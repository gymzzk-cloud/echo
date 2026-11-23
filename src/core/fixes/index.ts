import { and, eq, inArray, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { trackedProducts } from "../tracked-prompts";
import { projectUsageThisMonth } from "../ai/engine";
import { costConfig, withinBudget } from "../ai/budget";
import { activeWriter, runWriteTask } from "../ai/writer";
import { envValue } from "../ai/http";
import { AI_BATCH, FIX_SCHEMA, fixPrompt, parseFixAnswer, type AiItem } from "./ai";
import { catalogContext, descriptionIsWeak, ruleFixes, titleIsWeak, type FixCandidate, type FixField, type FixProduct } from "./rules";
import { planFixWrites, type ExistingFix } from "./plan";

export { FIX_FIELDS, type FixField } from "./rules";

/**
 * Reparațiile de produs ale unui magazin (rulează în worker, jobul `fixes`). Idempotent:
 * 1. reguli fără AI pe tot catalogul (GTIN, marcă, categorie, titlu), citind doar coloanele scurte;
 * 2. AI doar pentru produsele urmărite sau cele mai vândute, doar pentru titlurile și descrierile slabe,
 *    doar dacă datele produsului s-au schimbat de la ultima propunere AI, și doar în bugetul lunar;
 * 3. scrie propunerile; cele peste pragul magazinului se aprobă singure. Totul se aplică doar în feed-ul Echo.
 */
export async function generateFixes(projectId: string) {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!project) return { written: 0, auto: 0, ai: 0 };
  // Coloanele scurte, plus ce extragem din descriere direct în baza de date (codul EAN, lungimea, amprenta).
  const rows = await db.execute(dsql`select id::text as id, title, brand, category, gtin, mpn, in_stock as "inStock", popularity_rank as "popularityRank",
      coalesce(length(description), 0)::int as "descLength",
      substring(description from '(?i)(?:ean|gtin|cod de bare|vonalk[oó]d)[^0-9]{0,15}([0-9]{8}|[0-9]{12,14})(?:[^0-9]|$)') as "eanLabeled",
      substring(description from '(?:^|[^0-9])([0-9]{13})(?:[^0-9]|$)') as "eanBare",
      md5(concat_ws('|', title, brand, category, gtin, mpn, description)) as hash
    from products where project_id = ${projectId}`) as unknown as (FixProduct & { inStock: boolean; popularityRank: number | null; hash: string })[];
  const ctx = catalogContext(rows);
  const candidates = new Map<string, FixCandidate>();
  for (const p of rows) for (const c of ruleFixes(p, ctx)) candidates.set(`${c.productId}|${c.field}`, c);

  const existing = await db.select({ id: schema.productEdits.id, productId: schema.productEdits.productId, field: schema.productEdits.field, value: schema.productEdits.value,
    status: schema.productEdits.status, source: schema.productEdits.source, inputHash: schema.productEdits.inputHash, confidence: schema.productEdits.confidence })
    .from(schema.productEdits).where(eq(schema.productEdits.projectId, projectId)) as ExistingFix[];
  const hashOf = new Map(rows.map((r) => [r.id, r.hash]));

  // ── AI: puține produse, alese, cu rezultat salvat (aceleași date = nu întrebăm din nou) ──
  let aiCount = 0;
  const writer = activeWriter();
  if (writer) {
    const ex = new Map(existing.map((e) => [`${e.productId}|${e.field}`, e]));
    const tracked = await trackedProducts(projectId);
    const maxProducts = Math.max(0, Number(envValue("FIX_AI_MAX_PRODUCTS", "24")) || 0);
    const picked = rows
      .filter((p) => p.inStock && (tracked.has(p.id) || (p.popularityRank !== null && p.popularityRank <= 50)))
      .sort((a, b) => Number(tracked.has(b.id)) - Number(tracked.has(a.id)) || (a.popularityRank ?? 1e9) - (b.popularityRank ?? 1e9))
      .map((p) => {
        const fields: ("title" | "description")[] = [];
        const done = (f: FixField) => { const e = ex.get(`${p.id}|${f}`); return e && e.source === "ai" && e.inputHash === p.hash; };
        if (titleIsWeak(p.title, p.brand, p.category) && !done("title")) fields.push("title");
        if (descriptionIsWeak(p.descLength) && !done("description")) fields.push("description");
        return { p, fields };
      })
      .filter((x) => x.fields.length)
      .slice(0, maxProducts);
    const budget = costConfig().monthlyBudgetUsd;
    if (picked.length && withinBudget((await projectUsageThisMonth(projectId)).usd, budget)) {
      const full = await db.select({ id: schema.products.id, description: schema.products.description }).from(schema.products)
        .where(and(eq(schema.products.projectId, projectId), inArray(schema.products.id, picked.map((x) => x.p.id))));
      const desc = new Map(full.map((f) => [f.id, f.description]));
      const items: AiItem[] = picked.map(({ p, fields }) => ({ id: p.id, fields, title: p.title, brand: p.brand, category: p.category, mpn: p.mpn, description: desc.get(p.id) ?? null }));
      for (let i = 0; i < items.length; i += AI_BATCH) {
        if (i > 0 && !withinBudget((await projectUsageThisMonth(projectId)).usd, budget)) break;
        const batch = items.slice(i, i + AI_BATCH);
        const { system, user } = fixPrompt(batch, project.language === "hu" ? "hu" : "ro", project.name);
        try {
          const out = await runWriteTask(projectId, "fixes", writer, { system, user, schema: FIX_SCHEMA, maxTokens: 1000 + batch.length * 700 }, batch.length);
          for (const c of parseFixAnswer(out.json, batch)) {
            const k = `${c.productId}|${c.field}`;
            const rule = candidates.get(k);
            // Propunerea AI o înlocuiește pe cea din reguli doar dacă e cel puțin la fel de sigură.
            if (!rule || c.confidence >= rule.confidence) { candidates.set(k, c); aiCount++; }
          }
        } catch (e) {
          // Un AI căzut nu oprește reparațiile din reguli. Doar mesajul, fără date.
          console.error(`Reparații AI ${writer.id}: ${String(e).slice(0, 200)}`);
        }
      }
    }
  }

  const plan = planFixWrites([...candidates.values()], existing, hashOf, project.fixAutoThreshold);
  const now = new Date();
  for (let i = 0; i < plan.upsert.length; i += 500) {
    const chunk = plan.upsert.slice(i, i + 500).map((u) => ({ ...u, projectId, decidedAt: u.status === "aprobat" ? now : null }));
    await db.insert(schema.productEdits).values(chunk).onConflictDoUpdate({
      target: [schema.productEdits.productId, schema.productEdits.field],
      set: { value: dsql`excluded.value`, previous: dsql`excluded.previous`, source: dsql`excluded.source`, status: dsql`excluded.status`, confidence: dsql`excluded.confidence`,
        reason: dsql`excluded.reason`, inputHash: dsql`excluded.input_hash`, auto: dsql`excluded.auto`, decidedAt: dsql`excluded.decided_at`, createdAt: dsql`now()` },
    });
  }
  for (let i = 0; i < plan.remove.length; i += 1000) await db.delete(schema.productEdits).where(and(eq(schema.productEdits.projectId, projectId), inArray(schema.productEdits.id, plan.remove.slice(i, i + 1000))));
  await db.update(schema.projects).set({ fixesCheckedAt: now }).where(eq(schema.projects.id, projectId));
  return { written: plan.upsert.length, removed: plan.remove.length, auto: plan.upsert.filter((u) => u.auto).length, ai: aiCount };
}

/** Magazinele cu catalog la care căutarea de reparații e mai veche de 7 zile (sau n-a rulat niciodată). */
export async function projectsDueForFixes(limit = 5) {
  const r = await db.execute(dsql`select p.id::text as id from projects p where (p.fixes_checked_at is null or p.fixes_checked_at < now() - interval '7 days')
    and exists (select 1 from products x where x.project_id = p.id) order by p.fixes_checked_at nulls first limit ${limit}`);
  return (r as unknown as { id: string }[]).map((x) => x.id);
}

// ── Pentru pagină: doar numărători în SQL și o pagină de rânduri ─────────────────────────

export type FixStatus = "propus" | "aprobat" | "respins";

export async function fixCounts(projectId: string) {
  const r = await db.select({ status: schema.productEdits.status, field: schema.productEdits.field, n: dsql<number>`count(*)::int`, high: dsql<number>`count(*) filter (where ${schema.productEdits.confidence} >= 80)::int`, auto: dsql<number>`count(*) filter (where ${schema.productEdits.auto})::int` })
    .from(schema.productEdits).where(eq(schema.productEdits.projectId, projectId)).groupBy(schema.productEdits.status, schema.productEdits.field);
  const by = (s: FixStatus, f?: string) => r.filter((x) => x.status === s && (!f || x.field === f)).reduce((a, x) => a + x.n, 0);
  return { rows: r, pending: by("propus"), approved: by("aprobat"), rejected: by("respins"), auto: r.reduce((a, x) => a + (x.status === "aprobat" ? x.auto : 0), 0), by };
}

export const PAGE_SIZE = 50;

export async function listFixes(projectId: string, opts: { status: FixStatus; field?: string; page: number }) {
  const where = and(eq(schema.productEdits.projectId, projectId), eq(schema.productEdits.status, opts.status), opts.field ? eq(schema.productEdits.field, opts.field) : undefined);
  return db.select({ e: { id: schema.productEdits.id, field: schema.productEdits.field, value: schema.productEdits.value, previous: schema.productEdits.previous, source: schema.productEdits.source,
      confidence: schema.productEdits.confidence, reason: schema.productEdits.reason, auto: schema.productEdits.auto, status: schema.productEdits.status },
    p: { id: schema.products.id, title: schema.products.title, url: schema.products.url } })
    .from(schema.productEdits).innerJoin(schema.products, eq(schema.products.id, schema.productEdits.productId))
    .where(where).orderBy(dsql`${schema.productEdits.confidence} desc`, schema.productEdits.id)
    .limit(PAGE_SIZE).offset(Math.max(0, opts.page - 1) * PAGE_SIZE);
}

/** Aprobă, respinge sau readuce la „propus” reparațiile date (doar ale magazinului). Întoarce câte s-au schimbat. */
export async function decideFixes(projectId: string, ids: string[], status: FixStatus) {
  if (!ids.length) return 0;
  const r = await db.update(schema.productEdits).set({ status, auto: false, decidedAt: status === "propus" ? null : new Date() })
    .where(and(eq(schema.productEdits.projectId, projectId), inArray(schema.productEdits.id, ids))).returning({ id: schema.productEdits.id });
  return r.length;
}

/** Aprobă toate propunerile cu încredere de cel puțin `min` (opțional doar pe un câmp). Un singur UPDATE în baza de date. */
export async function approveAbove(projectId: string, min: number, field?: string, auto = false) {
  const r = await db.update(schema.productEdits).set({ status: "aprobat", auto, decidedAt: new Date() })
    .where(and(eq(schema.productEdits.projectId, projectId), eq(schema.productEdits.status, "propus"), dsql`${schema.productEdits.confidence} >= ${min}`, field ? eq(schema.productEdits.field, field) : undefined))
    .returning({ id: schema.productEdits.id });
  return r.length;
}

/** Pragul de aplicare automată: null = oprit. Îl aplicăm imediat și pe propunerile deja în așteptare. */
export async function setAutoThreshold(projectId: string, threshold: number | null) {
  await db.update(schema.projects).set({ fixAutoThreshold: threshold }).where(eq(schema.projects.id, projectId));
  return threshold === null ? 0 : approveAbove(projectId, threshold, undefined, true);
}

/** Reparațiile aprobate, pentru exportul CSV (magazinul le poate pune și în catalogul lui). Doar câmpurile scurte necesare. */
export function approvedFixesForExport(projectId: string, limit = 20000) {
  return db.select({ externalId: schema.products.externalId, url: schema.products.url, field: schema.productEdits.field, previous: schema.productEdits.previous, value: schema.productEdits.value, confidence: schema.productEdits.confidence })
    .from(schema.productEdits).innerJoin(schema.products, eq(schema.products.id, schema.productEdits.productId))
    .where(and(eq(schema.productEdits.projectId, projectId), eq(schema.productEdits.status, "aprobat"))).orderBy(schema.products.externalId).limit(limit);
}

/** De unde vin datele produselor (pentru „Acum” din fiecare propunere): adresa sursei sincronizate, fără chei. */
export async function catalogSources(projectId: string) {
  const rows = await db.select({ kind: schema.connections.kind, url: schema.connections.url, lastSyncAt: schema.connections.lastSyncAt })
    .from(schema.connections).where(eq(schema.connections.projectId, projectId)).limit(5);
  return rows.map((r) => {
    let label = r.url;
    try { const u = new URL(r.url); label = `${u.host}${u.pathname.length > 1 ? u.pathname : ""}`; } catch { /* adresă nevalidă: o arătăm cum e */ }
    return { kind: r.kind, label, lastSyncAt: r.lastSyncAt };
  });
}

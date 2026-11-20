import { and, desc, eq, gte, inArray, sql as dsql } from "drizzle-orm";
import { emitEvent } from "./platform";
import { getStore, mergeStableFacts, recordAudit, registerAiStores } from "./stores";
import type { StoreFacts } from "./audit";
import { db, schema } from "@/db";
import type { Mention } from "@/db/schema";
import { daysAgo, decrypt, domainOf, encrypt, parseStoreUrl, today } from "@/lib/util";
import { runAudit, type AuditResult } from "./audit";
import { detectConnector, fetchCatalog, fetchFeedFull, parseFeed, type CatalogItem, type ConnectorKind } from "./connectors";
import { invalidateWorld, loadWorld, runQuery } from "./ai/engine";
import { PROVIDERS, providerLabel } from "./ai/types";
import { suggestPrompts } from "./prompts";

type Project = typeof schema.projects.$inferSelect;
const MARKETPLACES = new Set(["emag.ro", "emag.hu", "altex.ro", "flanco.ro", "arukereso.hu", "compari.ro"]);

export const projectBase = (p: Project) => `https://${p.domain}${p.pathPrefix}`;

// ── Catalog ────────────────────────────────────────────────────────────────
export async function syncCatalog(connectionId: string) {
  const [c] = await db.select().from(schema.connections).where(eq(schema.connections.id, connectionId));
  if (!c) return;
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, c.projectId));
  try {
    const secret = c.secret ? decrypt(c.secret) : undefined;
    let items: CatalogItem[];
    if (c.kind === "feed") {
      // Feed/API: cereri condiționate și hash; dacă nimic nu s-a schimbat, nu rescriem catalogul.
      const r = await fetchFeedFull(c.url, p.currency, secret, { etag: c.etag, lastModified: c.lastModified });
      if (r.notModified || (r.hash && r.hash === c.contentHash)) {
        await db.update(schema.connections).set({ status: "ok", lastError: null, lastSyncAt: new Date() }).where(eq(schema.connections.id, c.id));
        return c.productCount;
      }
      if (!r.items.length) throw new Error("Nu am găsit produse la acest link. Verifică să fie feed-ul (sau API-ul) de produse și cheia, dacă e nevoie.");
      items = r.items;
      const d = await saveChangedItems(p.id, items);
      console.log(`catalog ${p.domain}${p.pathPrefix}: ${items.length} produse în ${r.requests} cereri, ${d.changed} noi/schimbate, ${d.gone} dispărute`);
      await db.update(schema.connections).set({ etag: r.etag ?? null, lastModified: r.lastModified ?? null, contentHash: r.hash }).where(eq(schema.connections.id, c.id));
    } else {
      items = await fetchCatalog(c.kind as ConnectorKind, c.url, p.currency, secret);
      if (items.length) await saveChangedItems(p.id, items);
    }
    await db.update(schema.connections).set({ status: "ok", lastError: null, lastSyncAt: new Date(), productCount: items.length }).where(eq(schema.connections.id, c.id));
    await db.update(schema.projects).set({ platform: c.kind }).where(eq(schema.projects.id, p.id));
    invalidateWorld();
    await ensurePrompts(p.id);
    return items.length;
  } catch (e) {
    await db.update(schema.connections).set({ status: "error", lastError: String(e).slice(0, 500) }).where(eq(schema.connections.id, c.id));
    throw e;
  }
}

/**
 * Sincronizare cu diferențe: scriem doar produsele noi sau schimbate (preț, stoc, titlu…),
 * iar cele care au dispărut din catalog nu mai sunt oferite agenților ca fiind în stoc.
 * O zi obișnuită atinge câteva sute de rânduri, nu tot catalogul.
 */
export async function saveChangedItems(projectId: string, items: CatalogItem[]) {
  const existing = await db.select().from(schema.products).where(eq(schema.products.projectId, projectId));
  const byId = new Map(existing.map((r) => [r.externalId, r]));
  const fmt = (n: number | null) => (n === null || n === undefined ? null : n.toFixed(2));
  const changed = items.filter((it) => {
    const r = byId.get(it.externalId.slice(0, 200));
    if (!r) return true;
    return r.title !== it.title.slice(0, 500) || r.url !== it.url || (r.cartUrl ?? null) !== (it.cartUrl ?? null) || r.price !== fmt(it.price)
      || r.inStock !== it.inStock || (r.brand ?? null) !== (it.brand ?? null) || (r.category ?? null) !== (it.category ?? null)
      || (r.imageUrl ?? null) !== (it.imageUrl ?? null) || (r.gtin ?? null) !== (it.gtin ?? null) || (r.description ?? null) !== (it.description ?? null)
      || (r.delivery ?? null) !== (it.delivery ?? null);
  });
  await saveItems(projectId, changed);
  const seen = new Set(items.map((it) => it.externalId.slice(0, 200)));
  const gone = existing.filter((r) => r.inStock && !seen.has(r.externalId)).map((r) => r.id);
  for (let i = 0; i < gone.length; i += 1000) {
    await db.update(schema.products).set({ inStock: false, updatedAt: new Date() }).where(inArray(schema.products.id, gone.slice(i, i + 1000)));
  }
  return { changed: changed.length, gone: gone.length };
}

/** Salvează (insert sau update) produsele unui proiect, în loturi de 500. */
export async function saveItems(projectId: string, items: CatalogItem[]) {
  for (let i = 0; i < items.length; i += 500) {
    const chunk = items.slice(i, i + 500).map((it) => ({
      projectId, externalId: it.externalId.slice(0, 200), title: it.title.slice(0, 500), url: it.url, cartUrl: it.cartUrl ?? null,
      price: it.price?.toFixed(2) ?? null, currency: it.currency, inStock: it.inStock, brand: it.brand ?? null,
      category: it.category ?? null, imageUrl: it.imageUrl ?? null, gtin: it.gtin ?? null, description: it.description ?? null, delivery: it.delivery ?? null, updatedAt: new Date(),
    }));
    await db.insert(schema.products).values(chunk).onConflictDoUpdate({
      target: [schema.products.projectId, schema.products.externalId],
      set: { title: dsql`excluded.title`, url: dsql`excluded.url`, cartUrl: dsql`excluded.cart_url`, price: dsql`excluded.price`, inStock: dsql`excluded.in_stock`, brand: dsql`excluded.brand`, category: dsql`excluded.category`, imageUrl: dsql`excluded.image_url`, gtin: dsql`excluded.gtin`, description: dsql`excluded.description`, delivery: dsql`excluded.delivery`, updatedAt: dsql`now()` },
    });
  }
}

/** Feed încărcat ca fișier (fără URL): îl citim o dată și îl salvăm ca o conexiune „upload”. */
export async function importFeedFile(projectId: string, fileName: string, body: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const items = parseFeed(body, p.currency);
  if (!items.length) throw new Error("Nu am găsit produse în fișier. Verifică să aibă cel puțin titlu și link pentru fiecare produs.");
  await saveItems(projectId, items);
  await db.insert(schema.connections).values({ projectId, kind: "upload", url: `fișier: ${fileName}`, status: "ok", productCount: items.length, lastSyncAt: new Date() });
  invalidateWorld();
  await ensurePrompts(projectId);
  return items.length;
}

export async function connectStore(projectId: string, opts: { kind?: ConnectorKind | "auto"; url?: string; secret?: string }) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  let kind = opts.kind;
  let url = opts.url?.trim() || projectBase(p);
  // Detectare automată cu un link care nu e chiar magazinul (feed, API, openapi.yaml): îl tratăm ca feed.
  if ((!kind || kind === "auto") && opts.url?.trim() && !/^https?:\/\/[^/]+\/?$/.test(opts.url.trim()) && opts.url.trim().replace(/\/$/, "") !== projectBase(p)) kind = "feed";
  if (!kind || kind === "auto") {
    const d = await detectConnector(projectBase(p));
    if (!d) throw new Error("Nu am putut detecta automat Shopify sau WooCommerce. Adaugă linkul feed-ului (XML, CSV, JSON sau YAML), încarcă fișierul sau alege platforma și pune cheia API.");
    kind = d;
    url = projectBase(p);
  }
  const secret = opts.secret?.trim() ? encrypt(opts.secret.trim()) : null;
  const [c] = await db.insert(schema.connections).values({ projectId, kind, url, secret }).returning();
  return c;
}

// ── Întrebări ──────────────────────────────────────────────────────────────
export async function ensurePrompts(projectId: string) {
  const existing = await db.select({ id: schema.prompts.id }).from(schema.prompts).where(eq(schema.prompts.projectId, projectId)).limit(1);
  if (existing.length) return;
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const prods = await db.select({ title: schema.products.title, category: schema.products.category, brand: schema.products.brand, price: schema.products.price })
    .from(schema.products).where(eq(schema.products.projectId, projectId)).limit(5000);
  const list = suggestPrompts(prods, p.name, p.language as "ro" | "hu");
  if (list.length) await db.insert(schema.prompts).values(list.map((x) => ({ projectId, ...x, language: p.language })));
}

// ── Rulare zilnică pentru un proiect ───────────────────────────────────────
export async function runProject(projectId: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const ps = await db.select().from(schema.prompts).where(and(eq(schema.prompts.projectId, projectId), eq(schema.prompts.active, true)));
  const world = await loadWorld();
  const seen: Mention[] = [];
  for (const pr of ps) {
    const runs = await Promise.all(PROVIDERS.map((prov) => runQuery(prov.id, { query: pr.text, language: p.language as "ro" | "hu", country: p.country as "RO" | "HU" }, world)));
    await db.insert(schema.promptRuns).values(runs.filter(Boolean).map((r) => ({ promptId: pr.id, runId: r.id }))).onConflictDoNothing();
    for (const r of runs) if (r) seen.push(...(r.mentions as Mention[]));
  }
  await registerAiStores(seen);
  await suggestCompetitors(projectId);
  await computeStats(projectId);
  await generateActions(projectId);
}

/** Datele de bază pentru un proiect într-o perioadă: rulările întrebărilor lui. */
export async function projectRuns(projectId: string, fromDay: string) {
  return db.select({ run: schema.runs, promptId: schema.prompts.id, prompt: schema.prompts.text, category: schema.prompts.category, intent: schema.prompts.intent })
    .from(schema.promptRuns)
    .innerJoin(schema.runs, eq(schema.runs.id, schema.promptRuns.runId))
    .innerJoin(schema.prompts, eq(schema.prompts.id, schema.promptRuns.promptId))
    .where(and(eq(schema.prompts.projectId, projectId), gte(schema.runs.runDate, fromDay))).orderBy(schema.runs.runDate);
}

async function suggestCompetitors(projectId: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const existing = await db.select().from(schema.competitors).where(eq(schema.competitors.projectId, projectId));
  if (existing.length >= 5) return;
  const rows = await projectRuns(projectId, daysAgo(14));
  const counts = new Map<string, { n: number; name?: string }>();
  for (const { run } of rows) for (const m of run.mentions as Mention[]) {
    if (m.domain === p.domain || MARKETPLACES.has(m.domain)) continue;
    const c = counts.get(m.domain) ?? { n: 0, name: m.name };
    c.n++; counts.set(m.domain, c);
  }
  const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5 - existing.length);
  if (top.length) await db.insert(schema.competitors).values(top.map(([domain, c]) => ({ projectId, domain, name: c.name ?? domain, suggested: true }))).onConflictDoNothing();
}

// ── Statistici zilnice ─────────────────────────────────────────────────────
export function summarize(rows: Awaited<ReturnType<typeof projectRuns>>, domain: string, competitorDomains: string[], auditScore: number | null) {
  const by = (prov?: string) => rows.filter((r) => !prov || r.run.provider === prov);
  const calc = (rs: typeof rows) => {
    if (!rs.length) return { visibility: 0, avgPosition: null as number | null, sov: 0, n: 0 };
    let hit = 0, posSum = 0, mine = 0, all = 0;
    for (const { run } of rs) {
      const ms = run.mentions as Mention[];
      const me = ms.find((m) => m.domain === domain);
      if (me) { hit++; posSum += me.position; }
      for (const m of ms) if (m.domain === domain || competitorDomains.includes(m.domain)) { all++; if (m.domain === domain) mine++; }
    }
    return { visibility: Math.round((hit / rs.length) * 100), avgPosition: hit ? +(posSum / hit).toFixed(2) : null, sov: all ? Math.round((mine / all) * 100) : 0, n: rs.length };
  };
  const total = calc(by());
  const score = Math.round(total.visibility * 0.5 + total.sov * 0.2 + (auditScore ?? 50) * 0.3);
  return { total, score, perProvider: PROVIDERS.map((p) => ({ provider: p.id, ...calc(by(p.id)) })) };
}

export async function latestAudit(projectId: string) {
  const [a] = await db.select().from(schema.audits).where(and(eq(schema.audits.projectId, projectId), eq(schema.audits.status, "done"))).orderBy(desc(schema.audits.createdAt)).limit(1);
  return a ?? null;
}

export async function computeStats(projectId: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const comps = (await db.select().from(schema.competitors).where(eq(schema.competitors.projectId, projectId))).map((c) => c.domain);
  const audit = await latestAudit(projectId);
  const day = today();
  const rows = (await projectRuns(projectId, day)).filter((r) => r.run.runDate === day);
  if (!rows.length) return;
  const s = summarize(rows, p.domain, comps, audit?.score ?? null);
  const prev = await db.select().from(schema.dailyStats)
    .where(and(eq(schema.dailyStats.projectId, projectId), eq(schema.dailyStats.provider, "all"))).orderBy(desc(schema.dailyStats.day)).limit(2);
  const values = [
    { projectId, day, provider: "all", visibility: s.total.visibility, avgPosition: s.total.avgPosition?.toString() ?? null, shareOfVoice: s.total.sov, score: s.score },
    ...s.perProvider.map((x) => ({ projectId, day, provider: x.provider, visibility: x.visibility, avgPosition: x.avgPosition?.toString() ?? null, shareOfVoice: x.sov, score: x.visibility })),
  ];
  for (const v of values) {
    await db.insert(schema.dailyStats).values(v).onConflictDoUpdate({ target: [schema.dailyStats.projectId, schema.dailyStats.day, schema.dailyStats.provider], set: { visibility: v.visibility, avgPosition: v.avgPosition, shareOfVoice: v.shareOfVoice, score: v.score } });
  }
  // Alerte: comparăm cu ziua precedentă înregistrată
  const before = prev.find((x) => x.day !== day);
  if (before) {
    const prevPer = await db.select().from(schema.dailyStats).where(and(eq(schema.dailyStats.projectId, projectId), eq(schema.dailyStats.day, before.day)));
    for (const x of s.perProvider) {
      const old = prevPer.find((r) => r.provider === x.provider);
      if (!old) continue;
      if (old.visibility > 0 && x.visibility === 0) await alert(projectId, "lost_provider", "bad", `Ai ieșit din recomandările ${providerLabel(x.provider)}.`);
      else if (old.visibility === 0 && x.visibility > 0) await alert(projectId, "won_provider", "good", `${providerLabel(x.provider)} a început să te recomande.`);
      else if (x.visibility - old.visibility <= -20) await alert(projectId, "drop", "warn", `Vizibilitatea la ${providerLabel(x.provider)} a scăzut de la ${old.visibility}% la ${x.visibility}%.`);
    }
  }
  // Preț greșit spus de AI
  const prods = await db.select().from(schema.products).where(eq(schema.products.projectId, projectId)).limit(20000);
  for (const { run } of rows) for (const m of run.mentions as Mention[]) {
    if (m.domain !== p.domain || !m.statedPrice || !m.productTitle) continue;
    const prod = prods.find((x) => x.title === m.productTitle);
    const real = prod?.price ? parseFloat(prod.price) : null;
    if (real && Math.abs(real - m.statedPrice) / real > 0.05) {
      await alert(projectId, `price:${prod!.id}:${run.provider}`, "warn", `${providerLabel(run.provider)} spune ${m.statedPrice} lei pentru „${prod!.title}”, dar prețul real e ${real} lei.`, true);
    }
  }
}

async function alert(projectId: string, kind: string, severity: string, message: string, dedupeToday = false) {
  if (dedupeToday) {
    const ex = await db.select({ id: schema.alerts.id }).from(schema.alerts)
      .where(and(eq(schema.alerts.projectId, projectId), eq(schema.alerts.kind, kind), gte(schema.alerts.createdAt, new Date(Date.now() - 864e5)))).limit(1);
    if (ex.length) return;
  }
  await db.insert(schema.alerts).values({ projectId, kind, severity, message });
  await emitEvent(projectId, "alert.created", { kind, severity, message });
}

// ── Acțiuni recomandate ────────────────────────────────────────────────────
const IMPACT: Record<string, "mare" | "mediu" | "mic"> = { robots: "mare", firewall: "mare", "jsonld-product": "mare", "content-product": "mediu", "jsonld-org": "mediu", trust: "mediu", llms: "mic", sitemap: "mediu", meta: "mic", speed: "mediu" };
const EFFORT: Record<string, "mic" | "mediu" | "mare"> = { robots: "mic", firewall: "mic", "jsonld-product": "mediu", "content-product": "mare", "jsonld-org": "mic", trust: "mic", llms: "mic", sitemap: "mic", meta: "mic", speed: "mare" };

async function upsertAction(projectId: string, a: { key: string; title: string; why: string; howTo?: string; fixKind?: string; impact: string; effort: string }, baseline: number | null) {
  await db.insert(schema.actions).values({ projectId, ...a, baselineVisibility: baseline }).onConflictDoNothing();
}

export async function generateActions(projectId: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const audit = await latestAudit(projectId);
  const [stat] = await db.select().from(schema.dailyStats).where(and(eq(schema.dailyStats.projectId, projectId), eq(schema.dailyStats.provider, "all"))).orderBy(desc(schema.dailyStats.day)).limit(1);
  const baseline = stat?.visibility ?? null;

  if (audit?.result) {
    for (const c of (audit.result as AuditResult).checks) {
      if (c.status === "pass" || c.status === "info") continue;
      await upsertAction(projectId, { key: `audit:${c.id}`, title: c.title, why: c.detail, fixKind: c.fixKind, impact: IMPACT[c.id] ?? "mediu", effort: EFFORT[c.id] ?? "mediu" }, baseline);
    }
  }
  // Surse unde apar concurenții, dar nu tu
  const rows = await projectRuns(projectId, daysAgo(14));
  const comps = (await db.select().from(schema.competitors).where(eq(schema.competitors.projectId, projectId))).map((c) => c.domain);
  const gap = new Map<string, number>();
  for (const { run } of rows) {
    const ms = run.mentions as Mention[];
    const meIn = ms.some((m) => m.domain === p.domain);
    const compIn = ms.some((m) => comps.includes(m.domain));
    if (meIn || !compIn) continue;
    for (const s of run.sources as { url: string }[]) {
      const d = domainOf(s.url);
      if (!d || d === p.domain || comps.includes(d)) continue;
      gap.set(d, (gap.get(d) ?? 0) + 1);
    }
  }
  for (const [d, n] of [...gap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    await upsertAction(projectId, {
      key: `source:${d}`, title: `Fă-te prezent pe ${d}`,
      why: `AI-urile au citat ${d} de ${n} ori în răspunsuri unde au apărut concurenții tăi, dar tu nu.`,
      howTo: MARKETPLACES.has(d) ? `Listează produsele principale pe ${d}, cu titluri și specificații complete.` : `Contactează ${d} pentru o recenzie, un articol sau o listare. Oferă un produs de test sau un cod de reducere pentru cititori.`,
      fixKind: "source", impact: n >= 5 ? "mare" : "mediu", effort: "mediu",
    }, baseline);
  }
  // Produse care nu apar niciodată, deși sunt în categoriile întrebate
  const mentionedTitles = new Set(rows.flatMap(({ run }) => (run.mentions as Mention[]).filter((m) => m.domain === p.domain && m.productTitle).map((m) => m.productTitle!)));
  const totalProducts = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.products).where(eq(schema.products.projectId, projectId));
  if ((totalProducts[0]?.n ?? 0) > 0 && mentionedTitles.size === 0 && rows.length > 0) {
    await upsertAction(projectId, {
      key: "products:none", title: "Niciun produs nu e recomandat pe nume",
      why: "AI-urile pot menționa magazinul, dar nu recomandă produse anume. Descrierile și datele structurate complete schimbă asta.",
      howTo: "Începe cu primele 20 de produse după vânzări: descriere de 150+ cuvinte, GTIN, brand, recenzii.", fixKind: "content", impact: "mare", effort: "mare",
    }, baseline);
  }
}

/** Măsoară efectul acțiunilor rezolvate de cel puțin 14 zile. */
export async function measureActionEffects(projectId: string) {
  const done = await db.select().from(schema.actions).where(and(eq(schema.actions.projectId, projectId), eq(schema.actions.status, "rezolvata")));
  const [stat] = await db.select().from(schema.dailyStats).where(and(eq(schema.dailyStats.projectId, projectId), eq(schema.dailyStats.provider, "all"))).orderBy(desc(schema.dailyStats.day)).limit(1);
  return done.map((a) => ({
    ...a,
    effect: a.resolvedAt && Date.now() - a.resolvedAt.getTime() > 14 * 864e5 && a.baselineVisibility !== null && stat ? stat.visibility - a.baselineVisibility : null,
  }));
}

// ── Audit pentru proiect ───────────────────────────────────────────────────
export async function auditProject(projectId: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const [a] = await db.insert(schema.audits).values({ projectId, url: projectBase(p), domain: p.domain }).returning();
  return runAuditRow(a.id);
}

export async function runAuditRow(auditId: string) {
  const [a] = await db.select().from(schema.audits).where(eq(schema.audits.id, auditId));
  try {
    const r = await runAudit(a.url);
    // Site inaccesibil: nu salvăm un scor 0 înșelător, marcăm auditul ca eșuat.
    if (r.error && !r.checks.some((c) => c.status === "pass")) throw new Error(r.error);
    // Datele stabile ale firmei lipsă acum, dar găsite la o verificare anterioară, se refolosesc
    const { domain, pathPrefix } = parseStoreUrl(a.url);
    const prev = await getStore(domain, pathPrefix ?? "");
    const merged = mergeStableFacts(r.facts, (prev?.facts as StoreFacts | null) ?? null, prev?.factsCheckedAt ?? null);
    r.facts = merged.facts;
    if (merged.reused.length) r.reusedFacts = merged.reused;
    await recordAudit(a, r);
    await db.update(schema.audits).set({ status: "done", score: r.score, result: r }).where(eq(schema.audits.id, auditId));
    if (a.projectId && r.platform && r.platform !== "necunoscută") {
      await db.update(schema.projects).set({ platform: r.platform }).where(and(eq(schema.projects.id, a.projectId)));
    }
    return r;
  } catch (e) {
    await db.update(schema.audits).set({ status: "error", result: { error: (e as Error).message ?? String(e) } }).where(eq(schema.audits.id, auditId));
    await recordAudit(a, null).catch(() => {});
    throw e;
  }
}

export async function projectsForOrg(orgId: string) {
  return db.select().from(schema.projects).where(eq(schema.projects.orgId, orgId)).orderBy(schema.projects.createdAt);
}

export async function allProjectIds() {
  return (await db.select({ id: schema.projects.id }).from(schema.projects)).map((x) => x.id);
}


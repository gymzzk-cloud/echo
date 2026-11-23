import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { buyerQuery, isPlainName, promptLimit, promptPool, suggestPrompts, type SuggestedPrompt } from "./prompts";
import { enqueue } from "./jobs";

type Existing = { id: string; text: string; active: boolean; suggested: boolean; retiredAt?: Date | null };

/**
 * Ce schimbăm în lista unui magazin ca să ajungă la lista propusă:
 * - cele adăugate de mână rămân mereu și intră în limită;
 * - cele propuse care nu mai sunt în listă (produs ieșit din stoc, produse de test, întrebări vechi) ies din listă
 *   (`remove`): cine le aplică le retrage dacă au răspunsuri salvate, ca istoricul să nu dispară, și le șterge doar pe cele fără;
 * - cele propuse care rămân nu se ating (istoricul lor rămâne), nici dacă magazinul le-a oprit;
 * - cele retrase care intră din nou în listă se repornesc (`revive`), nu se adaugă a doua oară;
 * - cele noi se adaugă până la limită.
 * Funcție pură, ca regula să poată fi testată fără bază de date.
 */
export function planPromptChanges(existing: Existing[], desired: SuggestedPrompt[], limit: number) {
  const key = (t: string) => t.trim().toLowerCase();
  const manual = existing.filter((p) => !p.suggested);
  const manualKeys = new Set(manual.map((p) => key(p.text)));
  const room = Math.max(0, limit - manual.filter((p) => p.active).length);
  // Căutările despre magazin (pentru Reputație) au prioritate, chiar dacă limita e mică.
  const ordered = [...desired.filter((d) => d.intent === "brand"), ...desired.filter((d) => d.intent !== "brand")];
  const wanted = ordered.filter((d) => !manualKeys.has(key(d.text))).slice(0, room);
  const wantedKeys = new Set(wanted.map((d) => key(d.text)));
  const suggested = existing.filter((p) => p.suggested);
  const remove = suggested.filter((p) => !p.retiredAt && !wantedKeys.has(key(p.text))).map((p) => p.id);
  const revive = suggested.filter((p) => p.retiredAt && wantedKeys.has(key(p.text))).map((p) => p.id);
  const have = new Set(suggested.map((p) => key(p.text)));
  const add = wanted.filter((d) => !have.has(key(d.text)));
  return { remove, add, revive };
}

/**
 * Căutările pe produs alese de magazin, scrise încă doar cu numele produsului (forma veche), primesc intenție de
 * cumpărare: „<nume> preț” (KNOWLEDGE B53). Doar cele active; cele oprite de magazin rămân cum sunt.
 * Funcție pură: întoarce ce căutare devine ce text.
 */
export function planBuyerUpgrade(
  manual: { id: string; text: string; active: boolean; retiredAt?: Date | null; product: { title: string; brand: string | null } | null }[],
  language: "ro" | "hu",
) {
  return manual.filter((m) => m.active && !m.retiredAt && m.product && isPlainName(m.text, m.product))
    .map((m) => ({ id: m.id, text: buyerQuery(m.product!, language) }));
}

/** Catalogul are doar produsele de test (din fixtures), nu pe cele reale ale magazinului. */
async function onlyTestCatalog(projectId: string) {
  const conns = await db.select({ url: schema.connections.url }).from(schema.connections).where(eq(schema.connections.projectId, projectId));
  return !conns.length || conns.every((c) => c.url.startsWith("fixture:"));
}

/**
 * Reface căutările propuse din catalogul real. Fără apeluri AI, doar baza de date, deci ieftin:
 * rulează după fiecare sincronizare cu schimbări și înaintea rulării zilnice. Idempotentă.
 */
export async function refreshPrompts(projectId: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!p) return { added: 0, removed: 0 };
  const [org] = await db.select({ plan: schema.orgs.plan }).from(schema.orgs).where(eq(schema.orgs.id, p.orgId));
  const limit = promptLimit(org?.plan ?? "trial");
  const products = (await onlyTestCatalog(projectId)) ? [] : await db
    .select({ id: schema.products.id, externalId: schema.products.externalId, title: schema.products.title, category: schema.products.category, brand: schema.products.brand, price: schema.products.price, gtin: schema.products.gtin, mpn: schema.products.mpn, rank: schema.products.popularityRank, focus: schema.products.focus })
    .from(schema.products).where(and(eq(schema.products.projectId, projectId), eq(schema.products.inStock, true)));
  const lang = p.language as "ro" | "hu";
  await upgradeManualProductPrompts(projectId, lang);
  // Întrebările propuse se aleg întâi din „Produse focus” (ZoZo, 23.11.2026); catalogul întreg doar dacă setul e prea mic.
  const desired = suggestPrompts(promptPool(products), p.name, lang, limit);
  const existing = await db.select({ id: schema.prompts.id, text: schema.prompts.text, active: schema.prompts.active, suggested: schema.prompts.suggested, retiredAt: schema.prompts.retiredAt })
    .from(schema.prompts).where(eq(schema.prompts.projectId, projectId));
  const { remove, add, revive } = planPromptChanges(existing, desired, limit);
  // Ștergerea unei căutări șterge și legăturile spre răspunsurile ei (prompt_runs, cascade): răspunsurile deja primite
  // ar dispărea din panou. Cele cu răspunsuri doar se retrag (nu mai sunt întrebate); se șterg doar cele fără.
  for (let i = 0; i < remove.length; i += 500) {
    const ids = remove.slice(i, i + 500);
    const answered = new Set((await db.selectDistinct({ id: schema.promptRuns.promptId }).from(schema.promptRuns).where(inArray(schema.promptRuns.promptId, ids))).map((r) => r.id));
    const keep = ids.filter((id) => answered.has(id));
    const drop = ids.filter((id) => !answered.has(id));
    if (keep.length) await db.update(schema.prompts).set({ active: false, retiredAt: new Date() }).where(and(eq(schema.prompts.projectId, projectId), inArray(schema.prompts.id, keep)));
    if (drop.length) await db.delete(schema.prompts).where(and(eq(schema.prompts.projectId, projectId), inArray(schema.prompts.id, drop)));
  }
  for (let i = 0; i < revive.length; i += 500) {
    await db.update(schema.prompts).set({ active: true, retiredAt: null }).where(and(eq(schema.prompts.projectId, projectId), inArray(schema.prompts.id, revive.slice(i, i + 500))));
  }
  if (add.length) {
    await db.insert(schema.prompts).values(add.map((x) => ({
      projectId, text: x.text, category: x.category, intent: x.intent, productId: x.productId ?? null, language: p.language, suggested: true,
    })));
  }
  if (add.length || remove.length || revive.length) console.log(`căutări ${p.domain}${p.pathPrefix}: +${add.length} / -${remove.length} / repornite ${revive.length} (limită ${limit})`);
  return { added: add.length, removed: remove.length, revived: revive.length };
}

/**
 * Aplică `planBuyerUpgrade`: o căutare cu răspunsuri se retrage (istoricul rămâne legat de întrebarea pusă atunci)
 * și se adaugă una nouă cu textul de cumpărare; una fără răspunsuri își schimbă doar textul. Idempotentă.
 */
async function upgradeManualProductPrompts(projectId: string, language: "ro" | "hu") {
  const Q = schema.prompts;
  const rows = await db.select({ id: Q.id, text: Q.text, active: Q.active, retiredAt: Q.retiredAt, productId: Q.productId, category: Q.category, title: schema.products.title, brand: schema.products.brand })
    .from(Q).leftJoin(schema.products, eq(schema.products.id, Q.productId))
    .where(and(eq(Q.projectId, projectId), eq(Q.suggested, false), eq(Q.intent, "produs"), eq(Q.active, true)));
  const plan = planBuyerUpgrade(rows.map((r) => ({ ...r, product: r.title ? { title: r.title, brand: r.brand } : null })), language);
  if (!plan.length) return;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const answered = new Set((await db.selectDistinct({ id: schema.promptRuns.promptId }).from(schema.promptRuns).where(inArray(schema.promptRuns.promptId, plan.map((x) => x.id)))).map((r) => r.id));
  for (const x of plan) {
    if (answered.has(x.id)) {
      const old = byId.get(x.id)!;
      await db.update(Q).set({ active: false, retiredAt: new Date() }).where(and(eq(Q.projectId, projectId), eq(Q.id, x.id)));
      await db.insert(Q).values({ projectId, text: x.text, category: old.category, intent: "produs", productId: old.productId, language, suggested: false });
    } else {
      await db.update(Q).set({ text: x.text }).where(and(eq(Q.projectId, projectId), eq(Q.id, x.id)));
    }
  }
  console.log(`căutări pe produs cu intenție de cumpărare: ${plan.length} (${projectId})`);
}

/**
 * „Urmărește în AI” pe un produs: căutarea lui (marcă + model) devine aleasă de client, deci nu mai e
 * înlocuită automat. Dacă era deja propusă automat, o păstrăm (cu istoricul) și doar o marcăm ca aleasă.
 * „Nu mai urmări”: o dăm înapoi listei automate, care o păstrează sau o scoate după regulile obișnuite.
 */
export async function setProductTracked(projectId: string, productId: string, on: boolean, plan: string) {
  const [prod] = await db.select({ id: schema.products.id, title: schema.products.title, brand: schema.products.brand })
    .from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.projectId, projectId)));
  if (!prod) throw new Error("Produs inexistent.");
  const [p] = await db.select({ language: schema.projects.language }).from(schema.projects).where(eq(schema.projects.id, projectId));
  const mine = await db.select({ id: schema.prompts.id, suggested: schema.prompts.suggested, intent: schema.prompts.intent, text: schema.prompts.text })
    .from(schema.prompts).where(and(eq(schema.prompts.projectId, projectId), eq(schema.prompts.productId, productId)));
  if (!on) {
    const manual = mine.filter((x) => !x.suggested).map((x) => x.id);
    if (manual.length) await db.update(schema.prompts).set({ suggested: true }).where(inArray(schema.prompts.id, manual));
  } else {
    const manualActive = await db.select({ id: schema.prompts.id }).from(schema.prompts)
      .where(and(eq(schema.prompts.projectId, projectId), eq(schema.prompts.suggested, false), eq(schema.prompts.active, true)));
    const limit = promptLimit(plan);
    if (manualActive.length >= limit) throw new Error(`Planul tău urmărește cel mult ${limit} căutări alese de tine. Scoate una ca să adaugi alta.`);
    // Doar o căutare cu intenție de cumpărare se refolosește; numele singur nu măsoară recomandarea (B53).
    const byName = mine.find((x) => x.intent === "produs" && !isPlainName(x.text, prod));
    if (byName) await db.update(schema.prompts).set({ suggested: false, active: true, retiredAt: null }).where(eq(schema.prompts.id, byName.id));
    else await db.insert(schema.prompts).values({ projectId, text: buyerQuery(prod, (p?.language ?? "ro") as "ro" | "hu"), category: null, intent: "produs", productId, language: p?.language ?? "ro", suggested: false });
  }
  // Lista automată se reface în worker, nu în cererea din panou.
  await enqueue("prompts", { projectId });
}

/** Produsele urmărite în AI (căutare activă pe numele lor) și dacă le-a ales clientul. */
export async function trackedProducts(projectId: string) {
  const rows = await db.select({ productId: schema.prompts.productId, suggested: schema.prompts.suggested }).from(schema.prompts)
    .where(and(eq(schema.prompts.projectId, projectId), eq(schema.prompts.active, true), eq(schema.prompts.intent, "produs")));
  const m = new Map<string, "ales" | "automat">();
  for (const r of rows) if (r.productId) m.set(r.productId, !r.suggested ? "ales" : m.get(r.productId) ?? "automat");
  return m;
}

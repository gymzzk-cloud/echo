import { and, asc, eq, inArray, isNotNull, or, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { humanName, promptLimit } from "./prompts";
import { refreshPrompts } from "./tracked-prompts";

/**
 * Lista „Produse urmărite”: produsele despre care întrebăm AI-urile direct, la fiecare rulare programată.
 * Fiecare produs urmărit e o întrebare (intent „produs”) în `prompts`, deci intră în aceeași rulare, în același buget
 * și fără dubluri (aceeași întrebare pe același AI rulează o dată pe zi pentru toate magazinele).
 * - ales de tine: suggested = false, active = true (intră în limita planului);
 * - propus automat: suggested = true (cele mai vândute, din fiecare categorie), umple locurile rămase;
 * - scos de tine: suggested = false, active = false. Nu mai e întrebat și lista automată nu-l mai pune la loc.
 */

/** Codurile lipite de client (un cod pe rând, sau cu virgulă / punct și virgulă): fără dubluri, cel mult 500. */
export function parseCodes(text: string) {
  return [...new Set(text.split(/[\n,;\t]+/).map((s) => s.trim()).filter((s) => s.length >= 2 && s.length <= 100))].slice(0, 500);
}

/** Ce produse cerute intră în listă: cele deja alese rămân, cele noi până la locurile libere din plan, restul peste limită. */
export function planAdd(requested: string[], chosen: Set<string>, manualActive: number, limit: number) {
  const fresh = [...new Set(requested)].filter((id) => !chosen.has(id));
  const room = Math.max(0, limit - manualActive);
  return { add: fresh.slice(0, room), over: fresh.slice(room), already: requested.filter((id) => chosen.has(id)).length };
}

/** Cât ar costa pe lună întrebările active: întrebări × AI-uri × rulări pe lună × costul mediu al unei întrebări de luna asta. */
export function monthlyCostEstimate(activePrompts: number, providers: number, runEveryDays: number, usage: { n: number; usd: number }) {
  if (!usage.n) return null;
  const runs = Math.max(1, Math.round(30 / Math.max(1, runEveryDays)));
  return { questions: activePrompts * providers * runs, usd: activePrompts * providers * runs * (usage.usd / usage.n) };
}

export type TrackedStatus = "ales" | "automat" | "scos";
const P = schema.products;
const Q = schema.prompts;

/** Produsele din listă, cu starea lor, plus câte întrebări alese de client sunt active (toate tipurile, ca limita planului). */
export async function trackedProductList(projectId: string) {
  const [rows, [counts]] = await Promise.all([
    db.select({ productId: Q.productId, active: Q.active, suggested: Q.suggested, title: P.title, externalId: P.externalId, mpn: P.mpn, gtin: P.gtin, brand: P.brand, price: P.price, currency: P.currency, inStock: P.inStock, rank: P.popularityRank })
      .from(Q).innerJoin(P, eq(P.id, Q.productId))
      .where(and(eq(Q.projectId, projectId), eq(Q.intent, "produs"), isNotNull(Q.productId)))
      .orderBy(asc(P.popularityRank), asc(P.title)).limit(1000),
    db.select({
      manualActive: dsql<number>`count(*) filter (where not ${Q.suggested} and ${Q.active})::int`,
      active: dsql<number>`count(*) filter (where ${Q.active})::int`,
    }).from(Q).where(eq(Q.projectId, projectId)),
  ]);
  const status = (r: { active: boolean; suggested: boolean }): TrackedStatus => (!r.active ? "scos" : r.suggested ? "automat" : "ales");
  // Un produs cu mai multe rânduri: „ales” bate „automat”, care bate „scos”.
  const order: Record<TrackedStatus, number> = { ales: 3, automat: 2, scos: 1 };
  const byId = new Map<string, (typeof rows)[number] & { status: TrackedStatus }>();
  for (const r of rows) {
    const s = status(r);
    const e = byId.get(r.productId!);
    if (!e || order[s] > order[e.status]) byId.set(r.productId!, { ...r, status: s });
  }
  return { items: [...byId.values()], manualActive: counts?.manualActive ?? 0, activePrompts: counts?.active ?? 0 };
}

/** Produsele din catalog după codurile lipite (cod din catalog, EAN sau cod producător), și codurile negăsite. */
export async function productsByCodes(projectId: string, codes: string[]) {
  if (!codes.length) return { ids: [], missing: [] };
  const low = codes.map((c) => c.toLowerCase());
  const rows = await db.select({ id: P.id, externalId: P.externalId, gtin: P.gtin, mpn: P.mpn }).from(P)
    .where(and(eq(P.projectId, projectId), or(inArray(dsql`lower(${P.externalId})`, low), inArray(P.gtin, codes), inArray(dsql`lower(${P.mpn})`, low))))
    .limit(2000);
  const found = new Set<string>();
  const ids: string[] = [];
  const byCode = new Map<string, string>();
  for (const r of rows) for (const c of [r.externalId, r.gtin, r.mpn]) if (c && !byCode.has(c.toLowerCase())) byCode.set(c.toLowerCase(), r.id);
  for (const c of low) {
    const id = byCode.get(c);
    if (id) { found.add(c); if (!ids.includes(id)) ids.push(id); }
  }
  return { ids, missing: codes.filter((c) => !found.has(c.toLowerCase())) };
}

async function orgPlan(projectId: string) {
  const [r] = await db.select({ plan: schema.orgs.plan, language: schema.projects.language }).from(schema.projects)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.projects.orgId)).where(eq(schema.projects.id, projectId));
  return r ?? { plan: "trial", language: "ro" };
}

/** Adaugă produse în lista aleasă de client, până la limita planului. Ce nu încape se raportează, nu se adaugă. */
export async function addTrackedProducts(projectId: string, productIds: string[]) {
  const { plan, language } = await orgPlan(projectId);
  const list = await trackedProductList(projectId);
  const chosen = new Set(list.items.filter((i) => i.status === "ales").map((i) => i.productId!));
  const { add, over, already } = planAdd(productIds, chosen, list.manualActive, promptLimit(plan));
  if (add.length) {
    // Doar produsele acestui magazin (id-urile vin din formular).
    const prods = await db.select({ id: P.id, title: P.title, brand: P.brand }).from(P).where(and(eq(P.projectId, projectId), inArray(P.id, add)));
    const existing = await db.select({ id: Q.id, productId: Q.productId }).from(Q)
      .where(and(eq(Q.projectId, projectId), eq(Q.intent, "produs"), inArray(Q.productId, prods.map((p) => p.id))));
    const have = new Map(existing.map((e) => [e.productId!, e.id]));
    const reuse = prods.filter((p) => have.has(p.id)).map((p) => have.get(p.id)!);
    if (reuse.length) await db.update(Q).set({ suggested: false, active: true }).where(inArray(Q.id, reuse));
    const fresh = prods.filter((p) => !have.has(p.id));
    if (fresh.length) await db.insert(Q).values(fresh.map((p) => ({ projectId, text: humanName(p), category: null, intent: "produs", productId: p.id, language, suggested: false })));
  }
  await refreshPrompts(projectId);
  return { added: add.length, over: over.length, already, limit: promptLimit(plan) };
}

/** Scoate produse din listă: nu mai sunt întrebate, iar lista automată nu le mai pune la loc. Istoricul rămâne. */
export async function removeTrackedProducts(projectId: string, productIds: string[]) {
  if (productIds.length) await db.update(Q).set({ active: false, suggested: false }).where(and(eq(Q.projectId, projectId), inArray(Q.productId, productIds)));
  await refreshPrompts(projectId);
}

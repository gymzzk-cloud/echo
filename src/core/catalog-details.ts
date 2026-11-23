import { and, eq, inArray, isNull, lt, or, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt } from "@/lib/util";
import { detailEndpointFor, fetchDetailDescription, type CatalogItem } from "./connectors";

/**
 * Descrieri citite din pagina de detaliu a API-ului, când lista nu le dă (vezi tabelul product_details).
 * Preluare ușoară: doar produsele fără descriere în listă, câte DETAILS_PER_RUN pe rulare, prin politeFetch
 * (o cerere odată, cu pauză), iar o descriere citită se păstrează și se reverifică abia după DETAILS_REFRESH_DAYS.
 */
export const DETAILS_PER_RUN = Number(process.env.CATALOG_DETAILS_PER_RUN ?? 500);
const REFRESH_DAYS = Number(process.env.CATALOG_DETAILS_REFRESH_DAYS ?? 30);
const CHUNK = 1000;

/** La sincronizare: completează descrierile păstrate și notează produsele încă necitite. Întoarce câte așteaptă. */
export async function applyCachedDetails(projectId: string, items: CatalogItem[]) {
  const missing = items.filter((it) => it.needsDetail);
  if (!missing.length) return 0;
  const known = new Map<string, { description: string | null; fetchedAt: Date | null }>();
  for (let i = 0; i < missing.length; i += CHUNK) {
    const ids = missing.slice(i, i + CHUNK).map((it) => it.externalId.slice(0, 200));
    const rows = await db.select({ externalId: schema.productDetails.externalId, description: schema.productDetails.description, fetchedAt: schema.productDetails.fetchedAt })
      .from(schema.productDetails).where(and(eq(schema.productDetails.projectId, projectId), inArray(schema.productDetails.externalId, ids)));
    for (const r of rows) known.set(r.externalId, r);
  }
  const fresh: { projectId: string; externalId: string }[] = [];
  let pending = 0;
  for (const it of missing) {
    const k = known.get(it.externalId.slice(0, 200));
    if (!k) { fresh.push({ projectId, externalId: it.externalId.slice(0, 200) }); pending++; continue; }
    if (!k.fetchedAt) pending++;
    if (k.description) it.description = k.description;
  }
  for (let i = 0; i < fresh.length; i += CHUNK) await db.insert(schema.productDetails).values(fresh.slice(i, i + CHUNK)).onConflictDoNothing();
  return pending;
}

/** Jobul `catalog_details`: citește următoarele descrieri lipsă. Întoarce câte a citit și câte mai sunt. */
export async function runCatalogDetails(connectionId: string) {
  const [c] = await db.select().from(schema.connections).where(eq(schema.connections.id, connectionId));
  if (!c || c.kind !== "feed") return { read: 0, left: 0, projectId: c?.projectId ?? null };
  const [p] = await db.select({ currency: schema.projects.currency }).from(schema.projects).where(eq(schema.projects.id, c.projectId));
  const due = or(isNull(schema.productDetails.fetchedAt), lt(schema.productDetails.fetchedAt, new Date(Date.now() - REFRESH_DAYS * 864e5)));
  const rows = await db.select({ externalId: schema.productDetails.externalId }).from(schema.productDetails)
    .where(and(eq(schema.productDetails.projectId, c.projectId), due)).limit(DETAILS_PER_RUN);
  if (!rows.length) return { read: 0, left: 0, projectId: c.projectId };
  const secret = c.secret ? decrypt(c.secret) : undefined;
  const ep = await detailEndpointFor(c.url, secret);
  if (!ep) return { read: 0, left: 0, projectId: c.projectId };
  let read = 0;
  for (const r of rows) {
    let description: string | null = null;
    try { description = await fetchDetailDescription(ep, secret, r.externalId, p?.currency ?? "RON"); } catch { /* o cerere căzută: rămâne de citit data viitoare */ continue; }
    await db.update(schema.productDetails).set({ description, fetchedAt: new Date() })
      .where(and(eq(schema.productDetails.projectId, c.projectId), eq(schema.productDetails.externalId, r.externalId)));
    if (description) {
      await db.update(schema.products).set({ description, updatedAt: new Date() })
        .where(and(eq(schema.products.projectId, c.projectId), eq(schema.products.externalId, r.externalId)));
    }
    read++;
  }
  const [{ n }] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.productDetails).where(and(eq(schema.productDetails.projectId, c.projectId), isNull(schema.productDetails.fetchedAt)));
  if (read) console.log(`detalii catalog: ${read} descrieri citite, ${n} rămase`);
  return { read, left: n, projectId: c.projectId };
}

import { and, desc, asc, eq, ilike, sql as dsql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Citirile paginii „Produse în AI”: doar din tabelul calculat în worker (`product_ai_stats`), cu paginare.
 * Fiecare interogare filtrează după magazin; magazinul vine din `currentProject()`, care verifică organizația.
 */

export const PRODUCT_AI_PAGE_SIZE = 50;
export type ProductAiFilter = "" | "fara-magazin" | "pret";

const S = schema.productAiStats;
const P = schema.products;

export async function productAiSummary(projectId: string) {
  const [[catalog], [stats], [proj], provs] = await Promise.all([
    db.select({ n: dsql<number>`count(*)::int` }).from(P).where(eq(P.projectId, projectId)),
    db.select({
      named: dsql<number>`count(*)::int`,
      withoutStore: dsql<number>`count(*) filter (where ${S.withStore} = 0)::int`,
      wrongPrice: dsql<number>`count(*) filter (where ${S.priceWrong})::int`,
    }).from(S).where(eq(S.projectId, projectId)),
    db.select({ at: schema.projects.productAiAt, answers: schema.projects.productAiAnswers }).from(schema.projects).where(eq(schema.projects.id, projectId)),
    // AI-urile care au numit cel puțin un produs: doar ele apar ca filtre.
    db.execute(dsql`select distinct jsonb_object_keys(${S.providers}) as p from ${S} where ${S.projectId} = ${projectId}`),
  ]);
  const providers = (provs as unknown as { p: string }[]).map((x) => x.p);
  return { catalog: catalog.n, ...stats, providers, computedAt: proj?.at ?? null, answers: proj?.answers ?? null };
}

export async function productAiList(projectId: string, opts: { filter?: ProductAiFilter; provider?: string; q?: string; page?: number }) {
  const where: SQL[] = [eq(S.projectId, projectId)];
  if (opts.filter === "fara-magazin") where.push(eq(S.withStore, 0));
  if (opts.filter === "pret") where.push(eq(S.priceWrong, true));
  if (opts.provider) where.push(dsql`${S.providers} ? ${opts.provider}`);
  if (opts.q) where.push(ilike(P.title, `%${opts.q.replace(/[%_\\]/g, "\\$&")}%`));
  const page = Math.max(1, opts.page ?? 1);
  const rows = await db.select({
    productId: S.productId, title: P.title, url: P.url, brand: P.brand, price: P.price, currency: P.currency, inStock: P.inStock,
    appearances: S.appearances, prompts: S.prompts, providers: S.providers, avgPosition: S.avgPosition, bestPosition: S.bestPosition,
    withStore: S.withStore, statedPrice: S.statedPrice, statedProvider: S.statedProvider, priceWrong: S.priceWrong, wrongPrices: S.wrongPrices, lastSeen: S.lastSeen,
    total: dsql<number>`count(*) over ()::int`,
  }).from(S).innerJoin(P, eq(P.id, S.productId)).where(and(...where))
    .orderBy(desc(S.appearances), asc(S.avgPosition), asc(P.title))
    .limit(PRODUCT_AI_PAGE_SIZE).offset((page - 1) * PRODUCT_AI_PAGE_SIZE);
  return { rows, total: rows[0]?.total ?? 0, page };
}

export async function productAiDetail(projectId: string, productId: string) {
  const [row] = await db.select({ stat: S, title: P.title, url: P.url, brand: P.brand, price: P.price, currency: P.currency, inStock: P.inStock })
    .from(P).leftJoin(S, and(eq(S.productId, P.id), eq(S.projectId, projectId)))
    .where(and(eq(P.id, productId), eq(P.projectId, projectId))).limit(1);
  return row ?? null;
}

/** Cifrele salvate pentru câteva produse (pagina Produse le arată pe aceleași, ca numerele să se potrivească). */
export async function savedProductStats(projectId: string) {
  return db.select({ productId: S.productId, appearances: S.appearances, providers: S.providers, avgPosition: S.avgPosition, wrongPrices: S.wrongPrices })
    .from(S).where(eq(S.projectId, projectId));
}

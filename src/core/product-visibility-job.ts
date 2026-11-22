import { and, eq, isNull, lt, or, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Mention } from "@/db/schema";
import { daysAgo } from "@/lib/util";
import { projectRuns } from "./project-runs";
import { aggregateProducts, type AnswerRun, type CatalogProduct } from "./product-visibility";

/** Fereastra pentru vizibilitatea pe produs: ultimele 30 de zile de răspunsuri (aceeași ca în restul panoului). */
export const PRODUCT_AI_WINDOW_DAYS = 30;

/**
 * Jobul de fundal: citește răspunsurile AI deja salvate ale magazinului (fără apeluri AI noi), găsește în ele
 * produsele din catalog și salvează cifrele pe produs. Idempotent: șterge și rescrie rândurile magazinului într-o tranzacție.
 */
export async function computeProductVisibility(projectId: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!p) return { products: 0, answers: 0 };
  const rows = await projectRuns(projectId, daysAgo(PRODUCT_AI_WINDOW_DAYS));
  // O rulare poate răspunde la mai multe întrebări ale magazinului: o socotim o singură dată.
  const runs = new Map<string, AnswerRun>();
  for (const r of rows) {
    const e = runs.get(r.run.id);
    if (e) { e.promptIds.push(r.promptId); continue; }
    runs.set(r.run.id, {
      id: r.run.id, provider: r.run.provider, runDate: r.run.runDate, query: r.run.query, answer: r.run.answer, promptIds: [r.promptId],
      storeNamed: (r.run.mentions as Mention[]).some((m) => m.domain === p.domain),
      sourceUrls: (r.run.sources as { url: string }[]).map((s) => s.url),
    });
  }
  const P = schema.products;
  // Doar coloanele de care are nevoie potrivirea (fără descrieri); în worker, nu în pagină.
  const prods = runs.size ? await db.select({ id: P.id, title: P.title, brand: P.brand, gtin: P.gtin, mpn: P.mpn, price: P.price, currency: P.currency, url: P.url, inStock: P.inStock })
    .from(P).where(eq(P.projectId, projectId)).limit(100000) : [];
  const catalog: CatalogProduct[] = prods.map((x) => ({ ...x, price: x.price ? parseFloat(x.price) : null }));
  const stats = aggregateProducts([...runs.values()], catalog);

  await db.transaction(async (tx) => {
    await tx.delete(schema.productAiStats).where(eq(schema.productAiStats.projectId, projectId));
    const values = [...stats.values()].map((s) => ({
      projectId, productId: s.productId, appearances: s.appearances, prompts: s.prompts, providers: s.providers,
      avgPosition: s.avgPosition.toFixed(1), bestPosition: s.bestPosition, withStore: s.withStore,
      statedPrice: s.statedPrice?.toFixed(2) ?? null, statedProvider: s.statedProvider,
      priceWrong: s.wrongPrices.length > 0, wrongPrices: s.wrongPrices, examples: s.examples, lastSeen: s.lastSeen,
    }));
    for (let i = 0; i < values.length; i += 500) await tx.insert(schema.productAiStats).values(values.slice(i, i + 500));
    await tx.update(schema.projects).set({ productAiAt: new Date(), productAiAnswers: runs.size }).where(eq(schema.projects.id, projectId));
  });
  return { products: stats.size, answers: runs.size };
}

/** Magazinele cu răspunsuri AI, fără calcul pe produs în ultimele 24 de ore (pentru programarea workerului). */
export async function projectsDueForProductAi() {
  const rows = await db.select({ id: schema.projects.id }).from(schema.projects)
    .where(and(
      or(isNull(schema.projects.productAiAt), lt(schema.projects.productAiAt, new Date(Date.now() - 864e5))),
      dsql`exists (select 1 from prompt_runs pr join prompts q on q.id = pr.prompt_id where q.project_id = ${schema.projects.id})`,
    ));
  return rows.map((r) => r.id);
}

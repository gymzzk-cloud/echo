import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { CHANNELS, channelItems, loadFeedBase, type FeedProduct } from "./feed";
import { feedStamp } from "./feed-files";
import { suggestRules } from "./feed-rule-presets";

/** Un produs în rezumat: doar ce arată pagina (descrierea scurtată), ca rezumatul să rămână mic. */
export type SummaryProduct = Pick<FeedProduct, "id" | "title" | "price" | "currency" | "inStock" | "brand" | "gtin" | "mpn" | "labels"> & { description: string | null };
export type FeedSummary = {
  total: number;
  included: number;
  gaps: { outOfStock: number; noDescription: number; noGtin: number; noBrand: number; noPrice: number };
  labelCounts: [string, number][];
  preview: SummaryProduct[];
  suggestions: { presetId: string; affected: number; examples: { id: string; before: SummaryProduct; after: SummaryProduct | null }[] }[];
};

const slim = (p: FeedProduct): SummaryProduct => ({
  id: p.id, title: p.title, price: p.price, currency: p.currency, inStock: p.inStock, brand: p.brand, gtin: p.gtin, mpn: p.mpn, labels: p.labels,
  description: p.description ? p.description.slice(0, 400) : null,
});

/** Câte produse au fiecare problemă care contează pentru canale. O singură trecere prin listă. Funcție pură. */
export function feedGaps(items: FeedProduct[]) {
  const g = { outOfStock: 0, noDescription: 0, noGtin: 0, noBrand: 0, noPrice: 0 };
  for (const p of items) {
    if (!p.inStock) g.outOfStock++;
    if (!p.description?.trim()) g.noDescription++;
    if (!p.gtin) g.noGtin++;
    if (!p.brand) g.noBrand++;
    if (p.price == null) g.noPrice++;
  }
  return g;
}

/** Rezumatul unui canal din datele feed-ului (pur, testabil). */
export function summarize(base: Awaited<ReturnType<typeof loadFeedBase>>, channel: string): FeedSummary {
  const items = channelItems(base, channel);
  const counts = new Map<string, number>();
  for (const l of base.labels.values()) for (const x of l) counts.set(x, (counts.get(x) ?? 0) + 1);
  return {
    total: base.total,
    included: items.length,
    gaps: feedGaps(items),
    labelCounts: [...counts.entries()].sort((a, b) => b[1] - a[1]),
    preview: items.slice(0, 20).map(slim),
    suggestions: suggestRules(items, base.rules, channel).map((s) => ({
      presetId: s.preset.id, affected: s.affected,
      examples: s.examples.map((e) => ({ id: e.id, before: slim(e.before), after: e.after ? slim(e.after) : null })),
    })),
  };
}

/**
 * Jobul de feed (worker): refacem rezumatul fiecărui canal când s-au schimbat datele (aceeași amprentă ca fișierele).
 * Idempotent: cu aceeași amprentă nu face nimic. Catalogul se citește o singură dată pentru toate canalele.
 */
export async function computeFeedSummaries(projectId: string) {
  const stamp = await feedStamp(projectId);
  const have = await db.select({ channel: schema.feedSummaries.channel, stamp: schema.feedSummaries.stamp }).from(schema.feedSummaries).where(eq(schema.feedSummaries.projectId, projectId));
  const fresh = new Set(have.filter((h) => h.stamp === stamp).map((h) => h.channel));
  const todo = CHANNELS.filter((c) => !fresh.has(c.id));
  if (!todo.length) return 0;
  const base = await loadFeedBase(projectId);
  for (const c of todo) {
    const data = summarize(base, c.id);
    await db.insert(schema.feedSummaries).values({ projectId, channel: c.id, stamp, data, computedAt: new Date() })
      .onConflictDoUpdate({ target: [schema.feedSummaries.projectId, schema.feedSummaries.channel], set: { stamp, data, computedAt: new Date() } });
    // Lăsăm procesorul liber o clipă între canale (panoul are prioritate).
    await new Promise((r) => setTimeout(r, 50));
  }
  return todo.length;
}

/** Pagina Feed: rezumatul salvat al canalului (o singură citire mică), sau null dacă nu e încă calculat. */
export async function readFeedSummary(projectId: string, channel: string) {
  const [r] = await db.select({ data: schema.feedSummaries.data, computedAt: schema.feedSummaries.computedAt }).from(schema.feedSummaries)
    .where(and(eq(schema.feedSummaries.projectId, projectId), eq(schema.feedSummaries.channel, channel)));
  return r ?? null;
}

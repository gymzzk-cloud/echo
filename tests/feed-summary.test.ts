import { describe, expect, it } from "vitest";
import { feedGaps, summarize } from "@/core/feed-summary";
import type { FeedProduct } from "@/core/feed";

const prod = (i: number, o: Partial<FeedProduct> = {}): FeedProduct => ({
  id: `p${i}`, externalId: `e${i}`, title: `Produs ${i}`, description: "descriere ".repeat(100), url: `https://x/${i}`, imageUrl: null,
  price: 100, currency: "RON", inStock: true, brand: "Bosch", category: null, gtin: `59${i}`, mpn: null, labels: [], ...o,
});
const base = (products: FeedProduct[], rules: Parameters<typeof summarize>[0]["rules"] = []) =>
  ({ project: {} as never, products, rules, labels: new Map(products.map((p) => [p.id, p.labels])), total: products.length });

describe("rezumatul feed-ului calculat în worker", () => {
  it("catalog gol: zero peste tot, fără sugestii", () => {
    const s = summarize(base([]), "openai");
    expect(s).toMatchObject({ total: 0, included: 0, preview: [], suggestions: [], labelCounts: [] });
  });

  it("numără ce lipsește și etichetele pe tot catalogul, dar păstrează doar 20 de exemple cu descrierea scurtată", () => {
    const items = Array.from({ length: 50 }, (_, i) => prod(i, { inStock: i % 10 !== 0, description: i < 5 ? null : "d".repeat(2000), labels: i < 3 ? ["ai_nu_apare"] : [] }));
    const s = summarize(base(items), "openai");
    expect(s.total).toBe(50);
    expect(s.gaps).toEqual(feedGaps(items));
    expect(s.gaps.outOfStock).toBe(5);
    expect(s.gaps.noDescription).toBe(5);
    expect(s.labelCounts).toEqual([["ai_nu_apare", 3]]);
    expect(s.preview).toHaveLength(20);
    expect(s.preview.every((p) => (p.description?.length ?? 0) <= 400)).toBe(true);
    // Fără stoc → regula propusă „Scoate din feed produsele fără stoc”, cu numărul real de produse.
    expect(s.suggestions.find((x) => x.presetId === "fara-stoc")?.affected).toBe(5);
  });

  it("regulile existente scot produse din canal: included < total", () => {
    const items = [prod(1), prod(2, { inStock: false })];
    const rule = { conditions: [{ field: "inStock" as const, op: "eq" as const, value: "nu" }], actions: [{ type: "exclude" as const }], channels: [], active: true };
    const s = summarize(base(items, [rule as never]), "google");
    expect(s.included).toBe(1);
    expect(s.suggestions.find((x) => x.presetId === "fara-stoc")).toBeUndefined();
  });
});

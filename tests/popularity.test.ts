import { describe, expect, it } from "vitest";
import { endpointFromOpenApi, mapRecord, type CatalogItem } from "../src/core/connectors";
import { differentOrder, rankFromItems } from "../src/core/connectors/popularity";
import { suggestPrompts, type CatalogProduct } from "../src/core/prompts";

const item = (id: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({ externalId: id, title: `P ${id}`, url: `https://x/${id}`, price: 10, currency: "RON", inStock: true, ...extra });

describe("topul vânzărilor din feed", () => {
  it("citește vânzările, rangul și eticheta bestseller", () => {
    expect(mapRecord({ id: "1", title: "A", link: "u", sales_30d: "42" }).sales).toBe(42);
    expect(mapRecord({ id: "1", title: "A", link: "u", "g:custom_label_0": "Bestseller" }).bestseller).toBe(true);
    expect(mapRecord({ id: "1", title: "A", link: "u", sales_rank: "3" }).salesRank).toBe(3);
  });
  it("ordonează după vânzări, fără produse din afara stocului", () => {
    const ids = rankFromItems([item("a", { sales: 5 }), item("b", { sales: 50 }), item("c", { sales: 99, inStock: false }), item("d")]);
    expect(ids).toEqual(["b", "a"]);
  });
  it("o valoare identică peste tot sau „bestseller” pe tot catalogul nu e semnal", () => {
    expect(rankFromItems([item("a", { sales: 1 }), item("b", { sales: 1 })])).toEqual([]);
    expect(rankFromItems([item("a", { bestseller: true }), item("b", { bestseller: true })])).toEqual([]);
  });
  it("zero date: listă goală", () => expect(rankFromItems([])).toEqual([]));
});

describe("ordonarea „populare” a unei platforme", () => {
  it("e ignorată dacă întoarce aceeași ordine ca de obicei (declarată, dar neaplicată)", () => {
    expect(differentOrder(["1", "2", "3"], ["1", "2", "3"])).toBe(false);
    expect(differentOrder(["3", "1", "2"], ["1", "2", "3"])).toBe(true);
    expect(differentOrder([], ["1"])).toBe(false);
  });
  it("OpenAPI: găsește sort=popularity în specificație", () => {
    const spec = { openapi: "3.0.1", servers: [{ url: "https://s/api" }], paths: { "/search": { get: { parameters: [
      { name: "limit", in: "query" }, { name: "offset", in: "query" }, { name: "sort", in: "query", schema: { enum: ["price_asc", "newest", "popularity"] } }] } } } };
    expect(endpointFromOpenApi(spec, "https://s/openapi.yaml")!.popularSort).toEqual(["sort", "popularity"]);
  });
});

describe("întrebările urmărite cu top de vânzări", () => {
  const cat: CatalogProduct[] = [];
  for (let i = 0; i < 500; i++) cat.push({ id: String(i), externalId: String(i), title: `BRAND${i % 9} Model ${i}`, brand: `BRAND${i % 9}`, category: `Raft > Tip ${i % 15}`, price: "100", gtin: String(5900000000000 + i), rank: i >= 400 ? 500 - i : null });
  it("cele mai vândute produse sunt urmărite întâi", () => {
    const ps = suggestPrompts(cat, "Magazin", "ro", 30);
    const names = ps.filter((p) => p.intent === "produs").map((p) => p.text);
    expect(names.slice(0, 5)).toEqual(["BRAND4 Model 499", "BRAND3 Model 498", "BRAND2 Model 497", "BRAND1 Model 496", "BRAND0 Model 495"]);
    expect(ps).toHaveLength(30);
  });
  it("amestec: ~25% tipuri de produs, ~10% coduri, restul produse, plus magazinul", () => {
    const ps = suggestPrompts(cat, "Magazin", "ro", 30);
    const count = (k: string) => ps.filter((p) => p.intent === k).length;
    expect(count("brand")).toBe(2);
    expect(count("categorie")).toBe(7);
    expect(count("cod")).toBe(3);
    expect(count("produs")).toBe(18);
  });
});

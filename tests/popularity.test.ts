import { describe, expect, it } from "vitest";
import { endpointFromOpenApi, mapRecord, type CatalogItem } from "../src/core/connectors";
import { differentOrder, rankFromItems } from "../src/core/connectors/popularity";
import { humanName, isPlainName, modelLike, suggestPrompts, type CatalogProduct } from "../src/core/prompts";

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
  it("produsele cu nume sunt cele mai vândute, iar tipurile lor au întâietate", () => {
    const ps = suggestPrompts(cat, "Magazin", "ro", 30);
    // Cele mai vândute, scrise cum caută un cumpărător: cumpăr, preț, cod + preț, cel mai ieftin, de unde cumpăr (B53).
    expect(ps.slice(0, 6).map((p) => p.text)).toEqual([
      "vreau să cumpăr Brand4 Model 499", "Brand3 Model 498 preț", "5900000000497 preț",
      "Brand1 Model 496 cel mai ieftin", "de unde cumpăr Brand0 Model 495", "vreau să cumpăr Brand8 Model 494",
    ]);
    // Nicio căutare pe produs nu e doar numele sau codul: fiecare are intenție de cumpărare.
    const names = new Map(cat.map((c) => [c.id, c]));
    for (const q of ps.filter((x) => x.productId)) {
      const c = names.get(q.productId!)!;
      expect(isPlainName(q.text, c), q.text).toBe(false);
      expect(q.text).not.toBe(c.gtin);
    }
    expect(ps.slice(0, 10).every((p) => Number(p.productId) >= 490)).toBe(true); // ~80% din produse vin din top
    // tipul celui mai vândut produs (499 % 15 = 4) are prima întrebare de cumpărător
    expect(ps.find((p) => p.intent === "cumparare")!.text).toBe("tip 4 cel mai bun preț");
    expect(ps).toHaveLength(30);
  });
  it("amestec: 16 întrebări de cumpărător, 12 produse populare, 2 despre magazin", () => {
    const ps = suggestPrompts(cat, "Magazin", "ro", 30);
    const count = (k: string) => ps.filter((p) => p.intent === k).length;
    expect(count("brand")).toBe(2);
    expect(count("produs") + count("cod")).toBe(12);
    expect(count("comercial") + count("cumparare") + count("informativ")).toBe(16);
  });
});

describe("numele produsului cum îl scrie un om", () => {
  it("marca scrisă cu majuscule devine normală, codul rămâne", () => {
    expect(humanName({ title: "BOSCH GBH 18V-22", brand: "BOSCH" })).toBe("Bosch GBH 18V-22");
    expect(humanName({ title: "AEG BS18", brand: "AEG" })).toBe("AEG BS18");
    expect(humanName({ title: "DeWALT DCD796", brand: "DeWALT" })).toBe("DeWALT DCD796");
  });
});

describe("fără top de vânzări: aparate cu model, nu accesorii", () => {
  it("recunoaște un model", () => {
    expect(modelLike({ title: "BOSCH GBH 18V-22", brand: "BOSCH" })).toBe(true);
    expect(modelLike({ title: "MAKITA JR3070CT", brand: "MAKITA" })).toBe(true);
    expect(modelLike({ title: "BOSCH Burghiu HSS spiralat", brand: "BOSCH" })).toBe(false);
  });
  it("produsele urmărite sunt aparate când sunt destule", () => {
    const cat: CatalogProduct[] = [];
    for (let i = 0; i < 100; i++) cat.push({ id: `m${i}`, title: `BOSCH GBH ${i}V-22`, brand: "BOSCH", category: `Scule > Tip ${i % 5}`, price: "500" });
    for (let i = 0; i < 100; i++) cat.push({ id: `a${i}`, title: `BOSCH Burghiu lemn ${String.fromCharCode(97 + (i % 26))}`, brand: "BOSCH", category: `Accesorii > Acc ${i % 5}`, price: "20" });
    expect(suggestPrompts(cat, "M", "ro", 30).filter((p) => p.productId).every((p) => p.productId!.startsWith("m"))).toBe(true);
    expect(humanName({ title: "BOSCH GST 185-LI (SOLO)", brand: "BOSCH" })).toBe("Bosch GST 185-LI");
  });
});

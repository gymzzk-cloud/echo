import { describe, expect, it } from "vitest";
import { aggregateProducts, buildProductIndex, findProducts, parsePrice, type AnswerRun, type CatalogProduct } from "@/core/product-visibility";

const prod = (id: string, title: string, price: number | null, o: Partial<CatalogProduct> = {}): CatalogProduct =>
  ({ id, title, brand: title.split(" ")[0], gtin: null, mpn: null, price, currency: "RON", url: `https://shopexpert.com/ro/${id}`, inStock: true, ...o });

const CATALOG = [
  prod("gsr15", "Bosch GSR 12V-15", 449),
  prod("gsr35", "Bosch GSR 12V-35", 799),
  prod("ddf", "Makita DDF484Z", 650),
  prod("asp", "Aspirator vertical fără fir 25.2V", 549, { brand: "Expert" }),
  prod("ean", "Șurubelniță cu acumulator compactă", 199, { brand: "Expert", gtin: "5901234123457" }),
];

const run = (id: string, answer: string, o: Partial<AnswerRun> = {}): AnswerRun =>
  ({ id, provider: "chatgpt", runDate: "2026-11-20", at: `2026-11-20T10:00:0${id.slice(-1)}Z`, query: "cea mai bună mașină de înșurubat", answer, promptIds: ["q1"], storeNamed: false, sourceUrls: [], ...o });

describe("parsePrice", () => {
  it("lei, Ft și mii cu punct sau spațiu", () => {
    expect(parsePrice("costă 1.299,90 lei")).toMatchObject({ price: 1299.9, currency: "RON" });
    expect(parsePrice("ára 12 990 Ft")).toMatchObject({ price: 12990, currency: "HUF" });
    expect(parsePrice("~450 RON")).toMatchObject({ price: 450, currency: "RON" });
    expect(parsePrice("fără preț")).toBeNull();
  });
});

describe("findProducts", () => {
  const idx = buildProductIndex(CATALOG);

  it("găsește produsul după marcă și model, cu locul din listă și prețul de pe rând", () => {
    const hits = findProducts("Recomandări:\n1. **Makita DDF484Z** – puternică\n2. **Bosch GSR 12V-15** – 449 lei, ușoară", idx);
    expect(hits.map((h) => [h.productId, h.position, h.statedPrice])).toEqual([["ddf", 1, null], ["gsr15", 2, 449]]);
  });

  it("nu confundă modelele care diferă doar prin cifre (12V-15 față de 12V-35)", () => {
    const hits = findProducts("- Bosch GSR 12V-35 Professional, 820 lei", idx);
    expect(hits.map((h) => h.productId)).toEqual(["gsr35"]);
  });

  it("prețul de pe rândul de sub produs, până la următoarea recomandare", () => {
    const hits = findProducts("1. Bosch GSR 12V-15\n   - Preț: aproximativ 430 lei\n2. Makita DDF484Z\n   - bună pentru profesioniști", idx);
    expect(hits.find((h) => h.productId === "gsr15")?.statedPrice).toBe(430);
    expect(hits.find((h) => h.productId === "ddf")?.statedPrice).toBeNull();
  });

  it("un titlu generic nu se potrivește pe câteva cuvinte comune", () => {
    expect(findProducts("Un aspirator vertical e practic pentru apartament.", idx)).toEqual([]);
    expect(findProducts("Aspirator vertical fără fir 25.2V de la Expert", idx).map((h) => h.productId)).toEqual(["asp"]);
  });

  it("după codul EAN scris în răspuns", () => {
    expect(findProducts("Codul EAN 5901234123457 apare la mai multe magazine.", idx).map((h) => h.productId)).toEqual(["ean"]);
  });

  it("același produs de două ori în răspuns se socotește o dată, la prima mențiune", () => {
    const hits = findProducts("1. Bosch GSR 12V-15\n2. Makita DDF484Z\nConcluzie: Bosch GSR 12V-15 e cea mai ușoară.", idx);
    expect(hits.filter((h) => h.productId === "gsr15")).toHaveLength(1);
    expect(hits.find((h) => h.productId === "gsr15")?.position).toBe(1);
  });

  it("fără listă: locul e ordinea în text", () => {
    const hits = findProducts("Îți recomand Makita DDF484Z sau, mai ieftin, Bosch GSR 12V-15.", idx);
    expect(hits.map((h) => [h.productId, h.position])).toEqual([["ddf", 1], ["gsr15", 2]]);
  });

  it("două produse pe același rând: fiecare cu prețul lui", () => {
    const hits = findProducts("Alege Makita DDF484Z (650 lei) sau Bosch GSR 12V-15 (430 lei).", idx);
    expect(hits.map((h) => [h.productId, h.statedPrice])).toEqual([["ddf", 650], ["gsr15", 430]]);
  });

  it("același titlu la prețuri diferite: varianta cu prețul cel mai apropiat de cel spus", () => {
    const i2 = buildProductIndex([prod("a", "Bosch GSR 12V-15", 449), prod("b", "Bosch GSR 12V-15", 599)]);
    expect(findProducts("Bosch GSR 12V-15 la 590 lei", i2)[0].productId).toBe("b");
    expect(findProducts("Bosch GSR 12V-15 la 450 lei", i2)[0].productId).toBe("a");
  });
});

describe("dovada potrivirii", () => {
  const idx = buildProductIndex([...CATALOG, prod("kit", "BOSCH Kit de accesorii", 208, { brand: "BOSCH", mpn: "2607017164" }), prod("ins", "MAKITA Inserție pentru acumulatori și încărcător", 50, { brand: "MAKITA" })]);

  it("nu leagă un produs generic de un rând care doar seamănă (bug raportat de ZoZo)", () => {
    expect(findProducts("Bosch are multe accesorii, de exemplu un kit de burghie la 326,39 lei.", idx)).toEqual([]);
    expect(findProducts("Makita: acumulatori și încărcător, set la 385 lei", idx)).toEqual([]);
  });

  it("numele complet: criteriul „nume”", () => {
    const [h] = findProducts("1. BOSCH Kit de accesorii – 210 lei", idx);
    expect(h).toMatchObject({ productId: "kit", match: { kind: "nume", value: "BOSCH Kit de accesorii" }, priceText: "210 lei" });
  });

  it("codul producătorului și linkul produsului", () => {
    expect(findProducts("Caută codul 2607017164 la magazine.", idx)[0]).toMatchObject({ productId: "kit", match: { kind: "cod", value: "cod 2607017164" } });
    const h = findProducts("- [Inserția Makita](https://www.shopexpert.com/ro/ins/) e compatibilă.", idx)[0];
    expect(h).toMatchObject({ productId: "ins", match: { kind: "link" } });
  });

  it("prețul de pe rândul următor se arată cu rândul lui", () => {
    const [h] = findProducts("1. Makita DDF484Z\n   - Preț: 399 lei la eMAG", idx);
    expect(h).toMatchObject({ priceText: "399 lei", priceLine: "Preț: 399 lei la eMAG" });
  });
});

describe("aggregateProducts", () => {
  it("fără răspunsuri (AI căzut sau încă nerulat): nimic", () => {
    expect(aggregateProducts([], CATALOG).size).toBe(0);
  });

  it("apariții, AI-uri, loc mediu, magazinul tău și prețul greșit", () => {
    const runs = [
      run("r1", "1. Makita DDF484Z\n2. Bosch GSR 12V-15 – 449 lei", { storeNamed: true }),
      run("r2", "1. Bosch GSR 12V-15 – 520 lei", { provider: "gemini", runDate: "2026-11-21", promptIds: ["q2"] }),
      run("r3", "Bosch GSR 12V-15 e bun.", { provider: "claude", sourceUrls: ["https://www.shopexpert.com/ro/gsr15/"] }),
    ];
    const s = aggregateProducts(runs, CATALOG).get("gsr15")!;
    expect(s).toMatchObject({ appearances: 3, prompts: 2, providers: { chatgpt: 1, gemini: 1, claude: 1 }, avgPosition: 1.3, bestPosition: 1, withStore: 2, lastSeen: "2026-11-21" });
    // 520 față de 449 = +16%: greșit pe Gemini; 449 pe ChatGPT e corect.
    expect(s.wrongPrices).toEqual([{ provider: "gemini", price: 520, runId: "r2" }]);
    // Dovada prețului greșit: AI-ul, textul exact și criteriul după care am recunoscut produsul.
    const proof = s.examples.find((e) => e.runId === "r2")!;
    expect(proof).toMatchObject({ provider: "gemini", priceText: "520 lei", match: { kind: "nume", value: "Bosch GSR 12V-15" } });
    expect(s.examples[0].runId).toBe("r3"); // cele mai noi primele
  });

  it("prețul în altă monedă nu se compară", () => {
    const s = aggregateProducts([run("r1", "Bosch GSR 12V-15 – 99 €")], CATALOG).get("gsr15")!;
    expect(s.wrongPrices).toEqual([]);
    expect(s.statedPrice).toBeNull();
  });

  it("idempotent: aceleași răspunsuri dau aceleași cifre", () => {
    const runs = [run("r1", "1. Bosch GSR 12V-15 – 449 lei\n2. Makita DDF484Z")];
    expect(aggregateProducts(runs, CATALOG)).toEqual(aggregateProducts(runs, CATALOG));
  });
});

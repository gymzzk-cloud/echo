import { describe, expect, it } from "vitest";
import { OPENAI_COLUMNS, categoryPath, cleanBrand, cleanGtin, missingOpenAiSettings, openAiRow, openAiWriter, plainText, renderOpenAiCsv } from "../src/core/feed-channels/openai";
import { detectPolicyLinks, effectivePolicy } from "../src/core/feed-channels/policy-links";
import type { FeedProduct } from "../src/core/feed";

const store = { name: "ShopExpert", domain: "shopexpert.com", pathPrefix: "/ro", country: "RO" };
const p = (o: Partial<FeedProduct> = {}): FeedProduct => ({
  id: "u1", externalId: "SE-1", title: "BOSCH HBA534BS0", description: "<p>Cuptor <b>încorporabil</b>&nbsp;71 l</p>", url: "https://shopexpert.com/ro/p/1",
  imageUrl: "https://shopexpert.com/i/1.jpg", price: 1899.9, currency: "RON", inStock: true, brand: "Bosch",
  category: "Electrocasnice / Cuptoare", gtin: "4242005123456", mpn: "HBA534BS0", labels: [], ...o,
});

describe("feed ChatGPT (OpenAI)", () => {
  it("transformă produsul în rândul cerut de OpenAI", () => {
    const r = openAiRow(p(), store, { returnPolicyUrl: "https://shopexpert.com/ro/retur" });
    expect("row" in r).toBe(true);
    if (!("row" in r)) return;
    expect(r.row.price).toBe("1899.90 RON");
    expect(r.row.availability).toBe("in_stock");
    expect(r.row.description).toBe("Cuptor încorporabil 71 l");
    expect(r.row.product_category).toBe("Electrocasnice > Cuptoare");
    expect(r.row.seller_url).toBe("https://shopexpert.com/ro");
    expect(r.row.return_window).toBe("14");
    expect(r.row.enable_search).toBe("true");
    expect(r.row.enable_checkout).toBe("false");
    expect(r.row.return_policy).toBe("https://shopexpert.com/ro/retur");
  });
  it("fără stoc rămâne în feed, marcat out_of_stock", () => {
    const r = openAiRow(p({ inStock: false }), store, null);
    expect("row" in r && r.row.availability).toBe("out_of_stock");
  });
  it("exclude produsele fără câmpuri obligatorii și spune de ce", () => {
    expect(openAiRow(p({ price: null }), store, null)).toEqual({ skip: "fără preț" });
    expect(openAiRow(p({ price: 0 }), store, null)).toEqual({ skip: "fără preț" });
    expect(openAiRow(p({ imageUrl: null }), store, null)).toEqual({ skip: "fără imagine" });
    expect(openAiRow(p({ url: "/relativ" }), store, null)).toEqual({ skip: "fără link" });
    expect(openAiRow(p({ title: "  " }), store, null)).toEqual({ skip: "fără titlu" });
  });
  it("descrierea lipsă devine titlul; textul lung se taie la limită", () => {
    const r = openAiRow(p({ description: null, title: "x ".repeat(200) }), store, null);
    expect("row" in r && r.row.title.length).toBeLessThanOrEqual(150);
    expect("row" in r && r.row.description).toBe("row" in r && r.row.title);
    expect(plainText("a".repeat(10), 5)).toHaveLength(5);
  });
  it("GTIN doar valid (8, 12, 13 sau 14 cifre)", () => {
    expect(cleanGtin("4242005123456")).toBe("4242005123456");
    expect(cleanGtin("123")).toBe("");
    expect(cleanGtin("ABC1234567890")).toBe("");
    expect(cleanGtin(null)).toBe("");
  });
  it("categoria cu separatorul „ > ”", () => {
    expect(categoryPath("A | B » C")).toBe("A > B > C");
    expect(categoryPath(null)).toBe("");
  });
  it("CSV: antet, ghilimele corecte și statistici", () => {
    const { body, stats } = renderOpenAiCsv([p(), p({ externalId: "SE-2", title: 'Set "Pro", 3 piese', brand: null, gtin: null, mpn: null }), p({ externalId: "SE-3", price: null })], store, null);
    const lines = body.trim().split("\n");
    expect(lines[0]).toBe(OPENAI_COLUMNS.join(","));
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('"Set ""Pro"", 3 piese"');
    expect(stats).toEqual({ total: 3, included: 2, excluded: { "fără preț": 1 }, missing: { brand: 1, gtin_mpn: 1 } });
  });
  it("TSV la cerere: tab între coloane, fără tab-uri sau rânduri noi în celule; implicit CSV", () => {
    expect(openAiWriter(store, null).head).toBe(`${OPENAI_COLUMNS.join(",")}\n`);
    const w = openAiWriter(store, null, "tsv");
    expect(w.head).toBe(`${OPENAI_COLUMNS.join("\t")}\n`);
    const row = w.row(p({ title: 'Set "Pro",\t3 piese' }))!;
    expect(row.endsWith("\n")).toBe(true);
    const cells = row.slice(0, -1).split("\t");
    expect(cells).toHaveLength(OPENAI_COLUMNS.length);
    expect(cells[OPENAI_COLUMNS.indexOf("title")]).toBe('Set "Pro", 3 piese');
  });
  it("marca: păstrează numele reale, golește valorile pe care OpenAI le respinge", () => {
    expect(cleanBrand("Bosch")).toBe("Bosch");
    expect(cleanBrand("  De&#39;Longhi ")).toBe("De'Longhi");
    expect(cleanBrand("3M")).toBe("3M");
    expect(cleanBrand("Yahoo!")).toBe("Yahoo!");
    expect(cleanBrand("Bosch®")).toBe("Bosch");
    expect(cleanBrand("<b>Samsung</b>")).toBe("Samsung");
    expect(cleanBrand("Brand\u0000X\u200b")).toBe("BrandX");
    for (const bad of ["-", "...", "N/A", "n/a", "Generic", "Fără brand", "fara brand", "Egyéb", "12345", "?!", "www.magazin.ro", "https://x.ro"]) expect(cleanBrand(bad), bad).toBe("");
    expect(cleanBrand(null)).toBe("");
    const long = cleanBrand("Compania Foarte Lunga De Producție Și Distribuție A Aparatelor Electrocasnice SRL");
    expect(long.length).toBeLessThanOrEqual(70);
    expect(long).not.toContain("…");
    expect(long.endsWith(" ")).toBe(false);
  });

  it("marca nevalidă: rândul intră fără marcă și e numărat", () => {
    const { stats } = renderOpenAiCsv([p({ brand: "N/A" }), p({ externalId: "SE-2", brand: "Bosch" })], store, null);
    expect(stats.included).toBe(2);
    expect(stats.missing).toEqual({ brand: 1, brand_invalid: 1 });
    expect(stats.samples).toEqual({ brand_invalid: [{ code: "SE-1", title: "BOSCH HBA534BS0", value: "N/A" }] });
  });

  it("catalog gol → doar antetul", () => {
    const { body, stats } = renderOpenAiCsv([], store, null);
    expect(body).toBe(`${OPENAI_COLUMNS.join(",")}\n`);
    expect(stats.included).toBe(0);
  });
  it("spune ce pagini de magazin lipsesc", () => {
    expect(missingOpenAiSettings(null)).toHaveLength(3);
    expect(missingOpenAiSettings({ returnPolicyUrl: "https://a.ro/r", privacyPolicyUrl: "https://a.ro/p", termsUrl: "https://a.ro/t" })).toEqual([]);
  });
});

describe("paginile de retur, confidențialitate și termeni găsite pe site", () => {
  const html = `<footer>
    <a href="/ro/conditii-de-retur">Condiții de retur</a>
    <a href="/ro/termeni-si-conditii">Termeni și condiții</a>
    <a href="https://shopexpert.com/ro/politica-de-confidentialitate#top">Confidențialitate</a>
    <a href="https://alt-site.ro/termeni">Termeni partener</a>
  </footer>`;
  it("le găsește în linkurile de pe același site", () => {
    expect(detectPolicyLinks(html, "https://shopexpert.com/ro/")).toEqual({
      returnPolicyUrl: "https://shopexpert.com/ro/conditii-de-retur",
      termsUrl: "https://shopexpert.com/ro/termeni-si-conditii",
      privacyPolicyUrl: "https://shopexpert.com/ro/politica-de-confidentialitate",
    });
  });
  it("magazin maghiar", () => {
    const hu = `<a href="/hu/aszf">ÁSZF</a><a href="/hu/adatvedelem">Adatvédelem</a><a href="/hu/elallas">Elállás</a>`;
    expect(detectPolicyLinks(hu, "https://shopexpert.com/hu/")).toEqual({
      termsUrl: "https://shopexpert.com/hu/aszf", privacyPolicyUrl: "https://shopexpert.com/hu/adatvedelem", returnPolicyUrl: "https://shopexpert.com/hu/elallas",
    });
  });
  it("nimic găsit → gol", () => {
    expect(detectPolicyLinks("<p>fără linkuri</p>", "https://a.ro/")).toEqual({});
  });
  it("adresa scrisă de magazin are prioritate față de cea găsită", () => {
    const e = effectivePolicy({ termsUrl: "https://a.ro/t2", detected: { termsUrl: "https://a.ro/t", returnPolicyUrl: "https://a.ro/r" } });
    expect(e.termsUrl).toBe("https://a.ro/t2");
    expect(e.returnPolicyUrl).toBe("https://a.ro/r");
  });
});

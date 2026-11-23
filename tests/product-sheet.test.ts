import { describe, expect, it } from "vitest";
import { googleItem, renderFeed, type FeedProduct } from "@/core/feed";
import { openAiRow } from "@/core/feed-channels/openai";
import { googleFeedReport, openAiReport, pagePrice, pageReport } from "@/core/product-sheet/channels";
import { competitorView, likelyReasons, type SheetRun } from "@/core/product-sheet/answers";
import { readProductPage } from "@/core/product-sheet/page-check";

const store = { name: "ShopExpert", domain: "shopexpert.com", pathPrefix: "/ro", country: "RO" };
const policies = { returnPolicyUrl: "https://shopexpert.com/ro/retur", privacyPolicyUrl: "https://shopexpert.com/ro/gdpr", termsUrl: "https://shopexpert.com/ro/termeni" };
const good: FeedProduct = {
  id: "p1", externalId: "SE-100", title: "DEWALT DCD796P2 Mașină de găurit cu percuție 18V", description: "cuvânt ".repeat(100).trim(),
  url: "https://shopexpert.com/ro/dcd796p2", imageUrl: "https://shopexpert.com/i.jpg", price: 1299.9, currency: "RON", inStock: true,
  brand: "DEWALT", category: "Scule > Bormașini", gtin: "5035048666883", mpn: "DCD796P2", labels: [],
};

describe("fișa produsului: ChatGPT", () => {
  it("un produs complet are 100", () => {
    const r = openAiReport(good, openAiRow(good, store, policies));
    expect(r.included).toBe(true);
    expect(r.score).toBe(100);
    expect(r.checks.filter((c) => c.fix)).toEqual([]);
  });

  it("lipsa EAN-ului, mărcii și descrierii scade scorul și spune ce să repari", () => {
    const p = { ...good, gtin: "123", brand: "N/A", description: null, mpn: null };
    const r = openAiReport(p, openAiRow(p, store, policies));
    const by = Object.fromEntries(r.checks.map((c) => [c.field, c]));
    expect(by.gtin.status).toBe("bad");
    expect(by.gtin.value).toContain("invalid");
    expect(by.brand.status).toBe("bad");
    expect(by.description.status).toBe("bad");
    expect(r.score).toBeLessThan(60);
  });

  it("cod producător fără EAN dă jumătate de puncte", () => {
    const p = { ...good, gtin: null };
    const r = openAiReport(p, openAiRow(p, store, policies));
    expect(r.checks.find((c) => c.field === "gtin")).toMatchObject({ points: 10, max: 20, status: "warn" });
  });

  it("produsul fără imagine nu intră în feed, iar regula care îl exclude e spusă", () => {
    const p = { ...good, imageUrl: null };
    expect(openAiReport(p, openAiRow(p, store, policies))).toMatchObject({ included: false, score: 0 });
    expect(openAiReport(good, null).reason).toContain("regulă");
  });
});

describe("fișa produsului: Google", () => {
  it("googleItem trimite EAN-ul valid și codul producătorului", () => {
    const f = new Map(googleItem(good));
    expect(f.get("g:gtin")).toBe("5035048666883");
    expect(f.get("g:mpn")).toBe("DCD796P2");
    expect(f.has("g:identifier_exists")).toBe(false);
  });

  it("EAN invalid nu se trimite; fără EAN și fără cod: identifier_exists = no", () => {
    const f = new Map(googleItem({ ...good, gtin: "abc", mpn: null }));
    expect(f.has("g:gtin")).toBe(false);
    expect(f.get("g:identifier_exists")).toBe("no");
  });

  it("feed-ul Google scris în fișier conține aceleași câmpuri ca fișa", () => {
    const { body } = renderFeed("google", store, [good]);
    expect(body).toContain("<g:gtin>5035048666883</g:gtin><g:mpn>DCD796P2</g:mpn>");
    expect(body).toContain("<g:condition>new</g:condition>");
  });

  it("scorul Google e 100 pentru produsul complet", () => {
    expect(googleFeedReport(good, googleItem(good)).score).toBe(100);
  });
});

describe("fișa produsului: pagina", () => {
  const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"DEWALT DCD796P2","brand":{"@type":"Brand","name":"DEWALT"},
    "gtin13":"5035048666883","image":"https://shopexpert.com/i.jpg","description":"${"text ".repeat(50)}","offers":{"@type":"Offer","price":"1399.90","priceCurrency":"RON","availability":"https://schema.org/InStock"}}</script></head><body></body></html>`;

  it("citește Product din JSON-LD", () => {
    const r = readProductPage(html);
    expect(r.source).toBe("JSON-LD");
    expect(r.fields?.gtin).toBe("5035048666883");
    expect(r.descriptionWords).toBe(50);
  });

  it("prețul din pagină diferit de feed e semnalat", () => {
    const read = readProductPage(html);
    const r = pageReport(good, { httpStatus: 200, botBlocked: false, error: null, ...read })!;
    const price = r.checks.find((c) => c.field === "offers.price")!;
    expect(price.status).toBe("bad");
    expect(price.value).toContain("în feed 1299.90 RON");
    expect(r.checks.find((c) => c.field === "gtin")!.status).toBe("ok");
  });

  it("pagina fără Product și pagina blocată nu dau scor", () => {
    expect(pageReport(good, { httpStatus: 200, botBlocked: false, error: null, ...readProductPage("<html></html>") })!.included).toBe(false);
    expect(pageReport(good, { httpStatus: 403, botBlocked: true, error: "refuz", found: "", source: null, fields: null, descriptionWords: null })!.included).toBe(false);
    expect(pageReport(good, null)).toBeNull();
  });

  it("pagePrice citește formatele românești și internaționale", () => {
    expect(pagePrice("3.949,00")).toBe(3949);
    expect(pagePrice("3949.00")).toBe(3949);
    expect(pagePrice("1,299.90")).toBe(1299.9);
    expect(pagePrice(undefined)).toBeNull();
  });
});

describe("fișa produsului: cine apare în locul tău", () => {
  const run = (id: string, mentions: SheetRun["mentions"], sources: string[] = []): SheetRun => ({
    id, provider: "chatgpt", runDate: "2026-11-22", at: "2026-11-22T10:00:00Z", query: "DEWALT DCD796P2 preț", answer: "…", mentions, sources: sources.map((url) => ({ url })),
  });
  const opts = { ownDomain: "shopexpert.com", ownDomains: ["shopexpert.com", "hardlineconstruct.ro"], productUrl: good.url, namedRunIds: new Set(["r1"]) };

  it("numără magazinele din locul tău și comparatoarele, fără magazinele proprii", () => {
    const v = competitorView([
      run("r1", [{ domain: "emag.ro", position: 1 }, { domain: "shopexpert.com", position: 2 }]),
      run("r2", [{ domain: "emag.ro", position: 1 }, { domain: "dedeman.ro", position: 2 }, { domain: "hardlineconstruct.ro", position: 3 }], ["https://www.compari.ro/x"]),
    ], opts);
    expect(v.withStore).toBe(1);
    expect(v.withoutStore).toBe(1);
    expect(v.others.map((o) => [o.domain, o.count, o.marketplace])).toEqual([["emag.ro", 2, true], ["dedeman.ro", 1, false]]);
    expect(v.comparators).toEqual([{ domain: "compari.ro", count: 1 }]);
    expect(v.runs[0].productNamed).toBe(true);
  });

  it("linkul paginii produsului în surse înseamnă că te numește", () => {
    const v = competitorView([run("r3", [{ domain: "emag.ro", position: 1 }], ["https://shopexpert.com/ro/dcd796p2?utm=x"])], opts);
    expect(v.withStore).toBe(1);
  });

  it("zero răspunsuri: niciun motiv inventat dacă datele sunt complete", () => {
    const openai = openAiReport(good, openAiRow(good, store, policies));
    expect(likelyReasons({ inStock: true, openai, openaiActive: true, google: googleFeedReport(good, googleItem(good)), page: null, view: null, wrongPrices: [] })).toEqual([]);
  });

  it("motivele vin din date: fără EAN, feed oprit, comparator citat", () => {
    const p = { ...good, gtin: null, mpn: null };
    const openai = openAiReport(p, openAiRow(p, store, policies));
    const view = competitorView([run("r2", [{ domain: "emag.ro", position: 1 }], ["https://compari.ro/y"])], opts);
    const titles = likelyReasons({ inStock: true, openai, openaiActive: false, google: null, page: null, view, wrongPrices: [] }).map((r) => r.title);
    expect(titles[0]).toContain("ChatGPT nu primește");
    expect(titles.some((t) => t.includes("EAN"))).toBe(true);
    expect(titles.some((t) => t.includes("compari.ro"))).toBe(true);
  });
});

import { productCodes } from "@/lib/product-codes";
describe("codurile afișate în panou", () => {
  it("codul producătorului și EAN-ul, fără codul intern", () => {
    expect(productCodes({ externalId: "1221852", mpn: "06019N7003", gtin: "4053423342871" })).toEqual(["Cod producător 06019N7003", "EAN 4053423342871"]);
  });
  it("codul intern doar când lipsesc amândouă", () => {
    expect(productCodes({ externalId: "1221852", mpn: " ", gtin: null })).toEqual(["Cod intern 1221852"]);
  });
});

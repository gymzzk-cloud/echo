import { describe, expect, it } from "vitest";
import { feedQuality, gtinValid, ISSUE_SAMPLE, productIssues } from "@/core/feed-quality";
import type { FeedProduct } from "@/core/feed";

const desc = "cuvânt ".repeat(60);
const ok = (i: number, o: Partial<FeedProduct> = {}): FeedProduct => ({
  id: `p${i}`, externalId: `e${i}`, title: `Bosch GSR 12V-15 ${i}`, description: desc, url: `https://shop.ro/p/${i}`, imageUrl: `https://shop.ro/i/${i}.jpg`,
  price: 100, currency: "RON", inStock: true, brand: "Bosch", category: "Scule", gtin: "4006381333931", mpn: null, labels: [], ...o,
});

describe("EAN cu cifra de control", () => {
  it("acceptă EAN-13, EAN-8, UPC-12 corecte", () => {
    expect(gtinValid("4006381333931")).toBe(true);
    expect(gtinValid("96385074")).toBe(true);
    expect(gtinValid("036000291452")).toBe(true);
  });
  it("respinge cifra de control greșită, lungimi greșite, litere", () => {
    expect(gtinValid("4006381333932")).toBe(false);
    expect(gtinValid("12345")).toBe(false);
    expect(gtinValid("40063813339AB")).toBe(false);
  });
});

describe("problemele unui produs", () => {
  it("produs complet: nicio problemă", () => expect(productIssues(ok(1))).toEqual([]));
  it("fără stoc nu e o problemă de calitate", () => expect(productIssues(ok(1, { inStock: false }))).toEqual([]));
  it("le găsește pe toate, în ordinea din listă", () => {
    expect(productIssues(ok(1, { title: " ", url: "/p/1", imageUrl: null, price: 0, brand: "N/A", gtin: null, description: null, category: null })))
      .toEqual(["no_title", "no_link", "no_image", "no_price", "no_brand", "no_gtin", "no_description", "no_category"]);
  });
  it("EAN greșit e altă problemă decât EAN lipsă", () => {
    expect(productIssues(ok(1, { gtin: "4006381333932" }))).toEqual(["bad_gtin"]);
    expect(productIssues(ok(1, { gtin: "" }))).toEqual(["no_gtin"]);
  });
  it("descrierea identică cu titlul e ca lipsă; una scurtă e scurtă", () => {
    expect(productIssues(ok(1, { description: "<p>Bosch GSR 12V-15 1</p>" }))).toEqual(["no_description"]);
    expect(productIssues(ok(1, { description: "Mașină de găurit compactă." }))).toEqual(["short_description"]);
  });
  it("titlu peste 150 de caractere", () => expect(productIssues(ok(1, { title: "x".repeat(151) }))).toEqual(["long_title"]));
});

describe("verificarea feed-ului", () => {
  it("feed gol: scor 0, fără probleme", () => {
    expect(feedQuality([])).toEqual({ checked: 0, perfect: 0, accepted: 0, score: 0, issues: [] });
  });
  it("100% doar când nu e nimic de reparat", () => {
    expect(feedQuality([ok(1), ok(2)]).score).toBe(100);
    const q = feedQuality([ok(1), ok(2), ok(3, { gtin: null })]);
    expect(q.score).toBe(66);
    expect(q.perfect).toBe(2);
    expect(q.accepted).toBe(3);
  });
  it("ce blochează vine primul, apoi după număr; acceptate exclude respinsele", () => {
    const q = feedQuality([ok(1, { gtin: null }), ok(2, { gtin: null }), ok(3, { price: null })]);
    expect(q.issues.map((i) => [i.id, i.count])).toEqual([["no_price", 1], ["no_gtin", 2]]);
    expect(q.accepted).toBe(2);
  });
  it("lista fiecărei probleme pune produsele focus întâi și e plafonată", () => {
    const items = Array.from({ length: ISSUE_SAMPLE + 10 }, (_, i) => ok(i, { gtin: null }));
    const q = feedQuality(items, new Set([`p${ISSUE_SAMPLE + 5}`]));
    const g = q.issues[0];
    expect(g.count).toBe(ISSUE_SAMPLE + 10);
    expect(g.focus).toBe(1);
    expect(g.sample).toHaveLength(ISSUE_SAMPLE);
    expect(g.sample[0]).toBe(`p${ISSUE_SAMPLE + 5}`);
  });
});

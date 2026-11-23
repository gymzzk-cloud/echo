import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { focusFirstDetail, type AuditResult } from "@/core/audit";
import { MIN_FOCUS_POOL, promptPool } from "@/core/prompts";
import { menuCategories, menuCategoryLinks, sitemapPagesPerCategory } from "@/core/onboarding/home";

describe("promptPool: întrebările se aleg întâi din produsele focus", () => {
  const items = (n: number, focus: boolean) => Array.from({ length: n }, (_, i) => ({ id: `${focus ? "f" : "x"}${i}`, focus }));
  it("folosește doar produsele focus când sunt destule", () => {
    const pool = promptPool([...items(MIN_FOCUS_POOL, true), ...items(100, false)]);
    expect(pool).toHaveLength(MIN_FOCUS_POOL);
    expect(pool.every((p) => p.focus)).toBe(true);
  });
  it("cade pe tot catalogul când setul focus e prea mic sau lipsește", () => {
    expect(promptPool([...items(3, true), ...items(50, false)])).toHaveLength(53);
    expect(promptPool(items(10, false))).toHaveLength(10);
    expect(promptPool([])).toEqual([]);
  });
});

describe("focusFirstDetail: recomandarea arată întâi produsele focus", () => {
  const check = { id: "content-product", detail: "Din 25.673 produse în stoc…", evidence: [{ label: "Catalogul conectat", value: "68% din 25.673 produse au descriere bună" }] };
  const focus: AuditResult["focus"] = { score: 87, products: 3209, checks: [{ id: "content-product", group: "continut", title: "x", status: "warn", detail: "d", weight: 1, evidence: [{ label: "Produse focus", value: "67% din 2.863 produse au descriere bună" }] } as never] };
  it("pune focusul înaintea întregului magazin", () => {
    const t = focusFirstDetail(check, focus);
    expect(t.indexOf("Produse focus: 67% din 2.863")).toBe(0);
    expect(t).toContain("Tot magazinul: 68% din 25.673");
  });
  it("fără variantă focus păstrează textul verificării", () => {
    expect(focusFirstDetail(check, undefined)).toBe(check.detail);
    expect(focusFirstDetail({ ...check, id: "llms" }, focus)).toBe(check.detail);
  });
});

describe("categorii din site înainte de feed (pagini, nu produse)", () => {
  const html = `<nav><a href="/ro/scule-electrice">Scule electrice</a><a href="/ro/gradina/">Grădină</a><a href="/ro/cos">Coș</a><a href="?cat=5">Oferte speciale</a><a href="/ro/scule-electrice">SCULE ELECTRICE</a></nav>`;
  const $ = cheerio.load(html);
  it("ia categoriile din meniu cu adresa lor, fără coș sau promoții, fără dubluri", () => {
    expect(menuCategoryLinks($, "https://www.shop.ro/ro")).toEqual([
      { name: "Scule electrice", href: "https://www.shop.ro/ro/scule-electrice" },
      { name: "Grădină", href: "https://www.shop.ro/ro/gradina/" },
    ]);
    expect(menuCategories($)).toEqual(["Scule electrice", "Grădină"]);
  });
  it("numără paginile din sitemap de sub fiecare categorie (cu sau fără www, fără pagina categoriei)", () => {
    const links = menuCategoryLinks($, "https://www.shop.ro/ro");
    const urls = ["https://shop.ro/ro/scule-electrice", "https://shop.ro/ro/scule-electrice/bormasina-x", "https://www.shop.ro/ro/scule-electrice/a/b", "https://shop.ro/ro/scule-electrice-promo/z", "https://shop.ro/ro/gradina/furtun"];
    expect(sitemapPagesPerCategory(links, urls)).toEqual([{ name: "Scule electrice", pages: 2 }, { name: "Grădină", pages: 1 }]);
  });
  it("fără listă de adrese sau fără adresă proprie: „nu am putut număra” (null), nu zero", () => {
    expect(sitemapPagesPerCategory([{ name: "A", href: "https://shop.ro/ro/a" }], null)).toEqual([{ name: "A", pages: null }]);
    expect(sitemapPagesPerCategory([{ name: "B", href: "https://shop.ro/?cat=5" }, { name: "C", href: "" }], ["https://shop.ro/x"])).toEqual([{ name: "B", pages: null }, { name: "C", pages: null }]);
  });
});

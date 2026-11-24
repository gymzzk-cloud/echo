import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { buildTrialPrompts } from "@/core/onboarding/prompts";
import { brandShare, computeTeaser, type TeaserRun } from "@/core/onboarding/teaser";
import { extractHomeCatalog, homeLogo } from "@/core/onboarding/home";
import { advance, cleanDomain, cleanList, domainFromName, TRIAL_QUESTIONS } from "@/core/onboarding/types";

const base = { storeName: "ShopExpert", categories: ["Scule electrice", "Grădină"], brands: ["Makita", "Bosch"], products: ["Makita DHP485Z", "Bosch GSR 12V"], focus: "buy" as const, markets: ["RO" as const] };

describe("buildTrialPrompts", () => {
  it("cel mult numărul de întrebări al testului, fără dubluri", () => {
    const q = buildTrialPrompts(base);
    expect(q.length).toBeLessThanOrEqual(TRIAL_QUESTIONS);
    expect(new Set(q.map((x) => x.text.toLowerCase())).size).toBe(q.length);
  });
  it("e determinist: aceleași date dau aceleași întrebări", () => {
    expect(buildTrialPrompts(base)).toEqual(buildTrialPrompts(base));
  });
  it("doar întrebări punctuale despre produse și despre magazin, niciuna generală pe categorie (A16)", () => {
    const q = buildTrialPrompts({ ...base, city: "Cluj-Napoca" });
    expect(q.every((x) => x.source === "magazin" || x.source === "produs" || x.source === "comparatie")).toBe(true);
    expect(q.some((x) => /scule|grădină|cum aleg|cel mai bun/i.test(x.text))).toBe(false);
    expect(q.map((x) => x.text)).toContain("Makita DHP485Z preț");
    expect(q.map((x) => x.text)).toContain("Makita DHP485Z sau Bosch GSR 12V?");
  });
  it("10 produse umplu testul; „preț” vine înaintea numelui simplu", () => {
    const products = Array.from({ length: 10 }, (_, i) => `Bosch GSR 12V-${i + 10}`);
    const q = buildTrialPrompts({ ...base, products });
    expect(q).toHaveLength(TRIAL_QUESTIONS);
    expect(q.findIndex((x) => x.text === "Bosch GSR 12V-19 preț")).toBeLessThan(q.findIndex((x) => x.text === "Bosch GSR 12V-10"));
  });
  it("profil gol: doar întrebările despre magazin", () => {
    const q = buildTrialPrompts({ ...base, categories: [], brands: [], products: [] });
    expect(q.every((x) => x.source === "magazin")).toBe(true);
    expect(q.length).toBeGreaterThan(0);
  });
  it("Ungaria: întrebări în maghiară doar din nume de produse, cel mult o treime", () => {
    const q = buildTrialPrompts({ ...base, markets: ["RO", "HU"] });
    const hu = q.filter((x) => x.language === "hu");
    expect(hu.length).toBeGreaterThan(0);
    expect(hu.length).toBeLessThanOrEqual(Math.ceil(q.length / 3) + 1);
    expect(hu.some((x) => /scule|grădină/i.test(x.text))).toBe(false);
  });
  it("doar Ungaria: nicio întrebare în română", () => {
    expect(buildTrialPrompts({ ...base, markets: ["HU"] }).every((x) => x.language === "hu")).toBe(true);
  });
});

const run = (promptId: string, provider: string, mentions: [string, number][]): TeaserRun =>
  ({ promptId, provider, mentions: mentions.map(([domain, position]) => ({ domain, position, name: domain })) as TeaserRun["mentions"] });

describe("computeTeaser", () => {
  it("fără răspunsuri: zero, fără împărțire la zero", () => {
    const t = computeTeaser([], ["shopexpert.com"], "ShopExpert");
    expect(t.visibility).toBe(0);
    expect(t.avgPosition).toBeNull();
    expect(t.rank).toBe(1);
    expect(t.table).toHaveLength(1);
  });
  it("numără adresele tale (inclusiv cele secundare) ca tine, nu ca concurent", () => {
    const t = computeTeaser([
      run("a", "chatgpt", [["dedeman.ro", 1], ["shopexpert.com", 2]]),
      run("a", "gemini", [["shop-expert.ro", 1]]),
      run("b", "chatgpt", [["dedeman.ro", 1], ["emag.ro", 2]]),
      run("b", "gemini", [["emag.ro", 1]]),
    ], ["shopexpert.com", "shop-expert.ro"], "ShopExpert");
    expect(t.myHits).toBe(2);
    expect(t.visibility).toBe(50);
    expect(t.avgPosition).toBe(1.5);
    expect(t.missingPrompts).toBe(1);
    expect(t.table.some((r) => r.domain === "shop-expert.ro")).toBe(false);
  });
  it("tu apari mereu în tabel, cu locul real, chiar dacă nu ești în primii 5", () => {
    const others = ["a.ro", "b.ro", "c.ro", "d.ro", "e.ro", "f.ro"];
    const t = computeTeaser([run("p", "chatgpt", others.map((d, i) => [d, i + 1]))], ["shopexpert.com"], "ShopExpert", 5);
    expect(t.table).toHaveLength(5);
    expect(t.table[4].me).toBe(true);
    expect(t.rank).toBe(7);
  });
});

describe("brandShare", () => {
  it("găsește marca ca cuvânt întreg, fără potriviri parțiale", () => {
    const r = brandShare(["Recomand Makita și Bosch.", "Boschetti nu e o marcă de scule."], ["Makita", "Bosch"]);
    expect(r).toEqual([{ brand: "Makita", visibility: 50 }, { brand: "Bosch", visibility: 50 }]);
  });
  it("fără răspunsuri: listă goală", () => expect(brandShare([], ["Makita"])).toEqual([]));
});

describe("extractHomeCatalog", () => {
  it("citește meniul, mărcile și produsele, fără paginile de cont sau coș", () => {
    const $ = cheerio.load(`<nav><a href="/">Acasă</a><a href="/scule">Scule electrice</a><a href="/gradina">Grădină</a><a href="/cos">Coș</a><a href="/contact">Contact</a></nav>
      <a href="/brand/makita">Makita</a><div class="product-card__title">Makita DHP485Z mașină de găurit</div>`);
    const h = extractHomeCatalog($, [{ "@type": "Product", name: "Bosch GSR 12V", brand: { name: "Bosch" } }]);
    expect(h.categories).toEqual(["Scule electrice", "Grădină"]);
    expect(h.brands).toEqual(["Bosch", "Makita"]);
    expect(h.products).toEqual(["Bosch GSR 12V", "Makita DHP485Z mașină de găurit"]);
  });
  it("pagină goală: liste goale, fără siglă", () => expect(extractHomeCatalog(cheerio.load(""), [])).toEqual({ categories: [], categoryLinks: [], brands: [], products: [], logo: null, logos: [], siteName: null }));
});

describe("homeLogo", () => {
  const url = "https://www.magazin.ro/ro/";
  it("preferă Organization.logo din datele structurate", () => {
    expect(homeLogo(cheerio.load(`<header><img class="logo" src="/a.png"></header>`), [{ "@type": "Organization", logo: { url: "https://cdn.magazin.ro/logo.svg" } }], url)).toBe("https://cdn.magazin.ro/logo.svg");
  });
  it("apoi imaginea din antet, cu adresa relativă făcută absolută", () => {
    expect(homeLogo(cheerio.load(`<header><a class="site-logo" href="/"><img src="img/logo.png"></a></header>`), [], url)).toBe("https://www.magazin.ro/ro/img/logo.png");
  });
  it("altfel iconița mare; ignoră data: și javascript:", () => {
    const $ = cheerio.load(`<head><link rel="icon" href="data:image/png;base64,AAA"><link rel="apple-touch-icon" href="javascript:alert(1)"><link rel="icon" sizes="32x32" href="/fav.png"></head>`);
    expect(homeLogo($, [], url)).toBe("https://www.magazin.ro/fav.png");
  });
  it("fără siglă: null", () => expect(homeLogo(cheerio.load("<p>x</p>"), [], url)).toBeNull());
});

describe("cleanList / cleanDomain / advance", () => {
  it("cleanList: taie spațiile, scoate dublurile și respectă limita", () => {
    expect(cleanList(" Makita ,makita\nBosch;  DeWalt ", 2)).toEqual(["Makita", "Bosch"]);
    expect(cleanList(["a", "ok"])).toEqual(["ok"]);
  });
  it("cleanDomain: din adresă scrisă de om", () => {
    expect(cleanDomain("https://www.Shop-Expert.ro/hu?x=1")).toBe("shop-expert.ro");
    expect(cleanDomain("nu e domeniu")).toBeNull();
  });
  it("advance: merge înainte, nu dă înapoi când clientul revine la un pas", () => {
    expect(advance("scan", "scan")).toBe("identity");
    expect(advance("markets", "identity")).toBe("markets");
    expect(advance("result", "result")).toBe("result");
  });
});

describe("scanare: mărci cunoscute, nume, sigle", () => {
  it("găsește marca din titlu și din textele alternative ale siglelor", async () => {
    const { knownBrandsIn } = await import("@/core/onboarding/home");
    expect(knownBrandsIn(["Scule electrice DEWALT", "logo makita", "Bosch Professional GSR"])).toEqual(expect.arrayContaining(["DeWalt", "Makita", "Bosch"]));
    expect(knownBrandsIn(["Boschetti", "totaling"])).toEqual([]);
  });
  it("mărcile din pagina reală: titlu + caruselul de sigle", () => {
    const $ = cheerio.load(`<title>Scule electrice DEWALT | Hardline Construct</title><div class="owl-carousel"><img alt="Stanley"><img alt="DeWalt logo"></div>`);
    expect(extractHomeCatalog($, []).brands).toEqual(expect.arrayContaining(["DeWalt", "Stanley"]));
  });
  it("sigla încărcată leneș: ia data-src, nu înlocuitorul, și trece pe https", async () => {
    const { homeLogos } = await import("@/core/onboarding/home");
    const $ = cheerio.load(`<header><a class="logo"><img src="/img/lazy.gif" data-src="http://cdn.hl.ro/logo.png"></a></header><link rel="icon" href="/fav.ico">`);
    expect(homeLogos($, [], "https://hl.ro/")).toEqual(["https://cdn.hl.ro/logo.png", "https://hl.ro/fav.ico"]);
  });
  it("numele magazinului nu e luat din titlul unei categorii", async () => {
    const { storeNameFrom } = await import("@/core/onboarding");
    const facts = { title: "Scule electrice DEWALT | Hardline Construct" } as never;
    expect(storeNameFrom({ facts, home: { categories: [], brands: [], products: [] } }, "hardlineconstruct.ro")).toBe("Hardline Construct");
    expect(storeNameFrom({ facts: { title: "Scule electrice DEWALT" } as never, home: { categories: [], brands: [], products: [] } }, "hardlineconstruct.ro")).toBeNull();
    expect(storeNameFrom({ facts, home: { categories: [], brands: [], products: [], siteName: "Hardline" } }, "hardlineconstruct.ro")).toBe("Hardline");
  });
  it("„Promoții %” nu e o categorie", () => {
    expect(extractHomeCatalog(cheerio.load(`<nav><a href="/a">Scule electrice</a><a href="/p">Promotii %</a></nav>`), []).categories).toEqual(["Scule electrice"]);
  });
});

describe("domainFromName", () => {
  it("concurent scris doar cu numele", () => {
    expect(domainFromName("Dedeman")).toBe("dedeman.ro");
    expect(domainFromName("Atelierul Tău")).toBe("atelierultau.ro");
    expect(domainFromName("Praktiker", "hu")).toBe("praktiker.hu");
    expect(domainFromName("x")).toBeNull();
  });
});

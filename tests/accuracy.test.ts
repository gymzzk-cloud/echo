import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { legalSignals, productDescriptionWords, sitemapUnsure } from "@/core/audit/signals";
import { canAct, isBrandSite, notRivals, sourceKind } from "@/core/source-kind";
import { toneOf } from "@/core/reputation";
import { categoryHead, llmsFix, jsonLdFix } from "@/core/audit/fixes";
import { GOLDEN, goldenAuditIssues, goldenClassifierIssues } from "@/core/golden";
import type { AuditResult, Check } from "@/core/audit";

/**
 * Afirmații greșite găsite pe producție la ShopExpert RO (23.11.2026), fiecare cu testul care le-ar fi prins.
 * KNOWLEDGE A0, B32: o verificare nesigură spune „nu am putut verifica”, nu „lipsește”.
 */

describe("sitemap: nesigur ≠ lipsă", () => {
  it("un sitemap care nu a răspuns la timp nu înseamnă că lipsește", () => {
    expect(sitemapUnsure([{ url: "https://www.shopexpert.com/ro/sitemap.xml", status: 0, kind: "timeout", locs: 0 }, { url: "https://www.shopexpert.com/sitemap.xml", status: 200, kind: "html", locs: 0 }])).toBe(true);
  });
  it("doar pagini HTML în toate locurile: lipsește cu adevărat", () => {
    expect(sitemapUnsure([{ url: "https://x.ro/sitemap.xml", status: 200, kind: "html", locs: 0 }, { url: "https://x.ro/sitemap.xml.gz", status: 404, kind: "other", locs: 0 }])).toBe(false);
  });
});

describe("datele firmei", () => {
  it("găsește CUI-ul fără etichetă, lângă numărul de la Registrul Comerțului (Termeni ShopExpert)", () => {
    const html = "<p>înregistrată la Registrul Comerțului: J05/1646/2004, RO16766463. Bunuri - orice produs</p>";
    expect(legalSignals(html).cui).toBe("RO16766463");
  });
  it("găsește CUI-ul cu etichetă", () => {
    expect(legalSignals("<footer>CUI: RO 12345678</footer>").cui).toBe("RO12345678");
  });
  it("nu inventează un CUI din orice „RO” urmat de cifre fără Registrul Comerțului", () => {
    expect(legalSignals("<p>Cod produs RO12345678</p>").cui).toBeUndefined();
  });
  it("ANPC doar din linkuri reale (anpc.ro sau SOL)", () => {
    expect(legalSignals('<a href="https://anpc.ro/ce-este-sal/">SAL</a>').anpc).toBe(true);
    expect(legalSignals("<p>salvează sol</p>").anpc).toBe(false);
  });
});

describe("descrierea produsului", () => {
  it("citește tab-urile „Detalii tehnice” și „Avantaje”, nu doar câmpul standard", () => {
    const $ = cheerio.load(`<h3>Detalii tehnice</h3><div>Putere 1.800 W Diametrul pânzei 210 mm Turație 5.200 rot/min Greutate 4,8 kg</div>
      <div id="list_specs_prod">Putere: 1.800 W Diametrul pânzei: 210 mm</div>`);
    expect(productDescriptionWords($)).toBeGreaterThan(10);
  });
  it("0 cuvinte când nu recunoaștem structura (auditul spune atunci „nu am putut verifica”)", () => {
    expect(productDescriptionWords(cheerio.load("<div>Preț 899 lei</div>"))).toBe(0);
  });
});

describe("sursele: ce fel de site e și dacă recomandăm ceva", () => {
  const ctx = { ownDomains: ["shopexpert.com", "hardlineconstruct.ro"], competitorDomains: ["emag.ro", "dedeman.ro"], brands: ["BOSCH", "MAKITA", "CROMWELL", "RECORD POWER"] };
  it("propriile domenii și magazinele aceluiași client sunt „site propriu”", () => {
    expect(sourceKind("shopexpert.ro", ctx)).toBe("site propriu");
    expect(sourceKind("hardlineconstruct.ro", ctx)).toBe("site propriu");
  });
  it("site-urile producătorilor nu sunt „editorial / blog”", () => {
    expect(sourceKind("bosch-professional.com", ctx)).toBe("producător");
    expect(sourceKind("makitatools.com", ctx)).toBe("producător");
    expect(isBrandSite("cromwell.co.uk", ctx.brands)).toBe(true);
    expect(isBrandSite("recordpower.co.uk", ctx.brands)).toBe(true);
  });
  it("comparatoare, recenzii, directoare, marketplace", () => {
    expect(sourceKind("cheie-fixa-cheie-inelara.compari.ro", ctx)).toBe("comparator");
    expect(sourceKind("trustpilot.com", ctx)).toBe("recenzii");
    expect(sourceKind("firmadeaur.ro", ctx)).toBe("director de firme");
    expect(sourceKind("ebay.com", ctx)).toBe("marketplace");
    expect(sourceKind("forum.softpedia.com", ctx)).toBe("forum");
    expect(sourceKind("en.wikipedia.org", ctx)).toBe("presă / blog");
  });
  it("alte magazine nu primesc „contactează-i pentru o recenzie”", () => {
    for (const d of ["evostore.ro", "zivtool.ro", "sculeprime.ro", "vexio.ro"]) {
      expect(sourceKind(d, ctx)).toBe("magazin sau alt site");
      expect(canAct(sourceKind(d, ctx))).toBe(false);
    }
    expect(canAct("producător")).toBe(false);
    expect(canAct("site propriu")).toBe(false);
    expect(canAct("comparator")).toBe(true);
  });
  it("producătorii, propriile magazine și site-urile care nu vând nu sunt concurenți", () => {
    expect(notRivals(["bosch-professional.com", "platform.openai.com", "hardlineconstruct.ro", "emag.ro", "dedeman.ro"], ctx).sort())
      .toEqual(["bosch-professional.com", "hardlineconstruct.ro", "platform.openai.com"]);
  });
});

describe("tonul afirmațiilor (B20)", () => {
  it("frazele reale greșit etichetate pe 23.11.2026", () => {
    expect(toneOf("Concluzie: Pe shopexpert.ro, clienții apreciază prețurile, calitatea și serviciul de relații cu clienții în cazul problemelor.")).toBe("pozitiv");
    expect(toneOf("- Un utilizator recomandă să se evite magazinul, afirmând că există multe magazine cu același profil și că ShopExpert ar fi unul de evitat.")).toBe("negativ");
    expect(toneOf("Iată un rezumat rapid și util, bazat pe surse publice recente:")).toBe("neutru");
    expect(toneOf("Recomandări practice (rapid)")).not.toBe("pozitiv");
    expect(toneOf("Principala critică este legată de stocul afișat și de întârzierile la livrare.")).toBe("negativ");
  });
});

describe("„Rezolvă” nu inventează date", () => {
  const ctx = { domain: "shopexpert.com", origin: "https://www.shopexpert.com/ro", storeName: "ShopExpert RO",
    checks: [{ id: "jsonld-org", status: "warn" as const, missing: ["Organization"] }, { id: "jsonld-product", status: "pass" as const }] };
  it("fără siglă găsită nu punem o adresă inventată, iar zilele de retur le completează magazinul", () => {
    const code = jsonLdFix(ctx).code ?? "";
    expect(code).not.toContain("/logo.png");
    expect(code).not.toMatch(/"merchantReturnDays": 14/);
    expect(jsonLdFix({ ...ctx, logo: "https://www.shopexpert.com/logo.svg" }).code).toContain("https://www.shopexpert.com/logo.svg");
  });
  it("llms.txt nu afirmă livrare sau plată neverificate", () => {
    expect(llmsFix(ctx).code).not.toMatch(/Livrare în toată țara|ramburs/);
  });
  it("categoriile din llms.txt: fără nivel dublat și fără marcă la final", () => {
    expect(categoryHead("Scule de mână > Scule de mână > Chei și capete tubulare > Chei fixe și inelare > CROMWELL", "CROMWELL")).toBe("Scule de mână > Chei și capete tubulare");
  });
});

describe("magazinul etalon (ShopExpert RO)", () => {
  const check = (id: string, status: Check["status"], extra: Partial<Check> = {}): Check => ({ id, group: "acces", title: id, status, detail: "", weight: 1, ...extra });
  const audit = (checks: Check[], cui?: string): AuditResult => ({
    url: GOLDEN.url, domain: GOLDEN.domain, fetchedAt: "", score: 0, checks, bots: [], sitemapUrl: GOLDEN.sitemap,
    facts: { hasReturnPolicy: true, hasTerms: true, hasContact: true, hasAnpc: false, trustmarks: [], socials: [], cui },
  });
  it("prinde afirmațiile false de azi: sitemap lipsă, descriere lipsă, CUI negăsit", () => {
    const issues = goldenAuditIssues(audit([check("sitemap", "warn"), check("content-product", "fail", { detail: "Nu am găsit o descriere de produs vizibilă în pagină." }), check("trust", "warn"), check("jsonld-product", "pass")]));
    expect(issues.map((i) => i.claim.split(":")[0])).toEqual(["Sitemap", "Descrieri", "Semnale de încredere"]);
  });
  it("„nu am putut verifica” nu e o afirmație falsă", () => {
    expect(goldenAuditIssues(audit([check("sitemap", "unknown"), check("content-product", "unknown"), check("trust", "pass"), check("jsonld-product", "pass")], "RO16766463"))).toEqual([]);
  });
  it("clasificarea domeniilor pe etalon e corectă", () => {
    expect(goldenClassifierIssues()).toEqual([]);
  });
});

describe("tonul: sfaturile nu sunt critici", () => {
  it("„pentru a evita” nu e negativ, „să se evite magazinul” este", () => {
    expect(toneOf("Protejează coletul pentru a evita deteriorarea la transport.")).not.toBe("negativ");
    expect(toneOf("Un client spune să se evite magazinul din cauza livrărilor.")).toBe("negativ");
  });
});

describe("prima pagină: producătorii și propriile magazine nu sunt „în locul tău”", () => {
  it("whoRecommends și cota ignoră domeniile excluse", async () => {
    const { whoRecommends, shareOfRecommendations } = await import("@/core/insights");
    const m = (domain: string, position: number) => ({ domain, name: domain, position });
    const rows = [{ run: { runDate: "2026-11-23", provider: "claude", model: "x", answer: "", mentions: [m("bosch-professional.com", 1), m("hardlineconstruct.ro", 2), m("evostore.ro", 3)] } }] as unknown as Parameters<typeof whoRecommends>[0];
    const ex = new Set(["bosch-professional.com", "hardlineconstruct.ro"]);
    expect(whoRecommends(rows, "shopexpert.com", null, [], ex).find((w) => w.provider === "claude")?.instead).toBe("evostore.ro");
    expect(shareOfRecommendations(rows, "shopexpert.com", 3, ex).map((s) => s.domain)).not.toContain("bosch-professional.com");
  });
});

describe("llms.txt: categoriile din tot catalogul", () => {
  it("numără din categoriile pe tot catalogul, nu din primele produse", () => {
    const code = llmsFix({ domain: "shopexpert.com", origin: "https://www.shopexpert.com/ro", storeName: "ShopExpert RO", checks: [],
      categories: [{ category: "Scule electrice > Rotopercutoare > BOSCH", brand: "BOSCH", n: 900 }, { category: "Scule electrice > Rotopercutoare > MAKITA", brand: "MAKITA", n: 300 }, { category: "Accesorii > Găurire", brand: "BOSCH", n: 92 }],
      products: [] }).code ?? "";
    expect(code).toContain("- Scule electrice > Rotopercutoare (1200 produse)");
    expect(code.indexOf("Rotopercutoare")).toBeLessThan(code.indexOf("Accesorii > Găurire"));
  });
});

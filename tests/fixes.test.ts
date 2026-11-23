import { describe, expect, it } from "vitest";
import {
  brandFix, buildTitle, catalogContext, categoryFix, gtinFix, inventedNumbers, isValidGtin, productType, ruleFixes, scoreAiDescription, scoreAiTitle, titleFix,
  type FixProduct,
} from "@/core/fixes/rules";
import { planFixWrites, type ExistingFix } from "@/core/fixes/plan";
import { fixPrompt, parseFixAnswer, type AiItem } from "@/core/fixes/ai";

const P = (o: Partial<FixProduct> & { id: string; title: string }): FixProduct => ({
  brand: null, category: null, gtin: null, mpn: null, descLength: 0, eanLabeled: null, eanBare: null, ...o,
});

describe("GTIN", () => {
  it("validează cifra de control (EAN-13, UPC-12, EAN-8)", () => {
    expect(isValidGtin("4006381333931")).toBe(true);
    expect(isValidGtin("4006381333932")).toBe(false);
    expect(isValidGtin("088381788731")).toBe(true);
    expect(isValidGtin("96385074")).toBe(true);
    expect(isValidGtin("B-08137")).toBe(false);
    expect(isValidGtin("")).toBe(false);
  });

  it("curăță semnele dintr-un GTIN valid, dar nu și spațiile pe care feed-ul le scoate deja", () => {
    expect(gtinFix(P({ id: "1", title: "x", gtin: "4006381-333931" }), catalogContext([]))).toMatchObject({ value: "4006381333931", confidence: 95 });
    expect(gtinFix(P({ id: "1", title: "x", gtin: "4006381 333931" }), catalogContext([]))).toBeNull();
  });

  it("un cod de producător în câmpul GTIN: feed-ul îl lasă deja gol, deci nu propunem nimic fără un EAN real", () => {
    expect(gtinFix(P({ id: "1", title: "MAKITA JV001GD201", gtin: "JV001GD201", mpn: "JV001GD201" }), catalogContext([]))).toBeNull();
    const f = gtinFix(P({ id: "1", title: "x", gtin: "JV001GD201", mpn: "JV001GD201", eanLabeled: "4006381333931" }), catalogContext([]));
    expect(f).toMatchObject({ value: "4006381333931" });
    expect(f?.reason).toContain("cod de producător");
  });

  it("un GTIN cu cifra de control greșită, pe care feed-ul l-ar trimite, se scoate", () => {
    expect(gtinFix(P({ id: "1", title: "x", gtin: "4006381333932" }), catalogContext([]))).toMatchObject({ value: "", confidence: 85 });
  });

  it("îl înlocuiește cu EAN-ul din descriere sau de la un produs cu același titlu", () => {
    expect(gtinFix(P({ id: "1", title: "x", eanLabeled: "4006381333931" }), catalogContext([]))).toMatchObject({ value: "4006381333931", confidence: 90 });
    const cat = [P({ id: "a", title: "BOSCH GWS 7-125", gtin: "3165140547956" }), P({ id: "b", title: "BOSCH GWS 7-125" })];
    expect(gtinFix(cat[1], catalogContext(cat))).toMatchObject({ value: "3165140547956", confidence: 70 });
  });

  it("nu propune nimic când două produse cu același titlu au GTIN-uri diferite (nu știm care e)", () => {
    const cat = [P({ id: "a", title: "Set", gtin: "3165140547956" }), P({ id: "b", title: "Set", gtin: "4006381333931" }), P({ id: "c", title: "Set" })];
    expect(gtinFix(cat[2], catalogContext(cat))).toBeNull();
  });

  it("un GTIN valid rămâne cum e", () => {
    expect(gtinFix(P({ id: "1", title: "x", gtin: "4006381333931" }), catalogContext([]))).toBeNull();
  });
});

describe("marcă și categorie", () => {
  const cat = [1, 2, 3, 4, 5].map((i) => P({ id: `m${i}`, title: `MAKITA X${i}`, brand: "MAKITA", category: "Scule > Polizoare > MAKITA" }));
  it("marca lipsă din primul cuvânt al titlului, dacă e o marcă din catalog", () => {
    expect(brandFix(P({ id: "z", title: "MAKITA HR2470" }), catalogContext(cat))).toMatchObject({ value: "MAKITA", confidence: 90 });
    expect(brandFix(P({ id: "z", title: "Necunoscut 123" }), catalogContext(cat))).toBeNull();
  });
  it("categoria lipsă de la marca care are aproape mereu aceeași categorie", () => {
    expect(categoryFix(P({ id: "z", title: "MAKITA HR2470" }), catalogContext(cat), "MAKITA")).toMatchObject({ value: "Scule > Polizoare > MAKITA", confidence: 60 });
  });
  it("tipul produsului sare peste marca pusă la finalul categoriei", () => {
    expect(productType("Scule cu Acumulator > Ferăstraie verticale > MAKITA", "MAKITA")).toBe("Ferăstraie verticale");
    expect(productType(null, "X")).toBeNull();
  });
});

describe("titlu", () => {
  it("nu lipește categoria (la plural) în titlu, iar codurile de model rămân exact", () => {
    expect(buildTitle("BOSCH GWS 14-125 S", "BOSCH", "Scule > Polizoare unghiulare > BOSCH")).toBe("Bosch GWS 14-125 S");
    expect(titleFix(P({ id: "1", title: "BOSCH GTA 50 W" }), "BOSCH", "Scule > Ferăstraie staționare > BOSCH")).toBeNull();
    expect(buildTitle("MAKITA DHR202Z (SOLO)", "MAKITA", "Ciocane > MAKITA")).toBe("Makita DHR202Z (solo)");
    expect(buildTitle("MAKITA FILTRU HEPA DCL282F", "MAKITA", null)).toBe("Makita Filtru hepa DCL282F");
    expect(titleFix(P({ id: "1", title: "RECORD POWER WG250/C" }), "RECORD POWER", null)).toBeNull();
  });
  it("nu adaugă tipul când titlul spune deja ce e produsul", () => {
    expect(titleFix(P({ id: "1", title: "Bosch Set perii colectoare" }), "Bosch", "Piese de schimb > BOSCH")).toBeNull();
  });
  it("nu propune doar pentru majusculele mărcii", () => {
    expect(titleFix(P({ id: "1", title: "MAKITA HR3001CJ" }), "MAKITA", null)).toBeNull();
  });
  it("adaugă marca lipsă", () => {
    expect(titleFix(P({ id: "1", title: "Polizor unghiular GWS 7-125" }), "Bosch", null)).toMatchObject({ value: "Bosch Polizor unghiular GWS 7-125", confidence: 90 });
  });
  it("ruleFixes folosește marca propusă și la titlu", () => {
    const cat = [1, 2, 3, 4, 5].map((i) => P({ id: `b${i}`, title: `BOSCH A${i}`, brand: "BOSCH" }));
    const out = ruleFixes(P({ id: "z", title: "Bormașină BOSCH GSB 13 RE" }), catalogContext(cat));
    expect(out.map((o) => o.field)).toContain("brand");
  });
  it("catalog gol: nicio propunere, fără erori", () => {
    expect(ruleFixes(P({ id: "z", title: "" }), catalogContext([]))).toEqual([]);
  });
});

describe("scorul propunerilor AI (calculat de noi)", () => {
  const src = { title: "BOSCH GWS 7-125", brand: "BOSCH", category: "Polizoare unghiulare", mpn: "06013880A0", description: "Polizor unghiular 720 W, disc 125 mm." };
  it("titlu bun: marcă și cod păstrate, fără cifre inventate", () => {
    expect(scoreAiTitle("Polizor unghiular Bosch GWS 7-125, 720 W, disc 125 mm", src)!.confidence).toBeGreaterThanOrEqual(90);
  });
  it("cifre inventate și cod pierdut scad mult scorul", () => {
    expect(scoreAiTitle("Polizor unghiular Bosch 900 W", src)!.confidence).toBeLessThan(40);
    expect(inventedNumbers("putere 900 W", "720 W")).toEqual(["900"]);
  });
  it("titlu identic nu e o propunere", () => {
    expect(scoreAiTitle("BOSCH GWS 7-125", src)).toBeNull();
  });
  it("descriere fără cifre inventate și fără reclamă", () => {
    const d = "Polizorul unghiular Bosch GWS 7-125 are 720 W și disc de 125 mm. Potrivit pentru tăiere și șlefuire în atelier și pe șantier, cu mâner lateral pentru control.";
    expect(scoreAiDescription(d, src)!.confidence).toBeGreaterThanOrEqual(80);
    expect(scoreAiDescription(`${d} Cel mai bun preț, garanție 5 ani!`, src)!.confidence).toBeLessThan(50);
    expect(scoreAiDescription("scurt", src)).toBeNull();
  });
});

describe("cererea și răspunsul AI", () => {
  const items: AiItem[] = [{ id: "p1", fields: ["title"], title: "BOSCH GWS 7-125", brand: "BOSCH", category: "Polizoare", mpn: null, description: "720 W" }];
  it("trimite doar datele produsului, scurtate", () => {
    const { user, system } = fixPrompt([{ ...items[0], description: "x".repeat(5000) }], "ro", "ShopExpert");
    expect(user.length).toBeLessThan(1500);
    expect(system).toContain("română");
  });
  it("ignoră răspunsurile invalide, id-urile necunoscute și câmpurile necerute", () => {
    expect(parseFixAnswer({ nope: 1 }, items)).toEqual([]);
    const out = parseFixAnswer({ items: [{ id: "p1", title: "Polizor unghiular Bosch GWS 7-125, 720 W", description: "Descriere lungă care nu a fost cerută pentru acest produs, deci trebuie ignorată complet." }, { id: "x", title: "a", description: "" }] }, items);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ field: "title", source: "ai" });
  });
});

describe("ce scriem (idempotent)", () => {
  const c = (o: Partial<Parameters<typeof planFixWrites>[0][number]> = {}) => ({ productId: "p1", field: "gtin" as const, value: "4006381333931", previous: null, source: "regula" as const, confidence: 90, reason: "r", ...o });
  const e = (o: Partial<ExistingFix> = {}): ExistingFix => ({ id: "e1", productId: "p1", field: "gtin", value: "4006381333931", status: "propus", source: "regula", inputHash: "h1", confidence: 90, ...o });
  const hash = new Map([["p1", "h1"]]);

  it("a doua rulare cu aceleași date nu scrie nimic", () => {
    expect(planFixWrites([c()], [e()], hash, null)).toEqual({ upsert: [], remove: [] });
  });
  it("peste prag se aprobă automat, sub prag rămâne de aprobat", () => {
    expect(planFixWrites([c()], [], hash, 80).upsert[0]).toMatchObject({ status: "aprobat", auto: true });
    expect(planFixWrites([c({ confidence: 70 })], [], hash, 80).upsert[0]).toMatchObject({ status: "propus", auto: false });
  });
  it("o decizie (respins) rămâne cât timp produsul nu s-a schimbat", () => {
    expect(planFixWrites([c({ value: "alt" })], [e({ status: "respins" })], hash, null).upsert).toEqual([]);
    expect(planFixWrites([c({ value: "alt" })], [e({ status: "respins" })], new Map([["p1", "h2"]]), null).upsert[0]).toMatchObject({ status: "propus", value: "alt" });
  });
  it("propunerea AI cu aceleași date nu e înlocuită de reguli și nu e ștearsă", () => {
    const ai = e({ field: "title", source: "ai", value: "Titlu AI" });
    expect(planFixWrites([c({ field: "title", value: "Titlu regulă" })], [ai], hash, null).upsert).toEqual([]);
    expect(planFixWrites([], [ai], hash, null).remove).toEqual([]);
  });
  it("propunerile rămase fără motiv (catalog reparat) se șterg", () => {
    expect(planFixWrites([], [e()], hash, null).remove).toEqual(["e1"]);
    expect(planFixWrites([], [e({ status: "aprobat" })], hash, null).remove).toEqual([]);
  });
  it("o reparație aprobată pe date vechi se scoate când produsul s-a schimbat și nu mai e nevoie de ea", () => {
    const changed = new Map([["p1", "h2"]]);
    expect(planFixWrites([], [e({ status: "aprobat", field: "title" })], changed, null).remove).toEqual(["e1"]);
    expect(planFixWrites([], [e({ status: "respins", source: "ai" })], changed, null).remove).toEqual(["e1"]);
    expect(planFixWrites([], [e({ status: "aprobat" })], new Map(), null).remove).toEqual([]);
  });
});

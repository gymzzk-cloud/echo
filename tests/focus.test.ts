import { describe, expect, it } from "vitest";
import { pickFocus, type FocusProduct } from "@/core/focus";
import { focusVariant } from "@/core/audit";
import type { Check } from "@/core/audit";

const p = (id: string, category: string, brand: string, extra: Partial<FocusProduct> = {}): FocusProduct => ({ id, category, brand, inStock: true, rank: null, ...extra });
const catalog = [
  p("drill", "Scule electrice > Rotopercutoare > BOSCH", "BOSCH"),
  p("drill2", "Scule electrice > Rotopercutoare > MAKITA", "MAKITA"),
  p("drill3", "Scule electrice > Rotopercutoare > BOSCH", "BOSCH", { inStock: false }),
  p("washer", "Scule de mână > Elemente de fixare > CROMWELL", "CROMWELL"),
  p("washer2", "Scule de mână > Elemente de fixare > CROMWELL", "CROMWELL"),
  p("tape", "Scule de mână > Adezivi > CROMWELL", "CROMWELL"),
];

describe("Produse focus", () => {
  it("automat: categoriile produselor numite de AI, fără șaibele din alte categorii", () => {
    const r = pickFocus(catalog, { chosen: new Set(), aiNamed: new Set(["drill"]) });
    expect([...r.focus].sort()).toEqual(["drill", "drill2"]);
    expect(r.auto).toEqual(["Scule electrice > Rotopercutoare"]);
    expect(r.counts).toMatchObject({ inStock: 5, focus: 2, aiNamed: 1, fromCategories: 1 });
  });
  it("produsul ales de magazin intră chiar dacă nu e în stoc", () => {
    const r = pickFocus(catalog, { chosen: new Set(["drill3"]), aiNamed: new Set() });
    expect(r.focus.has("drill3")).toBe(true);
    expect(r.counts.chosen).toBe(1);
  });
  it("cele mai vândute intră și dau categoria automată", () => {
    const r = pickFocus(catalog, { chosen: new Set(), aiNamed: new Set() });
    expect(r.auto.length).toBeGreaterThan(0); // fără semnale: cele mai mari categorii
    const best = pickFocus(catalog.map((x) => x.id === "tape" ? { ...x, rank: 1 } : x), { chosen: new Set(), aiNamed: new Set() });
    expect(best.focus.has("tape")).toBe(true);
    expect(best.auto).toEqual(["Scule de mână > Adezivi"]);
  });
  it("alegerea magazinului bate automatul; mărcile filtrează categoriile", () => {
    const r = pickFocus(catalog, { chosen: new Set(), aiNamed: new Set(["drill"]) }, { categories: ["Scule electrice > Rotopercutoare"], brands: ["MAKITA"] });
    expect([...r.focus].sort()).toEqual(["drill", "drill2"]); // drill e numit de AI, drill2 e MAKITA
    const r2 = pickFocus(catalog, { chosen: new Set(), aiNamed: new Set() }, { categories: ["Scule de mână > Elemente de fixare"] });
    expect([...r2.focus].sort()).toEqual(["washer", "washer2"]);
  });
  it("lista de ales: categoriile cu numărul de produse în stoc, cele mai mari întâi", () => {
    const r = pickFocus(catalog, { chosen: new Set(), aiNamed: new Set() });
    expect(r.available.categories[0]).toEqual({ name: "Scule electrice > Rotopercutoare", n: 2 });
  });
});

describe("auditul pe produse focus", () => {
  const checks: Check[] = [
    { id: "robots", group: "acces", title: "r", status: "pass", detail: "", weight: 10 },
    { id: "content-product", group: "continut", title: "Descrieri", status: "fail", detail: "tot", weight: 10, evidence: [{ label: "Catalogul conectat", value: "x" }] },
  ];
  it("scor separat: verificările de site la fel, descrierile pe focus", () => {
    const f = focusVariant({ checks }, { total: 100, pending: 0, good: 90, short: 10, none: 0 })!;
    expect(f.products).toBe(100);
    expect(f.score).toBe(100);
    expect(f.checks[0].detail).toContain("produse focus verificate");
  });
  it("fără date pe focus nu inventăm un scor", () => {
    expect(focusVariant({ checks }, undefined)).toBeUndefined();
    expect(focusVariant({ checks }, { total: 0, pending: 0, good: 0, short: 0, none: 0 })).toBeUndefined();
  });
});

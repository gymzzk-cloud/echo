import { describe, expect, it } from "vitest";
import { applyRules, fillPlaceholders, type FeedProduct } from "@/core/feed";
import { RULE_PRESETS, presetById, suggestRules } from "@/core/feed-rule-presets";

const p = (o: Partial<FeedProduct>): FeedProduct => ({
  id: "1", externalId: "A1", title: "Mașină de găurit GSR 12V", description: "Descriere", url: "https://x.ro/p", imageUrl: null,
  price: 299, currency: "RON", inStock: true, brand: "Bosch", category: "Scule", gtin: "4059952", labels: [], ...o,
});
const rule = (id: string) => {
  const r = presetById(id)!;
  return [{ conditions: [r.condition], actions: [r.action], channels: [], active: true }];
};

describe("valori cu {câmp} în reguli", () => {
  it("pune marca fiecărui produs în fața titlului", () => {
    expect(applyRules(p({}), rule("marca-in-titlu"), "openai")!.title).toBe("Bosch Mașină de găurit GSR 12V");
  });
  it("nu dublează marca dacă titlul o conține deja (oriunde)", () => {
    expect(applyRules(p({ title: "Mașină de găurit BOSCH GSR" }), rule("marca-in-titlu"), "openai")!.title).toBe("Mașină de găurit BOSCH GSR");
  });
  it("aplicată de două ori dă același rezultat", () => {
    const once = applyRules(p({}), rule("marca-in-titlu"), "openai")!;
    expect(applyRules(once, rule("marca-in-titlu"), "openai")!.title).toBe(once.title);
  });
  it("un produs fără marcă rămâne neatins (fără spațiu în față)", () => {
    const r = [{ conditions: [], actions: [{ type: "prefix" as const, field: "title", value: "{brand} " }], channels: [], active: true }];
    expect(applyRules(p({ brand: null }), r, "openai")!.title).toBe("Mașină de găurit GSR 12V");
  });
  it("completează descrierea lipsă cu titlul", () => {
    expect(applyRules(p({ description: null }), rule("descriere-lipsa"), "google")!.description).toBe("Mașină de găurit GSR 12V");
    expect(applyRules(p({}), rule("descriere-lipsa"), "google")!.description).toBe("Descriere");
  });
  it("textul fără {…} rămâne neschimbat", () => {
    expect(fillPlaceholders("| Livrare 24h", p({}))).toBe("| Livrare 24h");
  });
});

describe("reguli propuse pe produsele reale", () => {
  it("catalog fără probleme: nicio regulă propusă", () => {
    expect(suggestRules([p({ title: "Bosch GSR 12V" })], [], "openai")).toEqual([]);
  });
  it("zero produse: nicio regulă propusă", () => {
    expect(suggestRules([], [], "openai")).toEqual([]);
  });
  it("propune doar ce ajută, cu numărul de produse și exemple înainte/după", () => {
    const items = [p({ id: "a", inStock: false, title: "Bosch X" }), p({ id: "b" }), p({ id: "c", title: "Șurubelniță" }), p({ id: "d", description: "", title: "Bosch Y" })];
    const s = suggestRules(items, [], "openai");
    const byId = new Map(s.map((x) => [x.preset.id, x]));
    expect(byId.get("fara-stoc")!.affected).toBe(1);
    expect(byId.get("fara-stoc")!.examples[0].after).toBeNull();
    expect(byId.get("marca-in-titlu")!.affected).toBe(2);
    expect(byId.get("marca-in-titlu")!.examples[0].after!.title).toBe("Bosch Mașină de găurit GSR 12V");
    expect(byId.get("descriere-lipsa")!.affected).toBe(1);
    expect(byId.has("fara-pret")).toBe(false);
    expect(s[0].preset.id).toBe("marca-in-titlu"); // cele mai multe produse primele
  });
  it("nu mai propune o regulă pe care magazinul o are deja", () => {
    const r = presetById("fara-stoc")!;
    const existing = [{ conditions: [r.condition], actions: [r.action], active: true }];
    expect(suggestRules([p({ inStock: false, title: "Bosch X" })], existing, "openai").map((x) => x.preset.id)).not.toContain("fara-stoc");
  });
  it("exemplele sunt cel mult 3", () => {
    const items = Array.from({ length: 10 }, (_, i) => p({ id: String(i), inStock: false, title: `Bosch ${i}` }));
    const s = suggestRules(items, [], "openai")[0];
    expect(s.affected).toBe(10);
    expect(s.examples).toHaveLength(3);
  });
  it("exemplele care doar completează formularul nu sunt propuse singure", () => {
    expect(RULE_PRESETS.find((x) => x.id === "eticheta-scumpe")!.suggest).toBe(false);
    expect(suggestRules([p({ price: 5000, title: "Bosch Z" })], [], "openai")).toEqual([]);
  });
});

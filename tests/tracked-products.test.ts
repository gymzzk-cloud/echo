import { describe, expect, it } from "vitest";
import { monthlyCostEstimate, parseCodes, planAdd } from "@/core/tracked-products";

describe("parseCodes", () => {
  it("un cod pe rând, cu virgulă sau punct și virgulă; fără dubluri și rânduri goale", () => {
    expect(parseCodes("24924\n 5901234123457 ,0611332100;\n\n24924\nx")).toEqual(["24924", "5901234123457", "0611332100"]);
  });
  it("cel mult 500 de coduri", () => {
    expect(parseCodes(Array.from({ length: 600 }, (_, i) => `c${i}`).join("\n"))).toHaveLength(500);
  });
});

describe("planAdd: limita planului", () => {
  it("adaugă până la locurile libere și spune câte n-au încăput", () => {
    expect(planAdd(["a", "b", "c"], new Set(), 28, 30)).toEqual({ add: ["a", "b"], over: ["c"], already: 0 });
  });
  it("cele deja alese nu ocupă loc în plus și nu se dublează", () => {
    expect(planAdd(["a", "a", "b"], new Set(["a"]), 30, 30)).toEqual({ add: [], over: ["b"], already: 2 });
  });
  it("peste limită (plan schimbat): nimic nou", () => {
    expect(planAdd(["a"], new Set(), 40, 30).add).toEqual([]);
  });
});

describe("monthlyCostEstimate", () => {
  it("întrebări × AI-uri × rulări pe lună × costul mediu", () => {
    const e = monthlyCostEstimate(30, 3, 7, { n: 100, usd: 0.5 })!;
    expect(e.questions).toBe(30 * 3 * 4);
    expect(e.usd).toBeCloseTo(360 * 0.005);
  });
  it("fără întrebări luna asta: nu ghicim", () => {
    expect(monthlyCostEstimate(30, 3, 7, { n: 0, usd: 0 })).toBeNull();
  });
});

import { parseSitePrice } from "@/core/product-visibility-job";
describe("parseSitePrice", () => {
  it("formatele din schema.org", () => {
    expect([parseSitePrice("2635.00"), parseSitePrice("2.635,00"), parseSitePrice("2.635"), parseSitePrice(2635), parseSitePrice(""), parseSitePrice(null)]).toEqual([2635, 2635, 2635, 2635, null, null]);
  });
});

describe("isPartialCode (căutarea după o parte din codul producătorului)", () => {
  it("recunoaște bucăți de cod", async () => {
    const { isPartialCode } = await import("@/core/product-sheet/read");
    expect(isPartialCode("N3200")).toBe(true);
    expect(isPartialCode("06019N3200")).toBe(true);
    expect(isPartialCode("gsr")).toBe(false);
    expect(isPartialCode("bosch")).toBe(false);
    expect(isPartialCode("123")).toBe(false);
  });
});

describe("sortTracked (ordinea listei Produse urmărite)", () => {
  it("alese de tine întâi, ultimul adăugat sus; apoi automate după vânzări", async () => {
    const { sortTracked } = await import("@/core/tracked-products");
    const d = (m: number) => new Date(Date.UTC(2026, 10, 23, 17, m));
    const out = sortTracked([
      { title: "auto2", status: "automat" as const, added: d(0), rank: 2 },
      { title: "ales vechi", status: "ales" as const, added: d(1), rank: 1 },
      { title: "auto1", status: "automat" as const, added: d(0), rank: 1 },
      { title: "ales nou", status: "ales" as const, added: d(40), rank: 500 },
    ]);
    expect(out.map((x) => x.title)).toEqual(["ales nou", "ales vechi", "auto1", "auto2"]);
  });
});

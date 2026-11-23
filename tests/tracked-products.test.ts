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

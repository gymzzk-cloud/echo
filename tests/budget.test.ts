import { describe, expect, it } from "vitest";
import { budgetLeft, costConfig, daysBetween, isRunDue, withinBudget } from "../src/core/ai/budget";

describe("costConfig", () => {
  it("are valori implicite prudente", () => {
    expect(costConfig({})).toEqual({ runEveryDays: 7, monthlyBudgetUsd: 5, maxOutputTokens: 2000 });
  });
  it("ignoră valorile greșite sau negative", () => {
    expect(costConfig({ AI_RUN_EVERY_DAYS: "abc", AI_MONTHLY_BUDGET_USD: "-3", AI_MAX_OUTPUT_TOKENS: "10" }))
      .toEqual({ runEveryDays: 7, monthlyBudgetUsd: 5, maxOutputTokens: 256 });
  });
  it("acceptă 0 ca „fără plafon” și minim o zi între rulări", () => {
    const c = costConfig({ AI_MONTHLY_BUDGET_USD: "0", AI_RUN_EVERY_DAYS: "0" });
    expect(c.monthlyBudgetUsd).toBe(0);
    expect(c.runEveryDays).toBe(1);
  });
});

describe("isRunDue", () => {
  it("prima rulare e mereu la termen", () => {
    expect(isRunDue(null, "2026-11-20", 7)).toBe(true);
    expect(isRunDue(undefined, "2026-11-20", 7)).toBe(true);
  });
  it("nu rulează înainte de termen, nici de două ori în aceeași zi", () => {
    expect(isRunDue("2026-11-20", "2026-11-20", 7)).toBe(false);
    expect(isRunDue("2026-11-14", "2026-11-20", 7)).toBe(false);
  });
  it("rulează la termen și peste granița lunii", () => {
    expect(isRunDue("2026-11-13", "2026-11-20", 7)).toBe(true);
    expect(isRunDue("2026-10-28", "2026-11-04", 7)).toBe(true);
    expect(daysBetween("2026-10-28", "2026-11-04")).toBe(7);
  });
});

describe("buget", () => {
  it("fără plafon (0) mereu permite", () => {
    expect(budgetLeft(100, 0)).toBeNull();
    expect(withinBudget(100, 0)).toBe(true);
  });
  it("se oprește exact la plafon", () => {
    expect(budgetLeft(4.99, 5)).toBeCloseTo(0.01);
    expect(withinBudget(4.99, 5)).toBe(true);
    expect(withinBudget(5, 5)).toBe(false);
    expect(budgetLeft(7, 5)).toBe(0);
  });
  it("zero consum = tot bugetul", () => {
    expect(budgetLeft(0, 5)).toBe(5);
    expect(budgetLeft(-1, 5)).toBe(5);
  });
});

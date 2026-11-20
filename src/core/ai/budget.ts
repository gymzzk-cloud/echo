/**
 * Reguli de cost pentru întrebările către AI-uri (logică pură, testată unitar).
 * Valorile implicite se pot schimba din variabile de mediu, fără cod nou.
 */

const num = (v: string | undefined, d: number) => {
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export type CostConfig = {
  /** La câte zile rulăm automat întrebările unui magazin. */
  runEveryDays: number;
  /** Plafonul lunar per magazin, în USD. 0 = fără plafon. */
  monthlyBudgetUsd: number;
  /** Limita de tokeni pentru un răspuns. */
  maxOutputTokens: number;
};

export function costConfig(env: Record<string, string | undefined> = process.env): CostConfig {
  return {
    runEveryDays: Math.max(1, Math.round(num(env.AI_RUN_EVERY_DAYS, 7))),
    monthlyBudgetUsd: num(env.AI_MONTHLY_BUDGET_USD, 5),
    maxOutputTokens: Math.max(256, Math.round(num(env.AI_MAX_OUTPUT_TOKENS, 2000))),
  };
}

/** Zile întregi între două date „YYYY-MM-DD”. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
}

/** E timpul pentru o rulare automată? Prima rulare (fără istoric) e mereu la termen. */
export function isRunDue(lastRunDay: string | null | undefined, today: string, everyDays: number): boolean {
  if (!lastRunDay) return true;
  return daysBetween(lastRunDay, today) >= everyDays;
}

/** Cât mai e din bugetul lunii. null = fără plafon. */
export function budgetLeft(spentUsd: number, budgetUsd: number): number | null {
  if (budgetUsd <= 0) return null;
  return Math.max(0, budgetUsd - Math.max(0, spentUsd));
}

/** Mai putem pune întrebări luna asta? */
export const withinBudget = (spentUsd: number, budgetUsd: number) => {
  const left = budgetLeft(spentUsd, budgetUsd);
  return left === null || left > 0;
};

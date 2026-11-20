import { and, desc, eq, gte, inArray, ne, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { daysAgo } from "./budget";
import { SERP_PROVIDERS, TWO_CREDIT_SUFFIX } from "./serpapi";
import { ERROR_MODEL, type Provider, type RunnerLimits } from "./types";

/**
 * Limitele planurilor gratuite (Gemini, SerpApi), aplicate înainte de apel ca să nu plătim și să nu primim erori 429:
 * ritm pe minut în proces, plafon pe zi și pe lună din baza de date, refolosirea unei rulări recente.
 */

export type LimitUsage = { today: number; monthCredits: number };

/** Motivul pentru care nu mai întrebăm azi, sau null dacă mai avem loc. Logică pură, testată unitar. */
export function limitReason(l: RunnerLimits, used: LimitUsage): string | null {
  if (l.perDay && used.today >= l.perDay) return `Limita zilnică a planului gratuit e atinsă (${l.perDay} întrebări). Continuăm mâine.`;
  if (l.perMonthCredits && used.monthCredits >= l.perMonthCredits) return `Creditele lunare SerpApi s-au terminat (${l.perMonthCredits}). Continuăm luna viitoare sau după ce mărești SERPAPI_MONTHLY_LIMIT.`;
  return null;
}

/** Cât consumăm pentru un provider: rulări reușite azi și credite SerpApi luna aceasta (comune tuturor motoarelor SerpApi). */
export async function limitUsage(provider: Provider, day: string): Promise<LimitUsage> {
  const ok = and(eq(schema.runs.mode, "live"), ne(schema.runs.model, ERROR_MODEL));
  const [t] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.runs)
    .where(and(ok, eq(schema.runs.provider, provider), eq(schema.runs.runDate, day)));
  let monthCredits = 0;
  if (SERP_PROVIDERS.includes(provider)) {
    const [m] = await db.select({ n: dsql<number>`coalesce(sum(case when ${schema.runs.model} like ${`%${TWO_CREDIT_SUFFIX}`} then 2 else 1 end),0)::int` })
      .from(schema.runs)
      // Rulările refolosite au cost 0 și nu consumă credite.
      .where(and(ok, inArray(schema.runs.provider, SERP_PROVIDERS), gte(schema.runs.runDate, `${day.slice(0, 7)}-01`), dsql`${schema.runs.costUsd} > 0`));
    monthCredits = m?.n ?? 0;
  }
  return { today: t?.n ?? 0, monthCredits };
}

/** O rulare reușită a aceleiași întrebări din ultimele `days` zile, de refolosit fără cost. */
export async function recentRun(queryHash: string, provider: Provider, day: string, days: number) {
  const [r] = await db.select().from(schema.runs)
    .where(and(eq(schema.runs.queryHash, queryHash), eq(schema.runs.provider, provider), ne(schema.runs.model, ERROR_MODEL), gte(schema.runs.runDate, daysAgo(day, days - 1)),
      // Doar rulări plătite (originale): o copie refolosită (cost 0) nu prelungește la nesfârșit un răspuns vechi.
      dsql`${schema.runs.costUsd} > 0`))
    .orderBy(desc(schema.runs.runDate)).limit(1);
  return r ?? null;
}

const nextSlot = new Map<Provider, number>();
/** Așteaptă rândul la ritmul de `rpm` cereri pe minut (în procesul worker-ului). Întoarce câte ms a așteptat. */
export async function waitForSlot(provider: Provider, rpm: number | undefined, now = Date.now()): Promise<number> {
  if (!rpm || rpm <= 0) return 0;
  const at = Math.max(now, nextSlot.get(provider) ?? 0);
  nextSlot.set(provider, at + Math.ceil(60_000 / rpm));
  const wait = at - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return wait;
}

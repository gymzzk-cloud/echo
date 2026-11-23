import { and, asc, desc, eq, gte, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ERROR_MODEL } from "./ai/types";
import { failureReason } from "./ai/errors";
import type { DayStat, EngineFailure, EngineProducts, EngineRow } from "./engine-view";

/**
 * Citirile pentru „Pe fiecare AI” și „Ce s-a schimbat”. Doar coloanele de care e nevoie (fără textul răspunsurilor),
 * totalurile în SQL. Fiecare interogare filtrează după magazin; magazinul vine din `currentProject()`, care verifică organizația.
 */

const R = schema.runs;
const PR = schema.promptRuns;
const Q = schema.prompts;

/** Rulările întrebărilor magazinului, fără textul răspunsului (doar motivul, pentru cele eșuate). */
export async function engineRuns(projectId: string, fromDay: string) {
  const all = await db.select({
    promptId: Q.id, provider: R.provider, runDate: R.runDate, mentions: R.mentions, failed: dsql<boolean>`${R.model} = ${ERROR_MODEL}`,
    error: dsql<string | null>`case when ${R.model} = ${ERROR_MODEL} then left(${R.answer}, 500) end`,
  }).from(PR).innerJoin(R, eq(R.id, PR.runId)).innerJoin(Q, eq(Q.id, PR.promptId))
    .where(and(eq(Q.projectId, projectId), gte(R.runDate, fromDay)));
  const rows: EngineRow[] = [];
  const failed: EngineFailure[] = [];
  for (const r of all) {
    if (r.failed) failed.push({ provider: r.provider, runDate: r.runDate, reason: failureReason(r.error ?? "") });
    else rows.push({ promptId: r.promptId, run: { provider: r.provider, runDate: r.runDate, mentions: r.mentions } });
  }
  return { rows, failed };
}

/** Produsele din catalog numite de fiecare AI și cele cu preț greșit (din `product_ai_stats`, ultimele 30 de zile). */
export async function engineProducts(projectId: string): Promise<EngineProducts[]> {
  const r = await db.execute(dsql`
    select p.key as provider, count(*)::int as named,
      count(*) filter (where exists (select 1 from jsonb_array_elements(s.wrong_prices) w where w->>'provider' = p.key))::int as "wrongPrice"
    from product_ai_stats s cross join lateral jsonb_each(s.providers) p
    where s.project_id = ${projectId}
    group by p.key`);
  return r as unknown as EngineProducts[];
}

const A = schema.actions;

/** Ce s-a schimbat și ce urmează: măsurătorile zilnice, ce ai rezolvat și ce e deschis. */
export async function progressData(projectId: string) {
  const [stats, resolved, open, [counts], [edits], [prods]] = await Promise.all([
    db.select({ day: schema.dailyStats.day, provider: schema.dailyStats.provider, visibility: schema.dailyStats.visibility, score: schema.dailyStats.score })
      .from(schema.dailyStats).where(eq(schema.dailyStats.projectId, projectId)).orderBy(asc(schema.dailyStats.day)).limit(2000),
    db.select({ id: A.id, key: A.key, title: A.title, fixKind: A.fixKind, baselineVisibility: A.baselineVisibility, resolvedAt: A.resolvedAt })
      .from(A).where(and(eq(A.projectId, projectId), eq(A.status, "rezolvata"))).orderBy(desc(A.resolvedAt)).limit(5),
    db.select({ id: A.id, key: A.key, title: A.title, why: A.why, fixKind: A.fixKind, impact: A.impact })
      .from(A).where(and(eq(A.projectId, projectId), eq(A.status, "noua")))
      .orderBy(dsql`case ${A.impact} when 'mare' then 0 when 'mediu' then 1 else 2 end`, dsql`case ${A.effort} when 'mic' then 0 when 'mediu' then 1 else 2 end`).limit(3),
    db.select({ resolved: dsql<number>`count(*) filter (where ${A.status} = 'rezolvata')::int`, open: dsql<number>`count(*) filter (where ${A.status} = 'noua')::int` })
      .from(A).where(eq(A.projectId, projectId)),
    db.select({ approved: dsql<number>`count(*) filter (where ${schema.productEdits.status} = 'aprobat')::int`, proposed: dsql<number>`count(*) filter (where ${schema.productEdits.status} = 'propus')::int` })
      .from(schema.productEdits).where(eq(schema.productEdits.projectId, projectId)),
    db.select({ wrongPrice: dsql<number>`count(*) filter (where ${schema.productAiStats.priceWrong})::int`, withoutStore: dsql<number>`count(*) filter (where ${schema.productAiStats.withStore} = 0)::int` })
      .from(schema.productAiStats).where(eq(schema.productAiStats.projectId, projectId)),
  ]);
  return { stats: stats as DayStat[], resolved, open, counts, edits, prods };
}

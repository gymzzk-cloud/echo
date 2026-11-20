import { and, eq, isNull, lt, or, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Mention } from "@/db/schema";
import { daysAgo } from "@/lib/util";
import { extractMentions } from "./ai/extract";
import { invalidateWorld, loadWorld } from "./ai/engine";
import { projectRuns } from "./project-runs";
import { pickAutoRivals, rankRivals } from "./rivals";

/** Fereastra în care căutăm concurenții: ultimele 30 de zile de răspunsuri. */
export const RIVALS_WINDOW_DAYS = 30;

/**
 * Jobul de fundal: citește din nou răspunsurile AI deja salvate ale magazinului (fără apeluri AI noi),
 * clasează magazinele care apar mai bine ca el și le adaugă automat la concurenți.
 * Idempotent: rulat de două ori dă același rezultat (inserări „on conflict do nothing”, aceleași mențiuni).
 */
export async function detectRivals(projectId: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!p) return { added: [] as string[] };
  const rows = await projectRuns(projectId, daysAgo(RIVALS_WINDOW_DAYS));

  // Răspunsurile vechi au fost citite cu regulile de atunci: le recitim cu cele noi (doar text, fără tokeni).
  const world = await loadWorld();
  const fresh = new Map<string, Mention[]>();
  for (const r of rows) {
    if (fresh.has(r.run.id)) continue;
    const ms = extractMentions(r.run.answer, r.run.sources as { url: string; title?: string }[], world, r.run.query);
    fresh.set(r.run.id, ms);
    if (JSON.stringify(ms) !== JSON.stringify(r.run.mentions)) await db.update(schema.runs).set({ mentions: ms }).where(eq(schema.runs.id, r.run.id));
  }
  for (const r of rows) r.run.mentions = fresh.get(r.run.id)!;

  const report = rankRivals(rows, p.domain);
  const [existing, dismissed] = await Promise.all([
    db.select().from(schema.competitors).where(eq(schema.competitors.projectId, projectId)),
    db.select({ domain: schema.competitorDismissals.domain }).from(schema.competitorDismissals).where(eq(schema.competitorDismissals.projectId, projectId)),
  ]);
  const picks = pickAutoRivals(report.rivals, {
    tracked: existing.map((c) => c.domain),
    dismissed: dismissed.map((d) => d.domain),
    autoCount: existing.filter((c) => c.suggested).length,
  });
  if (picks.length) {
    await db.insert(schema.competitors).values(picks.map((r) => ({ projectId, domain: r.domain, name: r.name, suggested: true }))).onConflictDoNothing();
    invalidateWorld();
  }
  await db.update(schema.projects).set({ rivalsCheckedAt: new Date() }).where(eq(schema.projects.id, projectId));
  if (picks.length) console.log(`Concurenți noi pentru ${p.domain}${p.pathPrefix}: ${picks.map((r) => r.domain).join(", ")}`);
  return { added: picks.map((r) => r.domain) };
}

/** Magazinele cu răspunsuri AI, necăutate de concurenți în ultimele 24 de ore (pentru programarea workerului). */
export async function projectsDueForRivals() {
  const rows = await db.select({ id: schema.projects.id }).from(schema.projects)
    .where(and(
      or(isNull(schema.projects.rivalsCheckedAt), lt(schema.projects.rivalsCheckedAt, new Date(Date.now() - 864e5))),
      dsql`exists (select 1 from prompt_runs pr join prompts q on q.id = pr.prompt_id where q.project_id = ${schema.projects.id})`,
    ));
  return rows.map((r) => r.id);
}

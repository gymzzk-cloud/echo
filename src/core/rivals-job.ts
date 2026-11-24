import { and, eq, isNull, lt, or, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Mention } from "@/db/schema";
import { daysAgo } from "@/lib/util";
import { runMentions } from "./ai/extract";
import { invalidateWorld, loadWorld } from "./ai/engine";
import { projectRuns } from "./project-runs";
import { isOwnBrand, pickAutoRivals, rankRivals } from "./rivals";
import { notRivals } from "./source-kind";
import { catalogBrands, storeAliases } from "./store-context";
import { generateActions } from "./projects";

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
  const rows = await projectRuns(projectId, daysAgo(RIVALS_WINDOW_DAYS), { allPrompts: true });

  // Adăugat automat din greșeală: propriul magazin pe alt domeniu (ex. shopexpert.ro pentru shopexpert.com). Îl scoatem
  // înainte de recitire, ca mențiunile lui să fie socotite ale magazinului.
  const ownAuto = await db.select({ id: schema.competitors.id, domain: schema.competitors.domain }).from(schema.competitors)
    .where(and(eq(schema.competitors.projectId, projectId), eq(schema.competitors.suggested, true)));
  const [own, brands] = await Promise.all([storeAliases(p.id), catalogBrands(projectId)]);
  const notRival = new Set(notRivals(ownAuto.map((c) => c.domain), { ownDomains: [p.domain, ...own], brands }));
  // Tot din greșeală: alt magazin al clientului, un producător (bosch-professional.com) sau un site care nu vinde (platform.openai.com).
  const mine = ownAuto.filter((c) => isOwnBrand(c.domain, p.domain) || notRival.has(c.domain));
  for (const c of mine) await db.delete(schema.competitors).where(eq(schema.competitors.id, c.id));
  if (mine.length) invalidateWorld();

  // Răspunsurile vechi au fost citite cu regulile de atunci: le recitim cu cele noi (doar text, fără tokeni).
  const world = await loadWorld();
  const fresh = new Map<string, Mention[]>();
  for (const r of rows) {
    if (fresh.has(r.run.id)) continue;
    const ms = runMentions({ ...r.run, sources: r.run.sources as { url: string; title?: string }[] }, world);
    fresh.set(r.run.id, ms);
    if (JSON.stringify(ms) !== JSON.stringify(r.run.mentions)) await db.update(schema.runs).set({ mentions: ms }).where(eq(schema.runs.id, r.run.id));
  }
  for (const r of rows) r.run.mentions = fresh.get(r.run.id)!;

  const report = rankRivals(rows, p.domain, notRivals(rows.flatMap((r) => (r.run.mentions as Mention[]).map((m) => m.domain)), { ownDomains: [p.domain, ...own], brands }));
  const [all, dismissed] = await Promise.all([
    db.select().from(schema.competitors).where(eq(schema.competitors.projectId, projectId)),
    db.select({ domain: schema.competitorDismissals.domain }).from(schema.competitorDismissals).where(eq(schema.competitorDismissals.projectId, projectId)),
  ]);
  const existing = all;
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
  // Concurenții s-au putut schimba: recomandările (surse, produse numite) se recalculează din aceleași date.
  await generateActions(projectId);
  if (picks.length) console.log(`Concurenți noi pentru ${p.domain}${p.pathPrefix}: ${picks.map((r) => r.domain).join(", ")}`);
  return { added: picks.map((r) => r.domain) };
}

/**
 * Când s-au schimbat ultima dată regulile de citire a răspunsurilor (mențiuni, păreri). Magazinele citite
 * înainte se recitesc la următoarea programare, fără să aștepte 24 de ore. Se mută la fiecare schimbare de reguli.
 */
export const EXTRACT_RULES_CHANGED_AT = new Date("2026-11-23T13:15:00Z");

/** Magazinele cu răspunsuri AI, necăutate de concurenți în ultimele 24 de ore (pentru programarea workerului). */
export async function projectsDueForRivals() {
  const rows = await db.select({ id: schema.projects.id }).from(schema.projects)
    .where(and(
      or(isNull(schema.projects.rivalsCheckedAt), lt(schema.projects.rivalsCheckedAt, new Date(Math.max(Date.now() - 864e5, EXTRACT_RULES_CHANGED_AT.getTime())))),
      dsql`exists (select 1 from prompt_runs pr join prompts q on q.id = pr.prompt_id where q.project_id = ${schema.projects.id})`,
    ));
  return rows.map((r) => r.id);
}

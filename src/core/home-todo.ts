import { and, eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ISSUES, type FeedQuality, type IssueId } from "./feed-quality";
import { actionTitle } from "./audit/problems";

/**
 * Acasă = lista „Ce faci acum” (KNOWLEDGE A52): o singură listă, ordonată după cât ajută, din date reale:
 * problemele feed-ului trimis la AI (numărate pe produse, din verificarea salvată de worker) și acțiunile deschise
 * (audit, surse, prețuri). Ce blochează produse vine primul, apoi impactul mare, apoi ce atinge produsele focus.
 */
export type TodoItem = { key: string; title: string; why: string; href: string; tone: "bad" | "warn" | "muted"; tag: string; actionId?: string };
type Action = { id: string; key: string; title: string; why: string; impact: string; effort: string; fixKind: string | null };
type Quality = Omit<FeedQuality, "issues"> & { issues: { id: IssueId; count: number; focus: number }[] };

const ACTION_LINKS: Record<string, string> = { elsewhere: "/panou/produse-ai?f=fara-magazin", price: "/panou/produse-ai?f=pret", source: "/panou/surse" };
const n = (x: number) => x.toLocaleString("ro-RO");

/** Funcție pură (tests/home-todo.test.ts). */
export function homeTodo(quality: Quality | null, actions: Action[], channel = "openai"): TodoItem[] {
  const info = new Map(ISSUES.map((i) => [i.id, i]));
  const ranked: { rank: number; weight: number; item: TodoItem }[] = [];
  for (const i of quality?.issues ?? []) {
    const d = info.get(i.id);
    if (!d || !i.count) continue;
    const focus = i.focus ? ` (${n(i.focus)} din produsele focus)` : "";
    ranked.push({
      // Blocante: rang 0. Celelalte: după impactul mare al acțiunilor dacă ating produse focus, altfel după.
      rank: d.blocking ? 0 : i.focus ? 2 : 4,
      weight: i.count + i.focus, // produsele focus contează de două ori
      item: {
        key: `feed:${i.id}`, href: `/panou/feed?canal=${channel}&problema=${i.id}#verificare`,
        title: d.blocking ? `${n(i.count)} produse nu ajung la AI: ${d.label.toLowerCase()}` : `${n(i.count)} produse: ${d.label.toLowerCase()}${focus}`,
        why: d.fix, tone: d.blocking ? "bad" : "warn", tag: d.blocking ? "Feed: produse respinse" : "Feed: date slabe",
      },
    });
  }
  const effort: Record<string, number> = { mic: 2, mediu: 1, mare: 0 };
  for (const a of actions) {
    ranked.push({
      rank: a.impact === "mare" ? 1 : a.impact === "mediu" ? 3 : 5,
      weight: effort[a.effort] ?? 0, // la același impact, întâi ce se face repede
      item: {
        key: a.key, title: actionTitle(a), why: a.why, actionId: a.id,
        href: a.fixKind && ACTION_LINKS[a.fixKind] ? ACTION_LINKS[a.fixKind] : a.fixKind ? "/panou/audit#rezolva" : "/panou/actiuni",
        tone: a.impact === "mare" ? "bad" : a.impact === "mediu" ? "warn" : "muted", tag: a.key.startsWith("audit:") ? "Site" : a.fixKind === "source" ? "Surse" : "AI",
      },
    });
  }
  return ranked.sort((a, b) => a.rank - b.rank || b.weight - a.weight).map((r) => r.item);
}

/** Ce citește Acasă: verificarea feed-ului fără listele de produse (un rând mic) și acțiunile deschise. */
export async function readHomeTodo(projectId: string, channel = "openai") {
  const [q, actions] = await Promise.all([
    db.execute(dsql`select jsonb_build_object(
        'checked', data->'quality'->'checked', 'perfect', data->'quality'->'perfect', 'accepted', data->'quality'->'accepted', 'score', data->'quality'->'score',
        'issues', coalesce((select jsonb_agg(i - 'sample') from jsonb_array_elements(data->'quality'->'issues') i), '[]'::jsonb)) as q
      from feed_summaries where project_id = ${projectId} and channel = ${channel} and data ? 'quality'`),
    db.select({ id: schema.actions.id, key: schema.actions.key, title: schema.actions.title, why: schema.actions.why, impact: schema.actions.impact, effort: schema.actions.effort, fixKind: schema.actions.fixKind })
      .from(schema.actions).where(and(eq(schema.actions.projectId, projectId), eq(schema.actions.status, "noua"))).limit(100),
  ]);
  const quality = ((q as unknown as { q: Quality }[])[0]?.q) ?? null;
  return { quality, items: homeTodo(quality, actions, channel) };
}

import { and, eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Mention } from "@/db/schema";
import { daysAgo, today } from "@/lib/util";
import { enqueue } from "./jobs";
import { loadBase, productCounts, overview, trend, leaderboard, whoRecommends, shareOfRecommendations, sourceInsights, type Rows } from "./insights";
import { reputation } from "./reputation";
import type { AuditResult } from "./audit";
import { notRivals, isBrandSite } from "./source-kind";
import { isStoreLike } from "./ai/domains";
import { catalogBrands, orgDomains } from "./store-context";

/**
 * Cifrele paginilor panoului care cer toate rulările pe 30 de zile (mii de răspunsuri cu mențiuni și surse):
 * se calculează în worker (job `panel`) și se salvează în `panel_snapshots`; pagina doar citește un rând.
 * Pe Render gratuit (0,1 procesor), calculul la fiecare deschidere ținea Acasă la 1,5–2 s (KNOWLEDGE B48).
 *
 * `stamp` = din ce date s-a calculat (ziua, rulările, concurenții, produsele numite de AI, auditul). Dacă s-a schimbat ceva, pagina arată
 * cifrele salvate (cu ora calculului) și pune la coadă un calcul nou; doar prima dată, fără nimic salvat, calculează pe loc.
 */

type Project = typeof schema.projects.$inferSelect;

/** Acasă: tot ce afișează pagina din rulări, fără rulările însele. */
async function computeHome(project: Project) {
  const o = await overview(project);
  const [prods, own, brands] = await Promise.all([
    db.select({ title: schema.products.title, price: schema.products.price }).from(schema.products).where(eq(schema.products.projectId, project.id)).limit(5000),
    orgDomains(project.orgId), catalogBrands(project.id),
  ]);
  // Producătorii (Bosch Professional), propriile magazine și site-urile care nu vând nu sunt „în locul tău” (KNOWLEDGE A0, B32).
  const exclude = new Set(notRivals(o.rows.flatMap((r) => ((r.run.mentions as Mention[]) ?? []).map((m) => m.domain)), { ownDomains: [project.domain, ...own], brands }));
  exclude.delete(project.domain);
  const lastWeek = o.rows.map((x) => x.run.runDate).sort().slice(-7)[0];
  const comps = leaderboard(o.rows.filter((r) => r.run.runDate >= lastWeek), project.domain, o.competitors).filter((c) => c.name !== "Tu").slice(0, 3);
  return {
    latest: o.latest ? { day: o.latest.day, score: o.latest.score, visibility: o.latest.visibility, shareOfVoice: o.latest.shareOfVoice } : null,
    weekAgo: o.weekAgo ? { day: o.weekAgo.day, score: o.weekAgo.score } : null,
    perProvider: o.perProvider,
    unchecked: o.unchecked,
    audit: o.audit ? { score: o.audit.score, focusScore: (o.audit.result as { focus?: { score: number } } | null)?.focus?.score ?? null } : null,
    rowCount: o.rows.length,
    comps: comps.map((c) => ({ domain: c.domain, name: c.name })),
    chart: trend(o.rows, project.domain, comps.map((c) => c.domain)),
    who: whoRecommends(o.rows, project.domain, o.audit, prods, exclude),
    share: shareOfRecommendations(o.rows.filter((r) => r.run.runDate >= (o.latest?.day ?? "")), project.domain, 3, exclude),
  };
}

/** „Unde trimit AI-urile cumpărătorii” (pagina Produse): magazine, fără site-uri de producător sau care nu vând. */
export function topDestinations(rows: Rows, domain: string, brands: string[], top = 8) {
  const where = new Map<string, number>();
  for (const { run } of rows) for (const m of run.mentions as Mention[]) {
    if (!isStoreLike(m.domain) || (m.domain !== domain && isBrandSite(m.domain, brands))) continue;
    where.set(m.domain, (where.get(m.domain) ?? 0) + 1);
  }
  return [...where.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
}

async function computeProducts(project: Project) {
  const [{ rows }, brands, counts] = await Promise.all([loadBase(project, 30), catalogBrands(project.id), productCounts(project.id)]);
  return { ...counts, topDestinations: topDestinations(rows, project.domain, brands) };
}

async function computeSources(project: Project) {
  const { rows, competitors } = await loadBase(project, 30);
  const [own, brands] = await Promise.all([orgDomains(project.orgId), catalogBrands(project.id)]);
  const s = sourceInsights(rows, project.domain, competitors.map((c) => c.domain), { ownDomains: own, brands, country: project.country ?? "RO" });
  return { rowCount: rows.length, list: s.list.slice(0, 100), listTotal: s.list.length, gaps: s.gaps.slice(0, 10), gapCount: s.gaps.length };
}

async function computeReputation(project: Project) {
  const { rows, audit } = await loadBase(project, 30);
  return reputation(rows, project.domain, project.name, (audit?.result as AuditResult | undefined)?.facts ?? null);
}

const COMPUTE = { home: computeHome, products: computeProducts, sources: computeSources, reputation: computeReputation };
export type SnapshotKey = keyof typeof COMPUTE;
export type Snapshot<K extends SnapshotKey> = Awaited<ReturnType<(typeof COMPUTE)[K]>>;
export const SNAPSHOT_KEYS = Object.keys(COMPUTE) as SnapshotKey[];

/** Un calcul mai vechi de atât se reface chiar dacă datele de bază par aceleași (prețuri, mărci din catalog). */
const MAX_AGE_MS = 24 * 3600e3;

/**
 * Din ce date s-ar calcula acum: o singură interogare mică (numărători și ultima dată), fără să citească răspunsurile.
 * Ziua intră în ea pentru că ferestrele de 7 și 30 de zile se mută la miezul nopții.
 */
export async function snapshotStamp(project: Project) {
  const r = await db.execute(dsql`select
    (select count(*)::text || '@' || coalesce(max(r.created_at)::text, '') from prompt_runs pr
       join prompts p on p.id = pr.prompt_id join runs r on r.id = pr.run_id
       where p.project_id = ${project.id} and r.run_date >= ${daysAgo(30)}) as runs,
    (select count(*)::text || '@' || coalesce(max(created_at)::text, '') from competitors where project_id = ${project.id}) as comps,
    (select count(*)::text from competitor_dismissals where project_id = ${project.id}) as dismissed,
    (select count(*) filter (where appearances > 0)::text || '/' || count(*) filter (where price_wrong)::text from product_ai_stats where project_id = ${project.id}) as products,
    (select coalesce(max(id::text), '') from audits where project_id = ${project.id} and status = 'done'
       and created_at = (select max(created_at) from audits where project_id = ${project.id} and status = 'done')) as audit`);
  const x = (r as unknown as { runs: string; comps: string; dismissed: string; products: string; audit: string }[])[0];
  return [today(), x.runs, x.comps, x.dismissed, x.products, x.audit, project.domain, project.name].join("|");
}

async function save(projectId: string, key: SnapshotKey, stamp: string, data: unknown) {
  const now = new Date();
  await db.insert(schema.panelSnapshots).values({ projectId, key, stamp, data, computedAt: now })
    .onConflictDoUpdate({ target: [schema.panelSnapshots.projectId, schema.panelSnapshots.key], set: { stamp, data, computedAt: now } });
}

/** Jobul `panel` din worker: reface doar ce nu mai corespunde datelor (rulat de două ori, nu face nimic a doua oară). */
export async function computePanelSnapshots(projectId: string) {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!project) return { computed: [] as string[] };
  const stamp = await snapshotStamp(project);
  const have = await db.select({ key: schema.panelSnapshots.key, stamp: schema.panelSnapshots.stamp, computedAt: schema.panelSnapshots.computedAt })
    .from(schema.panelSnapshots).where(eq(schema.panelSnapshots.projectId, projectId));
  const fresh = new Set(have.filter((h) => h.stamp === stamp && Date.now() - h.computedAt.getTime() < MAX_AGE_MS).map((h) => h.key));
  const computed: string[] = [];
  for (const key of SNAPSHOT_KEYS) {
    if (fresh.has(key)) continue;
    await save(projectId, key, stamp, await COMPUTE[key](project));
    computed.push(key);
    // Panoul are prioritate: o pauză scurtă între calcule, ca cererile lui să nu aștepte după worker.
    await new Promise((res) => setTimeout(res, 50));
  }
  return { computed };
}

/**
 * Ce citește pagina: cifrele salvate și ora calculului. Dacă datele s-au schimbat de atunci (sau calculul are peste 24 h),
 * le arată pe cele salvate, marcate `stale`, și pune la coadă un calcul nou (`JobWatcher` reîncarcă pagina la final).
 * Fără nimic salvat (prima deschidere), calculează pe loc și salvează.
 */
export async function readSnapshot<K extends SnapshotKey>(project: Project, key: K): Promise<{ data: Snapshot<K>; computedAt: Date; stale: boolean }> {
  const [stamp, [row]] = await Promise.all([
    snapshotStamp(project),
    db.select().from(schema.panelSnapshots).where(and(eq(schema.panelSnapshots.projectId, project.id), eq(schema.panelSnapshots.key, key))),
  ]);
  if (!row) {
    const data = await COMPUTE[key](project) as Snapshot<K>;
    await save(project.id, key, stamp, data);
    return { data, computedAt: new Date(), stale: false };
  }
  const stale = row.stamp !== stamp || Date.now() - row.computedAt.getTime() > MAX_AGE_MS;
  if (stale) await enqueue("panel", { projectId: project.id });
  return { data: row.data as Snapshot<K>, computedAt: row.computedAt, stale };
}

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { finishJob, enqueue, pickJob, pendingJobs, requeueInterrupted, setCurrentJob } from "@/core/jobs";
import { computeFocus } from "@/core/focus";
import { refreshPrompts } from "@/core/tracked-prompts";
import { allProjectIds, auditProject, runAuditRow, runProject, syncCatalog, dueConnections } from "@/core/projects";
import { buildWeeklyReport, sendReport } from "@/core/report";
import { today } from "@/lib/util";
import { checkWatches } from "@/core/watches";
import { deliverWebhook } from "@/core/platform";
import { isDemo } from "@/core/ai/engine";
import { costConfig, isRunDue } from "@/core/ai/budget";
import { generateFeedFiles, projectsWithStaleFeeds } from "@/core/feed-files";
import { computeFeedSummaries } from "@/core/feed-summary";
import { detectRivals, projectsDueForRivals } from "@/core/rivals-job";
import { projectsDueForPolicies, refreshPolicies } from "@/core/policies";
import { pruneMcpCalls } from "@/core/mcp";
import { generateFixes, projectsDueForFixes } from "@/core/fixes";
import { runCatalogDetails } from "@/core/catalog-details";
import { computeProductVisibility, projectsDueForProductAi } from "@/core/product-visibility-job";
import { checkProductPage } from "@/core/product-sheet/page-check";
import { runGoldenCheck } from "@/core/golden";
import { computePanelSnapshots } from "@/core/panel-snapshot";
import { keepAwakeTick } from "@/core/keep-awake";

/**
 * Workerul: rulează joburile de fundal (audit, sincronizare catalog, rulări AI, rapoarte)
 * și programează automat rularea zilnică pentru fiecare magazin.
 * Pornește cu: npm run worker
 */

async function handle(kind: string, payload: Record<string, string>) {
  switch (kind) {
    case "audit": return payload.auditId ? runAuditRow(payload.auditId) : auditProject(payload.projectId);
    case "sync": {
      const n = await syncCatalog(payload.connectionId);
      // Catalog nou → fișierele de feed se refac (jobul nu face nimic dacă produsele nu s-au schimbat).
      const [c] = await db.select({ projectId: schema.connections.projectId }).from(schema.connections).where(eq(schema.connections.id, payload.connectionId));
      if (c) await enqueue("feed", { projectId: c.projectId });
      // Catalog nou → reparațiile de produs se recalculează (regulile sunt ieftine; AI-ul doar pentru produsele schimbate).
      if (c) await enqueue("fixes", { projectId: c.projectId });
      // Produse noi sau redenumite → vizibilitatea pe produs se recalculează (din răspunsurile salvate, fără AI).
      if (c) await enqueue("product_ai", { projectId: c.projectId });
      // Descrierile pe care lista API-ului nu le dă se citesc separat, încet (nu face nimic dacă nu lipsește nimic).
      if (c) await enqueue("catalog_details", { connectionId: payload.connectionId, projectId: c.projectId });
      // Prețuri și mărci noi → cifrele din panou (Acasă, Produse) se refac din răspunsurile salvate.
      if (c) await enqueue("panel", { projectId: c.projectId });
      return n;
    }
    case "catalog_details": {
      const r = await runCatalogDetails(payload.connectionId);
      // Mai sunt de citit: următoarea tranșă după o pauză, ca magazinul să nu primească toate cererile odată.
      // Altă tranșă = alte date ale jobului (`round`), altfel coada ar refuza-o ca dublură a jobului care rulează acum.
      const round = Number(payload.round ?? 0) + 1;
      if (r.left > 0 && r.read > 0) await enqueue("catalog_details", { connectionId: payload.connectionId, projectId: payload.projectId, round: String(round) }, new Date(Date.now() + 2 * 60e3));
      // Descrieri noi → feed-ul și reparațiile se refac la fiecare a opta tranșă (~40 min) și la final, nu după fiecare:
      // refacerea feed-ului e cea mai grea lucrare a workerului și ar încetini panoul de prea multe ori.
      if (r.read > 0 && r.projectId && (r.left === 0 || round % 8 === 0)) { await enqueue("feed", { projectId: r.projectId }); await enqueue("fixes", { projectId: r.projectId }); }
      return r;
    }
    case "feed": {
      // Fișierele canalelor pornite, apoi rezumatul citit de pagina Feed (pagina nu mai calculează feed-ul la deschidere).
      const files = await generateFeedFiles(payload.projectId);
      const summaries = await computeFeedSummaries(payload.projectId);
      return { files, summaries };
    }
    case "fixes": {
      const r = await generateFixes(payload.projectId);
      // Reparațiile aprobate automat intră în feed: fișierele se refac (doar dacă s-a schimbat ceva).
      if (r.auto) await enqueue("feed", { projectId: payload.projectId });
      return r;
    }
    case "run_project": {
      const r = await runProject(payload.projectId, { onlyNew: String(payload.onlyNew) === "true" });
      // Răspunsuri noi → cifrele pe produs se refac imediat, ca pagina „Produse în AI” să le arate.
      await enqueue("product_ai", { projectId: payload.projectId });
      return r;
    }
    case "product_ai": {
      const r = await computeProductVisibility(payload.projectId);
      // Produsele numite de AI fac parte din „Produse focus”: setul se recalculează după fiecare calcul pe produs.
      await enqueue("focus", { projectId: payload.projectId });
      return r;
    }
    case "focus": {
      const r = await computeFocus(payload.projectId);
      // Set nou → întrebările propuse se aleg din el. Doar la schimbare: „prompts” pune „focus” la coadă, fără buclă.
      if (r.changed) await enqueue("prompts", { projectId: payload.projectId });
      // Alegere nouă în Setări: auditul se reface, ca scorul „Produse focus” să o arate.
      if (payload.then === "audit") await enqueue("audit", { projectId: payload.projectId });
      return r;
    }
    case "prompts": {
      const r = await refreshPrompts(payload.projectId);
      // Produsele alese de magazin intră în „Produse focus”.
      await enqueue("focus", { projectId: payload.projectId });
      // Magazinul și-a schimbat lista (KNOWLEDGE A55): cifrele pe produs se refac pe lista curentă, iar întrebările noi
      // (fără niciun răspuns) se pun acum, doar ele. Schimbările automate ale listei rămân pentru rularea programată.
      if (String(payload.byStore) === "true") {
        const pid = payload.projectId;
        if (!(await pendingJobs(["product_ai", "run_project"], "projectId", pid))) await enqueue("product_ai", { projectId: pid });
        if ((await mayAskAi(pid)) && !(await pendingJobs(["run_project"], "projectId", pid))) await enqueue("run_project", { projectId: pid, onlyNew: true });
      }
      return r;
    }
    case "product_page": {
      const r = await checkProductPage(payload.projectId, payload.productId);
      // Citită după un calcul pe produs (prețul de pe site): refacem calculul o singură dată, după ce trec toate paginile.
      if (payload.then === "product_ai") await enqueue("product_ai", { projectId: payload.projectId }, new Date(Date.now() + 2 * 60e3));
      return r;
    }
    case "report": {
      const r = await buildWeeklyReport(payload.projectId);
      if (payload.email) await sendReport(r.id, payload.email);
      return r;
    }
    case "rivals": return detectRivals(payload.projectId);
    case "policies": return refreshPolicies(payload.projectId);
    case "watches": return checkWatches();
    case "webhook": return deliverWebhook(payload.webhookId, payload.payload);
    case "golden_check": return runGoldenCheck();
    case "panel": return computePanelSnapshots(payload.projectId);
    default: throw new Error(`Job necunoscut: ${kind}`);
  }
}

/** Rulăm AI-urile pentru magazin: există chei (sau demo cerut explicit) și nu e în testul gratuit. */
async function mayAskAi(projectId: string) {
  if (isDemo() && process.env.ALLOW_DEMO_AI !== "1") return false;
  const r = await db.execute<{ n: number }>(sql`select count(*)::int as n from projects p join orgs o on o.id = p.org_id
    where p.id = ${projectId} and p.onboarding is not null and o.plan = 'trial'`);
  return (r[0] as unknown as { n: number }).n === 0;
}

async function schedule() {
  // Fără chei AI nu rulăm întrebările (nu vrem răspunsuri simulate), decât cu ALLOW_DEMO_AI=1.
  const aiAllowed = !isDemo() || process.env.ALLOW_DEMO_AI === "1";
  // Magazinele în testul gratuit (onboarding, fără plan) nu primesc rulări automate: au avut o singură rulare, la cerere.
  const trial = new Set((await db.execute<{ id: string }>(sql`select p.id::text as id from projects p join orgs o on o.id = p.org_id
    where p.onboarding is not null and o.plan = 'trial'`) as unknown as { id: string }[]).map((r) => r.id));
  for (const projectId of await allProjectIds()) {
    // Întrebările la AI-uri rulează automat doar la termen (AI_RUN_EVERY_DAYS, implicit 7 zile), nu zilnic:
    // costă tokeni, iar răspunsurile nu se schimbă de la o zi la alta. „Rulează acum” rămâne la îndemână.
    const [last] = await db.select({ day: schema.dailyStats.day }).from(schema.dailyStats)
      .where(eq(schema.dailyStats.projectId, projectId)).orderBy(desc(schema.dailyStats.day)).limit(1);
    if (aiAllowed && !trial.has(projectId) && isRunDue(last?.day, today(), costConfig().runEveryDays) && !(await pendingJobs(["run_project"], "projectId", projectId))) {
      await enqueue("run_project", { projectId });
    }
    // Audit săptămânal
    const recent = await db.select().from(schema.audits)
      .where(and(eq(schema.audits.projectId, projectId), gte(schema.audits.createdAt, new Date(Date.now() - 7 * 864e5)))).limit(1);
    if (!recent.length && !(await pendingJobs(["audit"], "projectId", projectId))) await enqueue("audit", { projectId });
  }
  // Concurenții care apar mai bine ca tine: o dată pe zi, din răspunsurile deja salvate (fără apeluri AI).
  for (const projectId of await projectsDueForRivals()) {
    if (!(await pendingJobs(["rivals", "run_project"], "projectId", projectId))) await enqueue("rivals", { projectId });
  }
  // Vizibilitatea pe produs: o dată pe zi, din răspunsurile deja salvate (fără apeluri AI).
  for (const projectId of await projectsDueForProductAi()) {
    if (!(await pendingJobs(["product_ai", "run_project"], "projectId", projectId))) await enqueue("product_ai", { projectId });
  }
  // Condițiile magazinului (retur, plată, livrare, întrebări frecvente) de pe site: o dată pe lună, câte 5 magazine pe ciclu.
  for (const projectId of (await projectsDueForPolicies()).slice(0, 5)) {
    if (!(await pendingJobs(["policies"], "projectId", projectId))) await enqueue("policies", { projectId });
  }
  // Cataloage: doar conexiunile ajunse la termen (12h + decalaj stabil per magazin), max 5 pe ciclu,
  // ca să nu lovim multe magazine deodată. Sincronizarea face cerere condiționată (304 = nimic de descărcat).
  for (const c of await dueConnections(5)) {
    if (!(await pendingJobs(["sync"], "connectionId", c.id))) await enqueue("sync", { connectionId: c.id });
  }
  // Reparațiile de produs: o dată pe săptămână pe magazin (și după fiecare sincronizare), câte 5 pe ciclu.
  for (const projectId of await projectsDueForFixes(5)) {
    if (!(await pendingJobs(["fixes", "sync"], "projectId", projectId))) await enqueue("fixes", { projectId });
  }
  // Feed-urile pe canale: reîmprospătare zilnică (etichetele automate se schimbă și fără catalog nou)
  for (const projectId of await projectsWithStaleFeeds()) {
    if (!(await pendingJobs(["feed"], "projectId", projectId))) await enqueue("feed", { projectId });
  }
  // Cifrele din panou: refăcute o dată pe zi și fără vizită (prețuri, ferestrele de 7 și 30 de zile care se mută),
  // doar pentru magazinele cu un calcul mai vechi de 23 de ore; altfel le refac rulările noi sau deschiderea paginii.
  const oldPanels = await db.execute(sql`select distinct project_id::text as id from panel_snapshots where computed_at < now() - interval '23 hours'`) as unknown as { id: string }[];
  for (const { id: projectId } of oldPanels) {
    if (!(await pendingJobs(["panel", "run_project"], "projectId", projectId))) await enqueue("panel", { projectId });
  }
  // Alerte de preț și stoc pentru cumpărători: la fiecare programare (10 min), după sincronizările de catalog
  if (!(await pendingJobs(["watches"], "all", "1"))) await enqueue("watches", { all: "1" });
  // Istoricul joburilor: păstrăm 14 zile (coada rămâne mică, iar starea lucrărilor se citește repede).
  await db.execute(sql`delete from jobs where status in ('done','failed') and created_at < now() - interval '14 days'`).catch((e) => console.error("jobs prune", (e as Error).message));
  // Jurnalul apelurilor MCP: păstrat doar MCP_LOG_DAYS zile (promis în politica de confidențialitate).
  await pruneMcpCalls().catch((e) => console.error("mcp prune", (e as Error).message));
  // Raport săptămânal: lunea, pentru proprietarii fiecărui magazin
  if (new Date().getDay() === 1) {
    const rows = await db.select({ p: schema.projects, email: schema.users.email }).from(schema.projects)
      .innerJoin(schema.memberships, eq(schema.memberships.orgId, schema.projects.orgId))
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId));
    for (const r of rows) {
      const sent = await db.select().from(schema.reports)
        .where(and(eq(schema.reports.projectId, r.p.id), gte(schema.reports.createdAt, new Date(Date.now() - 6 * 864e5)))).limit(1);
      if (!sent.length && !(await pendingJobs(["report"], "projectId", r.p.id))) await enqueue("report", { projectId: r.p.id, email: r.email });
    }
  }
}

const PANEL_AFTER = new Set(["run_project", "rivals", "audit", "focus", "product_ai", "feed"]);

let stopping = false;
let running: string | null = null;
/**
 * La oprire (publicare nouă, repornire): lucrarea în curs se pune imediat înapoi la coadă, cu progresul ei,
 * ca serverul nou s-o reia primul, de unde a rămas (întrebările puse deja azi nu se plătesc și nu se repetă).
 */
const stop = async () => {
  stopping = true;
  if (running) await db.execute(sql`update jobs set status = 'queued', run_at = now() - interval '1 minute' where id = ${running} and status = 'running'`).catch(() => undefined);
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

console.log("Worker pornit.");
try {
  const n = await requeueInterrupted();
  if (n) console.log(`Joburi întrerupte puse înapoi la coadă: ${n}`);
} catch (e) { console.error("Nu am putut relua joburile întrerupte:", e); }
// După fiecare publicare (un commit nou), o singură verificare pe magazinul etalon, la 3 minute după pornire.
// Nu la fiecare trezire a serverului: o dată pe commit (KNOWLEDGE A0: nimic „gata” fără verificare pe producție).
try {
  const commit = process.env.RENDER_GIT_COMMIT;
  if (commit) {
    const seen = await db.execute(sql`select 1 from jobs where kind = 'golden_check' and payload->>'commit' = ${commit} limit 1`);
    if (!(seen as unknown as unknown[]).length) await enqueue("golden_check", { commit }, new Date(Date.now() + 3 * 60e3));
  }
} catch (e) { console.error("Nu am putut programa verificarea pe magazinul etalon:", e); }
// Feed-ul ChatGPT e CSV (formatul importat deja de OpenAI, KNOWLEDGE B49): un fișier rămas în alt format se reface imediat după publicare,
// nu la reîmprospătarea zilnică. Doar cele care chiar au alt tip; celelalte rămân cum sunt.
try {
  const old = await db.execute(sql`select distinct project_id::text as id from feed_outputs
    where active and channel = 'openai' and file_type is not null and file_type not like 'text/csv%'`) as unknown as { id: string }[];
  for (const { id } of old) await enqueue("feed", { projectId: id });
  if (old.length) console.log(`Feed-uri ChatGPT de refăcut în CSV: ${old.length}`);
} catch (e) { console.error("Nu am putut verifica formatul feed-urilor:", e); }
// Între 15:00 și 02:30 ora României serverul se cheamă singur la 5 minute: odată trezit, rămâne treaz până după descărcarea de noapte a feed-ului (B63).
// Separat de bucla de joburi: un job lung nu oprește pingul.
const keepAwake = setInterval(() => { void keepAwakeTick().then((r) => { if (r === "error") console.error("keep-awake: pingul pe /api/health a eșuat"); }); }, 5 * 60e3);
keepAwake.unref();
let lastSchedule = 0;
while (!stopping) {
  if (Date.now() - lastSchedule > 10 * 60e3) {
    lastSchedule = Date.now();
    try { await schedule(); } catch (e) { console.error("Programare eșuată:", e); }
  }
  const job = await pickJob();
  if (!job) { await new Promise((r) => setTimeout(r, 2000)); continue; }
  const t0 = Date.now();
  running = job.id;
  setCurrentJob(job.id);
  try {
    await handle(job.kind, job.payload);
    running = null;
    await finishJob(job.id);
    // Răspunsuri, concurenți sau audit noi → cifrele paginilor (Acasă, Surse, Reputație, Produse) se refac în fundal,
    // ca pagina să le citească gata calculate (KNOWLEDGE B48). Jobul nu face nimic dacă sunt deja la zi.
    if (PANEL_AFTER.has(job.kind) && job.payload.projectId) await enqueue("panel", { projectId: job.payload.projectId }).catch((e) => console.error("panel enqueue", (e as Error).message));
    console.log(`✓ ${job.kind} (${Date.now() - t0} ms)`);
  } catch (e) {
    running = null;
    console.error(`✗ ${job.kind}:`, e);
    await finishJob(job.id, String(e).slice(0, 1000), job.attempts);
  }
}
process.exit(0);

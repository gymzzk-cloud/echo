import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { finishJob, enqueue, pickJob, pendingJobs, requeueInterrupted } from "@/core/jobs";
import { allProjectIds, auditProject, runAuditRow, runProject, syncCatalog, dueConnections } from "@/core/projects";
import { buildWeeklyReport, sendReport } from "@/core/report";
import { today } from "@/lib/util";
import { checkWatches } from "@/core/watches";
import { deliverWebhook } from "@/core/platform";
import { isDemo } from "@/core/ai/engine";
import { costConfig, isRunDue } from "@/core/ai/budget";
import { generateFeedFiles, projectsWithStaleFeeds } from "@/core/feed-files";
import { detectRivals, projectsDueForRivals } from "@/core/rivals-job";
import { projectsDueForPolicies, refreshPolicies } from "@/core/policies";
import { pruneMcpCalls } from "@/core/mcp";
import { generateFixes, projectsDueForFixes } from "@/core/fixes";
import { computeProductVisibility, projectsDueForProductAi } from "@/core/product-visibility-job";
import { checkProductPage } from "@/core/product-sheet/page-check";
import { runGoldenCheck } from "@/core/golden";

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
      return n;
    }
    case "feed": return generateFeedFiles(payload.projectId);
    case "fixes": {
      const r = await generateFixes(payload.projectId);
      // Reparațiile aprobate automat intră în feed: fișierele se refac (doar dacă s-a schimbat ceva).
      if (r.auto) await enqueue("feed", { projectId: payload.projectId });
      return r;
    }
    case "run_project": {
      const r = await runProject(payload.projectId);
      // Răspunsuri noi → cifrele pe produs se refac imediat, ca pagina „Produse în AI” să le arate.
      await enqueue("product_ai", { projectId: payload.projectId });
      return r;
    }
    case "product_ai": return computeProductVisibility(payload.projectId);
    case "product_page": return checkProductPage(payload.projectId, payload.productId);
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
    default: throw new Error(`Job necunoscut: ${kind}`);
  }
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
  // Alerte de preț și stoc pentru cumpărători: la fiecare programare (10 min), după sincronizările de catalog
  if (!(await pendingJobs(["watches"], "all", "1"))) await enqueue("watches", { all: "1" });
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

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

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
let lastSchedule = 0;
while (!stopping) {
  if (Date.now() - lastSchedule > 10 * 60e3) {
    lastSchedule = Date.now();
    try { await schedule(); } catch (e) { console.error("Programare eșuată:", e); }
  }
  const job = await pickJob();
  if (!job) { await new Promise((r) => setTimeout(r, 2000)); continue; }
  const t0 = Date.now();
  try {
    await handle(job.kind, job.payload);
    await finishJob(job.id);
    console.log(`✓ ${job.kind} (${Date.now() - t0} ms)`);
  } catch (e) {
    console.error(`✗ ${job.kind}:`, e);
    await finishJob(job.id, String(e).slice(0, 1000), job.attempts);
  }
}
process.exit(0);

import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { finishJob, enqueue, pickJob, pendingJobs } from "@/core/jobs";
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
      return n;
    }
    case "feed": return generateFeedFiles(payload.projectId);
    case "run_project": return runProject(payload.projectId);
    case "report": {
      const r = await buildWeeklyReport(payload.projectId);
      if (payload.email) await sendReport(r.id, payload.email);
      return r;
    }
    case "rivals": return detectRivals(payload.projectId);
    case "policies": return refreshPolicies(payload.projectId);
    case "watches": return checkWatches();
    case "webhook": return deliverWebhook(payload.webhookId, payload.payload);
    default: throw new Error(`Job necunoscut: ${kind}`);
  }
}

async function schedule() {
  // Fără chei AI nu rulăm întrebările (nu vrem răspunsuri simulate), decât cu ALLOW_DEMO_AI=1.
  const aiAllowed = !isDemo() || process.env.ALLOW_DEMO_AI === "1";
  for (const projectId of await allProjectIds()) {
    // Întrebările la AI-uri rulează automat doar la termen (AI_RUN_EVERY_DAYS, implicit 7 zile), nu zilnic:
    // costă tokeni, iar răspunsurile nu se schimbă de la o zi la alta. „Rulează acum” rămâne la îndemână.
    const [last] = await db.select({ day: schema.dailyStats.day }).from(schema.dailyStats)
      .where(eq(schema.dailyStats.projectId, projectId)).orderBy(desc(schema.dailyStats.day)).limit(1);
    if (aiAllowed && isRunDue(last?.day, today(), costConfig().runEveryDays) && !(await pendingJobs(["run_project"], "projectId", projectId))) {
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
  // Condițiile magazinului (retur, plată, livrare, întrebări frecvente) de pe site: o dată pe lună, câte 5 magazine pe ciclu.
  for (const projectId of (await projectsDueForPolicies()).slice(0, 5)) {
    if (!(await pendingJobs(["policies"], "projectId", projectId))) await enqueue("policies", { projectId });
  }
  // Cataloage: doar conexiunile ajunse la termen (12h + decalaj stabil per magazin), max 5 pe ciclu,
  // ca să nu lovim multe magazine deodată. Sincronizarea face cerere condiționată (304 = nimic de descărcat).
  for (const c of await dueConnections(5)) {
    if (!(await pendingJobs(["sync"], "connectionId", c.id))) await enqueue("sync", { connectionId: c.id });
  }
  // Feed-urile pe canale: reîmprospătare zilnică (etichetele automate se schimbă și fără catalog nou)
  for (const projectId of await projectsWithStaleFeeds()) {
    if (!(await pendingJobs(["feed"], "projectId", projectId))) await enqueue("feed", { projectId });
  }
  // Alerte de preț și stoc pentru cumpărători: la fiecare programare (10 min), după sincronizările de catalog
  if (!(await pendingJobs(["watches"], "all", "1"))) await enqueue("watches", { all: "1" });
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

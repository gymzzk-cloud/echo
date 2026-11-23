import { sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Coadă de joburi pe Postgres (SELECT … FOR UPDATE SKIP LOCKED).
 * O singură componentă în plus față de baza de date = mai puțin de administrat la început.
 * Când volumul crește, interfața rămâne, iar implementarea se mută pe BullMQ/Redis.
 */
export type JobKind = "audit" | "sync" | "run_project" | "report" | "daily" | "watches" | "webhook" | "rivals" | "feed" | "policies" | "fixes" | "product_ai" | "product_page" | "golden_check";

/**
 * Pune o lucrare la coadă. Dacă exact aceeași lucrare (același tip și aceleași date) e deja la coadă
 * sau în lucru (pornită în ultimele 30 de minute), nu mai adăugăm alta: întoarcem jobul existent.
 * Așa clicurile repetate nu umplu coada și nu încarcă magazinul de mai multe ori.
 */
export async function enqueue(kind: JobKind, payload: Record<string, unknown> = {}, runAt = new Date()) {
  const same = await db.execute(dsql`select id from jobs where kind = ${kind} and status in ('queued','running')
    and payload = ${JSON.stringify(payload)}::jsonb and created_at > now() - interval '30 minutes' limit 1`);
  const existing = (same as unknown as { id: string }[])[0];
  if (existing) return existing.id;
  const [j] = await db.insert(schema.jobs).values({ kind, payload, runAt }).returning({ id: schema.jobs.id });
  return j.id;
}

/**
 * Ce lucrări are un magazin acum la coadă sau în lucru (audit, run_project, report, sync…).
 * Paginile ascund butonul care ar porni din nou aceeași lucrare. Joburile mai vechi de 30 de minute
 * sunt considerate blocate (ex. worker repornit), ca butonul să nu dispară la nesfârșit.
 */
export async function busyKinds(projectId: string, connectionIds: string[] = []): Promise<Set<JobKind>> {
  const conns = connectionIds.length ? dsql`or payload->>'connectionId' in ${connectionIds}` : dsql``;
  const r = await db.execute(dsql`select distinct kind from jobs where status in ('queued','running')
    and created_at > now() - interval '30 minutes' and (payload->>'projectId' = ${projectId} ${conns})`);
  return new Set((r as unknown as { kind: JobKind }[]).map((x) => x.kind));
}

/**
 * La pornirea workerului: joburile rămase „în lucru” au fost întrerupte (deploy, restart, adormire).
 * Le punem înapoi la coadă, cu ora de acum, ca butonul să arate în continuare „în lucru” și jobul să ruleze din nou.
 * Avem un singur worker, deci nimic altceva nu le rulează în acest moment. Joburile sunt idempotente.
 */
export async function requeueInterrupted() {
  const rows = await db.execute(dsql`update jobs set status = 'queued', run_at = now(), created_at = now()
    where status = 'running' returning id`);
  return rows.length;
}

export async function pickJob() {
  const rows = await db.execute(dsql`
    update jobs set status = 'running', attempts = attempts + 1
    where id = (
      select id from jobs where status = 'queued' and run_at <= now()
      order by run_at for update skip locked limit 1
    ) returning id, kind, payload, attempts`);
  return (rows[0] as unknown as { id: string; kind: JobKind; payload: Record<string, string>; attempts: number }) ?? null;
}

export async function finishJob(id: string, error?: string, attempts = 1) {
  if (!error) {
    await db.execute(dsql`update jobs set status = 'done', last_error = null where id = ${id}`);
  } else if (attempts < 3) {
    // Reîncercare cu așteptare crescătoare: 1 min, 4 min
    await db.execute(dsql`update jobs set status = 'queued', last_error = ${error}, run_at = now() + (${attempts * attempts} || ' minutes')::interval where id = ${id}`);
  } else {
    await db.execute(dsql`update jobs set status = 'failed', last_error = ${error} where id = ${id}`);
  }
}

export async function pendingJobs(kinds: JobKind[], key: string, value: string) {
  const r = await db.execute(dsql`select count(*)::int as n from jobs where status in ('queued','running') and kind in ${kinds} and payload->>${key} = ${value}`);
  return (r[0] as unknown as { n: number }).n;
}

/**
 * Conexiunile care au acum o sincronizare la coadă sau în lucru (pornită în ultimele 30 de minute).
 * Un job mai vechi e considerat blocat (ex. worker repornit), ca să nu ascundă butonul la nesfârșit.
 */
export async function syncingConnections(connectionIds: string[]): Promise<Set<string>> {
  if (!connectionIds.length) return new Set();
  const r = await db.execute(dsql`select distinct payload->>'connectionId' as id from jobs
    where kind = 'sync' and status in ('queued','running') and created_at > now() - interval '30 minutes'
    and payload->>'connectionId' in ${connectionIds}`);
  return new Set((r as unknown as { id: string }[]).map((x) => x.id));
}

/** Numele lucrărilor pe care le vede omul (cele interne, ca `daily` sau `webhook`, nu se afișează). */
export const JOB_LABELS: Partial<Record<JobKind, string>> = {
  audit: "Auditul tehnic", sync: "Sincronizarea catalogului", run_project: "Analiza AI", report: "Raportul",
  feed: "Feed-ul de produse", rivals: "Căutarea concurenților", policies: "Citirea politicilor magazinului", fixes: "Căutarea reparațiilor de produs", product_ai: "Calculul vizibilității pe produs",
  product_page: "Verificarea paginii produsului",
};

export type JobState = { id: string; kind: JobKind; label: string; status: "queued" | "running" | "done" | "failed"; error: string | null };

/**
 * Starea lucrărilor unui magazin, pentru actualizarea paginii fără reîncărcare:
 * cele active acum (la coadă sau în lucru, din ultimele 30 de minute) și, pentru id-urile cerute, starea lor finală.
 * Filtrează după magazin (projectId sau o conexiune a lui), deci nu se văd lucrările altor clienți.
 */
export async function jobStates(projectId: string, connectionIds: string[], ids: string[]): Promise<JobState[]> {
  const conns = connectionIds.length ? dsql`or payload->>'connectionId' in ${connectionIds}` : dsql``;
  const asked = ids.length ? dsql`or id::text in ${ids}` : dsql``;
  const r = await db.execute(dsql`select id::text as id, kind, status, last_error as error from jobs
    where (payload->>'projectId' = ${projectId} ${conns})
      and ((status in ('queued','running') and created_at > now() - interval '30 minutes') ${asked})
    order by created_at desc limit 50`);
  return (r as unknown as Omit<JobState, "label">[])
    .filter((j) => JOB_LABELS[j.kind])
    .map((j) => ({ ...j, label: JOB_LABELS[j.kind]!, error: j.error ? j.error.slice(0, 160) : null }));
}

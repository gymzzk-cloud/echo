import { sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Coadă de joburi pe Postgres (SELECT … FOR UPDATE SKIP LOCKED).
 * O singură componentă în plus față de baza de date = mai puțin de administrat la început.
 * Când volumul crește, interfața rămâne, iar implementarea se mută pe BullMQ/Redis.
 */
export type JobKind = "audit" | "sync" | "run_project" | "report" | "daily" | "watches" | "webhook";

export async function enqueue(kind: JobKind, payload: Record<string, unknown> = {}, runAt = new Date()) {
  const [j] = await db.insert(schema.jobs).values({ kind, payload, runAt }).returning({ id: schema.jobs.id });
  return j.id;
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

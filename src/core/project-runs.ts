import { and, eq, gte, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { ERROR_MODEL } from "./ai/types";

/**
 * Datele de bază pentru un proiect într-o perioadă: rulările întrebărilor lui.
 * Implicit fără rulările cu eroare (cheie greșită, AI căzut): nu știm ce ar fi răspuns AI-ul,
 * deci nu intră în scor, vizibilitate sau cote. `withErrors` le aduce, pentru a afișa motivul.
 */
export async function projectRuns(projectId: string, fromDay: string, opts: { withErrors?: boolean } = {}) {
  const ok = opts.withErrors ? undefined : ne(schema.runs.model, ERROR_MODEL);
  return db.select({ run: schema.runs, promptId: schema.prompts.id, prompt: schema.prompts.text, category: schema.prompts.category, intent: schema.prompts.intent })
    .from(schema.promptRuns)
    .innerJoin(schema.runs, eq(schema.runs.id, schema.promptRuns.runId))
    .innerJoin(schema.prompts, eq(schema.prompts.id, schema.promptRuns.promptId))
    .where(and(eq(schema.prompts.projectId, projectId), gte(schema.runs.runDate, fromDay), ok)).orderBy(schema.runs.runDate);
}

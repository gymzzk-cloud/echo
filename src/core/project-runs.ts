import { and, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";

/** Datele de bază pentru un proiect într-o perioadă: rulările întrebărilor lui. */
export async function projectRuns(projectId: string, fromDay: string) {
  return db.select({ run: schema.runs, promptId: schema.prompts.id, prompt: schema.prompts.text, category: schema.prompts.category, intent: schema.prompts.intent })
    .from(schema.promptRuns)
    .innerJoin(schema.runs, eq(schema.runs.id, schema.promptRuns.runId))
    .innerJoin(schema.prompts, eq(schema.prompts.id, schema.promptRuns.promptId))
    .where(and(eq(schema.prompts.projectId, projectId), gte(schema.runs.runDate, fromDay))).orderBy(schema.runs.runDate);
}

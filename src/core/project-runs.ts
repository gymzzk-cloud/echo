import { and, eq, getTableColumns, gte, isNull, ne, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { ERROR_MODEL } from "./ai/types";

/**
 * Datele de bază pentru un proiect într-o perioadă: rulările întrebărilor lui.
 * Implicit fără rulările cu eroare (cheie greșită, AI căzut): nu știm ce ar fi răspuns AI-ul,
 * deci nu intră în scor, vizibilitate sau cote. `withErrors` le aduce, pentru a afișa motivul.
 */
/**
 * `answers: false` (paginile panoului care numără doar apariții, surse și poziții): textul întreg al răspunsului
 * nu se mai citește (zeci de KB pe întrebare, mii de rulări pe lună), decât la erori (motivul) și la întrebările
 * despre magazin (tonul, pagina Reputație). Workerul și paginile care arată răspunsurile îl citesc întreg.
 */
/**
 * Implicit doar întrebările din lista curentă (active, neretrase): după ce magazinul schimbă produsele urmărite,
 * toate cifrele vorbesc despre lista nouă, nu despre produse scoase (ZoZo, 24.11.2026, KNOWLEDGE A55).
 * `allPrompts` aduce și istoricul întrebărilor scoase (ex. recitirea mențiunilor).
 */
export const currentPrompt = () => and(eq(schema.prompts.active, true), isNull(schema.prompts.retiredAt));

export async function projectRuns(projectId: string, fromDay: string, opts: { withErrors?: boolean; answers?: boolean; allPrompts?: boolean } = {}) {
  const ok = opts.withErrors ? undefined : ne(schema.runs.model, ERROR_MODEL);
  const cur = opts.allPrompts ? undefined : currentPrompt();
  const run = opts.answers === false
    ? { ...getTableColumns(schema.runs), answer: dsql<string>`case when ${schema.runs.model} = ${ERROR_MODEL} or ${schema.prompts.intent} = 'brand' then ${schema.runs.answer} else '' end` }
    : schema.runs;
  return db.select({ run, promptId: schema.prompts.id, prompt: schema.prompts.text, category: schema.prompts.category, intent: schema.prompts.intent })
    .from(schema.promptRuns)
    .innerJoin(schema.runs, eq(schema.runs.id, schema.promptRuns.runId))
    .innerJoin(schema.prompts, eq(schema.prompts.id, schema.promptRuns.promptId))
    .where(and(eq(schema.prompts.projectId, projectId), gte(schema.runs.runDate, fromDay), ok, cur)).orderBy(schema.runs.runDate);
}

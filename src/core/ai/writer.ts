import Anthropic from "@anthropic-ai/sdk";
import { db, schema } from "@/db";
import { envPrice, envValue, postJson } from "./http";

/**
 * Adaptoarele pentru texte scrise de AI (titluri, descrieri), fără căutare pe web.
 * Aceeași interfață pentru fiecare AI: un AI nou = un adaptor nou aici.
 * Model ieftin implicit (CLAUDE.md, „Costuri AI”): Claude Haiku 5.5 sau ChatGPT gpt-5-mini, gândire „low”, răspuns plafonat.
 * Costul și tokenii fiecărui apel se salvează în `ai_tasks` și intră în bugetul lunar al magazinului.
 */

export type WriteInput = { system: string; user: string; schema: Record<string, unknown>; maxTokens: number };
export type WriteOutput = { json: unknown; model: string; inputTokens: number; outputTokens: number; costUsd: number };

export interface Writer {
  id: "claude" | "chatgpt";
  isLive(): boolean;
  write(input: WriteInput): Promise<WriteOutput>;
}

let anthropic: Anthropic | null = null;
const claudeWriter: Writer = {
  id: "claude",
  isLive: () => !!envValue("ANTHROPIC_API_KEY"),
  async write(input) {
    anthropic ??= new Anthropic({ apiKey: envValue("ANTHROPIC_API_KEY") });
    const model = envValue("FIX_ANTHROPIC_MODEL", "claude-haiku-5-5");
    const res = await anthropic.messages.create({
      model,
      max_tokens: input.maxTokens,
      output_config: { effort: "low", format: { type: "json_schema", schema: input.schema } },
      system: input.system,
      messages: [{ role: "user", content: input.user }],
    });
    if (res.stop_reason === "refusal") throw new Error("Claude a refuzat cererea.");
    if (res.stop_reason === "max_tokens") throw new Error("Răspunsul a depășit limita de tokeni.");
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    const u = res.usage;
    const cost = (u.input_tokens * envPrice("FIX_ANTHROPIC_IN_PER_M", 0.1) + u.output_tokens * envPrice("FIX_ANTHROPIC_OUT_PER_M", 0.5)) / 1e6;
    return { json: JSON.parse(text), model: res.model, inputTokens: u.input_tokens, outputTokens: u.output_tokens, costUsd: cost };
  },
};

const openaiWriter: Writer = {
  id: "chatgpt",
  isLive: () => !!envValue("OPENAI_API_KEY"),
  async write(input) {
    const model = envValue("FIX_OPENAI_MODEL", "gpt-5-mini");
    const data = await postJson("https://api.openai.com/v1/responses", {
      model,
      instructions: input.system,
      input: input.user,
      reasoning: { effort: "low" },
      max_output_tokens: input.maxTokens,
      text: { format: { type: "json_schema", name: "fixes", schema: input.schema, strict: true } },
    }, { authorization: `Bearer ${envValue("OPENAI_API_KEY")}` });
    let text = "";
    for (const item of data.output ?? []) if (item.type === "message") for (const c of item.content ?? []) if (c.type === "output_text") text += c.text;
    const u = data.usage ?? {};
    const cost = ((u.input_tokens ?? 0) * envPrice("OPENAI_IN_PER_M", 0.25) + (u.output_tokens ?? 0) * envPrice("OPENAI_OUT_PER_M", 2)) / 1e6;
    return { json: JSON.parse(text), model, inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0, costUsd: cost };
  },
};

const WRITERS: Writer[] = [claudeWriter, openaiWriter];

/** AI-ul care scrie: cel ales în FIX_AI_PROVIDER (claude | chatgpt), altfel primul cu cheie. Fără cheie: null (doar reguli). */
export function activeWriter(): Writer | null {
  const want = envValue("FIX_AI_PROVIDER");
  const live = WRITERS.filter((w) => w.isLive());
  return live.find((w) => w.id === want) ?? live[0] ?? null;
}

/** Rulează o scriere și îi salvează costul pe magazin. O eroare se salvează și ea (fără cost), apoi se aruncă mai departe. */
export async function runWriteTask(projectId: string, kind: string, writer: Writer, input: WriteInput, items: number) {
  try {
    const out = await writer.write(input);
    await db.insert(schema.aiTasks).values({ projectId, kind, provider: writer.id, model: out.model, items, inputTokens: out.inputTokens, outputTokens: out.outputTokens, costUsd: out.costUsd.toFixed(5) });
    return out;
  } catch (e) {
    await db.insert(schema.aiTasks).values({ projectId, kind, provider: writer.id, items, error: String(e).slice(0, 300) });
    throw e;
  }
}

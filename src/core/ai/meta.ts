import { costConfig } from "./budget";
import { envPrice, envValue, postJson } from "./http";
import type { Runner, RunInput, RunOutput } from "./types";

/**
 * Meta AI, prin Meta Model API (developer.meta.com, compatibil OpenAI: /chat/completions).
 * Cheie: META_API_KEY. Model implicit muse-spark-1.3 (META_MODEL), adresa META_API_BASE.
 *
 * Atenție: API-ul nu are căutare web pe server, deci măsurăm ce știe modelul Meta din memorie
 * (ca asistentul Meta AI fără căutare). Sursele sunt doar linkurile scrise în răspuns.
 * În 2026 API-ul e deschis doar din SUA; fără cheie, Meta AI nu e întrebat deloc.
 */

const key = () => envValue("META_API_KEY");
const base = () => envValue("META_API_BASE", "https://api.meta.ai/v1").replace(/\/+$/, "");

type MetaResponse = {
  model?: string;
  choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/** Linkurile http(s) scrise în text, fără dubluri și fără punctuația de la final. */
export function urlsInText(text: string) {
  const seen = new Set<string>();
  const out: { url: string }[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s<>()"'\]]+/g)) {
    const url = m[0].replace(/[.,;:!?*_]+$/, "");
    if (!seen.has(url)) { seen.add(url); out.push({ url }); }
  }
  return out.slice(0, 20);
}

export function parseMeta(data: MetaResponse) {
  const c = data.choices?.[0]?.message?.content;
  const answer = (typeof c === "string" ? c : (c ?? []).map((p) => p.text ?? "").join("")).trim();
  const u = data.usage ?? {};
  return { answer, sources: urlsInText(answer), inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 };
}

export const meta: Runner = {
  id: "meta",
  isLive: () => !!key(),
  offReason: () => "key",
  async run(input: RunInput): Promise<RunOutput> {
    const t0 = Date.now();
    const model = envValue("META_MODEL", "muse-spark-1.3");
    const data: MetaResponse = await postJson(`${base()}/chat/completions`, {
      model,
      messages: [{ role: "user", content: input.query }],
      max_tokens: costConfig().maxOutputTokens,
    }, { authorization: `Bearer ${key()}` });
    const out = parseMeta(data);
    const cost = (out.inputTokens * envPrice("META_IN_PER_M", 1.25) + out.outputTokens * envPrice("META_OUT_PER_M", 4.25)) / 1e6;
    return { answer: out.answer, sources: out.sources, model: data.model ?? model, mode: "live", costUsd: cost, latencyMs: Date.now() - t0, inputTokens: out.inputTokens, outputTokens: out.outputTokens };
  },
};

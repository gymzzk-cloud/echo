import { costConfig } from "./budget";
import { envValue, envPrice, postJson } from "./http";
import type { Runner, RunInput, RunOutput } from "./types";

/**
 * Gemini (Google AI Studio) cu căutare Google („grounding”), ca să vedem ce răspunde Gemini unui cumpărător real.
 *
 * Cost mic:
 * - modelul Flash cel mai nou disponibil pe cheie (sau GEMINI_MODEL), fără gândire (sau gândire minimă la Gemini 3);
 * - răspuns plafonat la AI_MAX_OUTPUT_TOKENS;
 * - pe planul gratuit (GEMINI_FREE_TIER=1, implicit) costul e 0, iar ritmul e limitat în motor (GEMINI_RPM, GEMINI_DAILY_LIMIT).
 *
 * Dacă cheia nu are voie la căutarea Google (unele modele nu o au pe planul gratuit), întrebăm același model fără
 * căutare și marcăm rularea „fără căutare”, ca diferența să se vadă.
 */

const API = "https://generativelanguage.googleapis.com/v1beta";
const key = () => envValue("GEMINI_API_KEY");

type GeminiModel = { name: string; supportedGenerationMethods?: string[] };

/** Versiunea unui model Flash din nume („gemini-2.5-flash” → 2.5); null dacă nu e un Flash stabil sau preview simplu. */
export function flashVersion(id: string): number | null {
  const m = /^gemini-(\d+(?:\.\d+)?)-flash(?:-preview)?$/.exec(id);
  return m ? parseFloat(m[1]) : null;
}

/** Alege cel mai nou model Flash din lista cheii; la aceeași versiune, varianta stabilă înaintea celei „preview”. */
export function pickFlashModel(models: GeminiModel[]): string | null {
  const ids = models
    .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((id) => flashVersion(id) !== null);
  ids.sort((a, b) => flashVersion(b)! - flashVersion(a)! || Number(a.includes("preview")) - Number(b.includes("preview")));
  return ids[0] ?? null;
}

let detected: { at: number; model: string } | null = null;
async function resolveModel(): Promise<string> {
  const fixed = envValue("GEMINI_MODEL");
  if (fixed) return fixed;
  if (detected && Date.now() - detected.at < 864e5) return detected.model;
  const r = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": key() }, signal: AbortSignal.timeout(15000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
  const model = pickFlashModel((JSON.parse(text).models ?? []) as GeminiModel[]);
  if (!model) throw new Error("Cheia Gemini nu are niciun model Flash disponibil. Setează GEMINI_MODEL.");
  detected = { at: Date.now(), model };
  return model;
}

/** Gândirea cea mai ieftină: Gemini 3+ folosește „thinkingLevel”, modelele mai vechi „thinkingBudget”. */
export function thinkingFor(model: string) {
  const v = parseFloat(/^gemini-(\d+(?:\.\d+)?)/.exec(model)?.[1] ?? "0");
  return v >= 3 ? { thinkingLevel: "minimal" } : { thinkingBudget: 0 };
}

/** Refuz al căutării Google pentru cheia/modelul acesta (nu o problemă trecătoare). */
export const isGroundingRefused = (msg: string) =>
  /HTTP 4\d\d/.test(msg) && !/HTTP 429/.test(msg) && /(google_search|grounding|search tool|tool.*not (supported|available|enabled))/i.test(msg);

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { uri: string; title?: string } }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};

/** Textul și sursele dintr-un răspuns Gemini. Linkurile sunt redirecționări Google; titlul e de obicei domeniul real. */
export function parseGemini(data: GeminiResponse) {
  const cand = data.candidates?.[0] ?? {};
  const answer = (cand.content?.parts ?? []).map((p) => p.text ?? "").join("");
  const seen = new Set<string>();
  const sources = (cand.groundingMetadata?.groundingChunks ?? [])
    .map((c) => c.web)
    .filter((w): w is { uri: string; title?: string } => !!w?.uri)
    .map((w) => ({ url: w.title && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(w.title) ? `https://${w.title.toLowerCase()}` : w.uri, title: w.title }))
    .filter((s) => !seen.has(s.url) && !!seen.add(s.url));
  const u = data.usageMetadata ?? {};
  return { answer, sources, inputTokens: u.promptTokenCount ?? 0, outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) };
}

export const isGeminiFreeTier = () => envValue("GEMINI_FREE_TIER", "1") !== "0";

export const gemini: Runner = {
  id: "gemini",
  isLive: () => !!key(),
  limits: () => ({
    rpm: Number(envValue("GEMINI_RPM", "8")) || 8,
    perDay: isGeminiFreeTier() ? Number(envValue("GEMINI_DAILY_LIMIT", "200")) || 200 : 0,
  }),
  async run(input: RunInput): Promise<RunOutput> {
    const t0 = Date.now();
    const model = await resolveModel();
    const call = (grounded: boolean, thinking: boolean) =>
      postJson(`${API}/models/${model}:generateContent`, {
        contents: [{ role: "user", parts: [{ text: input.query }] }],
        ...(grounded ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: { maxOutputTokens: costConfig().maxOutputTokens, ...(thinking ? { thinkingConfig: thinkingFor(model) } : {}) },
      }, { "x-goog-api-key": key() }) as Promise<GeminiResponse>;

    let grounded = true;
    let data: GeminiResponse;
    try {
      data = await call(true, true);
    } catch (e) {
      const msg = String(e);
      if (/HTTP 400/.test(msg) && /thinking/i.test(msg)) data = await call(true, false);
      else if (isGroundingRefused(msg)) { grounded = false; data = await call(false, true); }
      else throw e;
    }
    const out = parseGemini(data);
    const cost = isGeminiFreeTier() ? 0
      : (out.inputTokens * envPrice("GEMINI_IN_PER_M", 0.3) + out.outputTokens * envPrice("GEMINI_OUT_PER_M", 2.5)) / 1e6 + (grounded ? envPrice("GEMINI_SEARCH_PER_CALL", 0.035) : 0);
    return { ...out, model: grounded ? model : `${model} (fără căutare)`, mode: "live", costUsd: cost, latencyMs: Date.now() - t0 };
  },
};

import { costConfig } from "./budget";
import { envPrice, envValue, postJson } from "./http";
import type { Runner, RunInput, RunOutput } from "./types";

/**
 * Grok (xAI), prin API-ul oficial Responses (compatibil OpenAI), cu unealta de căutare web pe server.
 * Cheie: XAI_API_KEY (console.x.ai). Întrebarea pleacă exact cum o scrie clientul.
 *
 * Cost mic: cel mai ieftin model Grok disponibil (xAI retrage des modele, așa că încercăm o listă,
 * de la cel mai ieftin, și îl ținem minte pe primul care merge), răspuns plafonat, cel mult 2 căutări.
 * GROK_MODEL fixează un model anume.
 */

const key = () => envValue("XAI_API_KEY") || envValue("GROK_API_KEY");
const URL_RESPONSES = "https://api.x.ai/v1/responses";
/** Prețul unei căutări web xAI: 5 $ la 1.000 de apeluri. */
const SEARCH_CALL_USD = 0.005;

/** Modelele încercate, de la cel mai ieftin. Prețuri estimative pe 1M tokeni [intrare, ieșire], ajustabile din GROK_IN_PER_M / GROK_OUT_PER_M. */
export const GROK_CANDIDATES: [string, [number, number]][] = [
  ["grok-4-1-fast-non-reasoning", [0.2, 0.5]],
  ["grok-4.3", [1.25, 2.5]],
  ["grok-4.20", [1.25, 2.5]],
  ["grok-4.7", [2, 6]],
];
const priceFor = (model: string): [number, number] =>
  GROK_CANDIDATES.find(([m]) => model.startsWith(m))?.[1] ?? [2, 6];

/** Modelul nu mai există sau nu e disponibil pentru cheie: trecem la următorul. */
export const isModelUnavailable = (msg: string) =>
  /HTTP (400|403|404)/.test(msg) && /model/i.test(msg) && /not (found|exist|available|supported)|does not exist|deprecated|retired|no access|invalid model/i.test(msg);
/** API-ul nu cunoaște plafonul de căutări: îl scoatem și reîncercăm. */
export const isToolCapRejected = (msg: string) => /HTTP 400/.test(msg) && /max_tool_calls/i.test(msg);

type Out = { type?: string; content?: { type?: string; text?: string; annotations?: { type?: string; url?: string; title?: string }[] }[] };
type GrokResponse = { model?: string; output?: Out[]; citations?: (string | { url?: string; title?: string })[]; usage?: { input_tokens?: number; output_tokens?: number } };

/** Textul, sursele (fără dubluri) și numărul de căutări dintr-un răspuns Responses. Logică pură, testată pe fixture. */
export function parseGrok(data: GrokResponse) {
  let answer = "";
  let searches = 0;
  const sources: { url: string; title?: string }[] = [];
  const seen = new Set<string>();
  const add = (url?: string, title?: string) => {
    if (url && /^https?:/.test(url) && !seen.has(url)) { seen.add(url); sources.push({ url, title }); }
  };
  for (const item of data.output ?? []) {
    if (item.type === "web_search_call") searches++;
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type !== "output_text") continue;
      answer += c.text ?? "";
      for (const a of c.annotations ?? []) if (a.type === "url_citation") add(a.url, a.title);
    }
  }
  for (const c of data.citations ?? []) typeof c === "string" ? add(c) : add(c.url, c.title);
  const u = data.usage ?? {};
  return { answer: answer.trim(), sources: sources.slice(0, 20), searches, inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 };
}

let workingModel: string | null = null;
let toolCap = true;
/** Doar pentru teste. */
export const resetGrok = () => { workingModel = null; toolCap = true; };

export const grok: Runner = {
  id: "grok",
  isLive: () => !!key(),
  offReason: () => "key",
  async run(input: RunInput): Promise<RunOutput> {
    const t0 = Date.now();
    const fixed = envValue("GROK_MODEL");
    const order = fixed ? [fixed] : workingModel ? [workingModel] : GROK_CANDIDATES.map(([m]) => m);
    let lastErr: unknown = null;
    for (const model of order) {
      const body = () => ({
        model,
        input: input.query,
        tools: [{ type: "web_search" }],
        ...(toolCap ? { max_tool_calls: 2 } : {}),
        max_output_tokens: costConfig().maxOutputTokens,
      });
      let data: GrokResponse;
      try {
        try {
          data = await postJson(URL_RESPONSES, body(), { authorization: `Bearer ${key()}` });
        } catch (e) {
          if (!toolCap || !isToolCapRejected(String(e))) throw e;
          toolCap = false;
          data = await postJson(URL_RESPONSES, body(), { authorization: `Bearer ${key()}` });
        }
      } catch (e) {
        lastErr = e;
        if (!fixed && isModelUnavailable(String(e))) {
          console.warn(`AI grok: sărim ${model}: ${String(e).slice(0, 200)}`);
          if (workingModel === model) workingModel = null;
          continue;
        }
        throw e;
      }
      if (workingModel !== model) { workingModel = model; console.log(`AI grok: folosim ${model}`); }
      const out = parseGrok(data);
      const [pin, pout] = priceFor(model);
      const cost = (out.inputTokens * envPrice("GROK_IN_PER_M", pin) + out.outputTokens * envPrice("GROK_OUT_PER_M", pout)) / 1e6
        + out.searches * SEARCH_CALL_USD;
      return { answer: out.answer, sources: out.sources, model: data.model ?? model, mode: "live", costUsd: cost, latencyMs: Date.now() - t0, inputTokens: out.inputTokens, outputTokens: out.outputTokens };
    }
    throw lastErr ?? new Error("Niciun model Grok disponibil pentru această cheie.");
  },
};

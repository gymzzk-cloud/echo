import Anthropic from "@anthropic-ai/sdk";
import type { Provider, Runner, RunInput, RunOutput } from "./types";
import { costConfig } from "./budget";
import { gemini } from "./gemini";
import { envPrice, envValue, postJson } from "./http";
import { grok } from "./grok";
import { meta } from "./meta";
import { aimode, aioverview, copilot } from "./serpapi";

/**
 * Adaptoarele reale. Trimitem întrebarea exact cum ar scrie-o un cumpărător,
 * fără instrucțiuni în plus, doar cu locația aproximativă (RO/HU), ca să măsurăm ce vede omul real.
 * Prețurile per 1M tokeni sunt estimative și se pot ajusta din variabile de mediu.
 *
 * Cost mic (vezi CLAUDE.md, „Costuri AI”): modelul cel mai ieftin care caută pe web,
 * efort de gândire redus, răspuns plafonat (AI_MAX_OUTPUT_TOKENS) și cel mult 2 căutări pe întrebare.
 * Întrebarea nu primește instrucțiuni în plus: ar costa tokeni și ar strica măsurătoarea.
 */

export { cleanEnvValue } from "./http";
const env = envValue;
const price = envPrice;

// ── ChatGPT (OpenAI Responses API cu web_search) ───────────────────────────
export const chatgpt: Runner = {
  id: "chatgpt",
  isLive: () => !!env("OPENAI_API_KEY"),
  async run(input: RunInput): Promise<RunOutput> {
    const t0 = Date.now();
    const model = env("OPENAI_MODEL", "gpt-5-mini");
    const data = await postJson("https://api.openai.com/v1/responses", {
      model,
      input: input.query,
      tools: [{ type: "web_search", search_context_size: "low", user_location: { type: "approximate", country: input.country } }],
      reasoning: { effort: env("OPENAI_REASONING_EFFORT", "low") },
      // La modelele cu gândire, plafonul include și gândirea: îi lăsăm loc în plus.
      max_output_tokens: costConfig().maxOutputTokens + 1500,
    }, { authorization: `Bearer ${env("OPENAI_API_KEY")}` });
    let answer = "";
    const sources: { url: string; title?: string }[] = [];
    for (const item of data.output ?? []) {
      if (item.type !== "message") continue;
      for (const c of item.content ?? []) {
        if (c.type === "output_text") {
          answer += c.text;
          for (const a of c.annotations ?? []) if (a.type === "url_citation") sources.push({ url: a.url, title: a.title });
        }
      }
    }
    const u = data.usage ?? {};
    const cost = ((u.input_tokens ?? 0) * price("OPENAI_IN_PER_M", 0.25) + (u.output_tokens ?? 0) * price("OPENAI_OUT_PER_M", 2)) / 1e6 + 0.01;
    return { answer, sources, model, mode: "live", costUsd: cost, latencyMs: Date.now() - t0, inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 };
  },
};

// ── Perplexity (Sonar) ─────────────────────────────────────────────────────
export const perplexity: Runner = {
  id: "perplexity",
  isLive: () => !!env("PERPLEXITY_API_KEY"),
  async run(input) {
    const t0 = Date.now();
    const model = env("PERPLEXITY_MODEL", "sonar");
    const data = await postJson("https://api.perplexity.ai/chat/completions", {
      model,
      messages: [{ role: "user", content: input.query }],
      max_tokens: costConfig().maxOutputTokens,
      web_search_options: { search_context_size: "low", user_location: { country: input.country } },
    }, { authorization: `Bearer ${env("PERPLEXITY_API_KEY")}` });
    const answer = data.choices?.[0]?.message?.content ?? "";
    const sources = (data.search_results ?? []).map((s: { url: string; title?: string }) => ({ url: s.url, title: s.title }));
    if (!sources.length) for (const url of data.citations ?? []) sources.push({ url });
    const u = data.usage ?? {};
    const cost = ((u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0)) * price("PERPLEXITY_PER_M", 1) / 1e6 + 0.005;
    return { answer, sources, model, mode: "live", costUsd: cost, latencyMs: Date.now() - t0, inputTokens: u.prompt_tokens ?? 0, outputTokens: u.completion_tokens ?? 0 };
  },
};

// ── Claude (Messages API cu web search) ────────────────────────────────────
// Implicit Claude Haiku 5.5 (de ~40 de ori mai ieftin decât Opus 5.5). Haiku folosește varianta de bază a căutării
// web și nu are fallback pe server la refuz; modelele mari primesc căutarea nouă și fallback-ul.
const CLAUDE_PRICES: Record<string, [number, number]> = { haiku: [0.1, 0.5], sonnet: [2, 10], opus: [4, 20] };
const claudeTier = (model: string) => (model.includes("haiku") ? "haiku" : model.includes("sonnet") ? "sonnet" : "opus");
let anthropic: Anthropic | null = null;
export const claude: Runner = {
  id: "claude",
  isLive: () => !!env("ANTHROPIC_API_KEY"),
  async run(input) {
    const t0 = Date.now();
    anthropic ??= new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
    const model = env("ANTHROPIC_MODEL", "claude-haiku-5-5");
    const tier = claudeTier(model);
    // Fără user_location: căutarea web Claude respinge țara RO („Country code RO is not supported”, 400).
    // Întrebarea e oricum în limba clientului, deci răspunsul rămâne local.
    const res = await anthropic.beta.messages.create({
      model,
      max_tokens: costConfig().maxOutputTokens,
      output_config: { effort: "low" }, // e o căutare, nu o analiză
      messages: [{ role: "user", content: input.query }],
      ...(tier === "haiku"
        ? { tools: [{ type: "web_search_20250305" as const, name: "web_search" as const, max_uses: 2 }] }
        : {
            tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 2 }],
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default" as const,
          }),
    });
    let answer = "";
    const sources: { url: string; title?: string }[] = [];
    for (const b of res.content) {
      if (b.type === "text") answer += b.text;
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) if (r.type === "web_search_result") sources.push({ url: r.url, title: r.title });
      }
    }
    if (res.stop_reason === "refusal") answer = answer || "(Claude a refuzat întrebarea.)";
    const u = res.usage;
    const [pin, pout] = CLAUDE_PRICES[tier];
    const cost = (u.input_tokens * price("ANTHROPIC_IN_PER_M", pin) + u.output_tokens * price("ANTHROPIC_OUT_PER_M", pout)) / 1e6
      + (u.server_tool_use?.web_search_requests ?? 0) * 0.01;
    return { answer, sources, model: res.model, mode: "live", costUsd: cost, latencyMs: Date.now() - t0, inputTokens: u.input_tokens, outputTokens: u.output_tokens };
  },
};

export const LIVE: Record<Provider, Runner> = { chatgpt, gemini, perplexity, claude, aioverview, aimode, copilot, grok, meta };

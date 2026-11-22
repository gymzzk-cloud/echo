import { envPrice, envValue } from "./http";
import type { Provider, Runner, RunInput, RunOutput } from "./types";

/**
 * Răspunsurile AI din motoarele de căutare (Google AI Overviews, Google AI Mode, Copilot), care nu au API oficial.
 * Le citim prin SerpApi (serpapi.com), pe google.ro / google.hu, în limba magazinului.
 *
 * Cost mic: o căutare SerpApi costă un credit (planul gratuit are puține pe lună), așa că:
 * - pornim doar motoarele din SERP_ENGINES (implicit toate trei: aioverview, aimode, copilot);
 * - motorul refolosește o rulare reușită SERP_REUSE_DAYS zile (implicit 7), nu o reface la fiecare clic;
 * - plafonul lunar SERPAPI_MONTHLY_LIMIT (implicit 100) oprește întrebările înainte să depășim planul.
 */

type Source = { url: string; title?: string };

const key = () => envValue("SERPAPI_API_KEY");
const enabledEngines = () => envValue("SERP_ENGINES", "aioverview,aimode,copilot").split(/[,\s]+/).filter(Boolean);
/** Câte credite are planul pe lună. */
export const serpMonthlyLimit = () => Math.max(0, Number(envValue("SERPAPI_MONTHLY_LIMIT", "100")) || 0);
export const serpReuseDays = () => Math.max(1, Number(envValue("SERP_REUSE_DAYS", "7")) || 7);
/** Modelul trecut pe o rulare care a costat două credite (căutare + cererea separată pentru AI Overview). */
export const TWO_CREDIT_SUFFIX = "+overview";
/** Răspunsul salvat când Google nu afișează un AI Overview pentru căutarea respectivă. */
export const NO_OVERVIEW = "(Google nu a afișat un rezumat AI pentru această căutare.)";

async function serpGet(params: Record<string, string>) {
  const q = new URLSearchParams({ ...params, api_key: key() });
  const r = await fetch(`https://serpapi.com/search.json?${q}`, { signal: AbortSignal.timeout(90000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
  const data = JSON.parse(text) as Record<string, unknown>;
  // „Fără rezultate” nu e o eroare: înseamnă doar că Google nu a arătat nimic pentru căutare.
  if (typeof data.error === "string" && !/hasn't returned any results/i.test(data.error)) throw new Error(`SerpApi: ${data.error.slice(0, 200)}`);
  return data;
}

type Block = { type?: string; snippet?: string; title?: string; list?: Block[]; text_blocks?: Block[]; table?: string[][] };
type Overview = { text_blocks?: Block[]; references?: { link?: string; title?: string; source?: string }[]; page_token?: string; error?: string };

/** Textul unui AI Overview, ca listă lizibilă (titlurile și numele magazinelor rămân, ca să le găsim mențiunile). */
export function overviewText(blocks: Block[] = [], depth = 0): string {
  const lines: string[] = [];
  const pad = "  ".repeat(depth);
  for (const b of blocks) {
    if (b.type === "list" || (b.list && !b.snippet)) {
      for (const it of b.list ?? []) {
        const head = [it.title, it.snippet].filter(Boolean).join(": ");
        if (head) lines.push(`${pad}- ${head}`);
        if (it.list?.length) lines.push(overviewText([{ type: "list", list: it.list }], depth + 1));
      }
    } else if (b.type === "table" && b.table) {
      for (const row of b.table) lines.push(`${pad}${row.join(" | ")}`);
    } else {
      const t = [b.title, b.snippet].filter(Boolean).join(": ");
      if (t) lines.push(b.type === "heading" ? `\n${pad}**${t}**` : `${pad}${t}`);
    }
    if (b.text_blocks?.length) lines.push(overviewText(b.text_blocks, depth));
  }
  const text = lines.filter(Boolean).join("\n");
  return depth === 0 ? text.trim() : text;
}

export function overviewSources(o: Overview): Source[] {
  const seen = new Set<string>();
  return (o.references ?? [])
    .filter((r): r is { link: string; title?: string; source?: string } => typeof r.link === "string" && /^https?:/.test(r.link))
    .map((r) => ({ url: r.link, title: r.title ?? r.source }))
    .filter((s) => !seen.has(s.url) && !!seen.add(s.url))
    .slice(0, 20);
}

const googleDomain = (country: RunInput["country"]) => (country === "HU" ? "google.hu" : "google.ro");

/** Google AI Overviews: rezumatul AI din capul rezultatelor Google, cu sursele citate. */
export const aioverview: Runner = {
  id: "aioverview",
  isLive: () => !!key() && enabledEngines().includes("aioverview"),
  offReason: () => (key() ? "off" : "key"),
  limits: () => ({ perMonthCredits: serpMonthlyLimit(), reuseDays: serpReuseDays() }),
  async run(input) {
    const t0 = Date.now();
    const base = { gl: input.country.toLowerCase(), hl: input.language, google_domain: googleDomain(input.country) };
    const data = await serpGet({ engine: "google", q: input.query, ...base });
    let o = (data.ai_overview ?? {}) as Overview;
    let credits = 1;
    // Uneori Google încarcă rezumatul separat: SerpApi dă un „page_token” valabil un minut, care costă încă un credit.
    if (o.page_token && !o.text_blocks?.length) {
      const more = await serpGet({ engine: "google_ai_overview", page_token: o.page_token });
      o = (more.ai_overview ?? {}) as Overview;
      credits = 2;
    }
    const answer = overviewText(o.text_blocks);
    return {
      answer: answer || NO_OVERVIEW,
      sources: answer ? overviewSources(o) : [],
      model: `serpapi:google${credits === 2 ? TWO_CREDIT_SUFFIX : ""}`,
      mode: "live",
      costUsd: credits * envPrice("SERPAPI_PER_CALL", 0.015),
      latencyMs: Date.now() - t0,
    };
  },
};

// ── Google AI Mode și Copilot (pornite implicit, se pot opri din SERP_ENGINES) ──
// Ambele dau „text_blocks” + „references”, ca AI Overviews; Copilot pune și un „header” cu răspunsul scurt.
// Dacă forma se schimbă, citim defensiv text și linkuri din orice bloc.
function collectSerp(node: unknown, out: { text: string[]; sources: Source[] }, depth = 0) {
  if (depth > 6 || !node) return;
  if (Array.isArray(node)) { for (const x of node) collectSerp(x, out, depth + 1); return; }
  if (typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  for (const k of ["snippet", "text", "answer", "paragraph"]) if (typeof o[k] === "string") out.text.push(o[k] as string);
  if (typeof o.link === "string" && /^https?:/.test(o.link)) out.sources.push({ url: o.link, title: typeof o.title === "string" ? o.title : undefined });
  for (const v of Object.values(o)) if (typeof v === "object") collectSerp(v, out, depth + 1);
}

/** Răspunsul AI Mode / Copilot din JSON-ul SerpApi. Logică pură, testată pe fixture. */
export function parseSerpAnswer(data: Record<string, unknown>): { answer: string; sources: Source[] } {
  const header = typeof data.header === "string" ? data.header.trim() : "";
  const blocks = Array.isArray(data.text_blocks) ? (data.text_blocks as Block[]) : [];
  const body = overviewText(blocks);
  let answer = [header, body].filter(Boolean).join("\n\n");
  if (!answer && typeof data.reconstructed_markdown === "string") answer = data.reconstructed_markdown.trim();
  let sources = overviewSources({ references: data.references as Overview["references"] });
  if (!answer) {
    const out = { text: [] as string[], sources: [] as Source[] };
    collectSerp(data.answer ?? data.ai_overview ?? null, out);
    answer = [...new Set(out.text)].join("\n");
    const seen = new Set<string>();
    if (!sources.length) sources = out.sources.filter((s) => !seen.has(s.url) && !!seen.add(s.url)).slice(0, 20);
  }
  return { answer, sources: answer ? sources : [] };
}
/** Răspunsul salvat când motorul nu a dat un răspuns AI. */
export const NO_ANSWER = "(Motorul nu a dat un răspuns AI pentru această căutare.)";

function serpRunner(id: Extract<Provider, "aimode" | "copilot">, engine: string, local: boolean): Runner {
  return {
    id,
    isLive: () => !!key() && enabledEngines().includes(id),
    offReason: () => (key() ? "off" : "key"),
    limits: () => ({ perMonthCredits: serpMonthlyLimit(), reuseDays: serpReuseDays() }),
    async run(input): Promise<RunOutput> {
      const t0 = Date.now();
      // Copilot nu primește țară/limbă: întrebarea în română sau maghiară ajunge, la fel ca la un om.
      const loc: Record<string, string> = local ? { gl: input.country.toLowerCase(), hl: input.language } : {};
      const data = await serpGet({ engine, q: input.query, ...loc });
      const { answer, sources } = parseSerpAnswer(data);
      return {
        answer: answer || NO_ANSWER, sources,
        model: `serpapi:${engine}`, mode: "live", costUsd: envPrice("SERPAPI_PER_CALL", 0.015), latencyMs: Date.now() - t0,
      };
    },
  };
}
export const aimode = serpRunner("aimode", envValue("AIMODE_ENGINE", "google_ai_mode"), true);
export const copilot = serpRunner("copilot", envValue("COPILOT_ENGINE", "bing_copilot"), false);
/** Providerii care consumă credite SerpApi (plafonul lunar e comun). */
export const SERP_PROVIDERS: Provider[] = ["aioverview", "aimode", "copilot"];

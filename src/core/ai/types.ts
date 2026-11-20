export type Provider = "chatgpt" | "gemini" | "perplexity" | "claude" | "aioverview" | "aimode" | "copilot";

/** `short` e eticheta de 3 litere din insignele panoului; trebuie să fie unică. */
export const PROVIDERS: { id: Provider; label: string; short: string; color: string }[] = [
  { id: "chatgpt", label: "ChatGPT", short: "Cha", color: "#10a37f" },
  { id: "gemini", label: "Gemini", short: "Gem", color: "#4285f4" },
  { id: "perplexity", label: "Perplexity", short: "Per", color: "#20808d" },
  { id: "claude", label: "Claude", short: "Cla", color: "#d97757" },
  { id: "aioverview", label: "Google AI Overviews", short: "Goo", color: "#34a853" },
  { id: "aimode", label: "Google AI Mode", short: "AIM", color: "#188038" },
  { id: "copilot", label: "Copilot", short: "Cop", color: "#0078d4" },
];
export const providerLabel = (p: string) => PROVIDERS.find((x) => x.id === p)?.label ?? p;

/** Modelul trecut pe o rulare eșuată. */
export const ERROR_MODEL = "eroare";

export type RunInput = {
  query: string;
  language: "ro" | "hu";
  country: "RO" | "HU";
};

export type RunOutput = {
  answer: string;
  sources: { url: string; title?: string }[];
  model: string;
  mode: "live" | "demo";
  costUsd: number;
  latencyMs: number;
  /** Tokenii raportați de API (0 în modul demo sau la eroare). */
  inputTokens?: number;
  outputTokens?: number;
};

/** Ce știm despre lume când extragem mențiunile sau simulăm (modul demo). */
export type KnownStore = { domain: string; name: string };
export type KnownProduct = { domain: string; title: string; price: number | null; url: string; category: string | null; codes?: string[] };

/**
 * Limitele unui AI, aplicate de motor înainte de apel (0 sau lipsă = fără limită):
 * rpm = cereri pe minut, perDay = rulări pe zi, perMonthCredits = credite pe lună (comune pentru SerpApi),
 * reuseDays = câte zile refolosim o rulare reușită în loc s-o plătim din nou.
 */
export type RunnerLimits = { rpm?: number; perDay?: number; perMonthCredits?: number; reuseDays?: number };

export interface Runner {
  id: Provider;
  isLive(): boolean;
  limits?(): RunnerLimits;
  run(input: RunInput): Promise<RunOutput>;
}

export type Provider = "chatgpt" | "gemini" | "perplexity" | "claude" | "aimode" | "copilot";

export const PROVIDERS: { id: Provider; label: string; color: string }[] = [
  { id: "chatgpt", label: "ChatGPT", color: "#10a37f" },
  { id: "gemini", label: "Gemini", color: "#4285f4" },
  { id: "perplexity", label: "Perplexity", color: "#20808d" },
  { id: "claude", label: "Claude", color: "#d97757" },
  { id: "aimode", label: "Google AI Mode", color: "#34a853" },
  { id: "copilot", label: "Copilot", color: "#0078d4" },
];
export const providerLabel = (p: string) => PROVIDERS.find((x) => x.id === p)?.label ?? p;

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

export interface Runner {
  id: Provider;
  isLive(): boolean;
  run(input: RunInput): Promise<RunOutput>;
}

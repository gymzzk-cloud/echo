import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GROK_CANDIDATES, grok, isModelUnavailable, isToolCapRejected, parseGrok, resetGrok } from "../src/core/ai/grok";
import { meta, parseMeta, urlsInText } from "../src/core/ai/meta";
import { NO_ANSWER, aimode, aioverview, copilot, parseSerpAnswer } from "../src/core/ai/serpapi";
import { LIVE } from "../src/core/ai/live";
import { PROVIDERS } from "../src/core/ai/types";

// Fixture-urile sunt sintetice, după forma din documentația xAI / SerpApi (containerul nu ajunge la API-uri);
// se înlocuiesc cu răspunsuri reale salvate după prima rulare în producție.
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/ai/${name}`, import.meta.url), "utf8"));
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const input = { query: "bormasina cu acumulator bosch", language: "ro" as const, country: "RO" as const };

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); resetGrok(); });

describe("lista AI-urilor", () => {
  it("fiecare AI are adaptor, etichetă scurtă unică", () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(expect.arrayContaining(["grok", "meta", "aimode", "copilot"]));
    for (const p of PROVIDERS) expect(LIVE[p.id].id).toBe(p.id);
    expect(new Set(PROVIDERS.map((p) => p.short)).size).toBe(PROVIDERS.length);
  });
});

describe("Grok", () => {
  it("citește textul, sursele fără dubluri și căutările", () => {
    const out = parseGrok(fixture("xai-responses-web-search.json"));
    expect(out.answer).toMatch(/^Poți cumpăra o bormașină Bosch/);
    expect(out.sources.map((s) => s.url)).toEqual([
      "https://www.dedeman.ro/ro/bormasina-bosch-gsr-18v-55/p/123",
      "https://www.emag.ro/bosch-gsr-18v-55/pd/ABC/",
      "https://www.compari.ro/bormasini/",
    ]);
    expect(out.searches).toBe(2);
    expect(out.inputTokens).toBe(1200);
  });

  it("răspuns gol nu aruncă", () => {
    expect(parseGrok({})).toEqual({ answer: "", sources: [], searches: 0, inputTokens: 0, outputTokens: 0 });
  });

  it("fără cheie nu e întrebat", () => {
    vi.stubEnv("XAI_API_KEY", "");
    vi.stubEnv("GROK_API_KEY", "");
    expect(grok.isLive()).toBe(false);
    vi.stubEnv("XAI_API_KEY", "k");
    expect(grok.isLive()).toBe(true);
  });

  it("întrebarea pleacă exact cum e scrisă, cu răspuns plafonat și cel mult 2 căutări; costul include căutările", async () => {
    vi.stubEnv("XAI_API_KEY", "k");
    const f = vi.fn(async (_url: string, init: RequestInit) => { void init; return ok(fixture("xai-responses-web-search.json")); });
    vi.stubGlobal("fetch", f);
    const out = await grok.run(input);
    const body = JSON.parse(String(f.mock.calls[0][1].body));
    expect(body.input).toBe(input.query);
    expect(body.max_tool_calls).toBe(2);
    expect(body.model).toBe(GROK_CANDIDATES[0][0]);
    expect(out.costUsd).toBeCloseTo((1200 * 0.2 + 80 * 0.5) / 1e6 + 2 * 0.005, 6);
    expect(out.sources).toHaveLength(3);
  });

  it("trece la următorul model când cel ieftin a fost retras, și îl ține minte", async () => {
    vi.stubEnv("XAI_API_KEY", "k");
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      const m = JSON.parse(String(init.body)).model;
      return m === GROK_CANDIDATES[0][0]
        ? new Response(JSON.stringify({ error: `The model ${m} does not exist or your team does not have access to it.` }), { status: 404 })
        : ok(fixture("xai-responses-web-search.json"));
    });
    vi.stubGlobal("fetch", f);
    await grok.run(input);
    await grok.run(input);
    const models = f.mock.calls.map((c) => JSON.parse(String(c[1].body)).model);
    expect(models).toEqual([GROK_CANDIDATES[0][0], GROK_CANDIDATES[1][0], GROK_CANDIDATES[1][0]]);
  });

  it("o cheie greșită nu trece prin toate modelele", async () => {
    vi.stubEnv("XAI_API_KEY", "k");
    const f = vi.fn(async () => new Response(JSON.stringify({ error: "Incorrect API key provided" }), { status: 401 }));
    vi.stubGlobal("fetch", f);
    await expect(grok.run(input)).rejects.toThrow(/401/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("recunoaște modelul retras și plafonul de căutări respins", () => {
    expect(isModelUnavailable("Error: HTTP 404: The model grok-x does not exist")).toBe(true);
    expect(isModelUnavailable("Error: HTTP 429: rate limit")).toBe(false);
    expect(isToolCapRejected("Error: HTTP 400: Unknown parameter: max_tool_calls")).toBe(true);
  });
});

describe("Meta AI", () => {
  it("citește textul și linkurile scrise în răspuns", () => {
    const out = parseMeta({ choices: [{ message: { content: "Vezi https://www.dedeman.ro/bormasini. Sau eMAG (https://www.emag.ro/x)." } }], usage: { prompt_tokens: 10, completion_tokens: 20 } });
    expect(out.sources.map((s) => s.url)).toEqual(["https://www.dedeman.ro/bormasini", "https://www.emag.ro/x"]);
    expect(out.outputTokens).toBe(20);
    expect(parseMeta({}).answer).toBe("");
  });

  it("fără linkuri nu inventează surse", () => {
    expect(urlsInText("Dedeman și eMAG au modele bune.")).toEqual([]);
  });

  it("trimite întrebarea exact cum e, la Meta Model API", async () => {
    vi.stubEnv("META_API_KEY", "k");
    const f = vi.fn(async (_url: string, init: RequestInit) => { void init; return ok({ model: "muse-spark-1.3", choices: [{ message: { content: "Dedeman." } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } }); });
    vi.stubGlobal("fetch", f);
    const out = await meta.run(input);
    expect(f.mock.calls[0][0]).toBe("https://api.meta.ai/v1/chat/completions");
    expect(JSON.parse(String(f.mock.calls[0][1].body)).messages).toEqual([{ role: "user", content: input.query }]);
    expect(out.costUsd).toBeCloseTo((1000 * 1.25 + 100 * 4.25) / 1e6, 8);
  });
});

describe("Google AI Mode și Copilot (SerpApi)", () => {
  beforeEach(() => { vi.stubEnv("SERPAPI_API_KEY", "k"); });

  it("Copilot: titlul, lista și sursele", () => {
    const out = parseSerpAnswer(fixture("serpapi-bing-copilot.json"));
    expect(out.answer).toMatch(/^Cele mai căutate bormașini Bosch/);
    expect(out.answer).toContain("- Dedeman are GSR 18V-55");
    expect(out.sources.map((s) => s.url)).toEqual(["https://www.dedeman.ro/ro/bormasina-bosch-gsr-18v-55/p/123", "https://www.emag.ro/bosch-gsb-18v-50/pd/ABC/"]);
  });

  it("AI Mode: textul și sursele", () => {
    const out = parseSerpAnswer(fixture("serpapi-google-ai-mode.json"));
    expect(out.answer).toContain("Bosch GSR 18V-55");
    expect(out.answer).toContain("- Dedeman: în jur de 899 lei");
    expect(out.sources).toHaveLength(1);
  });

  it("fără răspuns AI: mesaj clar, fără surse", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ search_metadata: { status: "Success" }, organic_results: [{ link: "https://x.ro" }] })));
    const out = await copilot.run(input);
    expect(out.answer).toBe(NO_ANSWER);
    expect(out.sources).toEqual([]);
  });

  it("AI Mode primește țara și limba, Copilot doar întrebarea", async () => {
    const f = vi.fn(async (_url: string) => ok(fixture("serpapi-google-ai-mode.json")));
    vi.stubGlobal("fetch", f);
    await aimode.run(input);
    await copilot.run(input);
    const a = new URL(f.mock.calls[0][0]).searchParams;
    const c = new URL(f.mock.calls[1][0]).searchParams;
    expect([a.get("engine"), a.get("gl"), a.get("hl")]).toEqual(["google_ai_mode", "ro", "ro"]);
    expect([c.get("engine"), c.get("q"), c.get("gl")]).toEqual(["bing_copilot", input.query, null]);
  });

  it("implicit pornite toate trei; oprite din SERP_ENGINES apar ca „oprit”, nu „fără cheie”", () => {
    expect([aioverview.isLive(), aimode.isLive(), copilot.isLive()]).toEqual([true, true, true]);
    vi.stubEnv("SERP_ENGINES", "aioverview");
    expect(aimode.isLive()).toBe(false);
    expect(aimode.offReason?.()).toBe("off");
    vi.stubEnv("SERPAPI_API_KEY", "");
    expect(aimode.offReason?.()).toBe("key");
  });
});

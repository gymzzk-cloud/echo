import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { daysAgo } from "../src/core/ai/budget";
import { failureReason } from "../src/core/ai/errors";
import { attemptOrder, flashCandidates, flashVersion, gemini, isGroundingRefused, isQuotaExhausted, parseGemini, pickFlashModel, thinkingFor } from "../src/core/ai/gemini";
import { errorSummary, postJson, retryAfterMs } from "../src/core/ai/http";
import { limitReason, waitForSlot } from "../src/core/ai/limits";
import { NO_OVERVIEW, aioverview, overviewSources, overviewText } from "../src/core/ai/serpapi";
import { PROVIDERS } from "../src/core/ai/types";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/ai/${name}`, import.meta.url), "utf8"));

describe("Gemini", () => {
  it("alege cel mai nou model Flash, stabil înaintea variantei preview", () => {
    const models = [
      { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3-flash-preview", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3-flash", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3-pro", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-3.5-flash-image", supportedGenerationMethods: ["generateContent"] },
      { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
    ];
    expect(pickFlashModel(models)).toBe("gemini-3-flash");
    expect(pickFlashModel([])).toBeNull();
    expect(flashVersion("gemini-2.5-flash")).toBe(2.5);
    expect(flashVersion("gemini-2.5-flash-lite")).toBeNull();
  });

  it("gândirea cea mai ieftină pe fiecare generație", () => {
    expect(thinkingFor("gemini-2.5-flash")).toEqual({ thinkingBudget: 0 });
    expect(thinkingFor("gemini-3-flash-preview")).toEqual({ thinkingLevel: "minimal" });
  });

  it("citește textul, sursele (domeniul real, fără dubluri) și tokenii", () => {
    const out = parseGemini(fixture("gemini-grounded.json"));
    expect(out.answer).toBe("Poți cumpăra o bormașină Bosch de la Dedeman sau eMAG. Prețurile încep de la 450 lei.");
    expect(out.sources.map((s) => s.url)).toEqual([
      "https://dedeman.ro",
      "https://emag.ro",
      "https://vertexaisearch.cloud.google.com/grounding-api-redirect/CCC",
    ]);
    expect(out.inputTokens).toBe(9);
    expect(out.outputTokens).toBe(45);
  });

  it("răspuns gol (AI fără candidați) nu aruncă", () => {
    expect(parseGemini({})).toEqual({ answer: "", sources: [], inputTokens: 0, outputTokens: 0 });
  });

  it("recunoaște refuzul căutării Google, dar nu și limita pe minut", () => {
    expect(isGroundingRefused('HTTP 400: {"error":{"message":"Search Grounding is not supported for this model."}}')).toBe(true);
    expect(isGroundingRefused('HTTP 403: {"error":{"message":"google_search tool is not available on the free tier"}}')).toBe(true);
    expect(isGroundingRefused('HTTP 429: {"error":{"message":"Quota exceeded for grounding"}}')).toBe(false);
    expect(isGroundingRefused("HTTP 401: API key not valid")).toBe(false);
  });

  it("timpul de așteptare după 429, plafonat la un minut", () => {
    expect(retryAfterMs('{"error":{"details":[{"retryDelay":"23s"}]}}')).toBe(23000);
    expect(retryAfterMs("{}", "5")).toBe(5000);
    expect(retryAfterMs('{"retryDelay":"3600s"}')).toBe(60000);
    expect(retryAfterMs("{}")).toBeNull();
  });
});

describe("Google AI Overviews (SerpApi)", () => {
  const data = fixture("serpapi-google-ai-overview.json");

  it("transformă blocurile în text lizibil, cu liste, subliste și secțiuni extinse", () => {
    const text = overviewText(data.ai_overview.text_blocks);
    expect(text).toContain("cele mai căutate modele sunt GSR 18V-55");
    expect(text).toContain("**Unde le găsești**");
    expect(text).toContain("- Dedeman: are GSR 18V-55 la aproximativ 899 lei.");
    expect(text).toContain("  - livrare rapidă cu Genius");
    expect(text).toContain("Sfaturi\nVerifică tensiunea");
    expect(overviewText([])).toBe("");
  });

  it("sursele citate, fără dubluri", () => {
    expect(overviewSources(data.ai_overview).map((s) => s.url)).toEqual([
      "https://www.dedeman.ro/ro/bormasina-bosch-gsr-18v-55/p/123",
      "https://www.emag.ro/bosch-gsb-18v-50/pd/ABC/",
    ]);
  });

  describe("adaptorul", () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

    it("întreabă google.ro în română și citește rezumatul dintr-un singur credit", async () => {
      vi.stubEnv("SERPAPI_API_KEY", "k");
      const f = vi.fn(async () => ok(data));
      vi.stubGlobal("fetch", f);
      const out = await aioverview.run({ query: "bormasina cu acumulator bosch", language: "ro", country: "RO" });
      const url = new URL(String((f.mock.calls[0] as unknown[])[0]));
      expect(url.searchParams.get("google_domain")).toBe("google.ro");
      expect(url.searchParams.get("gl")).toBe("ro");
      expect(url.searchParams.get("hl")).toBe("ro");
      expect(f).toHaveBeenCalledTimes(1);
      expect(out.model).toBe("serpapi:google");
      expect(out.sources).toHaveLength(2);
    });

    it("cere rezumatul separat când Google dă doar un page_token (două credite)", async () => {
      vi.stubEnv("SERPAPI_API_KEY", "k");
      const f = vi.fn()
        .mockResolvedValueOnce(ok({ ai_overview: { page_token: "tok" } }))
        .mockResolvedValueOnce(ok({ ai_overview: data.ai_overview }));
      vi.stubGlobal("fetch", f);
      const out = await aioverview.run({ query: "x", language: "hu", country: "HU" });
      expect(new URL(String(f.mock.calls[0][0])).searchParams.get("google_domain")).toBe("google.hu");
      expect(new URL(String(f.mock.calls[1][0])).searchParams.get("engine")).toBe("google_ai_overview");
      expect(out.model).toBe("serpapi:google+overview");
      expect(out.costUsd).toBeCloseTo(0.03);
    });

    it("fără rezumat AI pe pagină: răspuns clar, fără surse (nu e eroare)", async () => {
      vi.stubEnv("SERPAPI_API_KEY", "k");
      vi.stubGlobal("fetch", vi.fn(async () => ok({ organic_results: [{ link: "https://emag.ro" }] })));
      const out = await aioverview.run({ query: "x", language: "ro", country: "RO" });
      expect(out.answer).toBe(NO_OVERVIEW);
      expect(out.sources).toEqual([]);
    });

    it("eroare SerpApi (cheie greșită) devine eroare, nu răspuns gol", async () => {
      vi.stubEnv("SERPAPI_API_KEY", "k");
      vi.stubGlobal("fetch", vi.fn(async () => ok({ error: "Invalid API key." })));
      await expect(aioverview.run({ query: "x", language: "ro", country: "RO" })).rejects.toThrow(/Invalid API key/);
    });

    it("pornește doar motoarele din SERP_ENGINES", () => {
      vi.stubEnv("SERPAPI_API_KEY", "k");
      expect(aioverview.isLive()).toBe(true);
      vi.stubEnv("SERP_ENGINES", "aimode");
      expect(aioverview.isLive()).toBe(false);
    });
  });
});

describe("limitele planurilor gratuite", () => {
  it("oprește la plafonul zilnic și la creditele lunare", () => {
    expect(limitReason({ perDay: 200 }, { today: 199, monthCredits: 0 })).toBeNull();
    expect(limitReason({ perDay: 200 }, { today: 200, monthCredits: 0 })).toMatch(/zilnică/);
    expect(limitReason({ perMonthCredits: 100 }, { today: 0, monthCredits: 100 })).toMatch(/SerpApi/);
    expect(limitReason({}, { today: 10_000, monthCredits: 10_000 })).toBeNull();
  });

  it("motivul se vede pe înțeles în panou", () => {
    expect(failureReason(`(Eroare gemini: Error: ${limitReason({ perDay: 1 }, { today: 1, monthCredits: 0 })})`)).toMatch(/planului gratuit/);
  });

  it("împarte cererile la ritmul pe minut", async () => {
    vi.useFakeTimers();
    const now = Date.now();
    expect(await waitForSlot("gemini", 0, now)).toBe(0);
    expect(await waitForSlot("gemini", 10, now)).toBe(0);
    const second = waitForSlot("gemini", 10, now);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await second).toBe(6000);
    vi.useRealTimers();
  });

  it("data de acum n zile", () => {
    expect(daysAgo("2026-11-20", 6)).toBe("2026-11-14");
    expect(daysAgo("2026-03-01", 1)).toBe("2026-02-28");
  });

  it("etichetele scurte din panou sunt unice", () => {
    expect(new Set(PROVIDERS.map((p) => p.short)).size).toBe(PROVIDERS.length);
  });
});

describe("Gemini: cota gratuită", () => {
  const google429 = JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.", details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests", quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "0" }] }, { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "31s" }] } }, null, 2);

  it("mesajul de eroare păstrează cota atinsă, pe un rând", () => {
    const s = errorSummary(google429);
    expect(s).toBe("RESOURCE_EXHAUSTED [GenerateRequestsPerDayPerProjectPerModel-FreeTier limit: 0] You exceeded your current quota, please check your plan and billing details.");
    expect(errorSummary("bad\n gateway")).toBe("bad gateway");
  });

  it("cota pe zi sau zero trece la alt model; o eroare de cheie nu", () => {
    expect(isQuotaExhausted(`HTTP 429: ${errorSummary(google429)}`)).toBe(true);
    expect(isQuotaExhausted("HTTP 401: API key not valid")).toBe(false);
  });

  it("Flash-Lite e rezerva de la urmă", () => {
    expect(flashCandidates([{ name: "models/gemini-2.5-flash-lite" }, { name: "models/gemini-3-flash" }, { name: "models/gemini-2.5-flash" }]))
      .toEqual(["gemini-3-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"]);
  });

  it("încearcă întâi ce a mers, apoi fiecare model cu căutare, apoi fără", () => {
    const m = ["gemini-3-flash", "gemini-2.5-flash"];
    expect(attemptOrder(m, null).map((a) => `${a.model}${a.grounded ? "+s" : ""}`)).toEqual(["gemini-3-flash+s", "gemini-2.5-flash+s", "gemini-3-flash", "gemini-2.5-flash"]);
    expect(attemptOrder(m, { model: "gemini-2.5-flash", grounded: true })[0]).toEqual({ model: "gemini-2.5-flash", grounded: true });
  });

  describe("adaptorul", () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
    it("fără cotă pe primul model, folosește următorul, fără să aștepte retryDelay", async () => {
      vi.stubEnv("GEMINI_API_KEY", "k");
      vi.stubEnv("GEMINI_MODEL", "");
      vi.stubEnv("GEMINI_FREE_TIER", "1");
      const calls: string[] = [];
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        calls.push(url.replace(/^.*\/v1beta\//, ""));
        if (url.includes("/models?")) return new Response(JSON.stringify({ models: [{ name: "models/gemini-3-flash" }, { name: "models/gemini-2.5-flash" }] }));
        if (url.includes("gemini-3-flash:")) return new Response(google429, { status: 429 });
        return new Response(JSON.stringify(fixture("gemini-grounded.json")));
      }));
      const t0 = Date.now();
      const out = await gemini.run({ query: "bormasina bosch", language: "ro", country: "RO" });
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(out.model).toBe("gemini-2.5-flash");
      expect(out.costUsd).toBe(0);
      expect(calls).toEqual(["models?pageSize=200", "models/gemini-3-flash:generateContent", "models/gemini-2.5-flash:generateContent"]);
    });
  });
});

describe("supraîncărcare (503)", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const r503 = () => new Response(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE", message: "This model is currently experiencing high demand." } }), { status: 503 });

  it("reîncearcă de două ori cu pauze, apoi reușește", async () => {
    const f = vi.fn().mockResolvedValueOnce(r503()).mockResolvedValueOnce(r503()).mockResolvedValueOnce(new Response("{\"ok\":1}"));
    vi.stubGlobal("fetch", f);
    expect(await postJson("https://x", {}, {}, 1000, [1, 1])).toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("după reîncercări dă eroarea, scurtă și clară", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => r503()));
    await expect(postJson("https://x", {}, {}, 1000, [1, 1])).rejects.toThrow("HTTP 503: UNAVAILABLE This model is currently experiencing high demand.");
  });

  it("o eroare de cheie (401) nu se reîncearcă", async () => {
    const f = vi.fn(async () => new Response("bad key", { status: 401 }));
    vi.stubGlobal("fetch", f);
    await expect(postJson("https://x", {}, {}, 1000, [1, 1])).rejects.toThrow("HTTP 401");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("modelele stabile înaintea celor preview, chiar dacă preview e mai nou", () => {
    expect(flashCandidates([{ name: "models/gemini-3.5-flash-preview" }, { name: "models/gemini-3-flash" }, { name: "models/gemini-2.5-flash" }]))
      .toEqual(["gemini-3-flash", "gemini-2.5-flash", "gemini-3.5-flash-preview"]);
  });
});

import { describe, expect, it } from "vitest";
import { compareSameQuestions, engineVerdict, latestAnswers, perEngine, progressSince, recommendedNow, type EngineRow } from "@/core/engine-view";

const ME = "shopexpert.com";
const row = (promptId: string, provider: string, runDate: string, mentions: { domain: string; position: number; name?: string; opinions?: { aspect: null; tone: 1 | -1; quote: string }[] }[]): EngineRow =>
  ({ promptId, run: { provider, runDate, mentions } });

describe("perEngine", () => {
  it("fără date: nicio carte de AI", () => {
    expect(perEngine([], [], ME)).toEqual([]);
  });

  it("vizibilitate, loc mediu și cine apare în locul tău, pe fiecare AI", () => {
    const rows = [
      row("p1", "chatgpt", "2026-11-20", [{ domain: ME, position: 2 }, { domain: "dedeman.ro", position: 1, name: "Dedeman" }]),
      row("p2", "chatgpt", "2026-11-20", [{ domain: "dedeman.ro", position: 1, name: "Dedeman" }]),
      row("p1", "claude", "2026-11-20", [{ domain: "emag.ro", position: 1 }]),
    ];
    const [gpt, claude] = perEngine(rows, [], ME);
    expect(gpt).toMatchObject({ provider: "chatgpt", answers: 2, hits: 1, visibility: 50, avgPosition: 2, delta: null });
    expect(gpt.instead?.times).toBe(2);
    expect(gpt.leader).toMatchObject({ domain: "dedeman.ro", visibility: 100 });
    expect(claude).toMatchObject({ provider: "claude", hits: 0, visibility: 0, avgPosition: null });
  });

  it("variația e între ultimele două zile măsurate", () => {
    const rows = [
      row("p1", "gemini", "2026-11-13", []),
      row("p2", "gemini", "2026-11-13", []),
      row("p1", "gemini", "2026-11-20", [{ domain: ME, position: 1 }]),
      row("p2", "gemini", "2026-11-20", []),
    ];
    // Cifra de pe card = ultimul răspuns la fiecare întrebare (1 din 2), aceeași definiție ca pe Acasă.
    expect(perEngine(rows, [], ME)[0]).toMatchObject({ answers: 2, hits: 1, visibility: 50, delta: 50, lastDay: "2026-11-20" });
  });

  it("variația se calculează doar pe aceleași întrebări (B58): alte întrebări nu se compară", () => {
    // 20.11: întrebările vechi (doar numele produsului); 23.11: întrebări noi, cu „preț”. Nicio întrebare comună.
    const rows = [
      row("vechi1", "chatgpt", "2026-11-20", [{ domain: ME, position: 1 }]),
      row("vechi2", "chatgpt", "2026-11-20", [{ domain: ME, position: 1 }]),
      row("nou1", "chatgpt", "2026-11-23", []),
      row("nou2", "chatgpt", "2026-11-23", []),
      row("nou3", "chatgpt", "2026-11-23", [{ domain: ME, position: 2 }]),
    ];
    const e = perEngine(rows, [], ME)[0];
    expect(e).toMatchObject({ visibility: 60, delta: null, deltaBase: null, deltaUnavailable: true });
  });

  it("variația sare peste o zi fără întrebări comune și spune pe câte întrebări s-a calculat", () => {
    const rows = [
      row("p1", "claude", "2026-11-13", []),
      row("p2", "claude", "2026-11-13", []),
      row("x1", "claude", "2026-11-20", [{ domain: ME, position: 1 }]),
      row("p1", "claude", "2026-11-23", [{ domain: ME, position: 1 }]),
      row("p2", "claude", "2026-11-23", []),
      row("nou", "claude", "2026-11-23", []),
    ];
    expect(compareSameQuestions(rows, ME)).toEqual({ from: "2026-11-13", to: "2026-11-23", prompts: 2, fromVis: 0, toVis: 50, delta: 50 });
  });

  it("aceeași întrebare la AI-uri diferite nu e aceeași întrebare comună", () => {
    const rows = [
      row("p1", "claude", "2026-11-20", []), row("p2", "claude", "2026-11-20", []),
      row("p1", "chatgpt", "2026-11-23", []), row("p2", "chatgpt", "2026-11-23", []),
    ];
    expect(compareSameQuestions(rows, ME)).toBeNull();
    expect(compareSameQuestions(rows, ME, "first")).toBeNull();
  });

  it("AI căzut: apare cu motivul, după cele care au răspuns, și nu ca „nu te recomandă”", () => {
    const rows = [row("p1", "chatgpt", "2026-11-20", [])];
    const list = perEngine(rows, [{ provider: "claude", runDate: "2026-11-20", reason: "cheia API nu e validă" }], ME);
    expect(list.map((e) => e.provider)).toEqual(["chatgpt", "claude"]);
    expect(list[1]).toMatchObject({ answers: 0, failure: "cheia API nu e validă" });
    expect(engineVerdict(list, (p) => p).headline).toBe("chatgpt nu te recomandă încă.");
  });

  it("un eșec mai vechi decât ultimul răspuns bun nu se mai arată", () => {
    const rows = [row("p1", "chatgpt", "2026-11-20", [{ domain: ME, position: 1 }])];
    expect(perEngine(rows, [{ provider: "chatgpt", runDate: "2026-11-13", reason: "x" }], ME)[0].failure).toBeNull();
  });

  it("produsele numite și prețurile greșite vin din cifrele salvate, pe AI-ul lor", () => {
    const rows = [row("p1", "chatgpt", "2026-11-20", [{ domain: ME, position: 1 }])];
    const [e] = perEngine(rows, [], ME, [{ provider: "chatgpt", named: 7, wrongPrice: 2 }, { provider: "claude", named: 3, wrongPrice: 0 }]);
    expect(e).toMatchObject({ named: 7, wrongPrice: 2 });
  });

  it("tonul are nevoie de cel puțin 2 păreri", () => {
    const praise = { aspect: null, tone: 1 as const, quote: "livrare rapidă" };
    const one = perEngine([row("p1", "chatgpt", "2026-11-20", [{ domain: ME, position: 1, opinions: [praise] }])], [], ME)[0];
    expect(one.tone).toBeNull();
    const two = perEngine([row("p1", "chatgpt", "2026-11-20", [{ domain: ME, position: 1, opinions: [praise, praise] }])], [], ME)[0];
    expect(two.tone).toBe(100);
  });

  it("verdict: câte AI-uri te recomandă, unde stai cel mai bine și unde lipsești", () => {
    const rows = [
      row("p1", "chatgpt", "2026-11-20", [{ domain: ME, position: 1 }]),
      row("p1", "gemini", "2026-11-20", []),
    ];
    const v = engineVerdict(perEngine(rows, [], ME), (p) => p.toUpperCase());
    expect(v.headline).toBe("Te recomandă în 1 din 2 răspunsuri (50%), la ultima întrebare pusă fiecărui AI.");
    expect(v.best).toEqual({ name: "CHATGPT", visibility: 100 });
    expect(v.missing).toEqual(["GEMINI"]);
  });
});

describe("aceeași cifră peste tot (B61)", () => {
  it("recommendedNow numără doar ultimul răspuns al fiecărui AI la fiecare întrebare", () => {
    const rows = [
      row("p1", "chatgpt", "2026-11-13", []),
      row("p1", "chatgpt", "2026-11-20", [{ domain: ME, position: 1 }]),
      row("p2", "chatgpt", "2026-11-20", []),
      row("p1", "gemini", "2026-11-20", [{ domain: ME, position: 2 }]),
    ];
    expect(recommendedNow(rows, ME)).toEqual({ hits: 2, total: 3, pct: 67 });
    expect(latestAnswers(rows)).toHaveLength(3);
    const e = perEngine(rows, [], ME);
    expect(e.reduce((n, x) => n + x.hits, 0)).toBe(2);
    expect(e.reduce((n, x) => n + x.answers, 0)).toBe(3);
  });
  it("zero date", () => expect(recommendedNow([], ME)).toEqual({ hits: 0, total: 0, pct: 0 }));
});

describe("progressSince", () => {
  it("fără măsurători: nimic de comparat", () => {
    expect(progressSince([])).toMatchObject({ first: null, last: null, visibilityDelta: null, perProvider: [] });
  });

  it("o singură zi: fără variație", () => {
    expect(progressSince([{ day: "2026-11-20", provider: "all", visibility: 10, score: 30 }]).visibilityDelta).toBeNull();
  });

  it("prima față de ultima măsurătoare, total și pe AI", () => {
    const p = progressSince([
      { day: "2026-11-20", provider: "all", visibility: 30, score: 45 },
      { day: "2026-11-10", provider: "all", visibility: 10, score: 31 },
      { day: "2026-11-10", provider: "chatgpt", visibility: 0, score: 0 },
      { day: "2026-11-20", provider: "chatgpt", visibility: 40, score: 0 },
      { day: "2026-11-20", provider: "claude", visibility: 5, score: 0 },
    ]);
    expect(p).toMatchObject({ visibilityDelta: 20, scoreDelta: 14, measurements: 2 });
    expect(p.first?.day).toBe("2026-11-10");
    expect(p.perProvider).toEqual([{ provider: "chatgpt", from: 0, to: 40, fromDay: "2026-11-10", toDay: "2026-11-20" }]);
  });
});

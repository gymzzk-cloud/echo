import { describe, expect, it } from "vitest";
import { engineVerdict, perEngine, progressSince, type EngineRow } from "@/core/engine-view";

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
    expect(perEngine(rows, [], ME)[0]).toMatchObject({ visibility: 25, delta: 50, lastDay: "2026-11-20" });
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
    expect(v.headline).toBe("Te recomandă 1 din 2 AI-uri.");
    expect(v.best).toEqual({ name: "CHATGPT", visibility: 100 });
    expect(v.missing).toEqual(["GEMINI"]);
  });
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

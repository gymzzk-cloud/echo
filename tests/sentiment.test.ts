import { describe, expect, it } from "vitest";
import { clauseOpinions, fold, sampleQuotes, sentimentBoard, storeOpinions, type Opinion } from "@/core/ai/sentiment";
import { extractMentions } from "@/core/ai/extract";

const names = new Map([
  ["shopexpert.com", ["shopexpert.com", "shopexpert"]],
  ["dedeman.ro", ["dedeman.ro", "dedeman"]],
  ["emag.ro", ["emag.ro", "emag"]],
]);
const tones = (ops: Opinion[] | undefined) => (ops ?? []).map((o) => `${o.aspect ?? "general"}${o.tone > 0 ? "+" : "-"}`).sort();

describe("clauseOpinions", () => {
  it("găsește aspectul și tonul", () => {
    expect(clauseOpinions(fold("livrare rapidă în 24 de ore"))).toEqual([{ aspect: "livrare", tone: 1 }]);
    expect(clauseOpinions(fold("prețuri mai mari decât media"))).toEqual([{ aspect: "pret", tone: -1 }]);
    expect(clauseOpinions(fold("gamă foarte largă de scule"))).toEqual([{ aspect: "oferta", tone: 1 }]);
  });
  it("negația schimbă tonul", () => {
    expect(clauseOpinions(fold("nu este cel mai ieftin"))).toEqual([{ aspect: "pret", tone: -1 }]);
    expect(clauseOpinions(fold("livrare fără probleme"))).toEqual([{ aspect: "livrare", tone: 1 }]);
  });
  it("fără cuvinte de părere: nimic", () => {
    expect(clauseOpinions(fold("are bormaşini Bosch și Makita"))).toEqual([]);
    expect(clauseOpinions("")).toEqual([]);
  });
  it("nota din recenzii", () => {
    expect(clauseOpinions(fold("rating 4,7/5 pe Google"))).toContainEqual({ aspect: "incredere", tone: 1 });
    expect(clauseOpinions(fold("doar 2.1 stele"))).toContainEqual({ aspect: "incredere", tone: -1 });
  });
  it("maghiară", () => {
    expect(clauseOpinions(fold("gyors szállítás és olcsó árak"))).toEqual(expect.arrayContaining([{ aspect: "livrare", tone: 1 }, { aspect: "pret", tone: 1 }]));
    expect(clauseOpinions(fold("nem olcsó"))).toEqual([{ aspect: "pret", tone: -1 }]);
  });
});

describe("storeOpinions", () => {
  it("o listă tipică ChatGPT: sub-punctele sunt ale magazinului de deasupra", () => {
    const text = [
      "Iată unde găsești bormașina:",
      "",
      "1. **ShopExpert (shopexpert.com)**",
      "   - Preț: 459 lei, competitiv",
      "   - Livrare rapidă prin curier",
      "2. **eMAG**",
      "   - Gamă largă, dar livrarea poate avea întârzieri",
      "",
      "Concluzie: verifică stocul înainte.",
    ].join("\n");
    const ops = storeOpinions(text, names);
    expect(tones(ops.get("shopexpert.com"))).toEqual(["livrare+", "pret+"]);
    expect(tones(ops.get("emag.ro"))).toEqual(["livrare-", "oferta+"]);
    expect(ops.has("dedeman.ro")).toBe(false);
  });

  it("o comparație e a primului magazin numit", () => {
    const ops = storeOpinions("ShopExpert e mai ieftin decât Dedeman la această bormașină.", names);
    expect(tones(ops.get("shopexpert.com"))).toEqual(["pret+"]);
    expect(ops.has("dedeman.ro")).toBe(false);
  });

  it("fiecare parte a frazei merge la magazinul ei", () => {
    const ops = storeOpinions("La eMAG livrarea e rapidă, iar Dedeman are prețuri mari.", names);
    expect(tones(ops.get("emag.ro"))).toEqual(["livrare+"]);
    expect(tones(ops.get("dedeman.ro"))).toEqual(["pret-"]);
  });

  it("un paragraf fără nume nu se lipește de magazinul de dinainte", () => {
    const ops = storeOpinions("ShopExpert are bormașina în stoc.\nÎn general, prețurile sunt mari în această perioadă.", names);
    expect(tones(ops.get("shopexpert.com"))).toEqual(["oferta+"]);
  });

  it("„de” nu rupe fraza: „magazin de încredere”, „livrare în 24 de ore”", () => {
    const ops = storeOpinions("Dedeman e un magazin de încredere, cu livrare rapidă în 24 de ore.", names);
    expect(tones(ops.get("dedeman.ro"))).toEqual(["incredere+", "livrare+"]);
  });

  it("o frază despre alt vânzător, necunoscut, nu e a magazinului de deasupra (caz real, 23.11.2026)", () => {
    const text = "Recomand ShopExpert pentru scule Bosch, cu livrare rapidă. Alte produse, precum un set de chei fixe, sunt indisponibile momentan la CROMWELL Romania.";
    const ops = storeOpinions(text, names);
    expect(tones(ops.get("shopexpert.com"))).toEqual(["livrare+"]);
    // Și în sub-puncte: domeniul altui magazin oprește moștenirea.
    const list = storeOpinions("1. **ShopExpert**\n   - Livrare gratuită\n   - Pe cromwell.ro stocul e limitat", names);
    expect(tones(list.get("shopexpert.com"))).toEqual(["livrare+"]);
  });

  it("„plângeri legate de livrare” e o critică a livrării, nu a încrederii", () => {
    const ops = storeOpinions("ShopExpert are clienți mulțumiți, dar și plângeri serioase legate de livrare.", names);
    expect(tones(ops.get("shopexpert.com"))).toEqual(["livrare-"]);
  });

  it("fără magazine sau fără păreri: gol", () => {
    expect(storeOpinions("", names).size).toBe(0);
    expect(storeOpinions("ShopExpert vinde bormașini.", names).size).toBe(0);
  });

  it("păstrează fraza scurtă, fără Markdown", () => {
    const ops = storeOpinions("- **ShopExpert**: livrare gratuită peste 200 lei", names);
    expect(ops.get("shopexpert.com")![0]).toMatchObject({ aspect: "livrare", tone: 1, quote: "ShopExpert: livrare gratuită peste 200 lei" });
  });
});

describe("extractMentions cu păreri", () => {
  it("pune părerile pe mențiunea magazinului, fără să schimbe pozițiile", () => {
    const world = { stores: [{ domain: "shopexpert.com", name: "ShopExpert RO" }, { domain: "dedeman.ro", name: "Dedeman" }], products: [], ownDomains: ["shopexpert.com"] };
    const ms = extractMentions("1. **Dedeman** – prețuri mari, stoc limitat\n2. **ShopExpert** (shopexpert.com) – livrare rapidă, recenzii foarte bune", [], world, "bormasina", "RO");
    expect(ms.map((m) => [m.domain, m.position])).toEqual([["dedeman.ro", 1], ["shopexpert.com", 2]]);
    expect(tones(ms[0].opinions)).toEqual(["oferta-", "pret-"]);
    expect(tones(ms[1].opinions)).toEqual(["incredere+", "livrare+"]);
  });
  it("fără păreri: mențiunea nu primește câmpul (rulările vechi rămân la fel)", () => {
    const ms = extractMentions("Găsești la Dedeman.", [], { stores: [{ domain: "dedeman.ro", name: "Dedeman" }], products: [] }, "x", "RO");
    expect(ms[0]).not.toHaveProperty("opinions");
  });
});

describe("sentimentBoard", () => {
  const op = (aspect: Opinion["aspect"], tone: 1 | -1): Opinion => ({ aspect, tone, quote: "x" });
  const row = (mentions: { domain: string; opinions?: Opinion[] }[], provider = "chatgpt", runDate = "2026-11-20") => ({ run: { mentions, provider, runDate } });

  it("fără date: scoruri goale", () => {
    const [s] = sentimentBoard([], ["shopexpert.com"]);
    expect(s).toMatchObject({ answers: 0, withOpinion: 0, overall: { score: null, positive: 0, negative: 0 } });
    expect(s.aspects.pret.score).toBeNull();
  });

  it("calculează -100…+100, general și pe aspecte", () => {
    const rows = [
      row([{ domain: "shopexpert.com", opinions: [op("livrare", 1), op("pret", 1)] }]),
      row([{ domain: "shopexpert.com", opinions: [op("pret", -1), op(null, 1)] }, { domain: "dedeman.ro" }]),
      row([{ domain: "dedeman.ro", opinions: [op("pret", -1)] }]),
    ];
    const [me, dd] = sentimentBoard(rows, ["shopexpert.com", "dedeman.ro"]);
    expect(me.overall).toEqual({ positive: 3, negative: 1, score: 50 });
    expect(me.aspects.pret).toEqual({ positive: 1, negative: 1, score: 0 });
    expect(me.aspects.livrare.score).toBeNull(); // o singură părere: prea puțin
    expect(me).toMatchObject({ answers: 2, withOpinion: 2 });
    expect(dd).toMatchObject({ answers: 2, withOpinion: 1 });
    expect(dd.overall.score).toBeNull();
  });

  it("o mențiune dublată în același răspuns se socotește o dată", () => {
    const [s] = sentimentBoard([row([{ domain: "a.ro", opinions: [op("pret", 1)] }, { domain: "a.ro", opinions: [op("pret", 1)] }])], ["a.ro"]);
    expect(s.overall.positive).toBe(1);
  });

  it("frazele de exemplu: cele mai noi, cu sursa lor, fără dubluri", () => {
    const rows = [
      { prompt: "bormasina bosch", run: { id: "r1", mentions: [{ domain: "a.ro", opinions: [{ aspect: "pret", tone: 1, quote: "nou" }] }], provider: "claude", runDate: "2026-11-01", answer: "A1", sources: [{ url: "https://a.ro/x" }] } },
      { prompt: "flex makita", run: { id: "r2", mentions: [{ domain: "a.ro", opinions: [{ aspect: "pret", tone: 1, quote: "nou" }, { aspect: "livrare", tone: -1, quote: "lent" }] }], provider: "chatgpt", runDate: "2026-11-20", answer: "A2", sources: [] } },
    ];
    const q = sampleQuotes(rows, "a.ro");
    expect(q.positive).toHaveLength(1);
    expect(q.positive[0]).toMatchObject({ quote: "nou", total: 2, runId: "r2", prompt: "flex makita", provider: "chatgpt", answer: "A2" });
    expect(q.negative[0]).toMatchObject({ aspect: "livrare", quote: "lent", total: 1, runDate: "2026-11-20" });
    expect(sampleQuotes([], "a.ro")).toEqual({ positive: [], negative: [] });
  });

  it("aceeași frază pe două aspecte apare o dată, cu ambele", () => {
    const rows = [{ prompt: "x", run: { id: "r1", mentions: [{ domain: "a.ro", opinions: [{ aspect: "livrare", tone: 1, quote: "livrare bună, prețuri competitive" }, { aspect: "pret", tone: 1, quote: "livrare bună, prețuri competitive" }] }], provider: "claude", runDate: "2026-11-20", answer: "", sources: [] } }];
    const q = sampleQuotes(rows, "a.ro");
    expect(q.positive).toHaveLength(1);
    expect(q.positive[0]).toMatchObject({ aspects: ["livrare", "pret"], total: 1 });
  });
});

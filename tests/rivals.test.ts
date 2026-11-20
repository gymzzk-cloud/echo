import { describe, expect, it } from "vitest";
import { isStoreLike, pickAutoRivals, rankRivals, type RivalRow } from "@/core/rivals";
import { brandLabel, cleanAnswer, extractMentions, runMentions, sourceLabel } from "@/core/ai/extract";
import { failureReason } from "@/core/ai/errors";

const row = (promptId: string, provider: string, mentions: { domain: string; position: number; name?: string }[]): RivalRow =>
  ({ promptId, run: { provider, runDate: "2026-11-20", mentions } });

describe("rankRivals", () => {
  it("fără date: listă goală și cotă zero", () => {
    const r = rankRivals([], "shopexpert.com");
    expect(r.rivals).toEqual([]);
    expect(r.me).toEqual({ appearances: 0, prompts: 0, avgPosition: null, share: 0 });
    expect(r.answers).toBe(0);
  });

  it("numără „în locul tău” și „înaintea ta”, nu și când ești tu primul", () => {
    const rows = [
      row("p1", "chatgpt", [{ domain: "dedeman.ro", position: 1 }]),                                   // în locul tău
      row("p1", "claude", [{ domain: "dedeman.ro", position: 1 }, { domain: "shopexpert.com", position: 2 }]), // înaintea ta
      row("p2", "chatgpt", [{ domain: "shopexpert.com", position: 1 }, { domain: "dedeman.ro", position: 2 }]), // după tine
    ];
    const r = rankRivals(rows, "shopexpert.com");
    expect(r.rivals).toHaveLength(1);
    expect(r.rivals[0]).toMatchObject({ domain: "dedeman.ro", appearances: 3, instead: 1, ahead: 1, beats: 2, prompts: 2, avgPosition: 1.3 });
    // 2 mențiuni ale tale + 3 ale lui = 5
    expect(r.me.share).toBe(40);
    expect(r.rivals[0].share).toBe(60);
  });

  it("un singur concurent, AI căzut (răspuns gol) nu strică procentele", () => {
    const rows = [row("p1", "chatgpt", [{ domain: "sculemarket.ro", position: 1 }]), row("p1", "claude", [])];
    const r = rankRivals(rows, "shopexpert.com");
    expect(r.answers).toBe(2);
    expect(r.rivals[0]).toMatchObject({ domain: "sculemarket.ro", beats: 1, share: 100, name: "Sculemarket" });
  });

  it("ignoră comparatoarele, presa și forumurile; marchează marketplace-urile", () => {
    const rows = [row("p1", "chatgpt", [
      { domain: "compari.ro", position: 1 }, { domain: "reddit.com", position: 2 }, { domain: "emag.ro", position: 3 }, { domain: "forum.softpedia.com", position: 4 },
    ])];
    const r = rankRivals(rows, "shopexpert.com");
    expect(r.rivals.map((x) => x.domain)).toEqual(["emag.ro"]);
    expect(r.rivals[0].marketplace).toBe(true);
  });

  it("ordonează după de câte ori te întrece", () => {
    const rows = [
      row("p1", "chatgpt", [{ domain: "a-shop.ro", position: 1 }, { domain: "b-shop.ro", position: 2 }]),
      row("p2", "chatgpt", [{ domain: "b-shop.ro", position: 1 }]),
      row("p3", "chatgpt", [{ domain: "b-shop.ro", position: 1 }]),
    ];
    expect(rankRivals(rows, "me.ro").rivals.map((x) => x.domain)).toEqual(["b-shop.ro", "a-shop.ro"]);
  });
});

describe("pickAutoRivals", () => {
  const rivals = rankRivals([
    row("p1", "chatgpt", [{ domain: "a.ro", position: 1 }, { domain: "b.ro", position: 2 }, { domain: "c.ro", position: 3 }]),
    row("p2", "chatgpt", [{ domain: "a.ro", position: 1 }, { domain: "b.ro", position: 2 }]),
  ], "me.ro").rivals;

  it("adaugă doar pe cei care te întrec de cel puțin 2 ori", () => {
    expect(pickAutoRivals(rivals, { tracked: [], dismissed: [], autoCount: 0 }).map((r) => r.domain)).toEqual(["a.ro", "b.ro"]);
  });
  it("sare peste cei urmăriți sau scoși de client", () => {
    expect(pickAutoRivals(rivals, { tracked: ["a.ro"], dismissed: ["b.ro"], autoCount: 0 })).toEqual([]);
  });
  it("respectă plafonul de concurenți adăugați automat", () => {
    expect(pickAutoRivals(rivals, { tracked: [], dismissed: [], autoCount: 7, maxAuto: 8 }).map((r) => r.domain)).toEqual(["a.ro"]);
    expect(pickAutoRivals(rivals, { tracked: [], dismissed: [], autoCount: 8, maxAuto: 8 })).toEqual([]);
  });
});

describe("isStoreLike", () => {
  it("magazine da, restul nu", () => {
    expect(isStoreLike("dedeman.ro")).toBe(true);
    expect(isStoreLike("emag.ro")).toBe(true);
    expect(isStoreLike("arukereso.hu")).toBe(false);
    expect(isStoreLike("ro.wikipedia.org")).toBe(false);
    expect(isStoreLike("www.digi24.ro")).toBe(false);
    expect(isStoreLike("anaf.gov.ro")).toBe(false);
  });
});

describe("extractMentions: magazine citate și numite în text", () => {
  const world = { stores: [], products: [] };
  it("recunoaște un magazin necunoscut citat ca sursă și numit în răspuns", () => {
    const ms = extractMentions("Îl găsești la Sculemarket, cu livrare rapidă.", [{ url: "https://www.sculemarket.ro/p/123" }], world, "Bosch GSB 18V-55");
    expect(ms).toEqual([expect.objectContaining({ domain: "sculemarket.ro", name: "Sculemarket", position: 1 })]);
  });
  it("nu confundă marca din căutare cu un magazin (bosch.ro)", () => {
    const ms = extractMentions("Bosch GSB 18V-55 e o alegere bună.", [{ url: "https://www.bosch.ro/x" }], world, "Bosch GSB 18V-55");
    expect(ms).toEqual([]);
  });
  it("nu potrivește cuvinte obișnuite scrise cu literă mică", () => {
    const ms = extractMentions("Cele mai bune scule electrice sunt aici.", [{ url: "https://scule.ro/x" }], world, "polizor");
    expect(ms).toEqual([]);
  });
  it("sourceLabel", () => {
    expect(sourceLabel("leroy-merlin.ro")).toBe("leroy merlin");
    expect(sourceLabel("shop.ro")).toBeNull();
    expect(sourceLabel("abc.ro")).toBeNull();
  });
});

describe("runMentions", () => {
  it("o rulare cu eroare nu are mențiuni (linkul din eroare nu e magazin)", () => {
    const answer = '(Eroare chatgpt: Error: HTTP 401: { "message": "Incorrect API key provided. You can find your API key at https://platform.openai.com/account/api-keys." })';
    expect(runMentions({ answer, sources: [], model: "eroare" }, { stores: [], products: [] })).toEqual([]);
    expect(extractMentions(answer, [], { stores: [], products: [] }).map((m) => m.domain)).toContain("platform.openai.com");
  });
});

describe("același magazin pe alt domeniu", () => {
  const world = { stores: [{ domain: "shopexpert.com", name: "ShopExpert RO" }, { domain: "scule.ro", name: "Scule RO Shop" }], products: [] };
  it("shopexpert.ro și shop-expert.ro în text contează ca shopexpert.com", () => {
    const ms = extractMentions("Recenzii pentru shopexpert.ro / shop-expert.ro, apoi firmadeaur.ro.", [], world);
    expect(ms.map((m) => m.domain)).toEqual(["shopexpert.com", "firmadeaur.ro"]);
  });
  it("numele de marcă scris în text („ShopExpert”) e recunoscut", () => {
    const ms = extractMentions("Clienții ShopExpert spun că livrarea e rapidă.", [], world);
    expect(ms[0]?.domain).toBe("shopexpert.com");
  });
  it("marca din domeniu nu se potrivește pe un cuvânt obișnuit (scule electrice)", () => {
    const ms = extractMentions("Cele mai bune scule electrice pentru acasă.", [], world);
    expect(ms.some((m) => m.domain === "scule.ro")).toBe(false);
  });
  it("sursa citată pe alt domeniu al magazinului e același magazin", () => {
    const ms = extractMentions("Iată câteva opțiuni.", [{ url: "https://www.shopexpert.ro/x" }], world);
    expect(ms.map((m) => m.domain)).toEqual(["shopexpert.com"]);
  });
  it("rankRivals nu socotește propria marcă drept concurent", () => {
    const rows = [{ promptId: "p", run: { provider: "chatgpt", runDate: "2026-11-20", mentions: [{ domain: "shopexpert.ro", position: 1 }, { domain: "dedeman.ro", position: 2 }] } }];
    expect(rankRivals(rows, "shopexpert.com").rivals.map((r) => r.domain)).toEqual(["dedeman.ro"]);
  });
  it("brandLabel", () => {
    expect(brandLabel("shopexpert.com")).toBe("shopexpert");
    expect(brandLabel("www.shop-expert.ro")).toBe("shopexpert");
    expect(brandLabel("magazin.com.ro")).toBe("magazin");
  });
});

describe("marcajele de citare ChatGPT", () => {
  it("sunt scoase din text", () => {
    expect(cleanAnswer("Livrare rapidă. citeturn828342search6turn828342search1\nRetur 14 zile")).toBe("Livrare rapidă.\nRetur 14 zile");
  });
});

describe("motivul unei rulări eșuate", () => {
  it.each([
    ["(Eroare claude: BadRequestError: 400 {\"message\":\"tools.0.web_search_20250305: Country code RO is not supported.\"})", "AI-ul a respins setările cererii (o reparăm noi)"],
    ["(Eroare chatgpt: Error: HTTP 401: Incorrect API key provided)", "cheia API nu e validă"],
    ["(Eroare claude: 429 rate_limit_error)", "limita de cereri a contului AI e depășită"],
    ["(Eroare claude: Your credit balance is too low)", "contul AI nu mai are credit"],
    ["(Eroare gemini: TimeoutError: The operation was aborted due to timeout)", "AI-ul nu a răspuns la timp"],
  ])("%s", (a, want) => expect(failureReason(a)).toBe(want));
});

describe("domeniul propriu are întâietate", () => {
  it("chiar dacă alt domeniu al mărcii a ajuns la concurenți", () => {
    const world = { stores: [{ domain: "shopexpert.com", name: "ShopExpert RO" }, { domain: "shopexpert.ro", name: "Shopexpert" }], products: [], ownDomains: ["shopexpert.com"] };
    expect(extractMentions("Vezi shopexpert.ro.", [], world).map((m) => m.domain)).toEqual(["shopexpert.com"]);
  });
});

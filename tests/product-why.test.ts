import { describe, expect, it } from "vitest";
import { asksClarification, competitorView, type SheetRun } from "@/core/product-sheet/answers";
import { comparatorSearch, quotedPrices, whyNotRecommended, type WhyInput } from "@/core/product-sheet/why";
import type { ProductExample } from "@/core/product-visibility";

// Cazul real din 23.11.2026: MAKITA GA5030R, 269 lei la ShopExpert RO; Claude și Gemini îl numesc fără magazin, ChatGPT deloc.
const run = (id: string, provider: string, mentions: SheetRun["mentions"], sources: { url: string; title?: string }[] = []): SheetRun => ({
  id, provider, runDate: "2026-11-23", at: "2026-11-23T14:48:00Z", query: "polizoare unghiulare mici cel mai bun preț", answer: "…", mentions, sources,
});
const runs = [
  run("claude1", "claude", [{ domain: "bricodepot.ro", position: 1 }, { domain: "infinity.ro", position: 2 }], [
    { url: "https://polizor-unghiular.compari.ro/", title: "Ieftin Polizor unghiular Preturi" },
    { url: "https://www.bravonet.ro/top-10-polizor", title: "Top 10 modele de polizor unghiular pentru tine în 2026 - BRAVOnet" },
    { url: "https://www.tehnicbazar.ro/polizoare", title: "Polizoare unghiulare mici - TehnicBazar" },
  ]),
  run("gemini1", "gemini", [{ domain: "lidl.ro", position: 1 }, { domain: "emag.ro", position: 2 }, { domain: "dedeman.ro", position: 3 }]),
  run("gpt1", "chatgpt", [{ domain: "dedeman.ro", position: 1 }], [{ url: "https://www.dedeman.ro/ro/polizoare", title: "Dedeman" }]),
];
const ex = (runId: string, provider: string, snippet: string): ProductExample => ({ runId, provider, runDate: "2026-11-23", query: "q", position: 1, statedPrice: null, snippet, withStore: false });
const examples = [
  ex("claude2", "claude", "Makita GA5030R (720 W, disc de 125 mm), care apare la 276,00 RON + 20,00 RON costul livrării. Alte oferte: 308,05 RON în stoc"),
  ex("claude1", "claude", "Makita GA5030R: La 333.99 lei, modelul oferă un motor de 720 W."),
  ex("gemini1", "gemini", "Makita (Seria MT sau clasicul Makita M9001 sau GA5030R):"),
];
const view = competitorView(runs, { ownDomain: "shopexpert.com", ownDomains: ["shopexpert.com", "hardlineconstruct.ro"], productUrl: "https://www.shopexpert.com/ro/makita/ga5030r", namedRunIds: new Set(["claude1", "gemini1"]) });
const base: WhyInput = {
  product: { price: 269, currency: "RON", mpn: "GA5030R", gtin: "088381808552", inStock: true },
  ownDomain: "shopexpert.com", country: "RO", tracked: false, openaiActive: true, pageRating: null, view, examples,
  providerLabel: (id) => ({ chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini" })[id] ?? id,
};

describe("de ce nu ești recomandat", () => {
  it("prețurile spuse de AI pentru produs, fără livrare și fără prețurile altor produse", () => {
    expect(quotedPrices(examples, 269).map((q) => q.price)).toEqual([276, 308.05, 333.99]);
    expect(quotedPrices([{ ...examples[0], withStore: true }], 269)).toEqual([]);
  });

  it("cazul GA5030R: preț mai mic dar necunoscut, comparator, pagini citite, ChatGPT tăcut, fără recenzii, neurmărit", () => {
    const items = whyNotRecommended(base);
    const keys = items.map((i) => i.key);
    expect(keys).toEqual(["price", "comparator:compari.ro", "sources", "authority", "silent:chatgpt", "reviews", "track"]);
    const price = items[0];
    expect(price.title).toContain("mai mic");
    expect(price.evidence).toContain("276 lei (Claude)");
    expect(price.links[0].href).toBe("#dovada-claude2");
    expect(items[1].links[0].href).toBe("https://www.compari.ro/CategorySearch.php?st=GA5030R");
    expect(items[2].evidence).toContain("bravonet.ro");
    expect(items[1].title).toBe("AI-ul a citit comparatorul compari.ro");
    expect(items[2].evidence).not.toContain("compari");
    expect(items[3].title).toContain("Gemini");
    expect(items[4].evidence).toContain("„polizoare unghiulare mici cel mai bun preț”");
    expect(items[4].evidence).toContain("aplicația ChatGPT poate arăta altceva");
  });

  it("fără răspunsuri sau când AI-ul te numește peste tot: nimic inventat", () => {
    expect(whyNotRecommended({ ...base, view: competitorView([], { ownDomain: "shopexpert.com", ownDomains: [], productUrl: "", namedRunIds: new Set() }) })).toEqual([]);
    const withMe = competitorView([run("x", "claude", [{ domain: "shopexpert.com", position: 1 }])], { ownDomain: "shopexpert.com", ownDomains: [], productUrl: "", namedRunIds: new Set(["x"]) });
    expect(whyNotRecommended({ ...base, view: withMe })).toEqual([]);
  });

  it("pagina necitită: nu spunem că lipsesc recenziile; produs urmărit: nu cerem urmărirea", () => {
    const keys = whyNotRecommended({ ...base, pageRating: undefined, tracked: true }).map((i) => i.key);
    expect(keys).not.toContain("reviews");
    expect(keys).not.toContain("track");
  });

  it("prețul altora mai mic: spunem asta, nu că ești mai ieftin", () => {
    const items = whyNotRecommended({ ...base, product: { ...base.product, price: 300 } });
    expect(items[0].title).toContain("prețuri mai mici");
    expect(items[0].evidence).toContain("276 lei");
  });

  it("întrebare directă: ChatGPT doar cere clarificare — „a cerut clarificare”, nu „nu te numește”", () => {
    const direct = run("gpt2", "chatgpt", []);
    direct.query = "Makita GA5030R Polizor unghiular 720 W";
    direct.answer = "Vrei specificații sau prețuri? Model: Makita GA5030R, 720 W.";
    const v = competitorView([direct], { ownDomain: "shopexpert.com", ownDomains: [], productUrl: "", namedRunIds: new Set() });
    expect(v.clarified).toBe(1);
    expect(v.runs[0].clarified).toBe(true);
    const items = whyNotRecommended({ ...base, view: v, examples: [] });
    const keys = items.map((i) => i.key);
    expect(keys).toContain("clarify:chatgpt");
    expect(keys).not.toContain("noshop:chatgpt");
    expect(keys).not.toContain("silent:chatgpt");
    expect(items.find((i) => i.key === "clarify:chatgpt")!.links[0].href).toBe("#raspuns-gpt2");
  });

  it("descriere lungă fără magazine și fără întrebare: „a descris produsul”, nu clarificare", () => {
    const direct = run("gpt3", "chatgpt", []);
    direct.answer = `Makita GA5030R este un polizor unghiular de 720 W, disc de 125 mm. ${"Specificații detaliate. ".repeat(40)}`;
    const v = competitorView([direct], { ownDomain: "shopexpert.com", ownDomains: [], productUrl: "", namedRunIds: new Set() });
    expect(v.clarified).toBe(0);
    const keys = whyNotRecommended({ ...base, view: v, examples: [] }).map((i) => i.key);
    expect(keys).toContain("noshop:chatgpt");
  });

  it("clarificare: întrebarea scurtă sau ultimul rând cu „?”; răspunsul lung cu întrebare la final nu e clarificare", () => {
    expect(asksClarification("Vrei specificații sau prețuri?")).toBe(true);
    expect(asksClarification("Pot să te ajut.\n\nCe buget ai? **")).toBe(true);
    expect(asksClarification("Makita GA5030R are 720 W.")).toBe(false);
    expect(asksClarification(`${"Text lung. ".repeat(200)}\nVrei și alte modele?`)).toBe(false);
    // Răspunsul real ChatGPT (API) din 23.11.2026, 20:48, la „Makita GA5030R Polizor unghiular 720 W”: întreabă întâi, apoi un rezumat.
    const gpt = "Vrei informații despre acest model (specificații tehnice), prețuri și unde îl găsești în România, manual de utilizare, accesorii compatibile sau o comparație cu alte polizoare? Spune-mi ce anume te interesează și îți pregătesc detaliile.\n\nPentru a începe, iată un rezumat scurt (dacă vrei, îl confirm cu surse):\n- Model: Makita GA5030R\n- Putere: 720 W\n- Disc: 125 mm\n- Turație: 11.000 rpm\n- Greutate: aprox. 1,8 kg\n- Destinație: compact, ușor de manevrat (model pentru uz casnic/ocazional)\n- Caracteristici comune: protecţie contra pornirii accidentale, carcasă compactă, posibil mâner lateral pe două poziții.\n\nDacă vrei să caut oferte curente, manual în română, fișa tehnică completă sau recenzii, îmi spui și caut imediat.";
    expect(gpt.length).toBeGreaterThan(600);
    expect(asksClarification(gpt)).toBe(true);
    // O descriere de 1200 de caractere care doar se încheie politicos nu e clarificare.
    expect(asksClarification(`Polizorul are 720 W.\n\n${"Specificații. ".repeat(80)}\n\nDacă doriți, pot căuta alternative.`)).toBe(false);
  });

  it("un răspuns care numește alt magazin nu e clarificare, chiar dacă se termină cu o întrebare", () => {
    const r = run("c9", "claude", [{ domain: "dedeman.ro", position: 1 }]);
    r.answer = "Găsești la Dedeman. Vrei și alte oferte?";
    expect(competitorView([r], { ownDomain: "shopexpert.com", ownDomains: [], productUrl: "", namedRunIds: new Set() }).clarified).toBe(0);
  });

  it("căutarea pe comparator, pe piața magazinului", () => {
    expect(comparatorSearch("polizor-unghiular.compari.ro", "GA5030R")).toBe("https://www.compari.ro/CategorySearch.php?st=GA5030R");
    expect(comparatorSearch("arukereso.hu", "GA5030R")).toBe("https://www.arukereso.hu/CategorySearch.php?st=GA5030R");
    expect(comparatorSearch("pricy.ro", "GA5030R")).toContain("site%3Apricy.ro");
  });
});

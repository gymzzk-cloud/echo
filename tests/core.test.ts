import { describe, expect, it } from "vitest";
import { categoryType, productQuery, productType, promptLimit, suggestPrompts, type CatalogProduct } from "@/core/prompts";
import { planBuyerUpgrade, planPromptChanges } from "@/core/tracked-prompts";
import { parseFeed } from "@/core/connectors";
import { parseRobots, robotsAllows } from "@/core/audit";
import { parseStoreUrl } from "@/lib/util";
import { parseQuery } from "@/core/search";

describe("productType", () => {
  it("extrage tipul din titluri românești", () => {
    expect(productType("Fier de călcat cu abur 2800W", "ro")).toBe("fier de călcat");
    expect(productType("Aspirator vertical fără fir 25.2V", "ro")).toBe("aspirator vertical");
    expect(productType("Polistiren expandat EPS 80 10 cm", "ro")).toBe("polistiren expandat");
  });
  it("extrage tipul din titluri maghiare", () => {
    expect(productType("Automata kávéfőző", "hu")).toBe("automata kávéfőző");
    expect(productType("Elektromos fűnyíró 1600W", "hu")).toBe("elektromos fűnyíró");
  });
});

const se = (id: string, title: string, brand: string, cat: string, extra: Partial<CatalogProduct> = {}): CatalogProduct =>
  ({ id, externalId: id, title, brand, category: `${cat} > ${brand}`, price: "100", gtin: null, mpn: null, ...extra });

describe("căutări urmărite din catalog", () => {
  it("tipul de produs vine din categorii, fără marcă", () => {
    expect(categoryType({ title: "BOSCH GDS 18V-320", brand: "BOSCH", category: "Scule cu Acumulator > Șurubelnițe cu impact > BOSCH" }, "ro")).toBe("șurubelnițe cu impact");
    expect(categoryType({ title: "Fier de călcat cu abur 2800W", brand: null, category: null }, "ro")).toBe("fier de călcat");
  });
  it("numele produsului e scurt și are marca", () => {
    expect(productQuery({ title: "GDS 18V-320", brand: "BOSCH" })).toBe("BOSCH GDS 18V-320");
    expect(productQuery({ title: "CROMWELL Aparat de curatat cablul 0.2-16 mm WIRE STRIPPER NO. 5 PRO", brand: "CROMWELL" }).split(" ").length).toBeLessThanOrEqual(8);
  });
  it("propune doar întrebări punctuale pe produse din catalog, plus magazinul (KNOWLEDGE A16)", () => {
    const cat = [
      se("1", "BOSCH GDS 18V-320", "BOSCH", "Scule > Șurubelnițe cu impact", { mpn: "06019L5300", gtin: "4053423841923" }),
      se("2", "MAKITA DTD153Z", "MAKITA", "Scule > Șurubelnițe cu impact", { gtin: "0088381623456" }),
      se("3", "DREAME H12 Pro", "DREAME", "Casă > Aspiratoare verticale", { mpn: "HHV3", gtin: "6970000000001" }),
      se("4", "DREAME H14", "DREAME", "Casă > Aspiratoare verticale", { mpn: "HHV4" }),
    ];
    const ps = suggestPrompts(cat, "ShopExpert RO", "ro", 30);
    const texts = ps.map((p) => p.text);
    // Fără întrebări generale pe tip de produs („șurubelnițe cu impact cel mai bun preț”).
    expect(texts.some((t) => /^(șurubelnițe|aspiratoare)/i.test(t))).toBe(false);
    expect(ps.filter((p) => ["comercial", "cumparare", "informativ"].includes(p.intent))).toHaveLength(0);
    expect(texts.some((t) => t.includes("Bosch GDS 18V-320"))).toBe(true);
    expect(texts.some((t) => t.includes("BOSCH"))).toBe(false);
    expect(ps.filter((p) => p.productId)).toHaveLength(4);
    expect(texts).toContain("ShopExpert păreri clienți");
  });
  it("respectă limita, toate pe produse, acoperă mai multe categorii și nu se repetă", () => {
    const big: CatalogProduct[] = [];
    for (let i = 0; i < 3000; i++) big.push(se(String(i), `BRAND${i % 7} Model ${i % 1500}`, `BRAND${i % 7}`, `Domeniu ${i % 4} > Tip ${i % 12}`, { gtin: String(5900000000000 + i) }));
    const ps = suggestPrompts(big, "Magazin", "ro", 30);
    expect(ps).toHaveLength(30);
    expect(new Set(ps.map((p) => p.text.toLowerCase())).size).toBe(30);
    expect(ps.filter((p) => p.productId).length).toBe(28);
    expect(new Set(ps.filter((p) => p.productId).map((p) => p.category)).size).toBeGreaterThanOrEqual(6);
    // Determinist: aceeași listă la fiecare sincronizare, deci istoricul se păstrează.
    expect(suggestPrompts([...big].reverse(), "Magazin", "ro", 30).map((p) => p.text).sort()).toEqual(ps.map((p) => p.text).sort());
  });
  it("fără catalog real: doar căutările despre magazin", () => {
    expect(suggestPrompts([], "ShopExpert HU", "hu").map((p) => p.text)).toEqual(["ShopExpert vélemények", "ShopExpert szállítás és visszaküldés"]);
  });
  it("limita pe plan", () => {
    expect(promptLimit("trial")).toBe(30);
    expect(promptLimit("pro")).toBe(100);
  });
  it("reconcilierea: șterge propunerile vechi, păstrează manualele și ce rămâne", () => {
    const existing = [
      { id: "a", text: "Care este cel mai bun aspirator?", active: true, suggested: true },
      { id: "b", text: "BOSCH GDS 18V-320", active: false, suggested: true },
      { id: "c", text: "căutarea mea", active: true, suggested: false },
    ];
    const desired = [
      { text: "BOSCH GDS 18V-320", category: "x", intent: "produs" as const },
      { text: "06019L5300", category: "x", intent: "cod" as const },
      { text: "căutarea mea", category: "x", intent: "produs" as const },
      { text: "în plus", category: "x", intent: "produs" as const },
    ];
    const r = planPromptChanges(existing, desired, 3);
    expect(r.remove).toEqual(["a"]);
    expect(r.add.map((x) => x.text)).toEqual(["06019L5300"]);
    expect(planPromptChanges([...existing.slice(1)], desired, 3)).toEqual(r.remove.length ? { remove: [], add: r.add, revive: [] } : r);
  });
  it("o propunere retrasă (cu răspunsuri păstrate) nu se scoate din nou și se repornește când revine în listă, fără dublură", () => {
    const retired = new Date("2026-11-20T10:00:00Z");
    const existing = [
      { id: "r", text: "Polizoare unghiulare mici Makita cel mai bun preț", active: false, suggested: true, retiredAt: retired },
      { id: "o", text: "veche", active: false, suggested: true, retiredAt: retired },
    ];
    const back = [{ text: "polizoare unghiulare mici makita cel mai bun preț", category: "x", intent: "categorie" as const }];
    expect(planPromptChanges(existing, back, 5)).toEqual({ remove: [], add: [], revive: ["r"] });
    expect(planPromptChanges(existing, [], 5)).toEqual({ remove: [], add: [], revive: [] });
  });
  it("căutările pe produs alese de magazin, scrise doar cu numele, primesc „preț”; celelalte rămân (B53)", () => {
    const product = { title: "MAKITA GA5030R Polizor unghiular", brand: "MAKITA" };
    const manual = [
      { id: "plain", text: "Makita GA5030R Polizor unghiular", active: true, product },
      { id: "own", text: "polizor makita ieftin", active: true, product },
      { id: "off", text: "Makita GA5030R Polizor unghiular", active: false, product },
      { id: "nop", text: "ceva", active: true, product: null },
    ];
    const up = planBuyerUpgrade(manual, "ro");
    expect(up).toEqual([{ id: "plain", text: "Makita GA5030R Polizor unghiular preț" }]);
    expect(planBuyerUpgrade([{ ...manual[0], text: up[0].text }], "ro")).toEqual([]); // idempotentă
    expect(planBuyerUpgrade([manual[0]], "hu")[0].text).toBe("Makita GA5030R Polizor unghiular ár");
  });
});

describe("parseFeed", () => {
  it("citește CSV cu ; și XML Google", () => {
    const csv = parseFeed("id;title;link;price;availability\n1;Ciment 40 kg;https://a.ro/c;34 RON;out of stock");
    expect(csv[0]).toMatchObject({ externalId: "1", price: 34, inStock: false });
    const xml = parseFeed(`<rss xmlns:g="http://base.google.com/ns/1.0"><channel><item><g:id>7</g:id><title>Vopsea</title><link>https://a.ro/v</link><g:price>179.00 RON</g:price></item></channel></rss>`);
    expect(xml[0]).toMatchObject({ externalId: "7", title: "Vopsea", price: 179 });
  });
});

describe("robots.txt", () => {
  it("respectă regula cea mai specifică", () => {
    const r = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: OAI-SearchBot\nAllow: /");
    expect(robotsAllows(r, "OAI-SearchBot", "/produs")).toBe(true);
    expect(robotsAllows(r, "GPTBot", "/produs")).toBe(false);
  });
});

describe("parseStoreUrl / parseQuery", () => {
  it("păstrează subfolderul de țară", () => {
    expect(parseStoreUrl("shopexpert.com/hu")).toMatchObject({ domain: "shopexpert.com", pathPrefix: "/hu" });
  });
  it("înțelege bugetul", () => {
    expect(parseQuery("bormasina sub 400 lei").budgetMax).toBe(400);
  });
});

describe("parseFeed: YAML, JSON, stoc", () => {
  it("citește YAML cu chei românești", () => {
    const y = `produse:\n  - cod: A1\n    nume: Ciment 40 kg\n    link: https://a.ro/c\n    pret: "34,50 lei"\n    stoc: 12\n  - cod: A2\n    nume: Vopsea\n    link: https://a.ro/v\n    pret: 179\n    stoc: 0\n`;
    const r = parseFeed(y);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ externalId: "A1", price: 34.5, inStock: true });
    expect(r[1].inStock).toBe(false);
  });
  it("citește JSON cu listă imbricată", () => {
    const j = JSON.stringify({ data: { items: [{ sku: "X", name: "Flex", url: "https://a.ro/f", price: "219.00 RON", availability: "in stock" }] } });
    expect(parseFeed(j)[0]).toMatchObject({ externalId: "X", title: "Flex", price: 219 });
  });
  it("stocul 10 nu înseamnă epuizat", () => {
    expect(parseFeed("id,title,link,price,stock\n1,A,https://a.ro/a,5,10")[0].inStock).toBe(true);
  });
});

import { refineQuery } from "@/core/refine";
import { watchAlert } from "@/core/watches";

describe("asistentul din căutare", () => {
  it("schimbă bugetul", () => {
    expect(refineQuery("bormașină cu percuție sub 400 lei", "sub 300 lei")).toBe("bormașină cu percuție sub 300 lei");
  });
  it("mai ieftin scade bugetul cu 20%", () => {
    expect(refineQuery("bormașină sub 400 lei", "mai ieftin")).toBe("bormașină sub 320 lei");
    expect(refineQuery("bormașină", "mai ieftin", 500)).toBe("bormașină sub 400 lei");
  });
  it("adaugă stocul și textul liber", () => {
    expect(refineQuery("bormașină", "doar în stoc pentru beton")).toBe("bormașină doar în stoc, pentru beton");
  });
});

describe("alerte de preț", () => {
  const w = { targetPrice: null, lastPrice: 100, lastInStock: true, notifyStock: true };
  it("scădere de 5%", () => { expect(watchAlert(w, { price: 94, inStock: true })).toBe("scadere"); expect(watchAlert(w, { price: 97, inStock: true })).toBeNull(); });
  it("țintă atinsă o singură dată", () => {
    expect(watchAlert({ ...w, targetPrice: 90 }, { price: 89, inStock: true })).toBe("tinta");
    expect(watchAlert({ ...w, targetPrice: 90, lastPrice: 89 }, { price: 88, inStock: true })).toBeNull();
  });
  it("revenire în stoc", () => { expect(watchAlert({ ...w, lastInStock: false }, { price: 100, inStock: true })).toBe("stoc"); });
});

import { applyRules, suggestTitle, type FeedProduct } from "@/core/feed";
import { decideAgentOrder, DEFAULT_POLICY } from "@/core/agent-gate";
import { base32Encode, totpCode, verifyTotp } from "@/lib/totp";
import { verifyStripeSignature } from "@/core/billing";
import { safeWebhookUrl } from "@/core/platform";
import { trustScore } from "@/core/trust";
import { handleMcp, buyerTools } from "@/core/mcp";
import { createHmac } from "node:crypto";

const fp: FeedProduct = { id: "1", externalId: "A1", title: "Bormasina percutie 800W", description: null, url: "https://x.ro/p", imageUrl: null, price: 299, currency: "RON", inStock: false, brand: "Bosch", category: "Scule > Bormașini", gtin: null, labels: ["fara_stoc"] };

describe("feed", () => {
  it("exclude produsele fără stoc doar pe canalul ales", () => {
    const rules = [{ conditions: [{ field: "label", op: "eq" as const, value: "fara_stoc" }], actions: [{ type: "exclude" as const }], channels: ["meta"], active: true }];
    expect(applyRules(fp, rules, "meta")).toBeNull();
    expect(applyRules(fp, rules, "google")).not.toBeNull();
  });
  it("adaugă sufix la titlu și etichetă", () => {
    const r = applyRules(fp, [{ conditions: [{ field: "price", op: "lt", value: "500" }], actions: [{ type: "suffix", field: "title", value: " | Livrare 24h" }, { type: "label", value: "ieftin" }], channels: [], active: true }], "google");
    expect(r?.title).toBe("Bormasina percutie 800W | Livrare 24h");
    expect(r?.labels).toContain("ieftin");
  });
  it("titlul propus pune marca și categoria", () => {
    expect(suggestTitle({ title: "BORMASINA PERCUTIE 800W!!", brand: "Bosch", category: "Scule > Bormașini" })).toBe("Bosch Bormasina Percutie 800W");
  });
});

describe("Agent Gate", () => {
  it("rambursul cere SMS", () => { expect(decideAgentOrder(DEFAULT_POLICY, { agent: "ChatGPT", verified: true, paymentMethod: "ramburs", value: 300 }).decision).toBe("confirma_sms"); });
  it("cardul de la agent verificat trece", () => { expect(decideAgentOrder(DEFAULT_POLICY, { agent: "Claude", verified: true, paymentMethod: "card", value: 5000 }).decision).toBe("accepta"); });
  it("valoare mare, agent neverificat: verificare", () => { expect(decideAgentOrder(DEFAULT_POLICY, { agent: "Gemini", verified: false, paymentMethod: "card", value: 5000 }).decision).toBe("verificare"); });
  it("agent necunoscut blocat", () => { expect(decideAgentOrder({ ...DEFAULT_POLICY, blockUnknownAgents: true }, { agent: "BotX", verified: false, paymentMethod: "card", value: 10 }).decision).toBe("respinge"); });
});

describe("securitate", () => {
  it("TOTP: vectorul RFC 6238", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(totpCode(secret, 59_000)).toBe("287082");
    expect(verifyTotp(secret, "287082", 59_000)).toBe(true);
    expect(verifyTotp(secret, "000000", 59_000)).toBe(false);
  });
  it("semnătura Stripe", () => {
    const now = Date.now(), t = Math.floor(now / 1000), body = '{"a":1}';
    const sig = createHmac("sha256", "whsec").update(`${t}.${body}`).digest("hex");
    expect(verifyStripeSignature(body, `t=${t},v1=${sig}`, "whsec", now)).toBe(true);
    expect(verifyStripeSignature(body + " ", `t=${t},v1=${sig}`, "whsec", now)).toBe(false);
  });
  it("webhook-urile nu pot ținti rețele interne", () => {
    expect(safeWebhookUrl("https://erp.magazin.ro/x")).toBe(true);
    for (const u of ["http://erp.ro", "https://localhost/x", "https://10.0.0.1/", "https://192.168.1.2", "https://169.254.169.254/latest"]) expect(safeWebhookUrl(u)).toBe(false);
  });
});

describe("scor de încredere și MCP", () => {
  it("scorul adună doar faptele verificate", () => {
    const s = trustScore({ cui: "RO123", hasReturnPolicy: true, hasTerms: true, hasContact: true, hasAnpc: false, trustmarks: [], socials: [] } as never, { claimed: true, products: 10, reviews: { n: 0, avg: null }, tracked: false });
    expect(s.score).toBe(15 + 10 + 5 + 10 + 15);
  });
  it("MCP: initialize și tools/list", async () => {
    const init = await handleMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, { name: "t", tools: buyerTools() }) as { result: { protocolVersion: string } };
    expect(init.result.protocolVersion).toBe("2025-06-18");
    const list = await handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { name: "t", tools: buyerTools() }) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toContain("cauta_produse");
    expect(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, { name: "t", tools: [] })).toBeNull();
  });
});

import { mergeStableFacts } from "@/core/stores";
describe("registrul de magazine", () => {
  const base = { hasReturnPolicy: true, hasTerms: true, hasContact: true, hasAnpc: true, trustmarks: [], socials: [] };
  it("păstrează CUI-ul găsit anterior dacă acum lipsește", () => {
    const r = mergeStableFacts({ ...base }, { ...base, cui: "RO123" }, new Date(Date.now() - 10 * 864e5));
    expect(r.facts.cui).toBe("RO123"); expect(r.reused).toEqual(["cui"]);
  });
  it("nu folosește date mai vechi de 90 de zile", () => {
    expect(mergeStableFacts({ ...base }, { ...base, cui: "RO123" }, new Date(Date.now() - 100 * 864e5)).facts.cui).toBeUndefined();
  });
  it("datele noi au prioritate", () => {
    expect(mergeStableFacts({ ...base, cui: "RO999" }, { ...base, cui: "RO123" }, new Date()).facts.cui).toBe("RO999");
  });
});

import { nextSyncAt } from "@/core/connectors/polite";
describe("nextSyncAt (preluare ușoară)", () => {
  const t0 = new Date("2026-11-20T00:00:00Z");
  it("decalaj stabil per magazin, între 12h și 14h", () => {
    const a = nextSyncAt("conn-a", t0).getTime() - t0.getTime();
    expect(a).toBe(nextSyncAt("conn-a", t0).getTime() - t0.getTime());
    expect(a).toBeGreaterThanOrEqual(12 * 3600e3);
    expect(a).toBeLessThan(14 * 3600e3);
  });
  it("magazine diferite nu cad la aceeași oră", () => {
    const set = new Set(["c1", "c2", "c3", "c4", "c5"].map((id) => nextSyncAt(id, t0).getTime()));
    expect(set.size).toBeGreaterThan(1);
  });
  it("după erori așteaptă mai mult, plafonat la x4", () => {
    const d = (f: number) => nextSyncAt("x", t0, f).getTime() - nextSyncAt("x", t0, 0).getTime();
    expect(d(1)).toBe(12 * 3600e3);
    expect(d(5)).toBe(36 * 3600e3);
  });
});

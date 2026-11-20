import { describe, expect, it } from "vitest";
import { productType, suggestPrompts } from "@/core/prompts";
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
  it("acordă genul în întrebări", () => {
    const ps = suggestPrompts([{ title: "Bormașină cu percuție 750W", category: null, brand: null, price: "289" }], "X", "ro");
    expect(ps.map((p) => p.text)).toContain(`Care este cea mai bună bormașină cu percuție în ${new Date().getFullYear()}?`);
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

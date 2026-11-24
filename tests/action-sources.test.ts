import { describe, expect, it } from "vitest";
import { sourceGaps } from "@/core/action-sources";
import { baseDomain, isComparatorDomain, notRivals, sourceKind } from "@/core/source-kind";

// Cazul real ShopExpert RO, 24.11.2026: Acțiuni arăta compari.ro de trei ori (pe subdomenii), ebay.com, iar discount.ro
// (citat de ChatGPT în 28 de răspunsuri) apărea ca „concurent”, deci nu primea nicio recomandare.
const ctx = { ownDomains: ["shopexpert.com"], competitorDomains: ["dedeman.ro", "emag.ro", "discount.ro"], brands: ["Makita", "Bosch"] };
const run = (provider: string, query: string, sources: string[], mentions = [{ domain: "dedeman.ro", position: 1 }]) => ({
  run: { provider, query, mentions, sources: sources.map((url) => ({ url })) },
});

describe("surse pentru Acțiuni (B55)", () => {
  it("discount.ro, pretarena.ro și subdomeniile compari.ro sunt comparatoare, nu concurenți", () => {
    expect(sourceKind("discount.ro", ctx)).toBe("comparator");
    expect(sourceKind("roaba.compari.ro", ctx)).toBe("comparator");
    expect(sourceKind("pretarena.ro", ctx)).toBe("comparator");
    expect(isComparatorDomain("dedeman.ro")).toBe(false);
    expect(notRivals(["discount.ro", "dedeman.ro"], ctx)).toEqual(["discount.ro"]);
    expect(baseDomain("polizor-unghiular.compari.ro")).toBe("compari.ro");
    expect(baseDomain("www.ebay.co.uk")).toBe("ebay.co.uk");
  });

  it("adună subdomeniile comparatorului, scoate marketplace-urile din altă țară, spune ce AI și la ce întrebare", () => {
    const rows = [
      run("chatgpt", "polizor makita preț", ["https://www.discount.ro/a", "https://polizor-unghiular.compari.ro/", "https://www.ebay.com/x"]),
      run("chatgpt", "roabă preț", ["https://www.discount.ro/b", "https://roaba.compari.ro/", "https://www.ebay.com/y"]),
      run("claude", "flex 125", ["https://discount.ro/c", "https://okazii.ro/z"]),
      run("claude", "okazii", ["https://okazii.ro/z2"]),
      // Cu tine în răspuns: nu e o lipsă.
      run("gemini", "x", ["https://www.discount.ro/d"], [{ domain: "shopexpert.com", position: 1 }, { domain: "dedeman.ro", position: 2 }]),
      // Fără concurenți: nu e o lipsă.
      run("gemini", "y", ["https://www.discount.ro/e"], []),
    ];
    const gaps = sourceGaps(rows, { domain: "shopexpert.com", competitorDomains: ctx.competitorDomains, ctx, country: "RO" });
    expect(gaps.map((g) => [g.domain, g.answers])).toEqual([["discount.ro", 3], ["compari.ro", 2], ["okazii.ro", 2]]);
    expect(gaps[0].providers).toEqual(["chatgpt", "claude"]);
    expect(gaps[0].examples).toContain("polizor makita preț");
    expect(gaps.some((g) => g.domain.includes("ebay"))).toBe(false);
  });

  it("o sursă citată o singură dată nu devine acțiune; fără răspunsuri, nimic", () => {
    expect(sourceGaps([run("claude", "q", ["https://pricy.ro/a"])], { domain: "shopexpert.com", competitorDomains: ctx.competitorDomains, ctx, country: "RO" })).toEqual([]);
    expect(sourceGaps([], { domain: "shopexpert.com", competitorDomains: [], ctx, country: "RO" })).toEqual([]);
  });
});

describe("ChatGPT Merchants după țară (B57)", () => {
  it("deschis doar în SUA: România și Ungaria primesc altă recomandare", async () => {
    const { merchantsOpen, countryName } = await import("@/core/feed-channels/chatgpt-markets");
    expect(merchantsOpen("RO")).toBe(false);
    expect(merchantsOpen("hu")).toBe(false);
    expect(merchantsOpen("US")).toBe(true);
    expect(merchantsOpen(null)).toBe(false);
    expect(countryName("RO")).toBe("România");
  });
});

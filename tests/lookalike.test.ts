import { describe, expect, it } from "vitest";
import { isLookalike } from "@/core/ai/lookalike";

describe("site cu nume asemănător, dar alt site (B59)", () => {
  it("shexpert.ro nu e ShopExpert, dar seamănă", () => {
    expect(isLookalike("shexpert.ro", "shopexpert.com")).toBe(true);
  });
  it("variantele cu aceeași marcă sunt magazinul, nu un alt site", () => {
    expect(isLookalike("shopexpert.ro", "shopexpert.com")).toBe(false);
    expect(isLookalike("shop-expert.ro", "shopexpert.com")).toBe(false);
  });
  it("magazinele diferite nu se confundă", () => {
    expect(isLookalike("dedeman.ro", "shopexpert.com")).toBe(false);
    expect(isLookalike("emag.ro", "shopexpert.com")).toBe(false);
    expect(isLookalike("zivtool.ro", "shopexpert.com")).toBe(false);
  });
});

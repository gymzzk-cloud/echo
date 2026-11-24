import { describe, expect, it } from "vitest";
import { isLookalike } from "@/core/ai/lookalike";

describe("site cu nume asemănător, dar alt site (B59)", () => {
  it("shexpert.ro nu e ShopExpert, dar seamănă", () => {
    expect(isLookalike("shexpert.ro", "shopexpert.com")).toBe(true);
  });
  it("aceeași marcă exactă e magazinul; cu cratimă e alt site (B60)", () => {
    expect(isLookalike("shopexpert.ro", "shopexpert.com")).toBe(false);
    expect(isLookalike("shop-expert.ro", "shopexpert.com")).toBe(true);
  });
  it("magazinele diferite nu se confundă", () => {
    expect(isLookalike("dedeman.ro", "shopexpert.com")).toBe(false);
    expect(isLookalike("emag.ro", "shopexpert.com")).toBe(false);
    expect(isLookalike("zivtool.ro", "shopexpert.com")).toBe(false);
  });
});

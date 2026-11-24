import { describe, expect, it } from "vitest";
import { categoryType, intentPrompts, isGenericType, productPrompts, type CatalogProduct } from "@/core/prompts";

const prod = (i: number, over: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id: `p${i}`, title: `Produs ${i}`, category: null, brand: null, price: "100", ...over,
});

describe("întrebări care măsoară ceva (B58)", () => {
  it("„Diverse”, „Accesorii”, „Promoții” nu sunt tipuri de produs", () => {
    expect(isGenericType("diverse")).toBe(true);
    expect(isGenericType("Accesorii")).toBe(true);
    expect(isGenericType("accesorii strung")).toBe(false);
    expect(categoryType({ title: "Adaptor aspirator", category: "Diverse", brand: "MAKITA" }, "ro")).toBe("adaptor aspirator");
    expect(categoryType({ title: "Chei fixe", category: "Scule de mână > Chei fixe și inelare > Diverse", brand: null }, "ro")).toBe("chei fixe și inelare");
  });

  it("nicio întrebare „diverse cel mai bun preț”", () => {
    const products = [
      ...Array.from({ length: 6 }, (_, i) => prod(i, { title: `MAKITA P-7037${i} adaptor`, category: "Diverse", brand: "MAKITA" })),
      ...Array.from({ length: 6 }, (_, i) => prod(10 + i, { title: `Polizor unghiular GWS ${i}`, category: "Scule electrice > Polizoare unghiulare", brand: "BOSCH" })),
    ];
    const texts = intentPrompts(products, "ro", 6).map((p) => p.text);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.some((t) => /^diverse/.test(t))).toBe(false);
  });

  it("codul producătorului se caută cu marca: „Makita P-70378 preț”, nu „P-70378 preț”", () => {
    const picked = [0, 1, 2].map((i) => ({ product: prod(i, { title: "MAKITA adaptor Quicksystem", brand: "MAKITA", mpn: "P-70378" }), category: "adaptoare" }));
    expect(productPrompts(picked, "ro")[2].text).toBe("Makita P-70378 preț");
  });
});

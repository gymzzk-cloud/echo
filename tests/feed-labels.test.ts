import { describe, expect, it } from "vitest";
import { labelsFor, type LabelContext } from "@/core/feed";

const p = (id: string) => ({ id, title: "Produs", inStock: true, price: "100", gtin: "5901234123457", imageUrl: "https://x/i.jpg", brand: "BOSCH" });
const ctx = (o: Partial<LabelContext> = {}): LabelContext => ({ mentioned: new Set(), asked: new Set(), clickN: new Map(), minOther: new Map(), ...o });

describe("etichete de feed doar din date verificate (KNOWLEDGE B52)", () => {
  it("fără clicuri și neîntrebat la AI: nicio etichetă de vânzări sau AI (nu știm)", () => {
    const l = labelsFor(p("a"), ctx());
    expect(l).not.toContain("zombie");
    expect(l).not.toContain("ai_nu_apare");
    expect(l).not.toContain("recomandat_ai");
  });
  it("întrebat direct și nenumit: „ai_nu_apare”; numit: „recomandat_ai”", () => {
    expect(labelsFor(p("a"), ctx({ asked: new Set(["a"]) }))).toContain("ai_nu_apare");
    const named = labelsFor(p("a"), ctx({ asked: new Set(["a"]), mentioned: new Set(["a"]) }));
    expect(named).toContain("recomandat_ai");
    expect(named).not.toContain("ai_nu_apare");
  });
  it("popular doar cu clicuri reale", () => {
    expect(labelsFor(p("a"), ctx({ clickN: new Map([["a", 5]]) }))).toContain("popular");
    expect(labelsFor(p("a"), ctx({ clickN: new Map([["a", 1]]) }))).not.toContain("popular");
  });
});

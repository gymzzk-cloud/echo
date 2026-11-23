import { describe, expect, it } from "vitest";
import { topDestinations } from "@/core/panel-snapshot";
import type { Rows } from "@/core/insights";

const row = (domains: string[]) => ({ run: { mentions: domains.map((domain, i) => ({ domain, position: i + 1 })) } }) as unknown as Rows[number];

describe("topDestinations (Produse: unde trimit AI-urile cumpărătorii)", () => {
  it("fără răspunsuri: listă goală", () => {
    expect(topDestinations([], "shop.ro", [])).toEqual([]);
  });
  it("numără magazinele, cel mai des primul, fără site-uri de producător", () => {
    const rows = [row(["emag.ro", "shop.ro"]), row(["emag.ro", "bosch-professional.com"]), row(["dedeman.ro"])];
    const r = topDestinations(rows, "shop.ro", ["Bosch"]);
    expect(r[0]).toEqual(["emag.ro", 2]);
    expect(r.map(([d]) => d)).toContain("shop.ro");
    expect(r.map(([d]) => d)).not.toContain("bosch-professional.com");
  });
  it("taie la `top`", () => {
    const rows = [row(["a.ro", "b.ro", "c.ro"])];
    expect(topDestinations(rows, "x.ro", [], 2)).toHaveLength(2);
  });
});

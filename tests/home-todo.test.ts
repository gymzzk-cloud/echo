import { describe, expect, it } from "vitest";
import { homeTodo } from "@/core/home-todo";

const q = (issues: { id: "no_price" | "no_gtin" | "short_description"; count: number; focus: number }[]) => ({ checked: 100, perfect: 50, accepted: 90, score: 50, issues });
const act = (key: string, impact: string, effort = "mic") => ({ id: key, key, title: key, why: "de ce", impact, effort, fixKind: null });

describe("Acasă: ce faci acum", () => {
  it("fără date: listă goală", () => expect(homeTodo(null, [])).toEqual([]));
  it("produsele respinse de feed vin primele, apoi impactul mare, apoi ce atinge focus", () => {
    const t = homeTodo(q([{ id: "no_gtin", count: 500, focus: 10 }, { id: "no_price", count: 3, focus: 0 }]), [act("a:mic", "mic"), act("a:mare", "mare"), act("a:mediu", "mediu")]);
    expect(t.map((x) => x.key)).toEqual(["feed:no_price", "a:mare", "feed:no_gtin", "a:mediu", "a:mic"]);
    expect(t[0].title).toBe("3 produse nu ajung la AI: fără preț");
    expect(t[0].href).toContain("problema=no_price");
  });
  it("la același rang, produsele focus cântăresc dublu; la același impact, efortul mic primul", () => {
    const t = homeTodo(q([{ id: "no_gtin", count: 10, focus: 0 }, { id: "short_description", count: 8, focus: 5 }]), [act("greu", "mare", "mare"), act("usor", "mare", "mic")]);
    expect(t.map((x) => x.key)).toEqual(["usor", "greu", "feed:short_description", "feed:no_gtin"]);
  });
  it("problemele cu zero produse nu apar", () => expect(homeTodo(q([{ id: "no_price", count: 0, focus: 0 }]), [])).toEqual([]));
});

import { describe, expect, it } from "vitest";
import { actionTitle, PROBLEM_TITLES } from "../src/core/audit/problems";

// Bug: titlurile acțiunilor din audit spuneau criteriul („Pagina principală răspunde rapid”) chiar când textul spunea problema (3,0 s, lent).
describe("actionTitle", () => {
  it("acțiunile din audit au titlul problemei, nu al criteriului", () => {
    expect(actionTitle({ key: "audit:speed", title: "Pagina principală răspunde rapid" })).toBe("Pagina principală se încarcă greu");
    expect(actionTitle({ key: "audit:jsonld-org", title: "Datele firmei sunt marcate pentru AI (Organization)" })).toBe("Lipsesc datele firmei pentru AI (Organization)");
  });
  it("celelalte acțiuni își păstrează titlul", () => {
    expect(actionTitle({ key: "products:none", title: "Niciun produs nu e recomandat pe nume" })).toBe("Niciun produs nu e recomandat pe nume");
    expect(actionTitle({ key: "audit:necunoscut", title: "Altceva" })).toBe("Altceva");
  });
  it("fiecare verificare din audit are un titlu de problemă", async () => {
    const { readFileSync } = await import("node:fs");
    const ids = [...readFileSync("src/core/audit/index.ts", "utf8").matchAll(/id: "([a-z-]+)", group:/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(5);
    for (const id of ids) expect(PROBLEM_TITLES[id], id).toBeTruthy();
  });
});

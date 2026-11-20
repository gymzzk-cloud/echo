import { describe, expect, it } from "vitest";
import { classifySource, sourceActionTitle } from "@/core/source-kind";

const ctx = { domain: "shopexpert.com", competitors: ["dedeman.ro"], brands: ["BOSCH", "MAKITA", "DeWALT"], owned: ["hardlineconstruct.ro"] };
const k = (d: string) => classifySource(d, ctx);

describe("sursele citate de AI-uri: ce poate face magazinul", () => {
  it("site-urile producătorilor nu sunt oportunități, dar primesc un sfat realist", () => {
    for (const d of ["bosch-professional.com", "makitatools.com", "dewalt.ro", "www.bosch-pt.com"]) {
      expect(k(d).kind).toBe("producător");
      expect(k(d).actionable).toBe(false);
    }
    expect(k("makitatools.com").advice).toMatch(/dealeri/);
  });
  it("magazinele tale și concurenții nu sunt surse de „apărut pe”", () => {
    expect(k("hardlineconstruct.ro")).toMatchObject({ kind: "site propriu", actionable: false });
    expect(k("shopexpert.com")).toMatchObject({ kind: "site propriu", actionable: false });
    expect(k("dedeman.ro")).toMatchObject({ kind: "concurent", actionable: false });
    expect(k("sculemarket.ro")).toMatchObject({ kind: "magazin", actionable: false });
  });
  it("comparatoare, recenzii, forumuri, presă și marketplace-uri: da, cu titlu potrivit", () => {
    expect(k("compari.ro")).toMatchObject({ kind: "comparator", actionable: true });
    expect(k("trustpilot.com")).toMatchObject({ kind: "recenzii", actionable: true });
    expect(k("reddit.com")).toMatchObject({ kind: "forum", actionable: true });
    expect(k("emag.ro")).toMatchObject({ kind: "marketplace", actionable: true });
    expect(k("playtech.ro")).toMatchObject({ kind: "presă / blog", actionable: true });
    expect(sourceActionTitle("compari.ro", "comparator")).toBe("Listează produsele pe compari.ro");
  });
  it("directoarele de firme și enciclopediile nu sunt oportunități", () => {
    expect(k("listafirme.ro").actionable).toBe(false);
    expect(k("ro.wikipedia.org").actionable).toBe(false);
  });
});

describe("tonul afirmațiilor despre magazin", async () => {
  const { toneOf } = await import("@/core/reputation");
  it("laudele din captura lui ZoZo nu sunt negative", () => {
    expect(toneOf("Gama de produse: Este unul dintre puținele magazine care au în stoc branduri de top precum Makita, Bosch, DeWalt")).toBe("pozitiv");
    expect(toneOf("Dacă nu te grăbești, poți comanda online liniștit, riscul de a avea probleme cu produsul fiind minim.")).toBe("pozitiv");
    expect(toneOf("Un client de pe cumpar.net scrie că livrările au venit întotdeauna prin GLS și că nu a avut probleme cu livrarea.")).toBe("pozitiv");
  });
  it("criticile rămân negative", () => {
    expect(toneOf("Un alt comentariu de pe același site descrie o întârziere de două săptămâni, după ce comanda fusese confirmată.")).toBe("negativ");
    expect(toneOf("ShopExpert poate refuza returul sau poate reține o sumă din valoarea acestuia.")).toBe("negativ");
    expect(toneOf("Magazinul are puține recenzii publice.")).toBe("negativ");
    expect(toneOf("Nu recomand acest magazin.")).toBe("negativ");
  });
  it("informațiile simple sunt neutre", () => {
    expect(toneOf("ShopExpert are sediul în Cluj-Napoca și livrează prin curier.")).toBe("neutru");
  });
});

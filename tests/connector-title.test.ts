import { describe, expect, it } from "vitest";
import { composeTitle, mapRecord } from "../src/core/connectors";

// Bug ZoZo 2026-11-23: API-ul ShopExpert dă „title” = „BOSCH GCM 305-216 S”, iar tipul e în „short_description”.
// Site-ul (H1) și feed-ul magazinului arată titlu + descrierea scurtă. Echo compara doar titlul scurt și propunea
// mii de „reparații” care adăugau un tip pe care produsul îl avea deja.
describe("titlul complet din API (titlu + subtitlu)", () => {
  it("lipește descrierea scurtă la titlu, ca H1-ul de pe site", () => {
    const p = mapRecord({
      id: "1223714", title: "BOSCH GCM 305-216 S", brand: "BOSCH", ean: "4053423846317", sku: "0601B61000", price: 1035, currency: "RON",
      url: "https://www.shopexpert.com/ro/bosch/x", short_description: "Ferăstrău circular staționar cu sanie de glisare 1300 W, Ø216",
      description: "<p>Ferăstrău precis pentru tăieturi drepte și înclinate.</p>", attributes: { Putere: "1.300 W" },
    });
    expect(p.title).toBe("BOSCH GCM 305-216 S Ferăstrău circular staționar cu sanie de glisare 1300 W, Ø216");
    expect(p.description).toBe("Ferăstrău precis pentru tăieturi drepte și înclinate. Putere: 1.300 W");
    expect(p.gtin).toBe("4053423846317");
  });
  it("fără descriere lungă, păstrează subtitlul și în descriere", () => {
    const p = mapRecord({ id: "1", title: "MAKITA BL4080F, 40V, 8.0 Ah, XGT", url: "https://x.ro/p", price: 1, short_description: "Acumulator Li-Ion", description: null });
    expect(p.title).toBe("MAKITA BL4080F, 40V, 8.0 Ah, XGT Acumulator Li-Ion");
    expect(p.description).toBe("Acumulator Li-Ion");
  });
  it("o descriere scurtă care e frază nu intră în titlu", () => {
    expect(composeTitle("Bosch GSR 12V", "Mașină compactă. Ideală pentru montaj.").title).toBe("Bosch GSR 12V");
    expect(composeTitle("Bosch GSR 12V", "Mașină compactă pentru montaj.").subtitleUsed).toBe(false);
    const p = mapRecord({ id: "1", title: "Bosch GSR 12V", url: "https://x.ro/p", price: 1, short_description: "Mașină compactă. Ideală pentru montaj.", description: "Text lung." });
    expect(p.description).toBe("Mașină compactă. Ideală pentru montaj. Text lung.");
  });
  it("nu dublează subtitlul deja prezent în titlu", () => {
    expect(composeTitle("Bosch Polizor unghiular GWS 7-125", "polizor unghiular").title).toBe("Bosch Polizor unghiular GWS 7-125");
  });
});

describe("atributele de ambalaj nu intră în descriere", () => {
  it("CROMWELL 17mm IMPACT SOCKET: doar dimensiuni de ambalaj în API, deci fără descriere", () => {
    const p = mapRecord({ id: "1228149", title: 'CROMWELL 17mm IMPACT SOCKET 3/8"SQUAREDRIVE', url: "https://x.ro/p", price: 15, short_description: "", description: null,
      attributes: { "Lungime ambalaj (mm)": "2.60", "Latime ambalaj (mm)": "2.60", "Inaltime ambalaj (mm)": "3.10", "Greutate (gr)": "59" } });
    expect(p.description).toBe("Greutate (gr): 59");
  });
  it("valorile zero se sar", () => {
    const p = mapRecord({ id: "1", title: "X", url: "https://x.ro/p", price: 1, attributes: { "Greutate (gr)": "0", Putere: "1.300 W" } });
    expect(p.description).toBe("Putere: 1.300 W");
  });
});

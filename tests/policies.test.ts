import { describe, expect, it } from "vitest";
import { extractDelivery, extractFaq, extractPayment, extractReturns, findPolicyLinks, findPolicyLinksInSitemap, freeShippingThreshold, paymentMethods, returnDays, sitemapLocs } from "../src/core/policies/extract";
import { policiesDue, readPolicies } from "../src/core/policies";

const HOME = `<html><body>
<header><a href="/ro/categorie/bormasini">Bormașini</a><a href="/ro/cos">Coș</a></header>
<main><a href="/ro/produs/plata-cu-card-test">Un produs</a></main>
<footer>
  <a href="/ro/politica-de-retur">Politica de retur</a>
  <a href="/hu/visszakuldes">Visszaküldés</a>
  <a href="/ro/metode-de-plata">Metode de plată</a>
  <a href="/ro/livrare">Livrare</a>
  <a href="/ro/intrebari-frecvente">Întrebări frecvente</a>
  <a href="https://anpc.ro">ANPC</a>
  <img alt="Visa"> Plătești cu card sau ramburs
</footer></body></html>`;

describe("findPolicyLinks", () => {
  it("găsește paginile de condiții din subsol, sub subfolderul magazinului", () => {
    const l = findPolicyLinks(HOME, "https://shop.example/ro/");
    expect(l.returns).toBe("https://shop.example/ro/politica-de-retur");
    expect(l.payment).toBe("https://shop.example/ro/metode-de-plata");
    expect(l.delivery).toBe("https://shop.example/ro/livrare");
    expect(l.faq).toBe("https://shop.example/ro/intrebari-frecvente");
  });
  it("ignoră produsele, categoriile și alte site-uri", () => {
    const l = findPolicyLinks(`<a href="/produs/retur-x">Retur</a><a href="https://alt.ro/retur">Retur</a>`, "https://shop.example/");
    expect(l.returns).toBeUndefined();
  });
  it("pagina principală fără linkuri: nimic găsit", () => {
    expect(findPolicyLinks("<html><body>Salut</body></html>", "https://shop.example/")).toEqual({});
  });
});

describe("sitemap", () => {
  it("citește adresele și găsește paginile după cale", () => {
    const urls = sitemapLocs(`<urlset><url><loc>https://shop.example/ro/conditii-de-retur</loc></url><url><loc>https://shop.example/ro/faq</loc></url><url><loc>https://shop.example/hu/fizetes</loc></url></urlset>`);
    const l = findPolicyLinksInSitemap(urls, "https://shop.example/ro/");
    expect(l.returns).toBe("https://shop.example/ro/conditii-de-retur");
    expect(l.faq).toBe("https://shop.example/ro/faq");
    expect(l.payment).toBeUndefined(); // e sub /hu, nu sub /ro
  });
});

describe("retur", () => {
  const page = `<html><body><nav>Retur rapid în meniu</nav><main>
    <h1>Politica de retur</h1>
    <p>Ai dreptul să returnezi produsele în termen de 30 de zile de la primire, fără să spui motivul.</p>
    <p>Rambursarea banilor se face în maximum 14 zile de la primirea coletului.</p>
    <p>Program: luni-vineri.</p></main></body></html>`;
  it("găsește termenul în zile și păstrează doar frazele despre retur", () => {
    const r = extractReturns(page, "https://shop.example/retur")!;
    expect(r.days).toBe(30);
    expect(r.text).toContain("30 de zile");
    expect(r.text).not.toContain("Program");
    expect(r.text).not.toContain("meniu");
  });
  it("maghiară: 14 napon belül", () => {
    expect(returnDays(["A terméket 14 napon belül indoklás nélkül visszaküldheti."])).toBe(14);
  });
  it("pagină fără text despre retur: nimic", () => {
    expect(extractReturns("<main><p>Bun venit în magazinul nostru online!</p></main>", "https://x")).toBeUndefined();
  });
});

describe("plată", () => {
  it("recunoaște metodele (RO și HU)", () => {
    expect(paymentMethods("Plata se face cu cardul Visa/Mastercard, ramburs la curier, prin transfer bancar sau în rate fără dobândă cu TBI.")).toEqual(["card", "ramburs", "transfer bancar", "rate"]);
    expect(paymentMethods("Fizetés bankkártyával, utánvéttel vagy banki átutalással.")).toEqual(["card", "ramburs", "transfer bancar"]);
  });
  it("fără pagină de plată: metodele din pagina principală, fără adresă", () => {
    const p = extractPayment(HOME)!;
    expect(p.url).toBeUndefined();
    expect(p.methods).toEqual(expect.arrayContaining(["card", "ramburs"]));
  });
  it("nicio metodă: nimic", () => {
    expect(extractPayment("<main><p>Despre noi</p></main>")).toBeUndefined();
  });
});

describe("livrare", () => {
  it("pragul de transport gratuit", () => {
    expect(freeShippingThreshold("Transportul este gratuit pentru comenzi peste 300 lei.")).toBe("300 lei");
    expect(freeShippingThreshold("20 000 Ft felett ingyenes a szállítás.")).toBe("20 000 Ft");
    expect(freeShippingThreshold("Livrare rapidă.")).toBeUndefined();
  });
  it("textul despre livrare", () => {
    const d = extractDelivery("<main><p>Livrarea se face prin curier în 1-3 zile lucrătoare. Transport gratuit peste 250 lei.</p></main>", "https://x/livrare")!;
    expect(d.freeOver).toBe("250 lei");
    expect(d.text).toContain("curier");
  });
});

describe("întrebări frecvente", () => {
  it("din datele structurate FAQPage", () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Emiteți factură pe firmă?","acceptedAnswer":{"@type":"Answer","text":"<p>Da, completezi CUI-ul.</p>"}}]}</script>`;
    expect(extractFaq(html, "https://x/faq")!.items).toEqual([{ q: "Emiteți factură pe firmă?", a: "Da, completezi CUI-ul." }]);
  });
  it("din titluri cu semnul întrebării", () => {
    const html = `<main><h3>Cât durează livrarea?</h3><p>1-3 zile lucrătoare.</p><h3>Contact</h3><p>Sună-ne.</p></main>`;
    expect(extractFaq(html, "https://x/faq")!.items).toEqual([{ q: "Cât durează livrarea?", a: "1-3 zile lucrătoare." }]);
  });
  it("pagină fără întrebări: nimic", () => {
    expect(extractFaq("<main><p>Nimic</p></main>", "https://x")).toBeUndefined();
  });
});

describe("policiesDue", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const at = (days: number, error?: string) => ({ id: "p1", storeInfo: { policies: { checkedAt: new Date(now - days * 864e5).toISOString(), error } } });
  it("niciodată citit: la termen", () => expect(policiesDue({ id: "p1", storeInfo: null }, now)).toBe(true));
  it("citit acum o săptămână: nu", () => expect(policiesDue(at(7), now)).toBe(false));
  it("citit acum 40 de zile: da", () => expect(policiesDue(at(40), now)).toBe(true));
  it("eroare acum 4 zile: reîncercăm", () => expect(policiesDue(at(4, "403"), now)).toBe(true));
  it("eroare acum o zi: așteptăm", () => expect(policiesDue(at(1, "403"), now)).toBe(false));
});

describe("readPolicies (site simulat)", () => {
  const site = (pages: Record<string, string>) => {
    const asked: string[] = [];
    const fetchHtml = async (url: string) => { asked.push(url); if (!(url in pages)) throw new Error("404"); return pages[url]; };
    return { asked, fetchHtml };
  };
  it("citește retur, plată, livrare și întrebări; o pagină comună se cere o dată", async () => {
    const { asked, fetchHtml } = site({
      "https://shop.example/ro/": `<footer><a href="/ro/livrare-si-retur">Livrare și retur</a><a href="/ro/plata">Plată</a><a href="/ro/faq">FAQ</a></footer>`,
      "https://shop.example/ro/livrare-si-retur": `<main><p>Livrarea prin curier durează 1-2 zile lucrătoare, gratuit peste 300 lei.</p><p>Poți returna produsele în 30 de zile de la primire.</p></main>`,
      "https://shop.example/ro/plata": `<main><p>Accepte plata cu card bancar și ramburs la livrare.</p></main>`,
      "https://shop.example/ro/faq": `<main><h3>Emiteți factură?</h3><p>Da.</p></main>`,
    });
    const r = await readPolicies("https://shop.example/ro/", fetchHtml);
    expect(r.returns?.days).toBe(30);
    expect(r.delivery?.freeOver).toBe("300 lei");
    expect(r.payment?.methods).toEqual(["card", "ramburs"]);
    expect(r.faq?.items).toHaveLength(1);
    expect(asked.filter((u) => u.endsWith("livrare-si-retur"))).toHaveLength(1);
    expect(asked).not.toContain("https://shop.example/sitemap.xml"); // toate linkurile găsite: fără sitemap
  });
  it("fără linkuri în pagină: caută în sitemap", async () => {
    const { fetchHtml } = site({
      "https://shop.example/": `<p>Bun venit</p>`,
      "https://shop.example/sitemap.xml": `<urlset><url><loc>https://shop.example/politica-retur</loc></url></urlset>`,
      "https://shop.example/politica-retur": `<main><p>Returul se face în 14 zile, cu formularul de retur.</p></main>`,
    });
    const r = await readPolicies("https://shop.example/", fetchHtml);
    expect(r.returns?.url).toBe("https://shop.example/politica-retur");
    expect(r.payment).toBeUndefined();
  });
  it("pagina principală nu răspunde: eroare (păstrăm datele vechi în refreshPolicies)", async () => {
    const { fetchHtml } = site({});
    await expect(readPolicies("https://shop.example/", fetchHtml)).rejects.toThrow();
  });
});

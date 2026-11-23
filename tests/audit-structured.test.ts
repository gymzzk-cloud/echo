import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { gzipSync } from "node:zlib";
import { describeProductFields, isType, missingProductFields, ORG_TYPES, productFields, structuredData } from "@/core/audit/structured";
import { classifySitemap, decodeSitemapBody, findSitemap, productLikeUrls, sitemapCandidates } from "@/core/audit/sitemap";
import { fixFor } from "@/core/audit/fixes";
import { staleAuditKeys } from "@/core/projects";

const enc = (s: string) => new TextEncoder().encode(s);

// Ce are ShopExpert RO în realitate (verificat pe 23.11.2026): JSON-LD Product complet pe produs,
// nimic pe pagina principală, robots.txt fără „Sitemap:”, /sitemap.xml = pagină HTML, /ro/sitemap.xml = sitemap valid.
const SHOPEXPERT_PRODUCT = `<html><head><script type="application/ld+json">{
  "@context": "https://schema.org/", "@type": "Product", "name": "DEWALT DCN890P2-QW",
  "image": ["https://www.shopexpert.com/img/products/1.png"], "gtin": "5035048666883", "sku": "5035048666883", "mpn": "DCN890P2-QW",
  "brand": {"@type": "Brand", "name": "DEWALT"},
  "offers": {"@type": "AggregateOffer", "priceCurrency": "RON", "lowPrice": "3949", "price": "3949", "availability": "https://schema.org/InStock"}
}</script></head><body></body></html>`;

describe("date structurate schema.org", () => {
  it("citește Product din JSON-LD (cazul ShopExpert) și nu cere nimic în plus", () => {
    const sd = structuredData(cheerio.load(SHOPEXPERT_PRODUCT));
    const p = sd.find((e) => isType(e, ["Product"]))!;
    expect(p.source).toBe("JSON-LD");
    const f = productFields(p);
    expect(f).toMatchObject({ price: "3949", currency: "RON", availability: "InStock", brand: "DEWALT", gtin: "5035048666883", mpn: "DCN890P2-QW" });
    expect(missingProductFields(f)).toEqual([]);
    expect(describeProductFields(f)).toContain("GTIN 5035048666883");
  });

  it("citește Product din Microdata (magazinele vechi), cu oferta și brandul imbricate", () => {
    const html = `<div itemscope itemtype="http://schema.org/Product">
      <h1 itemprop="name">Bosch GWS 7-125</h1><img itemprop="image" src="/a.jpg">
      <meta itemprop="gtin13" content="3165140547956">
      <div itemprop="brand" itemscope itemtype="http://schema.org/Brand"><span itemprop="name">BOSCH</span></div>
      <div itemprop="offers" itemscope itemtype="http://schema.org/Offer">
        <span itemprop="price" content="289.90">289,90 lei</span><meta itemprop="priceCurrency" content="RON">
        <link itemprop="availability" href="http://schema.org/InStock">
      </div></div>`;
    const sd = structuredData(cheerio.load(html));
    expect(sd).toHaveLength(1); // Brand și Offer sunt proprietăți, nu obiecte separate
    const f = productFields(sd[0]);
    expect(sd[0].source).toBe("Microdata");
    expect(f).toMatchObject({ name: "Bosch GWS 7-125", price: "289.90", currency: "RON", availability: "InStock", brand: "BOSCH", gtin: "3165140547956" });
    expect(missingProductFields(f)).toEqual([]);
  });

  it("citește RDFa și Organization în Microdata", () => {
    const html = `<div vocab="https://schema.org/" typeof="Product"><span property="name">X</span><meta property="og:title" content="nu"/>
      <div property="offers" typeof="Offer"><span property="price" content="10"></span></div></div>
      <div itemscope itemtype="https://schema.org/Organization"><span itemprop="name">Firma SRL</span></div>`;
    const sd = structuredData(cheerio.load(html));
    const rd = sd.find((e) => e.source === "RDFa")!;
    expect(productFields(rd).price).toBe("10");
    expect(rd.props["og:title"]).toBeUndefined();
    expect(sd.some((e) => isType(e, ORG_TYPES))).toBe(true);
  });

  it("spune exact ce câmpuri lipsesc (GTIN, brand)", () => {
    const m = missingProductFields({ name: "x", price: "1", currency: "RON", availability: "InStock", sku: "INT-1", image: "a" });
    expect(m).toEqual(["brand", "GTIN/EAN (gtin13) sau cod producător (mpn), ai doar SKU intern"]);
  });
});

describe("sitemap", () => {
  it("caută și sub prefixul de limbă, după cele din robots.txt", () => {
    expect(sitemapCandidates("https://www.shopexpert.com", "/ro", [])).toEqual([
      "https://www.shopexpert.com/ro/sitemap.xml", "https://www.shopexpert.com/sitemap.xml", "https://www.shopexpert.com/sitemap_index.xml",
      "https://www.shopexpert.com/ro/sitemap_index.xml", "https://www.shopexpert.com/sitemap.xml.gz",
    ]);
    expect(sitemapCandidates("https://a.ro", "", ["https://a.ro/s.xml"])[0]).toBe("https://a.ro/s.xml");
  });

  it("o pagină HTML cu 200 nu e sitemap; gzip se decomprimă", () => {
    expect(classifySitemap(200, "<!DOCTYPE html><html><body>Acasă</body></html>").kind).toBe("html");
    expect(classifySitemap(403, "Attention Required! | Cloudflare").kind).toBe("blocked");
    const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://a.ro/x</loc></url></urlset>`;
    expect(decodeSitemapBody(new Uint8Array(gzipSync(xml)))).toBe(xml);
    expect(classifySitemap(200, xml)).toEqual({ kind: "urlset", locs: 1 });
  });

  it("găsește /ro/sitemap.xml la ShopExpert și știe că nu e declarat în robots.txt", async () => {
    const pages: Record<string, string> = {
      "https://www.shopexpert.com/sitemap.xml": "<html><body>pagina principală</body></html>",
      "https://www.shopexpert.com/ro/sitemap.xml": `<urlset><url><loc>https://www.shopexpert.com/ro/scule-electrice</loc></url><url><loc>https://www.shopexpert.com/ro/dewalt/scule-cu-acumulator/capsatoare/dcn890p2-qw-pistol-cu-cuie</loc></url></urlset>`,
    };
    const asked: string[] = [];
    const r = await findSitemap("https://www.shopexpert.com", "/ro", [], async (u) => { asked.push(u); return { status: 200, body: enc(pages[u] ?? "<html></html>") }; });
    expect(r.found).toEqual({ url: "https://www.shopexpert.com/ro/sitemap.xml", kind: "urlset", locs: 2, declared: false });
    expect(asked).toHaveLength(1); // ne oprim la primul găsit
    expect(productLikeUrls(r.sampleUrls, "/ro")).toEqual(["https://www.shopexpert.com/ro/dewalt/scule-cu-acumulator/capsatoare/dcn890p2-qw-pistol-cu-cuie"]);
  });

  it("raportează fiecare loc încercat când nu există sitemap", async () => {
    const r = await findSitemap("https://a.ro", "", [], async () => ({ status: 404, body: enc("") }));
    expect(r.found).toBeUndefined();
    expect(r.probes.map((p) => p.kind)).toEqual(["other", "other", "other"]);
  });
});

describe("Rezolvă cere doar ce lipsește", () => {
  const ctx = { domain: "shopexpert.com", origin: "https://www.shopexpert.com", storeName: "ShopExpert" };

  it("produse cu Product complet, fără Organization: doar blocul Organization", () => {
    const f = fixFor("jsonld", { ...ctx, checks: [{ id: "jsonld-org", status: "warn", missing: ["Organization"] }, { id: "jsonld-product", status: "pass" }] })!;
    expect(f.title).toBe("Adaugă blocul Organization (datele firmei)");
    expect(f.code).toContain("OnlineStore");
    expect(f.code).not.toContain('"@type": "Product"');
    expect(f.steps[0]).toContain("au deja schema.org Product");
  });

  it("Product cu câmpuri lipsă: numește câmpurile, fără bloc nou", () => {
    const f = fixFor("jsonld", { ...ctx, checks: [{ id: "jsonld-org", status: "pass" }, { id: "jsonld-product", status: "warn", missing: ["brand", "GTIN/EAN (gtin13) sau cod producător (mpn)"] }] })!;
    expect(f.title).toBe("Completează câmpurile lipsă din Product");
    expect(f.code).toBeUndefined();
    expect(f.steps.join(" ")).toContain("adaugă: brand, GTIN/EAN");
  });

  it("sitemap existent dar nedeclarat: doar linia din robots.txt, cu adresa reală", () => {
    const f = fixFor("sitemap", { ...ctx, sitemapUrl: "https://www.shopexpert.com/ro/sitemap.xml", checks: [{ id: "sitemap", status: "pass" }, { id: "sitemap-robots", status: "warn" }] })!;
    expect(f.title).toBe("Declară sitemap-ul în robots.txt");
    expect(f.code).toBe("Sitemap: https://www.shopexpert.com/ro/sitemap.xml");
  });
});

describe("recomandările vechi din audit", () => {
  it("se închid doar pentru verificările care trec acum", () => {
    const keys = staleAuditKeys([{ id: "sitemap", status: "pass" }, { id: "jsonld-org", status: "warn" }, { id: "jsonld-product", status: "info" }]);
    expect(keys).toEqual(["audit:sitemap", "audit:sitemap-robots"]);
    expect(staleAuditKeys([{ id: "sitemap", status: "pass" }, { id: "sitemap-robots", status: "warn" }])).toEqual(["audit:sitemap"]);
  });
});

describe("auditul complet pe un site ca ShopExpert RO", () => {
  it("nu mai spune că lipsesc schema.org și sitemap-ul; cere doar Organization și linia din robots.txt", async () => {
    const { runAudit } = await import("@/core/audit");
    const prodUrl = "https://www.shopexpert.com/ro/dewalt/scule-cu-acumulator/capsatoare/dcn890p2-qw-pistol-cu-cuie";
    const site: Record<string, string> = {
      "https://www.shopexpert.com/ro": `<html lang="ro"><head><title>ShopExpert</title><meta name="description" content="d"></head><body><a href="/ro/scule-electrice">Scule</a><a href="${prodUrl}">DEWALT</a></body></html>`,
      "https://www.shopexpert.com/robots.txt": "User-agent: *\nDisallow: /cart\n",
      "https://www.shopexpert.com/ro/sitemap.xml": `<urlset><url><loc>${prodUrl}</loc></url></urlset>`,
      "https://www.shopexpert.com/sitemap.xml": "<html><body>acasă</body></html>",
      [prodUrl]: SHOPEXPERT_PRODUCT,
    };
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL) => {
      const u = String(input);
      const body = site[u];
      return new Response(body ?? "not found", { status: body ? 200 : 404 });
    }) as typeof fetch;
    try {
      const r = await runAudit("https://www.shopexpert.com/ro");
      const c = Object.fromEntries(r.checks.map((x) => [x.id, x]));
      expect(c["jsonld-product"].status).toBe("pass");
      expect(c["jsonld-product"].detail).toContain("JSON-LD");
      expect(c["jsonld-org"].status).toBe("warn");
      expect(c["jsonld-org"].detail).toContain("Lipsește doar acest bloc");
      expect(c.sitemap.status).toBe("pass");
      expect(c.sitemap.evidence?.some((e) => e.value.includes("pagină HTML"))).toBe(false); // /ro/sitemap.xml e găsit primul
      expect(c["sitemap-robots"].status).toBe("warn");
      expect(r.sitemapUrl).toBe("https://www.shopexpert.com/ro/sitemap.xml");
      expect(r.productUrl).toBe(prodUrl);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

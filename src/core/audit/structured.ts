import type * as cheerio from "cheerio";
import type { Element } from "domhandler";

/**
 * Date structurate schema.org, în toate cele trei forme pe care le citesc Google și AI-urile:
 * JSON-LD (<script type="application/ld+json">), Microdata (itemscope/itemtype/itemprop) și RDFa (typeof/property).
 * Multe magazine vechi au Microdata de ani de zile; dacă citim doar JSON-LD, le spunem greșit că nu au nimic.
 */

export type SdSource = "JSON-LD" | "Microdata" | "RDFa";
export type SdEntity = { types: string[]; props: Record<string, unknown>; source: SdSource };

const typeName = (t: string) => t.replace(/^https?:\/\/(www\.)?schema\.org\//i, "").replace(/^schema:/i, "").trim();

// ── JSON-LD ────────────────────────────────────────────────────────────────
export function jsonLdNodes($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text().trim());
      const push = (n: unknown) => {
        if (Array.isArray(n)) n.forEach(push);
        else if (n && typeof n === "object") {
          const o = n as Record<string, unknown>;
          if (Array.isArray(o["@graph"])) (o["@graph"] as unknown[]).forEach(push);
          out.push(o);
        }
      };
      push(data);
    } catch { /* JSON invalid: îl ignorăm */ }
  });
  return out;
}

function jsonLdEntity(o: Record<string, unknown>): SdEntity {
  const t = o["@type"];
  const types = (Array.isArray(t) ? t : t ? [t] : []).map((x) => typeName(String(x)));
  return { types, props: o, source: "JSON-LD" };
}

// ── Microdata ──────────────────────────────────────────────────────────────
function microValue($: cheerio.CheerioAPI, el: Element): unknown {
  const $el = $(el);
  if ($el.is("[itemscope]")) return microItem($, el);
  const tag = el.tagName?.toLowerCase();
  if ($el.attr("content") !== undefined) return $el.attr("content");
  if (tag === "a" || tag === "link" || tag === "area") return $el.attr("href") ?? "";
  if (tag === "img" || tag === "source" || tag === "audio" || tag === "video" || tag === "embed" || tag === "iframe") return $el.attr("src") ?? "";
  if (tag === "time" && $el.attr("datetime")) return $el.attr("datetime");
  if ((tag === "data" || tag === "meter") && $el.attr("value") !== undefined) return $el.attr("value");
  return $el.text().replace(/\s+/g, " ").trim();
}

function microItem($: cheerio.CheerioAPI, scope: Element): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const types = ($(scope).attr("itemtype") ?? "").split(/\s+/).filter(Boolean).map(typeName);
  if (types.length) props["@type"] = types.length === 1 ? types[0] : types;
  $(scope).find("[itemprop]").each((_, el) => {
    // Proprietatea aparține celui mai apropiat itemscope de deasupra ei (nu cel al elementului însuși).
    const owner = $(el).parent().closest("[itemscope]").get(0);
    if (owner !== scope) return;
    const v = microValue($, el as Element);
    for (const name of ($(el).attr("itemprop") ?? "").split(/\s+/).filter(Boolean)) {
      const prev = props[name];
      props[name] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
    }
  });
  return props;
}

function microdata($: cheerio.CheerioAPI): SdEntity[] {
  const out: SdEntity[] = [];
  $("[itemscope]").each((_, el) => {
    if ($(el).is("[itemprop]")) return; // e o proprietate a altui obiect, se citește acolo
    const props = microItem($, el as Element);
    const t = props["@type"];
    out.push({ types: Array.isArray(t) ? (t as string[]) : t ? [String(t)] : [], props, source: "Microdata" });
  });
  return out;
}

// ── RDFa (forma simplă, cu vocabularul schema.org) ──────────────────────────
function rdfaItem($: cheerio.CheerioAPI, scope: Element): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const types = ($(scope).attr("typeof") ?? "").split(/\s+/).filter(Boolean).map(typeName);
  if (types.length) props["@type"] = types.length === 1 ? types[0] : types;
  $(scope).find("[property]").each((_, el) => {
    const owner = $(el).parent().closest("[typeof]").get(0);
    if (owner !== scope) return;
    const $el = $(el);
    const v = $el.is("[typeof]") ? rdfaItem($, el as Element) : $el.attr("content") ?? $el.attr("resource") ?? $el.attr("href") ?? $el.attr("src") ?? $el.text().replace(/\s+/g, " ").trim();
    for (const raw of ($el.attr("property") ?? "").split(/\s+/).filter(Boolean)) {
      if (/^(og|fb|twitter|article|product):/i.test(raw)) continue; // Open Graph nu e schema.org
      const name = typeName(raw);
      const prev = props[name];
      props[name] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
    }
  });
  return props;
}

function rdfa($: cheerio.CheerioAPI): SdEntity[] {
  const out: SdEntity[] = [];
  $("[typeof]").each((_, el) => {
    if ($(el).is("[property]")) return;
    const props = rdfaItem($, el as Element);
    const t = props["@type"];
    out.push({ types: Array.isArray(t) ? (t as string[]) : t ? [String(t)] : [], props, source: "RDFa" });
  });
  return out;
}

/** Toate obiectele schema.org din pagină, din oricare formă. */
export function structuredData($: cheerio.CheerioAPI): SdEntity[] {
  return [...jsonLdNodes($).map(jsonLdEntity), ...microdata($), ...rdfa($)];
}

export const ORG_TYPES = ["Organization", "OnlineStore", "OnlineBusiness", "Store", "LocalBusiness", "Corporation", "HardwareStore", "ElectronicsStore"];
export const isType = (e: SdEntity, ts: string[]) => e.types.some((t) => ts.includes(t));

/** Rezumat scurt pentru dovezi: „JSON-LD: Product, BreadcrumbList · Microdata: Offer”. */
export function sdSummary(es: SdEntity[]): string {
  const by = new Map<SdSource, Set<string>>();
  for (const e of es) {
    if (!by.has(e.source)) by.set(e.source, new Set());
    for (const t of e.types.length ? e.types : ["fără tip"]) by.get(e.source)!.add(t);
  }
  return [...by.entries()].map(([s, ts]) => `${s}: ${[...ts].join(", ")}`).join(" · ") || "nimic";
}

// ── Câmpurile unui produs ──────────────────────────────────────────────────
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
const str = (v: unknown): string | undefined => {
  const x = first(v);
  if (x === undefined || x === null) return undefined;
  if (typeof x === "object") {
    const o = x as Record<string, unknown>;
    return str(o.name ?? o["@id"] ?? o.url);
  }
  const s = String(x).trim();
  return s || undefined;
};

export type ProductFields = {
  name?: string; price?: string; currency?: string; availability?: string; brand?: string;
  gtin?: string; mpn?: string; sku?: string; image?: string; rating?: string;
};

export function productFields(e: SdEntity): ProductFields {
  const p = e.props;
  const offers = (Array.isArray(p.offers) ? p.offers : p.offers ? [p.offers] : []) as Record<string, unknown>[];
  const o = offers.find((x) => x && typeof x === "object") ?? {};
  const spec = (first(o.priceSpecification) ?? {}) as Record<string, unknown>;
  const rating = first(p.aggregateRating) as Record<string, unknown> | undefined;
  return {
    name: str(p.name),
    price: str(o.price ?? o.lowPrice ?? spec.price),
    currency: str(o.priceCurrency ?? spec.priceCurrency),
    availability: str(o.availability)?.replace(/^https?:\/\/schema\.org\//i, ""),
    brand: str(p.brand ?? p.manufacturer),
    gtin: str(p.gtin ?? p.gtin13 ?? p.gtin14 ?? p.gtin12 ?? p.gtin8 ?? p.isbn),
    mpn: str(p.mpn),
    sku: str(p.sku),
    image: str(p.image),
    rating: rating && typeof rating === "object" ? str(rating.ratingValue) : undefined,
  };
}

/**
 * Ce lipsește dintr-un produs, cu numele câmpurilor schema.org, ca magazinul să știe exact ce adaugă.
 * Rating-ul nu e obligatoriu: se pune doar dacă există recenzii reale.
 */
export function missingProductFields(f: ProductFields): string[] {
  const m: string[] = [];
  if (!f.name) m.push("nume (name)");
  if (!f.price) m.push("preț (offers.price)");
  if (!f.currency) m.push("monedă (offers.priceCurrency)");
  if (!f.availability) m.push("stoc (offers.availability)");
  if (!f.brand) m.push("brand");
  if (!f.gtin && !f.mpn) m.push(f.sku ? "GTIN/EAN (gtin13) sau cod producător (mpn), ai doar SKU intern" : "GTIN/EAN (gtin13) sau cod producător (mpn)");
  if (!f.image) m.push("imagine (image)");
  return m;
}

/** Ce am găsit, pe scurt: „preț 3949 RON, stoc InStock, brand DEWALT, GTIN 5035048666883”. */
export function describeProductFields(f: ProductFields): string {
  return [
    f.name && `nume „${f.name.slice(0, 60)}”`,
    f.price && `preț ${f.price}${f.currency ? ` ${f.currency}` : ""}`,
    f.availability && `stoc ${f.availability}`,
    f.brand && `brand ${f.brand}`,
    f.gtin && `GTIN ${f.gtin}`,
    f.mpn && `MPN ${f.mpn}`,
    !f.gtin && !f.mpn && f.sku && `SKU ${f.sku}`,
    f.image && "imagine",
    f.rating && `rating ${f.rating}`,
  ].filter(Boolean).join(", ");
}

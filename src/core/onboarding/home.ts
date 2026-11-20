import type * as cheerio from "cheerio";

/**
 * Ce se vede pe prima pagină a magazinului: categoriile din meniu, mărcile și produsele puse în față.
 * Doar din HTML-ul pe care auditul îl citește oricum (fără cereri în plus), ca propunere pentru profil.
 * Clientul le corectează la pasul „Profil”; nimic de aici nu e trimis la un AI.
 */
export type HomeCatalog = { categories: string[]; brands: string[]; products: string[]; logo?: string | null };

const NOT_CATEGORY = /^(acas[aă]|home|start|contul? meu|cont|login|autentific|[iî]nregistr|co[sș]|co[sș]ul|cart|checkout|contact|despre|about|blog|noutăți|nout[aă]ți|livrare|retur|termeni|condi[tț]ii|gdpr|cookie|confiden|faq|[iî]ntreb[aă]ri|ajutor|help|suport|cariere|anpc|sal|sol|magazine|loca[tț]ii|favorite|wishlist|comenzi|track|urm[aă]rire|toate|vezi tot|mai mult|meniu|menu|search|caut[aă]|kezd[oő]lap|kos[aá]r|fi[oó]k|bel[eé]p[eé]s|kapcsolat|sz[aá]ll[ií]t[aá]s|visszak[uü]ld[eé]s|aszf|adatv[eé]delem|oferte|promo[tț]ii|reduceri|black friday|outlet|lichidare|newsletter|brand(uri)?|m[aă]rci|produc[aă]tori|blog)$/i;
const BRAND_HREF = /\/(brand|brands|marca|marci|producator|producatori|manufacturer|gyarto|marka)(\/|-|$)/i;

const clean = (t: string) => t.replace(/\s+/g, " ").trim();
function uniq(list: string[], max: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    const k = x.toLowerCase();
    if (!x || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
    if (out.length >= max) break;
  }
  return out;
}
const titleCase = (t: string) => (t === t.toUpperCase() && t.length > 3 ? t.charAt(0) + t.slice(1).toLowerCase() : t);

/** Categoriile de pe primul nivel al meniului: texte scurte (1–4 cuvinte), fără paginile de cont, coș sau condiții. */
export function menuCategories($: cheerio.CheerioAPI, max = 10) {
  const found: string[] = [];
  const containers = $("nav, header [class*=menu], [class*=main-menu], [class*=mega], [id*=menu], [class*=categor], [class*=navbar]");
  containers.find("a").each((_, a) => {
    const t = clean($(a).text());
    if (t.length < 3 || t.length > 40 || t.split(" ").length > 4 || /\d{2,}|[|•@]/.test(t)) return;
    if (NOT_CATEGORY.test(t)) return;
    found.push(titleCase(t));
  });
  return uniq(found, max);
}

/** Mărcile: din datele structurate ale produselor, din linkurile spre pagini de marcă și din siglele marcate ca mărci. */
export function homeBrands($: cheerio.CheerioAPI, nodes: Record<string, unknown>[], max = 10) {
  const found: string[] = [];
  for (const n of nodes) {
    const b = (n as { brand?: unknown }).brand;
    const name = typeof b === "string" ? b : (b as { name?: unknown } | undefined)?.name;
    if (typeof name === "string") found.push(clean(name));
  }
  $("a[href]").each((_, a) => {
    if (!BRAND_HREF.test($(a).attr("href") ?? "")) return;
    const t = clean($(a).text()) || clean($(a).find("img").attr("alt") ?? "");
    if (t.length >= 2 && t.length <= 25 && t.split(" ").length <= 3 && !NOT_CATEGORY.test(t)) found.push(titleCase(t));
  });
  $("[class*=brand] img[alt], [class*=producator] img[alt], [class*=manufacturer] img[alt]").each((_, img) => {
    const t = clean($(img).attr("alt") ?? "").replace(/\s*(logo|sigl[aă])\s*/i, "");
    if (t.length >= 2 && t.length <= 25) found.push(titleCase(t));
  });
  return uniq(found, max);
}

/** Produsele puse în față: din datele structurate (Product) și din titlurile cardurilor de produs. */
export function homeProducts($: cheerio.CheerioAPI, nodes: Record<string, unknown>[], max = 8) {
  const found: string[] = [];
  for (const n of nodes) {
    const t = (n as { "@type"?: unknown; name?: unknown });
    const type = Array.isArray(t["@type"]) ? t["@type"].join(",") : String(t["@type"] ?? "");
    if (/Product/.test(type) && typeof t.name === "string") found.push(clean(t.name));
  }
  $('[itemtype*="Product"] [itemprop="name"], .product-title, .product-name, .product-item-name, .woocommerce-loop-product__title, .product-card__title, .card-product .title, [class*=product] h2 a, [class*=product] h3 a').each((_, el) => {
    const t = clean($(el).text());
    if (t.length >= 6 && t.length <= 90) found.push(t);
  });
  return uniq(found, max);
}

/**
 * Sigla magazinului, din ce e deja în HTML-ul primei pagini (fără cereri în plus):
 * Organization.logo din datele structurate, imaginea „logo” din antet, apoi iconițele mari (apple-touch-icon, favicon).
 * Întoarce o adresă absolută http(s) sau null; pagina o afișează ca imagine, cu inițiala ca rezervă.
 */
export function homeLogo($: cheerio.CheerioAPI, nodes: Record<string, unknown>[], pageUrl: string) {
  const found: string[] = [];
  for (const n of nodes) {
    const l = (n as { logo?: unknown }).logo;
    const u = typeof l === "string" ? l : (l as { url?: unknown; contentUrl?: unknown } | undefined)?.url ?? (l as { contentUrl?: unknown } | undefined)?.contentUrl;
    if (typeof u === "string") found.push(u);
  }
  const img = (sel: string) => $(sel).each((_, el) => { const u = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("href") || $(el).attr("content"); if (u) found.push(u); });
  img('header img[class*=logo i], header img[id*=logo i], [class*=logo i] > img, a[class*=logo i] img, [id*=logo i] img, img[alt*=logo i], header svg image');
  img('link[rel~="apple-touch-icon"], link[rel~="apple-touch-icon-precomposed"], link[rel~="icon"][sizes], link[rel~="icon"], link[rel="shortcut icon"]');
  for (const raw of found) {
    if (raw.startsWith("data:")) continue;
    try {
      const u = new URL(raw.trim(), pageUrl);
      if (u.protocol === "https:" || u.protocol === "http:") return u.href.slice(0, 500);
    } catch { /* adresă invalidă */ }
  }
  return null;
}

export function extractHomeCatalog($: cheerio.CheerioAPI, nodes: Record<string, unknown>[], pageUrl = "https://example.invalid/"): HomeCatalog {
  return { categories: menuCategories($), brands: homeBrands($, nodes), products: homeProducts($, nodes), logo: homeLogo($, nodes, pageUrl) };
}

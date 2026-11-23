import type * as cheerio from "cheerio";

/**
 * Ce se vede pe prima pagină a magazinului: categoriile din meniu, mărcile și produsele puse în față.
 * Doar din HTML-ul pe care auditul îl citește oricum (fără cereri în plus), ca propunere pentru profil.
 * Clientul le corectează la pasul „Profil”; nimic de aici nu e trimis la un AI.
 */
export type HomeCatalog = {
  categories: string[]; brands: string[]; products: string[];
  /** Prima siglă găsită și încă două variante, în caz că prima nu se încarcă în browser. */
  logo?: string | null; logos?: string[];
  /** Numele declarat de site (og:site_name, application-name, Organization/WebSite), nu titlul paginii. */
  siteName?: string | null;
  /** Categoriile din meniu cu adresa lor, pentru numărarea paginilor din sitemap (estimare înainte de feed). */
  categoryLinks?: { name: string; href: string }[];
};

const NOT_CATEGORY = /^(acas[aă]|home|start|contul? meu|cont|login|autentific|[iî]nregistr|co[sș]|co[sș]ul|cart|checkout|contact|despre|about|blog|noutăți|nout[aă]ți|livrare|retur|termeni|condi[tț]ii|gdpr|cookie|confiden|faq|[iî]ntreb[aă]ri|ajutor|help|suport|cariere|anpc|sal|sol|magazine|loca[tț]ii|favorite|wishlist|comenzi|track|urm[aă]rire|toate|vezi tot|mai mult|meniu|menu|search|caut[aă]|kezd[oő]lap|kos[aá]r|fi[oó]k|bel[eé]p[eé]s|kapcsolat|sz[aá]ll[ií]t[aá]s|visszak[uü]ld[eé]s|aszf|adatv[eé]delem|oferte|promo[tț]ii|reduceri|black friday|outlet|lichidare|newsletter|brand(uri)?|m[aă]rci|produc[aă]tori|blog)$/i;
const PROMO = /%|promo[tț]i|reduceri|oferte|lichidare|black friday|outlet|cadou|gift|akci[oó]|le[aá]raz[aá]s/i;
const BRAND_HREF = /\/(brand|brands|branduri|marca|marci|producator|producatori|manufacturer|gyarto|marka)(\/|-|$)|[?&](brand|marca|producator|filter_brand|pa_brand|manufacturer)=|\/m\/\d|_brand=/i;

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
  return menuCategoryLinks($, "https://example.invalid/", max).map((c) => c.name);
}

/** Aceleași categorii din meniu, cu adresa absolută a fiecăreia (prima găsită pentru un nume). */
export function menuCategoryLinks($: cheerio.CheerioAPI, pageUrl: string, max = 10) {
  const found: { name: string; href: string }[] = [];
  const containers = $("nav, header [class*=menu], [class*=main-menu], [class*=mega], [id*=menu], [class*=categor], [class*=navbar]");
  containers.find("a").each((_, a) => {
    const t = clean($(a).text());
    if (t.length < 3 || t.length > 40 || t.split(" ").length > 4 || /\d{2,}|[|•@]/.test(t)) return;
    if (NOT_CATEGORY.test(t) || PROMO.test(t)) return;
    let href = "";
    try { href = new URL($(a).attr("href") ?? "", pageUrl).toString(); } catch { href = ""; }
    found.push({ name: titleCase(t), href });
  });
  const seen = new Set<string>();
  const out: { name: string; href: string }[] = [];
  for (const x of found) {
    const k = x.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Câte pagini din sitemap stau sub fiecare categorie din meniu (adresa paginii începe cu adresa categoriei).
 * Sunt pagini, nu produse: o estimare din site până conectăm catalogul. null = nu am putut număra
 * (categoria nu are adresă proprie sau nu avem lista de adrese din sitemap).
 */
export function sitemapPagesPerCategory(links: { name: string; href: string }[], sitemapUrls: string[] | null): { name: string; pages: number | null }[] {
  const paths = sitemapUrls?.map((u) => { try { const x = new URL(u); return x.host.replace(/^www\./, "") + x.pathname.replace(/\/+$/, ""); } catch { return null; } }).filter((x): x is string => !!x) ?? null;
  return links.map(({ name, href }) => {
    let base: string | null = null;
    try { const x = new URL(href); const path = x.pathname.replace(/\/+$/, ""); base = path.split("/").filter(Boolean).length && !x.search ? x.host.replace(/^www\./, "") + path : null; } catch { base = null; }
    if (!paths || !base) return { name, pages: null };
    const b = base;
    return { name, pages: paths.filter((p) => p.startsWith(b + "/")).length };
  });
}

/**
 * Mărci cunoscute (scule, casă și grădină, electrocasnice, electronice, modă, auto, bebe).
 * Le căutăm ca cuvinte întregi în titlu, meniu, titluri de secțiuni și textul alternativ al imaginilor:
 * multe magazine afișează mărcile doar ca sigle sau le pun în titlu („Scule electrice DEWALT”).
 */
const KNOWN_BRANDS = [
  "DeWalt", "Makita", "Bosch", "Stanley", "Black+Decker", "Milwaukee", "Metabo", "Einhell", "Ryobi", "HiKOKI", "Hitachi", "Festool", "Hilti", "AEG",
  "Worx", "Kärcher", "Stihl", "Husqvarna", "Gardena", "Fiskars", "Facom", "Knipex", "Wera", "Wiha", "Bahco", "Irwin", "Total", "Ingco", "Dedra", "Yato",
  "Tolsen", "Proline", "Topex", "Graphite", "Vorel", "Kreator", "Stern", "Ruris", "Scheppach", "Parkside", "Rothenberger", "Ridgid", "Fein", "Flex", "Mafell",
  "Knauf", "Ceresit", "Baumit", "Henkel", "Sika", "Mapei", "Weber", "Rigips", "Adeplast", "Tytan", "Den Braven", "Soudal",
  "Samsung", "Apple", "Xiaomi", "Huawei", "Sony", "LG", "Philips", "Panasonic", "Lenovo", "Asus", "Acer", "HP", "Dell", "Logitech", "JBL",
  "Arctic", "Whirlpool", "Electrolux", "Beko", "Gorenje", "Indesit", "Tefal", "Rowenta", "DeLonghi", "Dyson", "Miele", "Siemens", "Braun", "Heinner",
  "Nike", "Adidas", "Puma", "Reebok", "New Balance", "Skechers", "Under Armour", "Levi's", "Zara", "Michelin", "Continental", "Bosch Professional",
  "Lego", "Chicco", "Pampers", "Hasbro", "Mattel",
];
const BRAND_RE = KNOWN_BRANDS.map((b) => ({ b, re: new RegExp(`(^|[^\\p{L}\\p{N}])${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "iu") }));

/** Mărcile cunoscute numite pe prima pagină, cele mai des întâi. */
export function knownBrandsIn(texts: string[], max = 10) {
  const counts = BRAND_RE.map(({ b, re }) => ({ b, n: texts.filter((t) => re.test(t)).length })).filter((x) => x.n > 0);
  // „Bosch Professional” acoperă și „Bosch”: păstrăm numele mai scurt, mai cunoscut.
  return counts.sort((a, b) => b.n - a.n).map((x) => x.b).filter((b, _, all) => !all.some((o) => o !== b && b.startsWith(`${o} `))).slice(0, max);
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
  $("[class*=brand] img[alt], [class*=producator] img[alt], [class*=manufacturer] img[alt], [id*=brand] img[alt], [class*=partner] img[alt]").each((_, img) => {
    const t = clean($(img).attr("alt") ?? "").replace(/\s*(logo|sigl[aă])\s*/i, "");
    if (t.length >= 2 && t.length <= 25 && !/^(logo|brand|image|img|banner)\b/i.test(t)) found.push(titleCase(t));
  });
  // Mărcile cunoscute din titlu, meniu, titluri și textele alternative ale imaginilor.
  const texts = [
    $("title").text(), $('meta[name="description"]').attr("content") ?? "",
    ...$("nav a, header a, h1, h2, h3, [class*=menu] a").map((_, el) => clean($(el).text())).get(),
    ...$("img[alt]").map((_, el) => $(el).attr("alt") ?? "").get(),
  ].filter(Boolean);
  found.push(...knownBrandsIn(texts, max));
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
  $('[itemtype*="Product"] [itemprop="name"], .product-title, .product-name, .product-item-name, .woocommerce-loop-product__title, .product-card__title, .card-product .title, [class*=product] h2 a, [class*=product] h3 a, [class*=product] h4 a, [class*=product] [class*=title] a, [class*=product] [class*=name] a, a[href*="/produs/"], a[href*="/product/"], a[href*="/termek/"]').each((_, el) => {
    const t = clean($(el).text());
    if (t.length >= 10 && t.length <= 90 && t.split(" ").length >= 2 && !/^(vezi|adaug|cump[aă]r|detalii|mai mult|add to|buy|kos[aá]rba)/i.test(t)) found.push(t);
  });
  return uniq(found, max);
}

/**
 * Sigla magazinului, din ce e deja în HTML-ul primei pagini (fără cereri în plus):
 * Organization.logo din datele structurate, imaginea „logo” din antet, apoi iconițele mari (apple-touch-icon, favicon).
 * Întoarce o adresă absolută http(s) sau null; pagina o afișează ca imagine, cu inițiala ca rezervă.
 */
export function homeLogos($: cheerio.CheerioAPI, nodes: Record<string, unknown>[], pageUrl: string, max = 3) {
  const found: string[] = [];
  for (const n of nodes) {
    const l = (n as { logo?: unknown }).logo;
    const u = typeof l === "string" ? l : (l as { url?: unknown } | undefined)?.url ?? (l as { contentUrl?: unknown } | undefined)?.contentUrl;
    if (typeof u === "string") found.push(u);
  }
  // Imaginile încărcate „leneș” au în src un înlocuitor; adresa reală e în data-src / srcset.
  const firstSrcset = (v?: string) => v?.split(",")[0]?.trim().split(/\s+/)[0];
  const pick = (sel: string) => $(sel).each((_, el) => {
    const e = $(el);
    for (const u of [e.attr("data-src"), e.attr("data-lazy-src"), e.attr("data-original"), firstSrcset(e.attr("data-srcset")), firstSrcset(e.attr("srcset")), e.attr("src"), e.attr("href"), e.attr("content")]) if (u) found.push(u);
  });
  pick('header img[class*=logo i], header img[id*=logo i], [class*=logo i] > img, a[class*=logo i] img, [id*=logo i] img, img[alt*=logo i], [class*=logo i] picture source');
  pick('meta[property="og:logo"], meta[itemprop="logo"]');
  pick('link[rel~="apple-touch-icon"], link[rel~="apple-touch-icon-precomposed"], link[rel~="icon"][sizes], link[rel~="icon"], link[rel="shortcut icon"]');
  const out: string[] = [];
  for (const raw of found) {
    if (raw.startsWith("data:") || /placeholder|lazy|blank|spacer|1x1|pixel/i.test(raw)) continue;
    try {
      const u = new URL(raw.trim(), pageUrl);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      u.protocol = "https:"; // o imagine http nu se încarcă într-o pagină https
      if (!out.includes(u.href)) out.push(u.href.slice(0, 500));
    } catch { /* adresă invalidă */ }
    if (out.length >= max) break;
  }
  return out;
}
export const homeLogo = ($: cheerio.CheerioAPI, nodes: Record<string, unknown>[], pageUrl: string) => homeLogos($, nodes, pageUrl, 1)[0] ?? null;

/** Numele declarat de site: og:site_name, application-name sau numele din datele structurate (Organization, WebSite). */
export function homeSiteName($: cheerio.CheerioAPI, nodes: Record<string, unknown>[]) {
  const meta = $('meta[property="og:site_name"]').attr("content") || $('meta[name="application-name"]').attr("content");
  const ld = nodes.find((n) => /Organization|OnlineStore|Store|WebSite/.test(JSON.stringify((n as { "@type"?: unknown })["@type"] ?? "")) && typeof n.name === "string")?.name as string | undefined;
  const t = clean(meta || ld || "");
  return t.length >= 2 && t.length <= 60 ? t : null;
}

export function extractHomeCatalog($: cheerio.CheerioAPI, nodes: Record<string, unknown>[], pageUrl = "https://example.invalid/"): HomeCatalog {
  const logos = homeLogos($, nodes, pageUrl);
  return { categories: menuCategories($), categoryLinks: menuCategoryLinks($, pageUrl), brands: homeBrands($, nodes), products: homeProducts($, nodes), logo: logos[0] ?? null, logos, siteName: homeSiteName($, nodes) };
}

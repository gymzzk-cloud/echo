import { brandLabel } from "./ai/extract";
import { isStoreLike } from "./ai/domains";
import { MARKETPLACES } from "./rivals";

/**
 * Ce fel de site e o sursă citată de AI și ce poate face magazinul acolo.
 * Regula (KNOWLEDGE A0, A20, B18, B19, B32): recomandăm doar locuri unde magazinul chiar poate apărea
 * (comparatoare, recenzii, directoare, presă, forumuri, video, marketplace-uri). Nu îi spunem să „contacteze”
 * un alt magazin, site-ul unui producător sau propriul magazin. Un site pe care nu-l recunoaștem sigur
 * se arată ca „magazin sau alt site”, nu ca „editorial / blog”.
 */
export type SourceKind =
  | "site propriu" | "concurent" | "magazin sau alt site" | "marketplace" | "producător"
  | "comparator" | "recenzii" | "director de firme" | "forum" | "video" | "presă / blog";

export type SourceCtx = {
  /** Domeniul magazinului și ale celorlalte magazine ale aceluiași client. */
  ownDomains: string[];
  competitorDomains: string[];
  /** Mărcile din catalog (Bosch, Makita …): bosch-professional.com e site de producător, nu loc de listare. */
  brands: string[];
};

const has = (d: string, re: RegExp) => re.test(`.${d}.`);
const COMPARATOR = /[.-](compari|pricy|price|shopmania|pricespy|pricerunner|idealo|geizhals|arukereso|e-catalog|kelkoo|skinflint|ceneo|heureka)[.-]/;
/** Site-uri care compară oferte de la mai multe magazine, fără cuvânt-cheie în nume (verificate de mână, B55). */
const COMPARATOR_SITES = new Set(["discount.ro", "pretarena.ro", "skroutz.ro", "pretistoric.ro", "price.ro", "pricy.ro", "compari.ro", "arukereso.hu", "argep.hu", "olcsobbat.hu"]);
const REVIEWS = /[.-](trustpilot|capterra|reviews|recenzii|parerimagazin|pareri|trusted|feefo|reviewcentre|sitejabber)[.-]/;
const DIRECTORY = /[.-](cylex|firmadeaur|citymaps|listafirme|termene|risco|infocui|paginiaurii|firme|romanian-companies|companiesromania|opencorporates|totalfirme)[.-]/;
const FORUM = /[.-](forum|reddit|softpedia|quora|dealabs|hotukdeals)[.-]/;
const VIDEO = /[.-](youtube|youtu|tiktok|vimeo)[.-]/;
const MEDIA = /[.-](wiki|wikipedia|medium|blog|news|stiri|digi24|hotnews|ziare|adevarul|libertatea|protv|mediafax|g4media|playtech|zf|wall-street|economica|go4it|start-up|coupert|cupoane)[.-]/;
const MARKET_EXTRA = /[.-](ebay|amazon|okazii|olx|vatera|jofogas|allegro|aliexpress)[.-]/;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/**
 * Doar adresele magazinului analizat (și subdomeniile lor). Aceeași marcă pe alt TLD (shopexpert.ro pentru shopexpert.com)
 * sau alt magazin al aceluiași proprietar e un magazin distinct (ZoZo, 24.11.2026, KNOWLEDGE A21).
 */
export function isOwnDomain(domain: string, ownDomains: string[]) {
  return ownDomains.some((o) => domain === o || domain.endsWith(`.${o}`));
}

/** bosch-professional.com, makitatools.com, makita.ca: eticheta domeniului începe cu o marcă din catalog. */
export function isBrandSite(domain: string, brands: string[]) {
  const label = brandLabel(domain);
  return brands.map(norm).some((b) => b.length >= 4 && label.startsWith(b));
}

/** Comparator de prețuri: discount.ro, pricy.ro, polizor-unghiular.compari.ro … (nu un magazin concurent). */
export function isComparatorDomain(domain: string) {
  return COMPARATOR_SITES.has(baseDomain(domain)) || has(domain, COMPARATOR);
}

/** Domeniul de bază: polizor-unghiular.compari.ro → compari.ro, ebay.co.uk → ebay.co.uk. */
export function baseDomain(domain: string) {
  const parts = domain.toLowerCase().replace(/^www\./, "").split(".");
  const n = parts.length >= 3 && /^(co|com|org|net)$/.test(parts[parts.length - 2]) ? 3 : 2;
  return parts.slice(-n).join(".");
}

/**
 * Sub ce nume grupăm o sursă: subdomeniile unui comparator (roaba.compari.ro, multi-cutter.compari.ro) sunt
 * același comparator, deci o singură recomandare, cu toate răspunsurile adunate.
 */
export function sourceGroup(domain: string, kind: SourceKind) {
  return kind === "comparator" || kind === "marketplace" ? baseDomain(domain) : domain;
}

/**
 * Un marketplace din altă țară (ebay.com, amazon.co.uk pentru un magazin din România) nu e un loc realist
 * pentru magazin: nu-l recomandăm. Cele locale (.ro / .hu) și cele cunoscute din țară rămân.
 */
export function localMarketplace(domain: string, country: string) {
  const tld = country.toLowerCase();
  return domain.endsWith(`.${tld}`) || MARKETPLACES.has(domain);
}

export function sourceKind(domain: string, ctx: SourceCtx): SourceKind {
  if (isOwnDomain(domain, ctx.ownDomains)) return "site propriu";
  // Un comparator nu e concurent, chiar dacă AI-ul l-a numit ca loc de cumpărare (discount.ro listează oferte de la magazine).
  if (isComparatorDomain(domain)) return "comparator";
  if (ctx.competitorDomains.includes(domain)) return "concurent";
  if (MARKETPLACES.has(domain) || has(domain, MARKET_EXTRA)) return "marketplace";
  if (has(domain, REVIEWS)) return "recenzii";
  if (has(domain, DIRECTORY)) return "director de firme";
  if (has(domain, FORUM)) return "forum";
  if (has(domain, VIDEO)) return "video";
  if (isBrandSite(domain, ctx.brands)) return "producător";
  if (has(domain, MEDIA) || !isStoreLike(domain)) return "presă / blog";
  return "magazin sau alt site";
}

/** Ce poate face magazinul la o sursă. null = nimic de recomandat (alt magazin, producător, propriul site). */
export const SOURCE_ADVICE: Partial<Record<SourceKind, string>> = {
  // Un comparator își ia singur datele (de pe site sau dintr-un feed): magazinul poate cere listarea sau corectarea,
  // nu poate schimba direct ce scrie acolo (ZoZo, 24.11.2026, B56).
  comparator: "Vezi dacă apari acolo și cu ce date. Dacă datele despre tine sunt greșite (preț, stoc), cere corectarea comparatorului, prin formularul lor de contact: tu nu le poți schimba direct. Dacă nu apari, poți cere listarea (de obicei cu cost, fără garanția recomandării).",
  recenzii: "Cere clienților recenzii aici (după livrare) și răspunde la cele existente.",
  "director de firme": "Verifică și completează fișa firmei: nume, adresă, telefon, site.",
  forum: "Răspunde util la discuțiile despre categoria ta (fără reclamă agresivă).",
  video: "Un video scurt de prezentare sau comparație, cu link spre produs.",
  marketplace: "Dacă vinzi și aici, completează fișele de produs; recenziile contează.",
  "presă / blog": "Propune un articol, un test de produs sau intră în topurile lor („cele mai bune …”).",
};

export const canAct = (k: SourceKind) => !!SOURCE_ADVICE[k];

/**
 * Domeniile din mențiuni care nu sunt concurenți: magazinele aceluiași client, site-urile producătorilor
 * (Bosch Professional nu e un magazin care „apare în locul tău”) și site-urile care nu vând (platform.openai.com).
 */
export function notRivals(domains: Iterable<string>, ctx: Pick<SourceCtx, "ownDomains" | "brands">): string[] {
  return [...new Set(domains)].filter((d) => isOwnDomain(d, ctx.ownDomains) || isBrandSite(d, ctx.brands) || isComparatorDomain(d) || !isStoreLike(d));
}

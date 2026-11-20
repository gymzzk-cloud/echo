/**
 * Ce fel de site e un domeniu și dacă ține de piața magazinului. Folosit la extragerea mențiunilor,
 * la concurenți și la cote: un director de firme sau o pagină Trustpilot nu e un magazin,
 * iar shopexpert.dk (Danemarca) nu e ShopExpert România.
 */

/** Site-uri care nu vând: comparatoare, forumuri, presă, recenzii, directoare de firme, rețele sociale, AI-uri. */
const NON_STORE = /(^|[.-])(wiki|wikipedia|reddit|youtube|youtu|facebook|instagram|tiktok|twitter|linkedin|pinterest|quora|medium|github|forum|blog|news|stiri|digi24|hotnews|ziare|adevarul|libertatea|protv|mediafax|g4media|playtech|zf|wall-street|economica|index|444|telex|hvg|origo|24|portfolio|compari|pricy|arukereso|shopmania|price|pricerunner|idealo|trustpilot|anpc|reviews|recenzii|firmadeaur|citymaps|listafirme|termene|risco|infocui|cylex|paginiaurii|firme|romanian-companies|companiesromania|opencorporates|google|bing|openai|chatgpt|anthropic|claude|gemini|perplexity)[.-]/;
const NON_STORE_EXACT = new Set(["x.com", "t.co", "gov.ro", "gov.hu"]);

export function isStoreLike(domain: string) {
  if (NON_STORE_EXACT.has(domain) || /\.(gov|edu)(\.|$)/.test(domain)) return false;
  return !NON_STORE.test(`.${domain}.`);
}

/** Terminațiile valabile pe o piață: cea a țării plus cele generale. */
const GENERIC_TLD = new Set(["com", "eu", "net", "org", "shop", "store", "online"]);
export const tldOf = (domain: string) => domain.toLowerCase().split(".").pop() ?? "";

/** Domeniul ține de piața magazinului (RO: .ro sau generic; HU: .hu sau generic)? shopexpert.dk pe piața RO: nu. */
export function inMarket(domain: string, country: string | null | undefined) {
  const t = tldOf(domain);
  if (GENERIC_TLD.has(t)) return true;
  if (!country) return t === "ro" || t === "hu";
  return t === country.toLowerCase();
}

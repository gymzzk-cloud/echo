import { politeFetch } from "./polite";
import { endpointFromOpenApi, feedAuth, findItems, getText, isOpenApi, mapRecord, withQuery, type CatalogItem, type ConnectorKind } from "./index";

/**
 * Ce produse se vând cel mai bine, pe fiecare platformă, ca întrebările urmărite să fie despre produsele importante.
 * O singură listă scurtă (primele ~100–200), o dată la sincronizare: câteva cereri în plus, nu tot catalogul.
 *
 * Surse, în ordinea încrederii:
 *  - câmpurile din feed: vânzări (sales_30d, total_sales…), rang (sales_rank) sau etichetă „bestseller”;
 *  - ordonarea „cele mai vândute” a platformei: WooCommerce (popularity = total_sales), Shopify (best-selling),
 *    API-uri OpenAPI care declară sort=popularity.
 * O ordonare care întoarce exact aceeași listă ca ordinea obișnuită e ignorată: unele API-uri o declară, dar n-o aplică.
 */

export const POPULAR_TOP = 200;

/** Din câmpurile feed-ului: vânzări (desc), apoi rang (asc), apoi bestseller. Întoarce ID-urile externe, în ordine. */
export function rankFromItems(items: CatalogItem[], top = POPULAR_TOP): string[] {
  const inStock = items.filter((i) => i.inStock);
  const bySales = inStock.filter((i) => (i.sales ?? 0) > 0).sort((a, b) => b.sales! - a.sales!);
  const byRank = inStock.filter((i) => (i.salesRank ?? 0) > 0).sort((a, b) => a.salesRank! - b.salesRank!);
  const flagged = inStock.filter((i) => i.bestseller);
  // Un câmp „popularity” cu aceeași valoare peste tot nu spune nimic.
  const distinct = (xs: CatalogItem[], f: (i: CatalogItem) => unknown) => new Set(xs.map(f)).size > 1;
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (xs: CatalogItem[]) => { for (const i of xs) { if (out.length >= top) return; if (!seen.has(i.externalId)) { seen.add(i.externalId); out.push(i.externalId); } } };
  if (bySales.length && distinct(bySales, (i) => i.sales)) add(bySales);
  if (byRank.length && distinct(byRank, (i) => i.salesRank)) add(byRank);
  if (flagged.length < inStock.length * 0.5) add(flagged); // „bestseller” pe jumătate din catalog nu e un semnal
  return out;
}

/** Ordonarea „populare” e reală doar dacă diferă de ordinea obișnuită. */
export function differentOrder(popular: string[], plain: string[], n = 20) {
  const a = popular.slice(0, n), b = plain.slice(0, n);
  if (!a.length) return false;
  return a.length !== b.length || a.some((x, i) => x !== b[i]);
}

async function json(url: string) {
  const r = await politeFetch(url, { headers: { accept: "application/json" }, timeoutMs: 30000 });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

async function shopify(base: string) {
  const ids = async (sort?: string) => ((await json(`${base}/collections/all/products.json?limit=250${sort ? `&sort_by=${sort}` : ""}`)).products ?? []).map((p: { id: number }) => String(p.id));
  return [await ids("best-selling"), await ids()] as const;
}

async function woo(base: string) {
  const ids = async (q: string) => ((await json(`${base}/wp-json/wc/store/v1/products?per_page=100${q}`)) as { id: number }[]).map((p) => String(p.id));
  return [await ids("&orderby=popularity&order=desc"), await ids("")] as const;
}

async function openApi(url: string, currency: string, secret?: string) {
  const spec = isOpenApi((await getText(url, feedAuth(secret))).body);
  const ep = spec && endpointFromOpenApi(spec, url);
  if (!ep?.popularSort) return null;
  const auth = feedAuth(secret, ep.scheme);
  // Fără „details”: ne trebuie doar ID-urile, cererea rămâne mică.
  const params = ep.params.filter(([k]) => !["details", "full", "expand"].includes(k));
  const page = async (extra: [string, string][]) => {
    const q: [string, string][] = [...params, ...extra];
    if (ep.limitParam) q.push([ep.limitParam, String(Math.min(POPULAR_TOP, ep.limit))]);
    const doc = JSON.parse((await getText(withQuery(ep.url, q), auth, { accept: "application/json" })).body);
    return findItems(doc).map((r) => mapRecord(r, currency)).filter((i) => i.inStock).map((i) => i.externalId);
  };
  return [await page([ep.popularSort]), await page([])] as const;
}

/**
 * Lista „cele mai vândute” de la platformă, sau null dacă platforma nu o are (sau o declară fără s-o aplice).
 * `items` = catalogul tocmai citit (pentru câmpurile de vânzări din feed), dacă îl avem.
 */
export async function fetchPopular(kind: ConnectorKind, url: string, currency: string, secret?: string, items: CatalogItem[] = []): Promise<string[] | null> {
  const fromFeed = rankFromItems(items);
  if (fromFeed.length) return fromFeed;
  let pair: readonly [string[], string[]] | null = null;
  if (kind === "shopify") pair = await shopify(url);
  else if (kind === "woocommerce") pair = await woo(url);
  // Doar pentru o specificație OpenAPI: un feed-fișier nu are ordonări, iar recitirea lui ar costa magazinul.
  else if (kind === "feed" && /openapi|swagger/i.test(url)) pair = await openApi(url, currency, secret);
  if (!pair || !differentOrder(pair[0], pair[1])) return null;
  return pair[0].slice(0, POPULAR_TOP);
}

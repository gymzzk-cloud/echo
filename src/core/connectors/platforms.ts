import { mapRecord, type CatalogItem } from "./index";

/**
 * Conectori prin API pentru platformele locale. Cheile vin criptate din baza de date și se decriptează doar aici.
 * Toți folosesc același mapper (mapRecord), deci tolerează diferențe de câmpuri între versiuni.
 * Stare: scrise după documentația publică a fiecărei platforme. Se validează pe primul magazin real cu cheie.
 */

const UA = "EchoCatalogBot/1.0 (+https://echo.ai/bot)";
const MAX = 20000;

async function getJson(url: string, headers: Record<string, string>) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json", ...headers }, signal: AbortSignal.timeout(30000) });
  if (r.status === 401 || r.status === 403) throw new Error("Cheia API a fost refuzată. Verifică cheia și drepturile de citire a produselor.");
  if (!r.ok) throw new Error(`${new URL(url).host} → HTTP ${r.status}`);
  return r.json();
}
const basic = (user: string, pass = "") => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
const values = (x: unknown): Record<string, unknown>[] => Array.isArray(x) ? x : x && typeof x === "object" ? Object.values(x as object) : [];

// ── Gomag: api.gomag.ro, antete Apikey + ApiShop ───────────────────────────
export async function fetchGomag(base: string, apiKey: string, currency = "RON"): Promise<CatalogItem[]> {
  const out: CatalogItem[] = [];
  for (let page = 1; page <= 400 && out.length < MAX; page++) {
    const d = await getJson(`https://api.gomag.ro/api/v1/product/read/json?page=${page}&limit=100`, { Apikey: apiKey, ApiShop: base });
    const list = values(d.products);
    if (!list.length) break;
    for (const p of list) {
      const brand = (p.brand as { name?: string } | undefined)?.name;
      const cat = values(p.categories)[0] as { name?: string } | undefined;
      out.push(mapRecord({ ...p, brand: brand ?? p.brand, category: cat?.name, image: values(p.images)[0] ?? p.image }, currency));
    }
    if (d.pages && page >= Number(d.pages)) break;
  }
  return out.filter((p) => p.title && p.url);
}

// ── MerchantPro: /api/v2/products, Basic auth cheie:secret ─────────────────
export async function fetchMerchantPro(base: string, credentials: string, currency = "RON"): Promise<CatalogItem[]> {
  const [key, secret = ""] = credentials.split(":");
  const out: CatalogItem[] = [];
  for (let start = 0; start < MAX; start += 100) {
    const d = await getJson(`${base}/api/v2/products?start=${start}&limit=100`, { authorization: basic(key, secret) });
    const list = values(d.data ?? d.products ?? d);
    if (!list.length) break;
    for (const p of list) out.push(mapRecord({ ...p, price: p.price_gross ?? p.price, url: p.url ?? p.permalink, image: values(p.images)[0] ?? p.image }, currency));
    if (list.length < 100) break;
  }
  return out.filter((p) => p.title && p.url);
}

// ── PrestaShop: Webservice API, cheia ca utilizator Basic auth ─────────────
export async function fetchPrestaShop(base: string, apiKey: string, currency = "RON"): Promise<CatalogItem[]> {
  const ml = (v: unknown) => Array.isArray(v) ? String((v[0] as { value?: string })?.value ?? "") : String(v ?? "");
  const out: CatalogItem[] = [];
  for (let start = 0; start < MAX; start += 100) {
    const d = await getJson(`${base}/api/products?output_format=JSON&display=full&filter[active]=1&limit=${start},100`, { authorization: basic(apiKey) });
    const list = values(d.products);
    if (!list.length) break;
    for (const p of list) {
      const id = String(p.id);
      out.push(mapRecord({
        id, name: ml(p.name), description: ml(p.description_short) || ml(p.description), price: p.price, ean: p.ean13 || p.upc,
        url: `${base}/index.php?controller=product&id_product=${id}`,
        image: p.id_default_image ? `${base}/api/images/products/${id}/${p.id_default_image}` : "",
        stock: p.quantity ?? "", brand: p.manufacturer_name,
      }, currency));
    }
    if (list.length < 100) break;
  }
  return out.filter((p) => p.title && p.url);
}

/** Pentru platformele fără API simplu (Shoprenter, Unas, OpenCart) folosim feed-ul lor de export. Aici spunem unde îl găsește magazinul. */
export const FEED_HINTS: Record<string, string> = {
  gomag: "Gomag: Setări → API (cheie) sau Marketing → Feed-uri produse (link XML).",
  merchantpro: "MerchantPro: Setări → API (cheie:secret) sau Marketing → Feed-uri (link XML).",
  prestashop: "PrestaShop: Parametri avansați → Webservice → adaugă cheie cu drept GET pe products.",
  shoprenter: "Shoprenter: Beállítások → Export (termékexport XML/CSV), copiază linkul.",
  unas: "Unas: Termékek → Export → Google Shopping vagy Árukereső XML link.",
  opencart: "OpenCart: extensia Google Merchant Center / Product Feed, copiază linkul feed-ului.",
};

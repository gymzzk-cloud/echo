import { XMLParser } from "fast-xml-parser";
import { politeFetch, UA } from "./polite";
import { parse as parseYaml } from "yaml";

/**
 * Conectori de catalog. Fiecare platformă are un adaptor cu aceeași ieșire.
 * Date publice (fără chei) pentru Shopify și WooCommerce, plus feed în orice format (XML, JSON, YAML, CSV) pentru orice platformă.
 * Faza 2: Gomag, MerchantPro, Shoprenter, Unas, PrestaShop, OpenCart prin API-urile lor (chei criptate).
 */

export type CatalogItem = {
  externalId: string;
  title: string;
  url: string;
  price: number | null;
  currency: string;
  inStock: boolean;
  brand?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  gtin?: string | null;
  description?: string | null;
  cartUrl?: string | null;
  delivery?: string | null;
};
export type ConnectorKind = "shopify" | "woocommerce" | "feed" | "gomag" | "merchantpro" | "prestashop" | "upload";
export const API_KINDS = ["gomag", "merchantpro", "prestashop"] as const;

const MAX_ITEMS = 100000;

async function fetchJson(url: string) {
  const r = await politeFetch(url, { headers: { accept: "application/json" }, timeoutMs: 20000 });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  const ct = r.headers.get("content-type") ?? "";
  if (!ct.includes("json")) throw new Error(`${url} nu a întors JSON`);
  return r.json();
}

const stripHtml = (s?: string | null) => (s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() || null;

// ── Shopify (endpoint public /products.json) ───────────────────────────────
export async function fetchShopify(base: string, currency = "RON"): Promise<CatalogItem[]> {
  const out: CatalogItem[] = [];
  for (let page = 1; page <= 100 && out.length < MAX_ITEMS; page++) {
    const data = await fetchJson(`${base}/products.json?limit=250&page=${page}`);
    const list = (data.products ?? []) as Record<string, any>[];
    if (!list.length) break;
    for (const p of list) {
      const v = (p.variants ?? [])[0] ?? {};
      out.push({
        externalId: String(p.id),
        title: p.title,
        url: `${base}/products/${p.handle}`,
        cartUrl: v.id ? `${base}/cart/${v.id}:1` : null,
        price: v.price ? parseFloat(v.price) : null,
        currency,
        inStock: (p.variants ?? []).some((x: any) => x.available !== false),
        brand: p.vendor || null,
        category: p.product_type || null,
        imageUrl: p.images?.[0]?.src ?? null,
        gtin: v.barcode || null,
        description: stripHtml(p.body_html)?.slice(0, 2000) ?? null,
      });
    }
  }
  return out;
}

// ── WooCommerce (Store API public) ─────────────────────────────────────────
export async function fetchWoo(base: string): Promise<CatalogItem[]> {
  const out: CatalogItem[] = [];
  for (let page = 1; page <= 200 && out.length < MAX_ITEMS; page++) {
    const list = (await fetchJson(`${base}/wp-json/wc/store/v1/products?per_page=100&page=${page}`)) as Record<string, any>[];
    if (!Array.isArray(list) || !list.length) break;
    for (const p of list) {
      const minor = p.prices?.currency_minor_unit ?? 2;
      const price = p.prices?.price ? parseInt(p.prices.price, 10) / 10 ** minor : null;
      out.push({
        externalId: String(p.id),
        title: stripHtml(p.name) ?? "",
        url: p.permalink,
        cartUrl: p.is_purchasable !== false && p.type === "simple" ? `${base}/?add-to-cart=${p.id}` : null,
        price,
        currency: p.prices?.currency_code ?? "RON",
        inStock: !!p.is_in_stock,
        brand: p.brands?.[0]?.name ?? null,
        category: p.categories?.[0]?.name ?? null,
        imageUrl: p.images?.[0]?.src ?? null,
        gtin: p.sku || null,
        description: stripHtml(p.short_description || p.description)?.slice(0, 2000) ?? null,
      });
    }
    if (list.length < 100) break;
  }
  return out;
}

// ── Feed Google Merchant (XML RSS/Atom) sau CSV/TSV ────────────────────────
function parsePrice(v: unknown, fallback: string): { price: number | null; currency: string } {
  if (v === undefined || v === null || v === "") return { price: null, currency: fallback };
  const s = String(v).trim();
  const m = s.match(/([\d.,\s]+)\s*([A-Z]{3})?/);
  if (!m) return { price: null, currency: fallback };
  let n = m[1].replace(/\s/g, "");
  if (/,\d{1,2}$/.test(n)) n = n.replace(/\./g, "").replace(",", ".");
  else n = n.replace(/,/g, "");
  return { price: parseFloat(n), currency: m[2] ?? fallback };
}

// Sinonime de coloane/chei: Google Merchant, exporturi românești și maghiare.
const KEYS = {
  id: ["id", "sku", "cod", "code", "product_id", "item_id", "cikkszam", "cikkszám"],
  title: ["title", "titlu", "nume", "name", "denumire", "product_name", "nev", "név", "termeknev", "terméknév"],
  url: ["link", "url", "product_url", "permalink", "link_produs", "termek_url"],
  price: ["price", "pret", "preț", "price_gross", "regular_price", "ar", "ár", "brutto_ar"],
  sale: ["sale_price", "pret_redus", "preț_redus", "pret_promo", "akcios_ar", "akciós_ár"],
  stock: ["availability", "stoc", "stock", "in_stock", "instock", "quantity", "cantitate", "keszlet", "készlet", "disponibilitate"],
  brand: ["brand", "producator", "producător", "manufacturer", "marca", "marcă", "gyarto", "gyártó"],
  category: ["product_type", "breadcrumbs", "breadcrumb", "category_path", "google_product_category", "subcategory", "categorie", "category", "categoria", "kategoria", "kategória"],
  image: ["image_link", "imagine", "image", "image_url", "kep", "kép"],
  gtin: ["gtin", "ean", "ean13", "barcode", "mpn", "cod_bare"],
  description: ["short_description", "description", "descriere", "leiras", "leírás"],
  delivery: ["delivery_time", "termen_livrare", "livrare", "shipping_time", "szallitas", "szállítás"],
  shipping: ["shipping_cost", "cost_livrare", "transport", "shipping_price"],
  currency: ["currency", "moneda", "monedă", "penznem", "pénznem"],
} as const;

const norm = (k: string) => k.toLowerCase().trim().replace(/^g:/, "").replace(/\s+/g, "_");
const scalar = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return scalar(v[0]);
  if (typeof v === "object") { const o = v as Record<string, unknown>; return scalar(o["#text"] ?? o["@_href"] ?? o.url ?? o.src ?? o.value ?? o.name ?? ""); }
  return String(v).trim();
};

/** Stocul poate veni ca text („in stock”, „indisponibil”), boolean sau cantitate. */
export function parseStock(v: string): boolean {
  const t = v.toLowerCase().trim();
  if (!t) return true;
  if (/^-?\d+([.,]\d+)?$/.test(t)) return parseFloat(t.replace(",", ".")) > 0;
  if (["false", "no", "nu", "nem", "0"].includes(t)) return false;
  return !/out[ _-]?of[ _-]?stock|indisponibil|epuizat|stoc epuizat|nincs|elfogyott|discontinued/.test(t);
}

/** Descrierea scurtă + atributele tehnice (Putere: 550 W; …): exact ce caută un agent AI când compară. */
function describe(m: Map<string, unknown>, text: string) {
  const attrs = m.get("attributes") ?? m.get("atribute") ?? m.get("specs") ?? m.get("specificatii");
  let a = "";
  if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
    a = Object.entries(attrs as Record<string, unknown>).filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
      .map(([k, v]) => `${k.trim()}: ${String(v).trim()}`).join("; ");
  }
  const out = [stripHtml(text), a].filter(Boolean).join(". ");
  return out ? out.slice(0, 2000) : null;
}

function deliveryText(time: string, cost: string, currency: string) {
  const c = cost ? parsePrice(cost, currency) : null;
  const parts = [time || null, c?.price === 0 ? "transport gratuit" : c?.price ? `transport ${c.price} ${c.currency}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ").slice(0, 200) : null;
}

/** Transformă un rând (CSV) sau un obiect (JSON/YAML/XML) într-un produs, după sinonimele de mai sus. */
export function mapRecord(rec: Record<string, unknown>, currency = "RON"): CatalogItem {
  const m = new Map<string, unknown>();
  for (const [k, v] of Object.entries(rec)) m.set(norm(k), v);
  const get = (names: readonly string[]) => { for (const n of names) { const v = scalar(m.get(n)); if (v) return v; } return ""; };
  const cur = get(KEYS.currency) || currency;
  const sale = parsePrice(get(KEYS.sale), cur);
  const reg = parsePrice(get(KEYS.price), cur);
  const pr = sale.price ? sale : reg;
  const url = get(KEYS.url);
  return {
    externalId: get(KEYS.id) || url,
    title: stripHtml(get(KEYS.title)) ?? "",
    url,
    price: pr.price,
    currency: pr.currency,
    inStock: parseStock(get(KEYS.stock)),
    brand: get(KEYS.brand) || null,
    category: get(KEYS.category) || null,
    imageUrl: get(KEYS.image) || null,
    gtin: get(KEYS.gtin) || null,
    description: describe(m, get(KEYS.description)),
    delivery: deliveryText(get(KEYS.delivery), get(KEYS.shipping), cur),
  };
}

/** Găsește lista de produse într-un document JSON/YAML/XML, oricum s-ar numi cheia. */
function findItems(doc: unknown, depth = 0): Record<string, unknown>[] {
  if (Array.isArray(doc)) return doc.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  if (!doc || typeof doc !== "object" || depth > 4) return [];
  const o = doc as Record<string, unknown>;
  for (const k of ["item", "items", "products", "product", "produse", "produs", "entry", "entries", "offers", "offer", "termekek", "termék", "data", "feed", "channel", "rss", "catalog", "shop"]) {
    if (k in o) { const r = findItems(o[k], depth + 1); if (r.length) return r; if (o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) && ("title" in (o[k] as object) || "id" in (o[k] as object))) return [o[k] as Record<string, unknown>]; }
  }
  // Altfel: cea mai lungă listă de obiecte găsită oriunde
  let best: Record<string, unknown>[] = [];
  for (const v of Object.values(o)) { const r = findItems(v, depth + 1); if (r.length > best.length) best = r; }
  return best;
}

export type FeedFormat = "xml" | "json" | "yaml" | "csv";
export function detectFormat(body: string): FeedFormat {
  const t = body.trimStart();
  if (t.startsWith("<")) return "xml";
  if (t.startsWith("{") || t.startsWith("[")) return "json";
  const first = t.split(/\r?\n/, 1)[0];
  if (t.startsWith("---") || /^[\w"'-]+:\s*(\S.*)?$/.test(first) || /^-\s+\w+:/.test(first)) return "yaml";
  return "csv";
}

/** Feed de produse în orice format: Google XML (RSS/Atom), JSON, YAML sau CSV/TSV. */
export function parseFeed(body: string, currency = "RON"): CatalogItem[] {
  const fmt = detectFormat(body);
  let records: Record<string, unknown>[];
  if (fmt === "xml") {
    const xml = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, textNodeName: "#text" }).parse(body);
    records = findItems(xml);
  } else if (fmt === "json") {
    records = findItems(JSON.parse(body));
  } else if (fmt === "yaml") {
    records = findItems(parseYamlLenient(body));
  } else {
    records = parseCsv(body);
  }
  return records.slice(0, MAX_ITEMS).map((r) => mapRecord(r, currency)).filter((p) => p.title && p.url);
}

function parseCsv(body: string): Record<string, unknown>[] {
  const lines = body.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const split = (line: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === sep && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  };
  const head = split(lines[0]);
  return lines.slice(1, MAX_ITEMS + 1).map((l) => { const r = split(l); return Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])); });
}

// ── Feed sau API cu cheie (inclusiv OpenAPI cu paginare) ───────────────────
// Regula de bază (ADR 0002): citim catalogul cât mai ușor pentru magazin. Cereri prin politeFetch (una odată, cu pauză),
// pagini mari, If-None-Match / If-Modified-Since când serverul le oferă,
// iar dacă nimic nu s-a schimbat (același hash), nu rescriem nimic în baza noastră.

export type FeedAuth = { query: [string, string][]; headers: Record<string, string> };
export type FeedSyncState = { etag?: string | null; lastModified?: string | null };
export type FeedResult = { items: CatalogItem[]; hash: string | null; notModified: boolean; requests: number; etag?: string | null; lastModified?: string | null };

/**
 * Cheia unui feed: „nume=valoare” → parametru în link, „Nume: valoare” → header,
 * doar valoarea → după specificația OpenAPI dacă există, altfel header x-api-key.
 */
export function feedAuth(secret?: string, scheme?: { in: string; name: string } | null): FeedAuth {
  const a: FeedAuth = { query: [], headers: {} };
  const s = secret?.trim();
  if (!s) return a;
  let m = s.match(/^([\w.-]+)=(.+)$/);
  if (m) { a.query.push([m[1], m[2]]); return a; }
  m = s.match(/^([\w-]+):\s*(.+)$/);
  if (m && !/^https?$/i.test(m[1])) { a.headers[m[1]] = m[2]; return a; }
  if (scheme?.in === "query") a.query.push([scheme.name, s]);
  else if (scheme?.in === "header") a.headers[scheme.name] = s;
  else a.headers["x-api-key"] = s;
  return a;
}

function withQuery(url: string, params: [string, string][]) {
  const u = new URL(url);
  for (const [k, v] of params) u.searchParams.set(k, v);
  return u.toString();
}


async function getText(url: string, auth: FeedAuth, extra: Record<string, string> = {}) {
  // politeFetch: o cerere odată pe host, pauză între cereri (CATALOG_PAGE_PAUSE_MS), respectă 429/503 + Retry-After.
  const r = await politeFetch(withQuery(url, auth.query), { headers: { "accept-encoding": "gzip", ...auth.headers, ...extra }, timeoutMs: 90000 });
  if (r.status === 304) return { status: 304, body: "", etag: r.headers.get("etag"), lastModified: r.headers.get("last-modified") };
  if (r.status === 401 || r.status === 403) throw new Error(`Feed → HTTP ${r.status}: cheia lipsește sau nu e acceptată.`);
  if (!r.ok) throw new Error(`Feed → HTTP ${r.status}`);
  return { status: r.status, body: await r.text(), etag: r.headers.get("etag"), lastModified: r.headers.get("last-modified") };
}

type ApiEndpoint = { url: string; params: [string, string][]; pageParam: "offset" | "page" | null; limitParam: string | null; limit: number; scheme: { in: string; name: string } | null };

/** Dintr-o specificație OpenAPI alegem endpoint-ul de listare a produselor (GET, cu paginare). */
export function endpointFromOpenApi(spec: Record<string, unknown>, specUrl: string): ApiEndpoint | null {
  const paths = spec.paths as Record<string, Record<string, { parameters?: { name: string; in?: string; schema?: { maximum?: number; enum?: unknown[] } }[]; description?: string }>> | undefined;
  if (!paths) return null;
  const servers = (spec.servers as { url: string }[] | undefined) ?? [];
  const base = new URL(servers[0]?.url ?? ".", specUrl).toString().replace(/\/$/, "");
  let best: { score: number; path: string; op: (typeof paths)[string][string] } | null = null;
  for (const [path, ops] of Object.entries(paths)) {
    const op = ops.get;
    if (!op) continue;
    const names = (op.parameters ?? []).map((p) => p.name);
    if ((op.parameters ?? []).some((p) => p.in === "path")) continue;
    let score = 0;
    if (/product|produs|search|cauta|catalog|items|feed/i.test(path)) score += 2;
    if (names.includes("offset") || names.includes("page")) score += 3;
    if (names.includes("limit") || names.includes("per_page") || names.includes("page_size")) score += 2;
    if ((op.parameters ?? []).some((p) => p.in === "query" && p.name === "id") && !names.includes("limit")) score -= 4; // detaliu de produs, nu listă
    if (!best || score > best.score) best = { score, path, op };
  }
  if (!best || best.score < 3) return null;
  const ps = best.op.parameters ?? [];
  const names = ps.map((p) => p.name);
  const params: [string, string][] = [];
  // Cerem detaliile complete în listă când API-ul o permite: o singură trecere, fără cereri per produs.
  const details = ps.find((p) => ["details", "full", "expand"].includes(p.name));
  if (details) params.push([details.name, details.schema?.enum?.includes(1) || details.schema?.enum?.includes("1") ? "1" : "true"]);
  const limitParam = ["limit", "per_page", "page_size"].find((n) => names.includes(n)) ?? null;
  const max = ps.find((p) => p.name === limitParam)?.schema?.maximum;
  const descMax = Number(String(best.op.description ?? "").match(/max(?:im(?:um)?)?\s*(\d{2,5})/i)?.[1] ?? 0) || 0;
  const limit = Math.min(max ?? (descMax || (details ? 1000 : 250)), 1000);
  // Schema de autentificare: prima de tip apiKey
  const schemes = ((spec.components as Record<string, unknown> | undefined)?.securitySchemes ?? {}) as Record<string, { type?: string; in?: string; name?: string }>;
  const sc = Object.values(schemes).find((x) => x.type === "apiKey" && x.name && x.in);
  return { url: base + best.path, params, pageParam: names.includes("offset") ? "offset" : names.includes("page") ? "page" : null, limitParam, limit, scheme: sc ? { in: sc.in!, name: sc.name! } : null };
}

/**
 * YAML scris de mână are des valori cu „: ” fără ghilimele (ex. `description: Text (ex: "abc")`), invalid strict.
 * Dacă parsarea strictă eșuează, punem ghilimele pe astfel de valori și mai încercăm o dată.
 */
export function parseYamlLenient(body: string): unknown {
  try { return parseYaml(body, { maxAliasCount: 100 }); } catch (e) {
    const fixed = body.split(/\r?\n/).map((line) => {
      const m = line.match(/^(\s*(?:-\s+)?[\w.$-]+:\s+)([^'"{[|>&*!#\s].*)$/);
      if (!m || !/:\s/.test(m[2])) return line;
      return m[1] + JSON.stringify(m[2].trimEnd());
    }).join("\n");
    if (fixed === body) throw e;
    return parseYaml(fixed, { maxAliasCount: 100 });
  }
}

function isOpenApi(body: string): Record<string, unknown> | null {
  const t = body.trimStart().slice(0, 200);
  if (!/^\{?\s*"?(openapi|swagger)"?\s*:/m.test(t)) return null;
  try {
    const doc = (t.startsWith("{") ? JSON.parse(body) : parseYamlLenient(body)) as Record<string, unknown>;
    return doc && (doc.openapi || doc.swagger) && doc.paths ? doc : null;
  } catch { return null; }
}

const totalOf = (doc: unknown): number | null => {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const o = doc as Record<string, unknown>;
  for (const k of ["total", "total_count", "totalCount", "count", "total_items"]) if (typeof o[k] === "number") return o[k] as number;
  const meta = (o.meta ?? o.pagination) as Record<string, unknown> | undefined;
  return meta ? totalOf(meta) : null;
};

/** Paginăm un API JSON (offset sau page), secvențial și cu pauză între pagini. */
async function fetchPaged(ep: ApiEndpoint, auth: FeedAuth, currency: string) {
  const records: Record<string, unknown>[] = [];
  let requests = 0;
  for (let i = 0; records.length < MAX_ITEMS; i++) {
    const q: [string, string][] = [...ep.params];
    if (ep.limitParam) q.push([ep.limitParam, String(ep.limit)]);
    if (ep.pageParam === "offset") q.push(["offset", String(records.length)]);
    if (ep.pageParam === "page") q.push(["page", String(i + 1)]);
    const { body } = await getText(withQuery(ep.url, q), auth, { accept: "application/json" });
    requests++;
    const doc = JSON.parse(body);
    const page = findItems(doc);
    records.push(...page);
    const total = totalOf(doc);
    if (!ep.pageParam || !page.length || (total !== null && records.length >= total) || (total === null && page.length < ep.limit)) break;
  }
  return { items: records.slice(0, MAX_ITEMS).map((r) => mapRecord(r, currency)).filter((p) => p.title && p.url), requests };
}

const hashItems = async (items: CatalogItem[]) => {
  const { createHash } = await import("node:crypto");
  // Independent de ordine: unele API-uri întorc produsele în altă ordine la fiecare cerere.
  const sorted = [...items].sort((a, b) => (a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0));
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
};

/**
 * Feed în orice format sau API de produse. Linkul poate fi:
 *  - un fișier de feed (XML/CSV/JSON/YAML), cu cheie opțională;
 *  - o specificație OpenAPI (openapi.yaml/json): găsim singuri endpoint-ul de produse și paginarea;
 *  - un endpoint JSON care întoarce „total” + o listă: îl paginăm cu offset.
 */
export async function fetchFeedFull(url: string, currency = "RON", secret?: string, state: FeedSyncState = {}): Promise<FeedResult> {
  const cond: Record<string, string> = {};
  if (state.etag) cond["if-none-match"] = state.etag;
  if (state.lastModified) cond["if-modified-since"] = state.lastModified;
  const first = await getText(url, feedAuth(secret), cond);
  if (first.status === 304) return { items: [], hash: null, notModified: true, requests: 1, etag: state.etag, lastModified: state.lastModified };
  const spec = isOpenApi(first.body);
  if (spec) {
    const ep = endpointFromOpenApi(spec, url);
    if (!ep) throw new Error("Specificația OpenAPI nu are un endpoint de listare a produselor (GET cu limit/offset sau page).");
    const r = await fetchPaged(ep, feedAuth(secret, ep.scheme), currency);
    return { items: r.items, hash: await hashItems(r.items), notModified: false, requests: r.requests + 1 };
  }
  // Endpoint JSON paginat dat direct
  if (detectFormat(first.body) === "json") {
    const doc = JSON.parse(first.body);
    const total = totalOf(doc);
    const page = findItems(doc);
    if (total !== null && page.length < total) {
      const u = new URL(url);
      const limit = Number(u.searchParams.get("limit")) || page.length;
      u.searchParams.delete("offset");
      const r = await fetchPaged({ url: u.toString(), params: [], pageParam: "offset", limitParam: "limit", limit, scheme: null }, feedAuth(secret), currency);
      return { items: r.items, hash: await hashItems(r.items), notModified: false, requests: r.requests + 1 };
    }
  }
  const items = parseFeed(first.body, currency);
  return { items, hash: await hashItems(items), notModified: false, requests: 1, etag: first.etag, lastModified: first.lastModified };
}

export async function fetchFeed(url: string, currency = "RON", secret?: string) {
  return (await fetchFeedFull(url, currency, secret)).items;
}

/** Încearcă automat Shopify, apoi WooCommerce. Întoarce null dacă niciunul nu răspunde public. */
export async function detectConnector(base: string): Promise<ConnectorKind | null> {
  try { const d = await fetchJson(`${base}/products.json?limit=1`); if (Array.isArray(d.products)) return "shopify"; } catch { /* nu e Shopify */ }
  try { const d = await fetchJson(`${base}/wp-json/wc/store/v1/products?per_page=1`); if (Array.isArray(d)) return "woocommerce"; } catch { /* nu e Woo */ }
  return null;
}

export async function fetchCatalog(kind: ConnectorKind, url: string, currency = "RON", secret?: string): Promise<CatalogItem[]> {
  const { fetchGomag, fetchMerchantPro, fetchPrestaShop } = await import("./platforms");
  if (kind === "shopify") return fetchShopify(url, currency);
  if (kind === "woocommerce") return fetchWoo(url);
  if (kind === "upload") throw new Error("Fișierul încărcat nu se poate resincroniza automat. Încarcă-l din nou sau adaugă un link de feed.");
  if ((kind === "gomag" || kind === "merchantpro" || kind === "prestashop") && !secret) throw new Error("Lipsește cheia API.");
  if (kind === "gomag") return fetchGomag(url, secret!, currency);
  if (kind === "merchantpro") return fetchMerchantPro(url, secret!, currency);
  if (kind === "prestashop") return fetchPrestaShop(url, secret!, currency);
  return fetchFeed(url, currency, secret);
}

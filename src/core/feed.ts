import { and, desc, eq, gte, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FeedAction, FeedCondition, FeedFileStats, FeedOutputSettings } from "@/db/schema";
import { cleanGtin, openAiWriter } from "./feed-channels/openai";
import { normalizeText } from "@/lib/util";
import { ERROR_MODEL } from "./ai/types";

/**
 * Optimizarea feed-ului (în stilul Channable): etichete automate, reguli „dacă… atunci…”,
 * modificări aprobate (titluri) și ieșiri pe canale (Google, Meta, TikTok, OpenAI, Compari, Árukereső, eMAG, Glami).
 * Catalogul original nu se modifică: totul se aplică la generarea feed-ului, deci orice se poate anula.
 */

export const CHANNELS = [
  { id: "google", name: "Google Merchant Center", format: "xml" },
  { id: "meta", name: "Meta (Facebook, Instagram)", format: "xml" },
  { id: "tiktok", name: "TikTok Shop / Catalog", format: "xml" },
  { id: "openai", name: "ChatGPT (feed OpenAI)", format: "csv" },
  { id: "compari", name: "Compari.ro", format: "xml" },
  { id: "arukereso", name: "Árukereső.hu", format: "xml" },
  { id: "emag", name: "eMAG Marketplace", format: "csv" },
  { id: "glami", name: "Glami", format: "xml" },
] as const;
export type Channel = (typeof CHANNELS)[number]["id"];

export const FIELDS = ["title", "description", "brand", "category", "gtin", "price", "inStock", "label"] as const;

export type FeedProduct = {
  id: string; externalId: string; title: string; description: string | null; url: string; imageUrl: string | null;
  price: number | null; currency: string; inStock: boolean; brand: string | null; category: string | null; gtin: string | null; mpn?: string | null;
  labels: string[];
};

type LabelInput = { id: string; title: string; inStock: boolean; price: string | null; gtin: string | null; imageUrl: string | null; brand: string | null };
/**
 * mentioned = numite de AI; asked = produse despre care am întrebat AI-urile direct și am primit răspuns (30 de zile).
 * Un produs neîntrebat nu primește nicio etichetă AI: nu știm (KNOWLEDGE A0), nu e „fără AI”.
 */
export type LabelContext = { mentioned: Set<string>; asked?: Set<string>; clickN: Map<string, number>; minOther: Map<string, number> };

/** Datele din care se calculează etichetele automate (AI, clicuri, prețuri în alte magazine). Se citesc o dată pe magazin. */
export async function labelContext(projectId: string, domain: string): Promise<LabelContext> {
  // 1. Recomandat de AI: produsele numite în calculul salvat pe produs (cod, link sau numele complet, KNOWLEDGE B26),
  // aceeași sursă ca paginile Produse și „Produse în AI”, nu potrivirea veche după titlul din mențiuni.
  void domain;
  const named = await db.select({ id: schema.productAiStats.productId }).from(schema.productAiStats)
    .where(and(eq(schema.productAiStats.projectId, projectId), dsql`${schema.productAiStats.appearances} > 0`));
  const mentioned = new Set<string>(named.map((x) => x.id));
  // 1b. Întrebate direct: produsele cu o întrebare proprie care a primit un răspuns valid în ultimele 30 de zile.
  const Q = schema.prompts, PR = schema.promptRuns, R = schema.runs;
  const askedRows = await db.selectDistinct({ id: Q.productId }).from(Q).innerJoin(PR, eq(PR.promptId, Q.id)).innerJoin(R, eq(R.id, PR.runId))
    .where(and(eq(Q.projectId, projectId), dsql`${Q.productId} is not null`, dsql`${R.model} is distinct from ${ERROR_MODEL}`, gte(R.runDate, new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10))));
  const asked = new Set<string>(askedRows.map((x) => x.id!));
  // 2. Clicuri din căutarea Echo (popularitate). Filtrăm după magazin, nu după o listă de mii de id-uri.
  const clicks = await db.select({ productId: schema.clicks.productId, n: dsql<number>`count(*)::int` }).from(schema.clicks)
    .where(and(eq(schema.clicks.projectId, projectId), gte(schema.clicks.createdAt, new Date(Date.now() - 30 * 864e5)))).groupBy(schema.clicks.productId);
  const clickN = new Map(clicks.map((c) => [c.productId!, c.n]));
  // 3. Competitivitatea prețului: cel mai mic preț pentru același GTIN în celelalte magazine conectate, calculat în baza de date.
  const others = await db.select({ gtin: schema.products.gtin, min: dsql<string>`min(${schema.products.price})` }).from(schema.products)
    .where(and(dsql`${schema.products.projectId} <> ${projectId}`, dsql`${schema.products.price} is not null`,
      dsql`${schema.products.gtin} in (select ${schema.products.gtin} from ${schema.products} where ${schema.products.projectId} = ${projectId} and ${schema.products.gtin} is not null)`))
    .groupBy(schema.products.gtin);
  const minOther = new Map(others.map((o) => [o.gtin!, parseFloat(o.min)]));
  return { mentioned, asked, clickN, minOther };
}

/** Etichetele unui produs. Funcție pură. */
export function labelsFor(p: LabelInput, ctx: LabelContext) {
  const l: string[] = [];
  const isMentioned = ctx.mentioned.has(p.id);
  if (isMentioned) l.push("recomandat_ai");
  else if (ctx.asked?.has(p.id)) l.push("ai_nu_apare");
  // Clicuri din căutarea Echo: doar „popular” când chiar există. Fără date de vânzări nu punem „fără vânzări” (zombie):
  // lipsa datelor nu e o performanță slabă (ZoZo, 23.11.2026). Revine doar cu vânzări reale de la platformă.
  if ((ctx.clickN.get(p.id) ?? 0) >= 5) l.push("popular");
  l.push(p.inStock ? "in_stoc" : "fara_stoc");
  const price = p.price ? parseFloat(p.price) : null;
  const best = p.gtin ? ctx.minOther.get(p.gtin) : undefined;
  if (price && best !== undefined && !Number.isNaN(best)) l.push(price <= best ? "pret_cel_mai_bun" : price > best * 1.1 ? "pret_peste_piata" : "pret_in_piata");
  if (!p.gtin || !p.imageUrl || !p.brand) l.push("date_lipsa");
  return l;
}

/** Etichete automate, calculate din datele Echo (nu din catalog). */
export async function autoLabels(projectId: string, domain: string, products: LabelInput[]) {
  if (!products.length) return new Map<string, string[]>();
  const ctx = await labelContext(projectId, domain);
  return new Map(products.map((p) => [p.id, labelsFor(p, ctx)]));
}

const get = (p: FeedProduct, f: string): string => f === "label" ? p.labels.join(",") : f === "inStock" ? (p.inStock ? "da" : "nu") : String((p as unknown as Record<string, unknown>)[f] ?? "");

export function matches(p: FeedProduct, c: FeedCondition) {
  const v = get(p, c.field), x = c.value ?? "";
  switch (c.op) {
    case "eq": return c.field === "label" ? p.labels.includes(x) : normalizeText(v) === normalizeText(x);
    case "neq": return c.field === "label" ? !p.labels.includes(x) : normalizeText(v) !== normalizeText(x);
    case "contains": return normalizeText(v).includes(normalizeText(x));
    case "lt": return v !== "" && parseFloat(v) < parseFloat(x);
    case "gt": return v !== "" && parseFloat(v) > parseFloat(x);
    case "empty": return v.trim() === "";
    case "not_empty": return v.trim() !== "";
  }
}

/** Câmpurile pe care le poate folosi textul unei reguli: „{brand} ” pune marca fiecărui produs. */
export const PLACEHOLDERS = ["title", "brand", "category", "gtin", "mpn"] as const;
export function fillPlaceholders(value: string, p: FeedProduct) {
  return value.replace(/\{(title|brand|category|gtin|mpn)\}/g, (_, k: string) => String((p as unknown as Record<string, unknown>)[k] ?? "").trim());
}

/** Aplică regulile în ordinea priorității. Întoarce produsul modificat sau null dacă e exclus. Funcție pură. */
export function applyRules(p: FeedProduct, rules: { conditions: FeedCondition[]; actions: FeedAction[]; channels: string[]; active: boolean }[], channel: string): FeedProduct | null {
  let out = { ...p, labels: [...p.labels] };
  for (const r of rules) {
    if (!r.active || (r.channels.length && !r.channels.includes(channel))) continue;
    if (!r.conditions.every((c) => matches(out, c))) continue;
    for (const a of r.actions) {
      if (a.type === "exclude") return null;
      if (a.type === "label" && a.value) { out.labels.push(a.value); continue; }
      if (!a.field || a.field === "label") continue;
      const cur = get(out, a.field);
      const add = fillPlaceholders(a.value ?? "", out);
      if (!add.trim() && /\{\w+\}/.test(a.value ?? "")) continue; // ex. „{brand} ” la un produs fără marcă
      // Prefix/sufix: nu dublăm ce există deja („Bosch Bosch GSR…”), deci regula se poate aplica de oricâte ori.
      if (a.type !== "set" && add.trim() && normalizeText(cur).includes(normalizeText(add.trim()))) continue;
      const val = a.type === "set" ? add : a.type === "prefix" ? `${add}${cur}` : `${cur}${add}`;
      out = { ...out, [a.field]: a.field === "price" ? parseFloat(val) || out.price : val };
    }
  }
  return out;
}

/** Titlu propus: marcă + tipul produsului + atributele importante, fără majuscule și simboluri inutile. */
export function suggestTitle(p: { title: string; brand: string | null; category: string | null }) {
  let t = p.title.replace(/\s+/g, " ").replace(/[!*]+/g, "").trim();
  if (t === t.toUpperCase() && /[A-Z]{4}/.test(t)) t = t.split(" ").map((w) => (/\d/.test(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())).join(" ");
  if (p.brand && !normalizeText(t).includes(normalizeText(p.brand))) t = `${p.brand} ${t}`;
  const cat = p.category?.split(/[>/|]/).pop()?.trim();
  if (cat && cat.length > 2 && !normalizeText(t).includes(normalizeText(cat).split(" ")[0].slice(0, 6))) t = `${t}, ${cat.toLowerCase()}`;
  return t.slice(0, 150);
}

/**
 * Feed-ul calculat se păstrează 10 minute în memorie (pagina Feed și descărcările canalelor îl refolosesc).
 * Se recalculează când se schimbă catalogul (număr de produse / ultima actualizare) sau când se modifică regulile ori titlurile (invalidateFeed).
 */
const FEED_TTL_MS = 10 * 60_000;
const feedCache = new Map<string, { at: number; stamp: string; value: Awaited<ReturnType<typeof computeFeed>> }>();
export function invalidateFeed() {
  feedCache.clear();
}

const inflight = new Map<string, ReturnType<typeof cachedFeed>>();

export function buildFeed(projectId: string, channel: string) {
  // Cererile simultane pentru același feed (ex. două carduri din pagină) așteaptă același rezultat.
  const key = `${projectId}|${channel}`;
  const running = inflight.get(key);
  if (running) return running;
  const p = cachedFeed(projectId, channel).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function cachedFeed(projectId: string, channel: string) {
  const [st] = await db.select({ n: dsql<number>`count(*)::int`, last: dsql<string>`coalesce(max(${schema.products.updatedAt})::text, '')` })
    .from(schema.products).where(eq(schema.products.projectId, projectId));
  const stamp = `${st.n}|${st.last}`;
  const key = `${projectId}|${channel}`;
  const hit = feedCache.get(key);
  if (hit && hit.stamp === stamp && Date.now() - hit.at < FEED_TTL_MS) return hit.value;
  const value = await computeFeed(projectId, channel);
  feedCache.set(key, { at: Date.now(), stamp, value });
  return value;
}

// Tot catalogul (nu primele 20.000): etichetele și previzualizarea numără toate produsele magazinului.
async function computeFeed(projectId: string, channel: string, limit = 200_000) {
  const base = await loadFeedBase(projectId, limit);
  return { ...base, items: channelItems(base, channel) };
}

/**
 * Datele comune tuturor canalelor: produsele cu titlurile aprobate și etichetele automate, plus regulile.
 * Workerul le citește o singură dată și generează din ele fișierul fiecărui canal pornit.
 */
export async function loadFeedBase(projectId: string, limit = 200_000) {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const products = await db.select().from(schema.products).where(eq(schema.products.projectId, projectId)).limit(limit);
  const edits = await db.select().from(schema.productEdits).innerJoin(schema.products, eq(schema.products.id, schema.productEdits.productId))
    .where(and(eq(schema.products.projectId, projectId), eq(schema.productEdits.status, "aprobat"))).orderBy(desc(schema.productEdits.createdAt));
  const rules = await db.select().from(schema.feedRules).where(eq(schema.feedRules.projectId, projectId)).orderBy(schema.feedRules.priority);
  const labels = await autoLabels(projectId, project.domain, products);
  const editsBy = new Map<string, typeof edits>();
  for (const e of edits) editsBy.set(e.product_edits.productId, [...(editsBy.get(e.product_edits.productId) ?? []), e]);
  const base: FeedProduct[] = products.map((p) => {
    let fp: FeedProduct = {
      id: p.id, externalId: p.externalId, title: p.title, description: p.description, url: p.url, imageUrl: p.imageUrl,
      price: p.price ? parseFloat(p.price) : null, currency: p.currency, inStock: p.inStock, brand: p.brand, category: p.category, gtin: p.gtin, mpn: p.mpn,
      labels: labels.get(p.id) ?? [],
    };
    for (const e of [...(editsBy.get(p.id) ?? [])].reverse()) fp = { ...fp, [e.product_edits.field]: e.product_edits.value };
    return fp;
  });
  // Produsele focus (KNOWLEDGE A0c): verificarea feed-ului le arată primele în lista fiecărei probleme.
  const focus = new Set(products.filter((p) => p.focus).map((p) => p.id));
  return { project, products: base, rules, labels, focus, total: products.length };
}

/** Produsele unui canal: regulile se aplică pe canal (o regulă poate exclude sau modifica produse doar pentru Meta, de ex.). */
export function channelItems(base: { products: FeedProduct[]; rules: Parameters<typeof applyRules>[1] }, channel: string) {
  const out: FeedProduct[] = [];
  for (const p of base.products) {
    const r = applyRules(p, base.rules, channel);
    if (r) out.push(r);
  }
  return out;
}

const x = (s: string | null | undefined) => (s ?? "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
const priceStr = (p: FeedProduct) => (p.price != null ? `${p.price.toFixed(2)} ${p.currency}` : "");

type StoreRef = { name: string; domain: string; pathPrefix?: string; country?: string };
export type FeedWriter = { type: string; head: string; row: (p: FeedProduct) => string | null; foot: string; stats: () => FeedFileStats };

/**
 * Scrie feed-ul unui canal rând cu rând (antet, câte un rând pe produs, final), ca workerul să poată genera
 * cataloage mari pe bucăți, fără să țină tot fișierul în memorie.
 */
export function feedWriter(channel: string, project: StoreRef, settings?: FeedOutputSettings | null): FeedWriter {
  let total = 0, included = 0;
  const counted = (row: (p: FeedProduct) => string | null) => (p: FeedProduct) => { total++; const r = row(p); if (r !== null) included++; return r; };
  const simpleStats = () => ({ total, included, excluded: {}, missing: {} });
  if (channel === "openai") {
    const w = openAiWriter({ ...project, pathPrefix: project.pathPrefix ?? "", country: project.country ?? "RO" }, settings ?? null);
    return { type: "text/csv; charset=utf-8", head: w.head, row: w.row, foot: "", stats: w.stats };
  }
  if (channel === "emag") {
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return { type: "text/csv; charset=utf-8", head: "part_number,name,brand,category,price,currency,stock,ean,url,image\n", foot: "", stats: simpleStats,
      row: counted((p) => `${[p.externalId, p.title, p.brand, p.category, p.price, p.currency, p.inStock ? 1 : 0, p.gtin, p.url, p.imageUrl].map(q).join(",")}\n`) };
  }
  if (channel === "compari" || channel === "arukereso") {
    return { type: "application/xml", head: `<?xml version="1.0" encoding="UTF-8"?>\n<products>\n`, foot: "</products>", stats: simpleStats,
      row: counted((p) => `<product><identifier>${x(p.externalId)}</identifier><manufacturer>${x(p.brand)}</manufacturer><name>${x(p.title)}</name><category>${x(p.category)}</category><product_url>${x(p.url)}</product_url><price>${p.price ?? ""}</price><image_url>${x(p.imageUrl)}</image_url><description>${x(p.description)}</description><ean_code>${x(p.gtin)}</ean_code><delivery_time>${p.inStock ? "1-3" : ""}</delivery_time></product>\n`) };
  }
  // Google, Meta, TikTok, Glami: formatul RSS 2.0 cu spațiul de nume g:
  return { type: "application/xml", stats: simpleStats,
    head: `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${x(project.name)}</title><link>https://${x(project.domain)}</link>\n`,
    foot: "</channel></rss>",
    row: counted((p) => `<item>${googleItem(p).map(([k, v]) => `<${k}>${x(v)}</${k}>`).join("")}</item>\n`) };
}

/**
 * Câmpurile unui produs în feed-ul Google (și Meta, TikTok, Glami), în ordinea din fișier. Funcție pură: aceeași listă
 * se scrie în feed și se arată în fișa produsului, ca magazinul să vadă exact ce trimitem.
 * GTIN-ul invalid nu se trimite (Google respinge produsul); fără GTIN și fără cod producător: identifier_exists = no.
 */
export function googleItem(p: FeedProduct): [string, string][] {
  const gtin = cleanGtin(p.gtin);
  const mpn = (p.mpn ?? "").trim().slice(0, 70);
  const out: [string, string][] = [["g:id", p.externalId], ["title", p.title], ["description", p.description ?? p.title], ["link", p.url]];
  if (p.imageUrl) out.push(["g:image_link", p.imageUrl]);
  out.push(["g:price", priceStr(p)], ["g:availability", p.inStock ? "in_stock" : "out_of_stock"]);
  if (p.brand) out.push(["g:brand", p.brand]);
  if (gtin) out.push(["g:gtin", gtin]);
  if (mpn) out.push(["g:mpn", mpn]);
  if (!gtin && !(mpn && p.brand)) out.push(["g:identifier_exists", "no"]);
  if (p.category) out.push(["g:product_type", p.category]);
  out.push(["g:condition", "new"]);
  p.labels.slice(0, 5).forEach((l, i) => out.push([`g:custom_label_${i}`, l]));
  return out;
}

/** Tot feed-ul ca text (pentru cataloage mici și teste). Workerul folosește feedWriter, pe bucăți. */
export function renderFeed(channel: string, project: StoreRef, items: FeedProduct[], settings?: FeedOutputSettings | null) {
  const w = feedWriter(channel, project, settings);
  const rows: string[] = [];
  for (const p of items) { const r = w.row(p); if (r !== null) rows.push(r); }
  return { type: w.type, body: `${w.head}${rows.join("")}${w.foot}`, stats: w.stats() };
}

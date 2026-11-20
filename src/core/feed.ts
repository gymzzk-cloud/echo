import { and, desc, eq, gte, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FeedAction, FeedCondition } from "@/db/schema";
import { daysAgo, normalizeText } from "@/lib/util";
import { projectRuns } from "./projects";

/**
 * Optimizarea feed-ului (în stilul Channable): etichete automate, reguli „dacă… atunci…”,
 * modificări aprobate (titluri) și ieșiri pe canale (Google, Meta, TikTok, OpenAI, Compari, Árukereső, eMAG, Glami).
 * Catalogul original nu se modifică: totul se aplică la generarea feed-ului, deci orice se poate anula.
 */

export const CHANNELS = [
  { id: "google", name: "Google Merchant Center", format: "xml" },
  { id: "meta", name: "Meta (Facebook, Instagram)", format: "xml" },
  { id: "tiktok", name: "TikTok Shop / Catalog", format: "xml" },
  { id: "openai", name: "ChatGPT (feed OpenAI)", format: "json" },
  { id: "compari", name: "Compari.ro", format: "xml" },
  { id: "arukereso", name: "Árukereső.hu", format: "xml" },
  { id: "emag", name: "eMAG Marketplace", format: "csv" },
  { id: "glami", name: "Glami", format: "xml" },
] as const;
export type Channel = (typeof CHANNELS)[number]["id"];

export const FIELDS = ["title", "description", "brand", "category", "gtin", "price", "inStock", "label"] as const;

export type FeedProduct = {
  id: string; externalId: string; title: string; description: string | null; url: string; imageUrl: string | null;
  price: number | null; currency: string; inStock: boolean; brand: string | null; category: string | null; gtin: string | null;
  labels: string[];
};

/** Etichete automate, calculate din datele Echo (nu din catalog). */
export async function autoLabels(projectId: string, domain: string, products: (typeof schema.products.$inferSelect)[]) {
  const labels = new Map<string, string[]>(products.map((p) => [p.id, []]));
  // 1. Recomandat de AI în ultimele 30 de zile
  const runs = await projectRuns(projectId, daysAgo(30));
  const mentioned = new Set<string>();
  for (const { run: r } of runs) for (const m of r.mentions as { domain: string; productTitle?: string }[]) if (m.domain === domain && m.productTitle) mentioned.add(normalizeText(m.productTitle));
  // 2. Clicuri din căutarea Echo (popularitate). Filtrăm după magazin, nu după o listă de mii de id-uri.
  const clicks = products.length ? await db.select({ productId: schema.clicks.productId, n: dsql<number>`count(*)::int` }).from(schema.clicks)
    .where(and(eq(schema.clicks.projectId, projectId), gte(schema.clicks.createdAt, new Date(Date.now() - 30 * 864e5)))).groupBy(schema.clicks.productId) : [];
  const clickN = new Map(clicks.map((c) => [c.productId!, c.n]));
  // 3. Competitivitatea prețului: cel mai mic preț pentru același GTIN în celelalte magazine conectate, calculat în baza de date.
  const others = products.some((p) => p.gtin) ? await db.select({ gtin: schema.products.gtin, min: dsql<string>`min(${schema.products.price})` }).from(schema.products)
    .where(and(dsql`${schema.products.projectId} <> ${projectId}`, dsql`${schema.products.price} is not null`,
      dsql`${schema.products.gtin} in (select ${schema.products.gtin} from ${schema.products} where ${schema.products.projectId} = ${projectId} and ${schema.products.gtin} is not null)`))
    .groupBy(schema.products.gtin) : [];
  const minOther = new Map(others.map((o) => [o.gtin!, parseFloat(o.min)]));
  for (const p of products) {
    const l = labels.get(p.id)!;
    const isMentioned = mentioned.size > 0 && mentioned.has(normalizeText(p.title));
    if (isMentioned) l.push("recomandat_ai");
    const n = clickN.get(p.id) ?? 0;
    if (n >= 5) l.push("popular");
    else if (n === 0 && !isMentioned) l.push("zombie");
    l.push(p.inStock ? "in_stoc" : "fara_stoc");
    const price = p.price ? parseFloat(p.price) : null;
    const best = p.gtin ? minOther.get(p.gtin) : undefined;
    if (price && best !== undefined && !Number.isNaN(best)) l.push(price <= best ? "pret_cel_mai_bun" : price > best * 1.1 ? "pret_peste_piata" : "pret_in_piata");
    if (!p.gtin || !p.imageUrl || !p.brand) l.push("date_lipsa");
  }
  return labels;
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
      const val = a.type === "set" ? a.value ?? "" : a.type === "prefix" ? `${a.value ?? ""}${cur}` : `${cur}${a.value ?? ""}`;
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

/** Propune titluri noi pentru produsele unde diferența contează (fără marcă, prea scurte, majuscule). */
export async function proposeTitleEdits(projectId: string) {
  const products = await db.select().from(schema.products).where(eq(schema.products.projectId, projectId)).limit(5000);
  const existing = await db.select({ productId: schema.productEdits.productId }).from(schema.productEdits)
    .innerJoin(schema.products, eq(schema.products.id, schema.productEdits.productId))
    .where(and(eq(schema.products.projectId, projectId), eq(schema.productEdits.field, "title")));
  const done = new Set(existing.map((e) => e.productId));
  const rows = products.filter((p) => !done.has(p.id)).map((p) => ({ p, s: suggestTitle(p) })).filter(({ p, s }) => s !== p.title);
  if (rows.length) await db.insert(schema.productEdits).values(rows.map(({ p, s }) => ({ productId: p.id, field: "title", value: s, previous: p.title, source: "regula" })));
  return rows.length;
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

async function computeFeed(projectId: string, channel: string) {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const products = await db.select().from(schema.products).where(eq(schema.products.projectId, projectId)).limit(20000);
  const edits = await db.select().from(schema.productEdits).innerJoin(schema.products, eq(schema.products.id, schema.productEdits.productId))
    .where(and(eq(schema.products.projectId, projectId), eq(schema.productEdits.status, "aprobat"))).orderBy(desc(schema.productEdits.createdAt));
  const rules = await db.select().from(schema.feedRules).where(eq(schema.feedRules.projectId, projectId)).orderBy(schema.feedRules.priority);
  const labels = await autoLabels(projectId, project.domain, products);
  const editsBy = new Map<string, typeof edits>();
  for (const e of edits) editsBy.set(e.product_edits.productId, [...(editsBy.get(e.product_edits.productId) ?? []), e]);
  const out: FeedProduct[] = [];
  for (const p of products) {
    let fp: FeedProduct = {
      id: p.id, externalId: p.externalId, title: p.title, description: p.description, url: p.url, imageUrl: p.imageUrl,
      price: p.price ? parseFloat(p.price) : null, currency: p.currency, inStock: p.inStock, brand: p.brand, category: p.category, gtin: p.gtin,
      labels: labels.get(p.id) ?? [],
    };
    for (const e of [...(editsBy.get(p.id) ?? [])].reverse()) fp = { ...fp, [e.product_edits.field]: e.product_edits.value };
    const r = applyRules(fp, rules, channel);
    if (r) out.push(r);
  }
  return { project, items: out, labels, total: products.length };
}

const x = (s: string | null | undefined) => (s ?? "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
const priceStr = (p: FeedProduct) => (p.price != null ? `${p.price.toFixed(2)} ${p.currency}` : "");

export function renderFeed(channel: string, project: { name: string; domain: string }, items: FeedProduct[]) {
  if (channel === "openai") {
    return { type: "application/json", body: JSON.stringify(items.map((p) => ({
      id: p.externalId, title: p.title, description: p.description ?? p.title, link: p.url, image_link: p.imageUrl,
      price: priceStr(p), availability: p.inStock ? "in_stock" : "out_of_stock", brand: p.brand, gtin: p.gtin,
      product_category: p.category, seller_name: project.name, seller_url: `https://${project.domain}`,
      enable_search: true, enable_checkout: false,
    })), null, 1) };
  }
  if (channel === "emag") {
    const head = "part_number,name,brand,category,price,currency,stock,ean,url,image";
    const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    return { type: "text/csv; charset=utf-8", body: [head, ...items.map((p) => [p.externalId, p.title, p.brand, p.category, p.price, p.currency, p.inStock ? 1 : 0, p.gtin, p.url, p.imageUrl].map(q).join(","))].join("\n") };
  }
  if (channel === "compari" || channel === "arukereso") {
    return { type: "application/xml", body: `<?xml version="1.0" encoding="UTF-8"?>\n<products>\n${items.map((p) => `<product><identifier>${x(p.externalId)}</identifier><manufacturer>${x(p.brand)}</manufacturer><name>${x(p.title)}</name><category>${x(p.category)}</category><product_url>${x(p.url)}</product_url><price>${p.price ?? ""}</price><image_url>${x(p.imageUrl)}</image_url><description>${x(p.description)}</description><ean_code>${x(p.gtin)}</ean_code><delivery_time>${p.inStock ? "1-3" : ""}</delivery_time></product>`).join("\n")}\n</products>` };
  }
  // Google, Meta, TikTok, Glami: formatul RSS 2.0 cu spațiul de nume g:
  return { type: "application/xml", body: `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${x(project.name)}</title><link>https://${x(project.domain)}</link>\n${items.map((p) =>
    `<item><g:id>${x(p.externalId)}</g:id><title>${x(p.title)}</title><description>${x(p.description ?? p.title)}</description><link>${x(p.url)}</link>${p.imageUrl ? `<g:image_link>${x(p.imageUrl)}</g:image_link>` : ""}<g:price>${x(priceStr(p))}</g:price><g:availability>${p.inStock ? "in_stock" : "out_of_stock"}</g:availability>${p.brand ? `<g:brand>${x(p.brand)}</g:brand>` : ""}${p.gtin ? `<g:gtin>${x(p.gtin)}</g:gtin>` : "<g:identifier_exists>no</g:identifier_exists>"}${p.category ? `<g:product_type>${x(p.category)}</g:product_type>` : ""}<g:condition>new</g:condition>${p.labels.slice(0, 5).map((l, i) => `<g:custom_label_${i}>${x(l)}</g:custom_label_${i}>`).join("")}</item>`).join("\n")}\n</channel></rss>` };
}

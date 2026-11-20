import { desc, eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Mention } from "@/db/schema";
import { keywords, normalizeText } from "@/lib/util";
import { runAll } from "./ai/engine";
import { PROVIDERS, type Provider } from "./ai/types";

/**
 * Căutarea pentru cumpărători: întrebarea → toate AI-urile → clasament combinat
 * → preț și stoc verificate în cataloagele magazinelor → profil magazin.
 *
 * Ordonarea (publică, vezi /cum-ordonam):
 *   40% câte AI-uri recomandă produsul/magazinul
 *   25% potrivirea cu întrebarea
 *   20% încadrarea în buget și preț verificat
 *   15% semnale de încredere ale magazinului (date publice)
 * Nimeni nu poate plăti pentru poziția în clasamentul organic.
 */

export type ParsedQuery = { text: string; budgetMax: number | null; budgetMin: number | null; keywords: string[]; country: "RO" | "HU"; language: "ro" | "hu"; inStockOnly: boolean };

export function parseQuery(q: string, lang?: "ro" | "hu"): ParsedQuery {
  const n = normalizeText(q);
  const hu = lang === "hu" || /[őű]/i.test(q) || /\b(ft|forint|legjobb|olcso|ajanl|alatt)/.test(n);
  const toNum = (s: string) => parseInt(s.replace(/[.\s]/g, ""), 10);
  const max = q.match(/(?:sub|până la|pana la|maxim|max\.?|cel mult|alatt|under)\s*([\d.\s]+)\s*(?:lei|ron|ft|€)?/i) ?? q.match(/([\d.\s]*\d)\s*(?:ft|forint)?\s*alatt/i);
  const min = q.match(/(?:peste|minim|de la|felett)\s*([\d.\s]+)\s*(?:lei|ron|ft)?/i);
  return { text: q.trim(), budgetMax: max ? toNum(max[1]) : null, budgetMin: min ? toNum(min[1]) : null, keywords: keywords(q.replace(/(doar )?(în|in) stoc|raktáron/gi, "")), country: hu ? "HU" : "RO", language: hu ? "hu" : "ro", inStockOnly: /(în|in) stoc|raktáron|raktaron/i.test(q) };
}

export type ResultItem = {
  key: string;
  title: string;
  domain: string;
  storeName: string;
  productId: string | null;
  url: string | null;
  cartUrl: string | null;
  imageUrl: string | null;
  verifiedPrice: number | null;
  statedPrices: { provider: Provider; price: number }[];
  priceCorrected: boolean;
  inStock: boolean | null;
  providers: Provider[];
  connected: boolean;
  trustFacts: number;
  score: number;
};

export async function search(q: string, lang?: "ro" | "hu") {
  const parsed = parseQuery(q, lang);
  const runs = await runAll({ query: parsed.text, language: parsed.language, country: parsed.country });

  const projects = await db.select().from(schema.projects);
  const byDomain = new Map(projects.map((p) => [p.domain, p]));
  const audits = await db.execute(dsql`select distinct on (domain) domain, result from audits where status = 'done' order by domain, created_at desc`);
  const trustByDomain = new Map<string, number>();
  for (const a of audits as unknown as { domain: string; result: { facts?: Record<string, unknown> } }[]) {
    const f = a.result?.facts ?? {};
    trustByDomain.set(a.domain, [f.hasReturnPolicy, f.hasTerms, f.hasContact, f.cui, f.hasAnpc].filter(Boolean).length + ((f.trustmarks as string[] | undefined)?.length ?? 0));
  }

  // 1. Grupăm mențiunile AI pe (domeniu, produs)
  const items = new Map<string, ResultItem>();
  for (const run of runs) {
    for (const m of run.mentions as Mention[]) {
      const key = `${m.domain}|${normalizeText(m.productTitle ?? "")}`;
      const it = items.get(key) ?? {
        key, title: m.productTitle ?? m.name ?? m.domain, domain: m.domain, storeName: m.name ?? byDomain.get(m.domain)?.name ?? m.domain,
        productId: null, url: null, cartUrl: null, imageUrl: null, verifiedPrice: null, statedPrices: [], priceCorrected: false, inStock: null,
        providers: [], connected: byDomain.has(m.domain), trustFacts: trustByDomain.get(m.domain) ?? 0, score: 0,
      };
      if (!it.providers.includes(run.provider as Provider)) it.providers.push(run.provider as Provider);
      if (m.statedPrice) it.statedPrices.push({ provider: run.provider as Provider, price: m.statedPrice });
      items.set(key, it);
    }
  }

  // 2. Verificăm prețul și stocul în catalogul magazinelor conectate
  for (const it of items.values()) {
    const p = byDomain.get(it.domain);
    if (!p || !it.title) continue;
    const kw = keywords(it.title);
    if (!kw.length) continue;
    const cands = await db.select().from(schema.products).where(eq(schema.products.projectId, p.id)).limit(5000);
    let best: (typeof cands)[number] | null = null, bestScore = 0;
    for (const c of cands) {
      const ck = new Set(keywords(c.title));
      const s = kw.filter((k) => ck.has(k)).length / kw.length;
      if (s > bestScore) { bestScore = s; best = c; }
    }
    if (best && bestScore >= 0.5) {
      it.productId = best.id; it.url = best.url; it.cartUrl = best.cartUrl; it.imageUrl = best.imageUrl; it.title = best.title; it.inStock = best.inStock;
      it.verifiedPrice = best.price ? parseFloat(best.price) : null;
      it.priceCorrected = !!it.verifiedPrice && it.statedPrices.some((s) => Math.abs(s.price - it.verifiedPrice!) / it.verifiedPrice! > 0.03);
    }
  }

  // 3. Adăugăm produse din cataloagele conectate care se potrivesc, chiar dacă AI-urile nu le-au menționat
  if (parsed.keywords.length) {
    const like = parsed.keywords.slice(0, 4).map((k) => `%${k.slice(0, Math.max(4, k.length - 2))}%`);
    const extra = await db.select({ prod: schema.products, project: schema.projects }).from(schema.products)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.products.projectId))
      .where(dsql`(${dsql.join(like.map((l) => dsql`unaccent_lower(${schema.products.title}) like ${l}`), dsql` or `)}) and ${schema.projects.country} = ${parsed.country}`)
      .orderBy(desc(schema.products.inStock)).limit(30);
    for (const { prod, project } of extra) {
      const key = `${project.domain}|${normalizeText(prod.title)}`;
      if ([...items.values()].some((i) => i.productId === prod.id)) continue;
      items.set(key, {
        key, title: prod.title, domain: project.domain, storeName: project.name, productId: prod.id, url: prod.url, cartUrl: prod.cartUrl, imageUrl: prod.imageUrl,
        verifiedPrice: prod.price ? parseFloat(prod.price) : null, statedPrices: [], priceCorrected: false, inStock: prod.inStock,
        providers: [], connected: true, trustFacts: trustByDomain.get(project.domain) ?? 0, score: 0,
      });
    }
  }

  // 4. Scor și ordonare
  const list = [...items.values()].filter((i) => !/^(compari|pricy|forum|youtube|reddit)/.test(i.domain) && !(parsed.inStockOnly && i.inStock === false));
  for (const it of list) {
    const ai = it.providers.length / PROVIDERS.length;
    const tk = new Set(keywords(it.title));
    const rel = parsed.keywords.length ? parsed.keywords.filter((k) => [...tk].some((t) => t.startsWith(k.slice(0, 5)))).length / parsed.keywords.length : 0.5;
    const price = it.verifiedPrice ?? it.statedPrices[0]?.price ?? null;
    let budget = 0.5;
    if (parsed.budgetMax && price) budget = price <= parsed.budgetMax ? 1 : 0;
    if (it.verifiedPrice) budget = Math.min(1, budget + 0.25);
    if (it.inStock === false) budget = 0;
    const trust = Math.min(1, it.trustFacts / 5 + (it.connected ? 0.2 : 0));
    // Peste buget (cu 5% toleranță) sau fără stoc: coboară sub produsele care respectă cererea.
    const penalty = (parsed.budgetMax && price && price > parsed.budgetMax * 1.05) || it.inStock === false ? 0.5 : 1;
    it.score = Math.round((ai * 0.4 + rel * 0.25 + budget * 0.2 + trust * 0.15) * 100 * penalty);
  }
  list.sort((a, b) => b.score - a.score);
  const results = list.slice(0, 24);

  const [s] = await db.insert(schema.searches).values({ query: parsed.text, parsed, resultCount: results.length }).returning();
  return { searchId: s.id, parsed, runs, results };
}

const ACCESSORY_RE = "^(accesorii|piese|consumabile|tartozek|alkatresz)";
const ACCESSORY_WORDS = /accesori|disc|filtr|piese|piesa|panz|lama|burghi|bit|furtun|sac|acumulator|baterie|incarcator|tartozek/;

/**
 * Căutare doar în cataloagele verificate (fără apeluri la AI-uri): rapidă și ieftină.
 * O folosesc serverul MCP și API-ul, unde cel care întreabă este deja un AI.
 */
export async function catalogSearch(q: string, opts: { budgetMax?: number | null; projectId?: string; limit?: number } = {}) {
  const parsed = parseQuery(q);
  const budget = opts.budgetMax ?? parsed.budgetMax;
  if (!parsed.keywords.length) return [];
  const like = parsed.keywords.slice(0, 5).map((k) => `%${k.slice(0, Math.max(4, k.length - 2))}%`);
  // Cine caută „polizor” vrea polizorul, nu discurile pentru el: accesoriile coboară, dacă nu sunt cerute explicit.
  const accessoryLast = !ACCESSORY_WORDS.test(normalizeText(q));
  // Căutăm în titlu, categorie (cu calea completă) și marcă: multe magazine au titluri doar „MARCĂ MODEL”.
  const hay = dsql`unaccent_lower(coalesce(${schema.products.title}, '') || ' ' || coalesce(${schema.products.category}, '') || ' ' || coalesce(${schema.products.brand}, ''))`;
  const hits = dsql.join(like.map((l) => dsql`(case when ${hay} like ${l} then 1 else 0 end)`), dsql` + `);
  const rows = await db.select({ prod: schema.products, project: schema.projects }).from(schema.products)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.products.projectId))
    .where(dsql`(${dsql.join(like.map((l) => dsql`${hay} like ${l}`), dsql` or `)})
      ${opts.projectId ? dsql`and ${schema.products.projectId} = ${opts.projectId}` : dsql``}
      ${budget ? dsql`and ${schema.products.price} <= ${budget}` : dsql``}
      ${parsed.inStockOnly ? dsql`and ${schema.products.inStock}` : dsql``}`)
    .orderBy(dsql`${hits} desc`, accessoryLast ? dsql`(unaccent_lower(coalesce(${schema.products.category}, '')) ~ ${ACCESSORY_RE}) asc` : dsql`1`, dsql`${schema.products.inStock} desc`)
    .limit(200);
  const scored = rows.map(({ prod, project }) => {
    const tk = keywords(`${prod.title} ${prod.category ?? ""} ${prod.brand ?? ""}`);
    const rel = parsed.keywords.filter((k) => tk.some((t) => t.startsWith(k.slice(0, 5)))).length / parsed.keywords.length;
    const acc = accessoryLast && new RegExp(ACCESSORY_RE).test(normalizeText(prod.category ?? "")) ? 0.5 : 0;
    return { prod, project, rel: rel - acc + (prod.inStock ? 0.1 : 0) };
  }).sort((a, b) => b.rel - a.rel).slice(0, opts.limit ?? 10);
  return scored.map(({ prod, project }) => ({
    product_id: prod.id, title: prod.title, store: project.name, domain: project.domain,
    price: prod.price ? parseFloat(prod.price) : null, currency: prod.currency, in_stock: prod.inStock,
    brand: prod.brand, category: prod.category, gtin: prod.gtin, image: prod.imageUrl, delivery: prod.delivery, verified_at: prod.updatedAt.toISOString(),
    buy_url: `${process.env.APP_URL ?? "http://localhost:3000"}/go/${prod.id}${prod.cartUrl ? "?cos=1" : ""}`,
  }));
}

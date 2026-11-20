import { and, desc, eq, gte, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Mention } from "@/db/schema";
import { daysAgo, domainOf } from "@/lib/util";
import { projectRuns, summarize, latestAudit } from "./projects";
import { PROVIDERS } from "./ai/types";

type Project = typeof schema.projects.$inferSelect;
export type Rows = Awaited<ReturnType<typeof projectRuns>>;

export async function loadBase(project: Project, days = 30) {
  const [rows, competitors, audit] = await Promise.all([
    projectRuns(project.id, daysAgo(days)),
    db.select().from(schema.competitors).where(eq(schema.competitors.projectId, project.id)),
    latestAudit(project.id),
  ]);
  return { rows, competitors, audit };
}

/** Evoluția zilnică: vizibilitatea ta și a concurenților (% întrebări în care apare fiecare). */
export function trend(rows: Rows, domain: string, competitorDomains: string[]) {
  const days = [...new Set(rows.map((r) => r.run.runDate))].sort();
  return days.map((d) => {
    const rs = rows.filter((r) => r.run.runDate === d);
    const vis = (dom: string) => Math.round((rs.filter((r) => (r.run.mentions as Mention[]).some((m) => m.domain === dom)).length / Math.max(1, rs.length)) * 100);
    const point: Record<string, string | number> = { day: d.slice(5).split("-").reverse().join("."), tu: vis(domain) };
    for (const c of competitorDomains) point[c] = vis(c);
    return point;
  });
}

/** Clasamentul de vizibilitate: tu și concurenții, pe perioada aleasă. */
export function leaderboard(rows: Rows, domain: string, competitors: { domain: string; name: string }[]) {
  const all = [{ domain, name: "Tu" }, ...competitors];
  return all.map((c) => {
    const hits = rows.filter((r) => (r.run.mentions as Mention[]).some((m) => m.domain === c.domain));
    const pos = hits.map((r) => (r.run.mentions as Mention[]).find((m) => m.domain === c.domain)!.position);
    return { ...c, visibility: Math.round((hits.length / Math.max(1, rows.length)) * 100), mentions: hits.length, avgPosition: pos.length ? +(pos.reduce((a, b) => a + b, 0) / pos.length).toFixed(1) : null };
  }).sort((a, b) => b.visibility - a.visibility);
}

/** Pe fiecare întrebare: în ce AI-uri apari și cine apare în locul tău. */
export function perPrompt(rows: Rows, domain: string) {
  const map = new Map<string, { prompt: string; category: string | null; intent: string; byProvider: Record<string, { me: number | null; top: string[]; runId: string; answer: string }> }>();
  const latest = new Map<string, Rows[number]>();
  for (const r of rows) {
    const k = `${r.promptId}|${r.run.provider}`;
    const prev = latest.get(k);
    if (!prev || prev.run.runDate < r.run.runDate) latest.set(k, r);
  }
  for (const r of latest.values()) {
    const e = map.get(r.promptId) ?? { prompt: r.prompt, category: r.category, intent: r.intent, byProvider: {} };
    const ms = r.run.mentions as Mention[];
    e.byProvider[r.run.provider] = { me: ms.find((m) => m.domain === domain)?.position ?? null, top: ms.slice(0, 3).map((m) => m.name ?? m.domain), runId: r.run.id, answer: r.run.answer };
    map.set(r.promptId, e);
  }
  return [...map.entries()].map(([id, v]) => ({ id, ...v }));
}

/** Produse: de câte ori e recomandat fiecare, de ce AI-uri, ce prețuri spun. */
export async function productInsights(project: Project, rows: Rows) {
  // Doar coloanele afișate: fără textul descrierilor (mult) pentru mii de produse.
  const P = schema.products;
  const prods = await db.select({
    id: P.id, title: P.title, url: P.url, brand: P.brand, category: P.category, price: P.price, currency: P.currency, inStock: P.inStock, gtin: P.gtin,
    hasDescription: dsql<boolean>`coalesce(${P.description}, '') <> ''`, hasImage: dsql<boolean>`coalesce(${P.imageUrl}, '') <> ''`,
  }).from(P).where(eq(P.projectId, project.id)).limit(20000);
  const stats = new Map<string, { n: number; providers: Set<string>; prices: { provider: string; price: number }[]; positions: number[] }>();
  const where = new Map<string, number>();
  for (const { run } of rows) {
    const ms = run.mentions as Mention[];
    for (const m of ms) {
      where.set(m.domain, (where.get(m.domain) ?? 0) + 1);
      if (m.domain !== project.domain || !m.productTitle) continue;
      const s = stats.get(m.productTitle) ?? { n: 0, providers: new Set(), prices: [], positions: [] };
      s.n++; s.providers.add(run.provider); s.positions.push(m.position);
      if (m.statedPrice) s.prices.push({ provider: run.provider, price: m.statedPrice });
      stats.set(m.productTitle, s);
    }
  }
  const list = prods.map((p) => {
    const s = stats.get(p.title);
    const real = p.price ? parseFloat(p.price) : null;
    // Un singur preț greșit pe AI: cel mai recent spus (rândurile vin în ordine cronologică).
    const byProv = new Map<string, { provider: string; price: number }>();
    for (const x of s?.prices ?? []) if (real && Math.abs(x.price - real) / real > 0.05) byProv.set(x.provider, x);
    const wrong = [...byProv.values()];
    return { ...p, mentions: s?.n ?? 0, providers: s ? [...s.providers] : [], avgPosition: s?.positions.length ? +(s.positions.reduce((a, b) => a + b, 0) / s.positions.length).toFixed(1) : null, wrongPrices: wrong };
  });
  list.sort((a, b) => b.mentions - a.mentions || (b.inStock ? 1 : 0) - (a.inStock ? 1 : 0));
  const topDest = [...where.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return { list, recommended: list.filter((p) => p.mentions > 0).length, wrongPriceCount: list.filter((p) => p.wrongPrices.length).length, topDestinations: topDest };
}

/** Surse: ce site-uri citesc AI-urile și unde apar concurenții, dar tu nu. */
export function sourceInsights(rows: Rows, domain: string, competitorDomains: string[]) {
  const all = new Map<string, { n: number; withMe: number; withComp: number; providers: Set<string> }>();
  for (const { run } of rows) {
    const ms = run.mentions as Mention[];
    const me = ms.some((m) => m.domain === domain);
    const comp = ms.some((m) => competitorDomains.includes(m.domain));
    const seen = new Set<string>();
    for (const s of run.sources as { url: string }[]) {
      const d = domainOf(s.url);
      if (!d || seen.has(d)) continue;
      seen.add(d);
      const e = all.get(d) ?? { n: 0, withMe: 0, withComp: 0, providers: new Set() };
      e.n++; if (me) e.withMe++; if (comp) e.withComp++; e.providers.add(run.provider);
      all.set(d, e);
    }
  }
  const kind = (d: string) => d === domain ? "site propriu" : competitorDomains.includes(d) ? "concurent" : /forum|reddit|softpedia/.test(d) ? "forum" : /youtube|tiktok/.test(d) ? "video" : /compari|pricy|arukereso|price/.test(d) ? "comparator" : /emag|altex|flanco|dedeman|leroy|hornbach/.test(d) ? "marketplace / retailer" : "editorial / blog";
  const list = [...all.entries()].map(([d, e]) => ({ domain: d, kind: kind(d), citations: e.n, withMe: e.withMe, gap: e.withComp - e.withMe, providers: [...e.providers] }))
    .sort((a, b) => b.citations - a.citations);
  return { list, gaps: list.filter((s) => s.gap > 0 && s.kind !== "concurent" && s.kind !== "site propriu").sort((a, b) => b.gap - a.gap) };
}

export async function overview(project: Project) {
  const { rows, competitors, audit } = await loadBase(project, 30);
  const stats = await db.select().from(schema.dailyStats).where(and(eq(schema.dailyStats.projectId, project.id), gte(schema.dailyStats.day, daysAgo(30)))).orderBy(desc(schema.dailyStats.day));
  const all = stats.filter((s) => s.provider === "all");
  const latest = all[0] ?? null;
  const weekAgo = all.find((s) => s.day <= daysAgo(7)) ?? all[all.length - 1] ?? null;
  const latestDay = latest?.day;
  const perProvider = PROVIDERS.map((p) => {
    const cur = stats.find((s) => s.day === latestDay && s.provider === p.id);
    const old = stats.find((s) => s.day === weekAgo?.day && s.provider === p.id);
    return { provider: p.id, visibility: cur?.visibility ?? 0, avgPosition: cur?.avgPosition ? parseFloat(cur.avgPosition) : null, delta: cur && old && old.day !== cur.day ? cur.visibility - old.visibility : null };
  });
  const today7 = rows.filter((r) => r.run.runDate >= daysAgo(7));
  const sum = summarize(today7, project.domain, competitors.map((c) => c.domain), audit?.score ?? null);
  return { rows, competitors, audit, latest, weekAgo, perProvider, sum };
}

const VENDOR: Record<string, string> = { chatgpt: "OpenAI", gemini: "Google", perplexity: "Perplexity", claude: "Anthropic", aimode: "Google", copilot: "Microsoft" };

/** „Cine te recomandă și cine nu”: pe fiecare AI, câte întrebări, cine apare în locul tău și problema probabilă. */
export function whoRecommends(rows: Rows, domain: string, audit: { result: unknown } | null, products: { title: string; price: string | null }[]) {
  const day = rows.map((r) => r.run.runDate).sort().at(-1);
  const today = rows.filter((r) => r.run.runDate === day);
  const bots = ((audit?.result as { bots?: { vendor: string; important: boolean; robots: string }[] } | null)?.bots) ?? [];
  const priceOf = new Map(products.map((p) => [p.title, p.price ? parseFloat(p.price) : null]));
  return PROVIDERS.map((p) => {
    const rs = today.filter((r) => r.run.provider === p.id);
    const hits = rs.filter((r) => (r.run.mentions as Mention[]).some((m) => m.domain === domain)).length;
    const others = new Map<string, number>();
    let wrongPrice = false;
    for (const r of rs) for (const m of r.run.mentions as Mention[]) {
      if (m.domain !== domain) others.set(m.name ?? m.domain, (others.get(m.name ?? m.domain) ?? 0) + 1);
      else if (m.productTitle && m.statedPrice) { const real = priceOf.get(m.productTitle); if (real && Math.abs(m.statedPrice - real) / real > 0.05) wrongPrice = true; }
    }
    const instead = [...others.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const blocked = bots.some((b) => b.vendor === VENDOR[p.id] && b.important && b.robots === "blocked");
    const problem = blocked ? "robot blocat" : wrongPrice ? "preț greșit" : hits === 0 && rs.length ? "nu te cunoaște" : null;
    return { provider: p.id, hits, total: rs.length, instead, problem };
  });
}

/** Cota din recomandări: tu, concurenții principali și restul. */
export function shareOfRecommendations(rows: Rows, domain: string, top = 3) {
  const n = new Map<string, number>();
  let all = 0;
  for (const r of rows) for (const m of r.run.mentions as Mention[]) { all++; n.set(m.domain, (n.get(m.domain) ?? 0) + 1); }
  const sorted = [...n.entries()].sort((a, b) => b[1] - a[1]);
  const pick = sorted.slice(0, top).map(([d]) => d);
  if (!pick.includes(domain)) pick.push(domain);
  const list = pick.map((d) => ({ domain: d, me: d === domain, pct: all ? Math.round(((n.get(d) ?? 0) / all) * 100) : 0 }));
  const rest = Math.max(0, 100 - list.reduce((s, x) => s + x.pct, 0));
  return [...list.sort((a, b) => b.pct - a.pct), { domain: "Alții", me: false, pct: rest }];
}

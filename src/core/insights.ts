import { and, asc, desc, eq, gte, ilike, inArray, sql as dsql, type SQL } from "drizzle-orm";
import { canAct, isBrandSite, sourceKind, type SourceCtx } from "./source-kind";
import { catalogBrands as catalogBrandsFn } from "./store-context";
import { db, schema } from "@/db";
import type { Mention } from "@/db/schema";
import { daysAgo, domainOf } from "@/lib/util";
import { projectRuns, summarize, latestAudit } from "./projects";
import { ERROR_MODEL, PROVIDERS } from "./ai/types";
import { failureReason } from "./ai/errors";
import { isStoreLike } from "./ai/domains";
import { cleanAnswer } from "./ai/extract";

type Project = typeof schema.projects.$inferSelect;
export type Rows = Awaited<ReturnType<typeof projectRuns>>;

export async function loadBase(project: Project, days = 30) {
  const [all, competitors, audit] = await Promise.all([
    projectRuns(project.id, daysAgo(days), { withErrors: true }),
    db.select().from(schema.competitors).where(eq(schema.competitors.projectId, project.id)),
    latestAudit(project.id),
  ]);
  // Rulările eșuate nu intră în cifre (nu știm ce ar fi răspuns AI-ul); le păstrăm doar ca să arătăm motivul.
  const rows = all.filter((r) => r.run.model !== ERROR_MODEL);
  const failed = all.filter((r) => r.run.model === ERROR_MODEL);
  return { rows, failed, competitors, audit };
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
export function perPrompt(rows: Rows, domain: string, failed: Rows = []) {
  const map = new Map<string, { prompt: string; category: string | null; intent: string; byProvider: Record<string, { me: number | null; top: string[]; runId: string; answer: string; failure: string | null }> }>();
  const latest = new Map<string, Rows[number]>();
  // Pe aceeași zi o rulare reușită o înlocuiește pe cea eșuată, deci „cea mai recentă” e cea de afișat.
  for (const r of [...failed, ...rows]) {
    const k = `${r.promptId}|${r.run.provider}`;
    const prev = latest.get(k);
    if (!prev || prev.run.runDate < r.run.runDate) latest.set(k, r);
  }
  for (const r of latest.values()) {
    const e = map.get(r.promptId) ?? { prompt: r.prompt, category: r.category, intent: r.intent, byProvider: {} };
    const ms = r.run.mentions as Mention[];
    const failure = r.run.model === ERROR_MODEL ? failureReason(r.run.answer) : null;
    e.byProvider[r.run.provider] = { me: failure ? null : ms.find((m) => m.domain === domain)?.position ?? null, top: ms.slice(0, 3).map((m) => m.name ?? m.domain), runId: r.run.id, answer: cleanAnswer(r.run.answer), failure };
    map.set(r.promptId, e);
  }
  return [...map.entries()].map(([id, v]) => ({ id, ...v }));
}

export type ProductFilter = "" | "recomandate" | "pret" | "stoc" | "urmarite" | "populare" | "incomplete";

/**
 * Produse: de câte ori e recomandat fiecare, de ce AI-uri, ce prețuri spun.
 * Totul în SQL, pe tot catalogul (nu doar pe primele 20.000 de rânduri): numărătorile cu count, lista cu filtru și limită 100.
 * „Preț greșit” = aceeași definiție ca în Vizibilitate (price_wrong din calculul salvat), ca cifrele să se lege între pagini.
 */
export async function productInsights(project: Project, rows: Rows, opts: { f?: string; q?: string; tracked?: string[] } = {}) {
  const P = schema.products, S = schema.productAiStats;
  const incomplete = dsql`(coalesce(${P.gtin}, '') = '' or coalesce(${P.brand}, '') = '' or coalesce(octet_length(${P.description}), 0) = 0 or coalesce(${P.imageUrl}, '') = '')`;
  const [counts] = await db.select({
    total: dsql<number>`count(*)::int`,
    recommended: dsql<number>`count(*) filter (where ${S.appearances} > 0)::int`,
    wrongPrice: dsql<number>`count(*) filter (where ${S.priceWrong})::int`,
    incomplete: dsql<number>`count(*) filter (where ${incomplete})::int`,
  }).from(P).leftJoin(S, eq(S.productId, P.id)).where(eq(P.projectId, project.id));
  const f = opts.f as ProductFilter | undefined;
  const conds: SQL[] = [eq(P.projectId, project.id)];
  if (f === "recomandate") conds.push(dsql`${S.appearances} > 0`);
  if (f === "pret") conds.push(dsql`${S.priceWrong}`);
  if (f === "stoc") conds.push(dsql`not ${P.inStock}`);
  if (f === "urmarite") conds.push(opts.tracked?.length ? inArray(P.id, opts.tracked) : dsql`false`);
  if (f === "populare") conds.push(dsql`${P.popularityRank} is not null`);
  if (f === "incomplete") conds.push(incomplete);
  if (opts.q) conds.push(ilike(P.title, `%${opts.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
  const list = await db.select({
    id: P.id, title: P.title, url: P.url, popularityRank: P.popularityRank, brand: P.brand, category: P.category, price: P.price, currency: P.currency, inStock: P.inStock, gtin: P.gtin,
    hasDescription: dsql<boolean>`coalesce(octet_length(${P.description}), 0) > 0`, hasImage: dsql<boolean>`coalesce(${P.imageUrl}, '') <> ''`,
    mentions: dsql<number>`coalesce(${S.appearances}, 0)::int`, providersMap: S.providers, avgPositionRaw: S.avgPosition, wrongPricesRaw: S.wrongPrices,
  }).from(P).leftJoin(S, eq(S.productId, P.id)).where(and(...conds))
    .orderBy(f === "populare" ? asc(P.popularityRank) : dsql`coalesce(${S.appearances}, 0) desc, ${P.inStock} desc, ${P.popularityRank} asc nulls last`).limit(100);
  // „Unde trimit AI-urile cumpărătorii” = magazine: fără site-uri de producător (bosch-professional.com) sau care nu vând.
  const brands = await catalogBrandsFn(project.id);
  const where = new Map<string, number>();
  for (const { run } of rows) for (const m of run.mentions as Mention[]) {
    if (!isStoreLike(m.domain) || (m.domain !== project.domain && isBrandSite(m.domain, brands))) continue;
    where.set(m.domain, (where.get(m.domain) ?? 0) + 1);
  }
  return {
    list: list.map(({ providersMap, avgPositionRaw, wrongPricesRaw, ...p }) => ({ ...p, providers: providersMap ? Object.keys(providersMap) : [], avgPosition: avgPositionRaw ? parseFloat(avgPositionRaw) : null, wrongPrices: wrongPricesRaw ?? [] })),
    total: counts?.total ?? 0, recommended: counts?.recommended ?? 0, wrongPriceCount: counts?.wrongPrice ?? 0, incompleteCount: counts?.incomplete ?? 0,
    topDestinations: [...where.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
  };
}

/** Surse: ce site-uri citesc AI-urile și unde apar concurenții, dar tu nu. */
export function sourceInsights(rows: Rows, domain: string, competitorDomains: string[], extra: { ownDomains?: string[]; brands?: string[] } = {}) {
  const ctx: SourceCtx = { ownDomains: [domain, ...(extra.ownDomains ?? [])], competitorDomains, brands: extra.brands ?? [] };
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
  const list = [...all.entries()].map(([d, e]) => ({ domain: d, kind: sourceKind(d, ctx), citations: e.n, withMe: e.withMe, gap: e.withComp - e.withMe, providers: [...e.providers] }))
    .sort((a, b) => b.citations - a.citations);
  // Oportunități doar unde magazinul poate face ceva (nu alte magazine, producători sau propriul site).
  return { list, gaps: list.filter((s) => s.gap > 0 && canAct(s.kind)).sort((a, b) => b.gap - a.gap) };
}

export async function overview(project: Project) {
  const { rows, failed, competitors, audit } = await loadBase(project, 30);
  const stats = await db.select().from(schema.dailyStats).where(and(eq(schema.dailyStats.projectId, project.id), gte(schema.dailyStats.day, daysAgo(30)))).orderBy(desc(schema.dailyStats.day));
  const all = stats.filter((s) => s.provider === "all");
  const latest = all[0] ?? null;
  const weekAgo = all.find((s) => s.day <= daysAgo(7)) ?? all[all.length - 1] ?? null;
  const latestDay = latest?.day;
  const perProvider = PROVIDERS.map((p) => {
    const cur = stats.find((s) => s.day === latestDay && s.provider === p.id);
    const old = stats.find((s) => s.day === weekAgo?.day && s.provider === p.id);
    return { provider: p.id, checked: !!cur, visibility: cur?.visibility ?? 0, avgPosition: cur?.avgPosition ? parseFloat(cur.avgPosition) : null, delta: cur && old && old.day !== cur.day ? cur.visibility - old.visibility : null };
  });
  const today7 = rows.filter((r) => r.run.runDate >= daysAgo(7));
  const sum = summarize(today7, project.domain, competitors.map((c) => c.domain), audit?.score ?? null);
  // AI-urile care n-au putut fi verificate în ultima zi cu rulări (doar erori), cu motivul.
  const lastDay = [...rows, ...failed].map((r) => r.run.runDate).sort().at(-1);
  const answered = new Set(rows.filter((r) => r.run.runDate === lastDay).map((r) => r.run.provider));
  const unchecked = new Map<string, string>();
  for (const r of failed) if (r.run.runDate === lastDay && !answered.has(r.run.provider)) unchecked.set(r.run.provider, failureReason(r.run.answer));
  return { rows, competitors, audit, latest, weekAgo, perProvider, sum, unchecked: [...unchecked.entries()].map(([provider, reason]) => ({ provider, reason })) };
}

const VENDOR: Record<string, string> = { chatgpt: "OpenAI", gemini: "Google", perplexity: "Perplexity", claude: "Anthropic", aioverview: "Google", aimode: "Google", copilot: "Microsoft", grok: "xAI", meta: "Meta" };

/** „Cine te recomandă și cine nu”: pe fiecare AI, câte întrebări, cine apare în locul tău și problema probabilă. */
export function whoRecommends(rows: Rows, domain: string, audit: { result: unknown } | null, products: { title: string; price: string | null }[], exclude: ReadonlySet<string> = new Set()) {
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
      if (m.domain !== domain && isStoreLike(m.domain) && !exclude.has(m.domain)) others.set(m.name ?? m.domain, (others.get(m.name ?? m.domain) ?? 0) + 1);
      else if (m.productTitle && m.statedPrice) { const real = priceOf.get(m.productTitle); if (real && Math.abs(m.statedPrice - real) / real > 0.05) wrongPrice = true; }
    }
    const instead = [...others.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const blocked = bots.some((b) => b.vendor === VENDOR[p.id] && b.important && b.robots === "blocked");
    const problem = blocked ? "robot blocat" : wrongPrice ? "preț greșit" : hits === 0 && rs.length ? "nu te cunoaște" : null;
    return { provider: p.id, hits, total: rs.length, instead, problem };
  });
}

/** Cota din recomandări: tu, concurenții principali și restul. */
export function shareOfRecommendations(rows: Rows, domain: string, top = 3, exclude: ReadonlySet<string> = new Set()) {
  const n = new Map<string, number>();
  let all = 0;
  for (const r of rows) for (const m of r.run.mentions as Mention[]) {
    if (m.domain !== domain && (!isStoreLike(m.domain) || exclude.has(m.domain))) continue; // directoare, presă, producători, propriile magazine: nu sunt concurenți
    all++; n.set(m.domain, (n.get(m.domain) ?? 0) + 1);
  }
  const sorted = [...n.entries()].sort((a, b) => b[1] - a[1]);
  const pick = sorted.slice(0, top).map(([d]) => d);
  if (!pick.includes(domain)) pick.push(domain);
  const list = pick.map((d) => ({ domain: d, me: d === domain, pct: all ? Math.round(((n.get(d) ?? 0) / all) * 100) : 0 }));
  const rest = Math.max(0, 100 - list.reduce((s, x) => s + x.pct, 0));
  return [...list.sort((a, b) => b.pct - a.pct), { domain: "Alții", me: false, pct: rest }];
}

/**
 * Mărcile de produs din catalogul tău (Bosch, Makita…) menționate în răspunsuri: în câte răspunsuri apare fiecare
 * și pe ce loc, în medie, între mărci. Pe ultimele răspunsuri (cel mult 150), cu o căutare simplă de text înaintea expresiei, ca pagina să rămână rapidă.
 */
export function brandMentions(rows: Rows, brands: string[], top = 8) {
  const recent = rows.slice(-150);
  const res = brands.map((b) => ({ brand: b, re: new RegExp(`(^|[^\\p{L}\\p{N}])${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "iu"), lower: b.toLowerCase(), hits: 0, posSum: 0 }));
  for (const r of recent) {
    if (r.run.model === ERROR_MODEL) continue;
    const text = r.run.answer;
    const lower = text.toLowerCase();
    const found = res.filter((x) => lower.includes(x.lower)).map((x) => ({ x, i: text.search(x.re) })).filter((f) => f.i >= 0).sort((a, b) => a.i - b.i);
    found.forEach((f, k) => { f.x.hits++; f.x.posSum += k + 1; });
  }
  const answers = recent.filter((r) => r.run.model !== ERROR_MODEL).length;
  return res.filter((x) => x.hits).map((x) => ({ brand: x.brand, visibility: Math.round((x.hits / Math.max(1, answers)) * 100), avgPosition: +(x.posSum / x.hits).toFixed(1) }))
    .sort((a, b) => b.visibility - a.visibility || a.avgPosition - b.avgPosition).slice(0, top);
}

export { catalogBrands } from "./store-context";

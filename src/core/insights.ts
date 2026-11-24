import { compareSameQuestions, latestAnswers } from "./engine-view";
import { isLookalike } from "./ai/lookalike";
import { and, asc, desc, eq, gte, ilike, inArray, sql as dsql, type SQL } from "drizzle-orm";
import { canAct, localMarketplace, sourceGroup, sourceKind, type SourceCtx } from "./source-kind";
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

export async function loadBase(project: Project, days = 30, opts: { answers?: boolean } = {}) {
  const [all, competitors, audit] = await Promise.all([
    // Fără textul răspunsurilor, în afară de cine îl cere (răspunsurile întregi, tonul): pagina citește mult mai puțin.
    projectRuns(project.id, daysAgo(days), { withErrors: true, answers: opts.answers ?? false }),
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
  const map = new Map<string, { prompt: string; category: string | null; intent: string; byProvider: Record<string, { me: number | null; top: string[]; lookalikes: string[]; runId: string; answer: string; failure: string | null }> }>();
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
    e.byProvider[r.run.provider] = { me: failure ? null : ms.find((m) => m.domain === domain)?.position ?? null, top: ms.slice(0, 3).map((m) => m.name ?? m.domain),
      // Site cu nume aproape ca al tău, dar alt site (B59): AI-ul te-a confundat cu el.
      lookalikes: failure ? [] : [...new Set(ms.map((m) => m.domain).filter((d) => isLookalike(d, domain)))], runId: r.run.id, answer: cleanAnswer(r.run.answer), failure };
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
const incompleteSql = () => { const P = schema.products; return dsql`(coalesce(${P.gtin}, '') = '' or coalesce(${P.brand}, '') = '' or coalesce(octet_length(${P.description}), 0) = 0 or coalesce(${P.imageUrl}, '') = '')`; };

/** Numărătorile din pagina Produse, pe tot catalogul: calculate în worker (`panel_snapshots`), nu la fiecare deschidere. */
export async function productCounts(projectId: string) {
  const P = schema.products, S = schema.productAiStats;
  const [counts] = await db.select({
    total: dsql<number>`count(*)::int`,
    recommended: dsql<number>`count(*) filter (where ${S.appearances} > 0)::int`,
    wrongPrice: dsql<number>`count(*) filter (where ${S.priceWrong})::int`,
    incomplete: dsql<number>`count(*) filter (where ${incompleteSql()})::int`,
    // Aceleași cifre doar pe „Produse focus”, arătate primele (ZoZo, 23.11.2026).
    focusTotal: dsql<number>`count(*) filter (where ${P.focus})::int`,
    focusRecommended: dsql<number>`count(*) filter (where ${P.focus} and ${S.appearances} > 0)::int`,
    focusWrongPrice: dsql<number>`count(*) filter (where ${P.focus} and ${S.priceWrong})::int`,
    focusIncomplete: dsql<number>`count(*) filter (where ${P.focus} and ${incompleteSql()})::int`,
  }).from(P).leftJoin(S, eq(S.productId, P.id)).where(eq(P.projectId, projectId));
  return {
    total: counts?.total ?? 0, recommended: counts?.recommended ?? 0, wrongPriceCount: counts?.wrongPrice ?? 0, incompleteCount: counts?.incomplete ?? 0,
    focus: { total: counts?.focusTotal ?? 0, recommended: counts?.focusRecommended ?? 0, wrongPrice: counts?.focusWrongPrice ?? 0, incomplete: counts?.focusIncomplete ?? 0 },
  };
}

/**
 * Lista din pagina Produse: cel mult 100 de rânduri. Întâi produsele numite de AI (puține, din index), apoi restul
 * în ordinea indexului (în stoc, cele mai vândute): fără sortare pe tot catalogul la fiecare deschidere.
 */
export async function productInsights(project: Project, opts: { f?: string; q?: string; tracked?: string[]; focus?: boolean } = {}) {
  const P = schema.products, S = schema.productAiStats;
  const f = opts.f as ProductFilter | undefined;
  const conds: SQL[] = [eq(P.projectId, project.id)];
  if (opts.focus) conds.push(eq(P.focus, true));
  if (f === "recomandate") conds.push(dsql`${S.appearances} > 0`);
  if (f === "pret") conds.push(dsql`${S.priceWrong}`);
  if (f === "stoc") conds.push(eq(P.inStock, false));
  if (f === "urmarite") conds.push(opts.tracked?.length ? inArray(P.id, opts.tracked) : dsql`false`);
  if (f === "populare") conds.push(dsql`${P.popularityRank} is not null`);
  if (f === "incomplete") conds.push(incompleteSql());
  if (opts.q) conds.push(ilike(P.title, `%${opts.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
  const select = (extra: SQL[]) => db.select({
    id: P.id, title: P.title, url: P.url, popularityRank: P.popularityRank, brand: P.brand, category: P.category, price: P.price, currency: P.currency, inStock: P.inStock, gtin: P.gtin,
    hasDescription: dsql<boolean>`coalesce(octet_length(${P.description}), 0) > 0`, hasImage: dsql<boolean>`coalesce(${P.imageUrl}, '') <> ''`,
    mentions: dsql<number>`coalesce(${S.appearances}, 0)::int`, providersMap: S.providers, avgPositionRaw: S.avgPosition, wrongPricesRaw: S.wrongPrices,
  }).from(P).leftJoin(S, eq(S.productId, P.id)).where(and(...conds, ...extra));
  // Forma condiției și „desc nulls last” contează: așa Postgres citește direct primele rânduri din products_project_stock_rank_idx
  // (3 ms în loc de 200 ms pe 28.000 de produse cu procesorul limitat ca pe Render).
  const LIMIT = 100;
  let list;
  if (f === "populare") list = await select([]).orderBy(asc(P.popularityRank)).limit(LIMIT);
  else {
    const named = await select([dsql`${S.appearances} > 0`]).orderBy(desc(S.appearances), desc(P.inStock), dsql`${P.popularityRank} asc nulls last`).limit(LIMIT);
    const rest = named.length < LIMIT && f !== "recomandate"
      ? await select([dsql`(${S.productId} is null or ${S.appearances} = 0)`]).orderBy(dsql`${P.inStock} desc nulls last`, dsql`${P.popularityRank} asc nulls last`).limit(LIMIT - named.length)
      : [];
    list = [...named, ...rest];
  }
  return {
    list: list.map(({ providersMap, avgPositionRaw, wrongPricesRaw, ...p }) => ({ ...p, providers: providersMap ? Object.keys(providersMap) : [], avgPosition: avgPositionRaw ? parseFloat(avgPositionRaw) : null, wrongPrices: wrongPricesRaw ?? [] })),
  };
}

/** Surse: ce site-uri citesc AI-urile și unde apar concurenții, dar tu nu. */
export function sourceInsights(rows: Rows, domain: string, competitorDomains: string[], extra: { ownDomains?: string[]; brands?: string[]; country?: string } = {}) {
  const ctx: SourceCtx = { ownDomains: [domain, ...(extra.ownDomains ?? [])], competitorDomains, brands: extra.brands ?? [] };
  const all = new Map<string, { n: number; withMe: number; withComp: number; providers: Set<string> }>();
  for (const { run } of rows) {
    const ms = run.mentions as Mention[];
    const me = ms.some((m) => m.domain === domain);
    const comp = ms.some((m) => competitorDomains.includes(m.domain));
    const seen = new Set<string>();
    for (const s of run.sources as { url: string }[]) {
      const raw = domainOf(s.url);
      if (!raw) continue;
      // Subdomeniile unui comparator (roaba.compari.ro …) sunt același comparator (B55).
      const d = sourceGroup(raw, sourceKind(raw, ctx));
      if (seen.has(d)) continue;
      seen.add(d);
      const e = all.get(d) ?? { n: 0, withMe: 0, withComp: 0, providers: new Set() };
      e.n++; if (me) e.withMe++; if (comp) e.withComp++; e.providers.add(run.provider);
      all.set(d, e);
    }
  }
  const list = [...all.entries()].map(([d, e]) => ({ domain: d, kind: sourceKind(d, ctx), citations: e.n, withMe: e.withMe, gap: e.withComp - e.withMe, providers: [...e.providers] }))
    .sort((a, b) => b.citations - a.citations);
  // Oportunități doar unde magazinul poate face ceva (nu alte magazine, producători, propriul site sau un marketplace din altă țară).
  const realistic = (x: { domain: string; kind: string }) => x.kind !== "marketplace" || !extra.country || localMarketplace(x.domain, extra.country);
  return { list, gaps: list.filter((s) => s.gap > 0 && canAct(s.kind) && realistic(s)).sort((a, b) => b.gap - a.gap) };
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
    // Variația doar pe aceleași întrebări (KNOWLEDGE B58): o zi cu alte întrebări nu se compară.
    const same = cur ? compareSameQuestions(rows.filter((r) => r.run.provider === p.id), project.domain) : null;
    return { provider: p.id, checked: !!cur, visibility: cur?.visibility ?? 0, avgPosition: cur?.avgPosition ? parseFloat(cur.avgPosition) : null, delta: same?.delta ?? null };
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
  // Aceeași definiție ca „Cum te văd AI-urile”: ultimul răspuns al fiecărui AI la fiecare întrebare din lista curentă.
  const today = latestAnswers(rows);
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

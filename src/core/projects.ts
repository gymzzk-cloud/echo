import { reportProgress } from "./jobs";
import { and, asc, desc, eq, gte, inArray, sql as dsql } from "drizzle-orm";
import { PROBLEM_TITLES } from "./audit/problems";
import { emitEvent } from "./platform";
import { projectRuns } from "./project-runs";
import { detectRivals } from "./rivals-job";
import { getStore, mergeStableFacts, recordAudit, registerAiStores } from "./stores";
import type { StoreFacts } from "./audit";
import { db, schema } from "@/db";
import type { Mention } from "@/db/schema";
import { daysAgo, decrypt, domainOf, encrypt, parseStoreUrl, today } from "@/lib/util";
import { focusFirstDetail, runAudit, type AuditResult } from "./audit";
import { refreshPopularity, savePopularity } from "./popularity";
import { rankFromItems } from "./connectors/popularity";
import { detectConnector, fetchCatalog, fetchFeedFull, parseFeed, type CatalogItem, type ConnectorKind } from "./connectors";
import { nextSyncAt } from "./connectors/polite";
import { saveCatalogDelivery } from "./policies";
import { applyCachedDetails } from "./catalog-details";
import { ERROR_MODEL, invalidateWorld, isDemo, loadWorld, projectUsageThisMonth, runQuery, usableProviders } from "./ai/engine";
import { costConfig, withinBudget } from "./ai/budget";
import { PROVIDERS, providerLabel } from "./ai/types";
import { isStoreLike } from "./ai/domains";
import { notRivals, SOURCE_ADVICE, type SourceCtx } from "./source-kind";
import { sourceGaps } from "./action-sources";
import { catalogBrands, catalogDescriptionStats, storeAliases } from "./store-context";
import { refreshPrompts } from "./tracked-prompts";
import { pruneStalePriceAlerts } from "./price-alerts";
import { computeFocus } from "./focus";
import { TRIAL_PROVIDERS } from "./onboarding/types";

type Project = typeof schema.projects.$inferSelect;
export { projectRuns };

export const projectBase = (p: Project) => `https://${p.domain}${p.pathPrefix}`;

// ── Catalog ────────────────────────────────────────────────────────────────
export async function syncCatalog(connectionId: string) {
  const [c] = await db.select().from(schema.connections).where(eq(schema.connections.id, connectionId));
  if (!c) return;
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, c.projectId));
  // Sincronizări dublate la coadă: dacă tocmai am sincronizat (sub 10 minute), nu mai cerem nimic de la magazin.
  if (c.lastSyncAt && Date.now() - c.lastSyncAt.getTime() < 10 * 60e3) {
    if (c.status === "pending") await db.update(schema.connections).set({ status: c.lastError ? "error" : "ok" }).where(eq(schema.connections.id, c.id));
    return c.productCount;
  }
  try {
    const secret = c.secret ? decrypt(c.secret) : undefined;
    const now = new Date();
    // La termen data viitoare (12h + decalaj stabil per magazin), contorul de erori se resetează.
    const base = { status: "ok", lastError: null, lastSyncAt: now, failures: 0, nextSyncAt: nextSyncAt(c.id, now) };
    let items: CatalogItem[];
    if (c.kind === "feed") {
      // Feed/API: cereri condiționate (ETag/Last-Modified) și hash; dacă nimic nu s-a schimbat, nu rescriem catalogul.
      const r = await fetchFeedFull(c.url, p.currency, secret, { etag: c.etag, lastModified: c.lastModified });
      if (r.notModified || (r.hash && r.hash === c.contentHash)) {
        await db.update(schema.connections).set(base).where(eq(schema.connections.id, c.id));
        // Catalogul e neschimbat, dar topul vânzărilor al unui API se poate schimba (un feed-fișier neschimbat, nu).
        if (/openapi|swagger/i.test(c.url) && (await refreshPopularity(p.id, "feed", c.url, p.currency, secret))) await ensurePrompts(p.id);
        return c.productCount;
      }
      if (!r.items.length) throw new Error("Nu am găsit produse la acest link. Verifică să fie feed-ul (sau API-ul) de produse și cheia, dacă e nevoie.");
      items = r.items;
      // Descrierile pe care lista nu le dă: cele deja citite din pagina de detaliu a API-ului (jobul catalog_details).
      await applyCachedDetails(p.id, items);
      const d = await saveChangedItems(p.id, items);
      console.log(`catalog ${p.domain}${p.pathPrefix}: ${items.length} produse în ${r.requests} cereri, ${d.changed} noi/schimbate, ${d.gone} dispărute`);
      await db.update(schema.connections).set({ etag: r.etag ?? null, lastModified: r.lastModified ?? null, contentHash: r.hash }).where(eq(schema.connections.id, c.id));
    } else {
      items = await fetchCatalog(c.kind as ConnectorKind, c.url, p.currency, secret);
      if (items.length) await saveChangedItems(p.id, items);
    }
    await refreshPopularity(p.id, c.kind as ConnectorKind, c.url, p.currency, secret, items);
    await db.update(schema.connections).set({ ...base, productCount: items.length }).where(eq(schema.connections.id, c.id));
    await db.update(schema.projects).set({ platform: c.kind }).where(eq(schema.projects.id, p.id));
    invalidateWorld();
    await saveCatalogDelivery(p.id);
    await ensurePrompts(p.id);
    return items.length;
  } catch (e) {
    const failures = (c.failures ?? 0) + 1;
    await db.update(schema.connections).set({ status: "error", lastError: String(e).slice(0, 500), failures, nextSyncAt: nextSyncAt(c.id, new Date(), failures) }).where(eq(schema.connections.id, c.id));
    throw e;
  }
}

/** Conexiunile care au nevoie de sincronizare acum (feed/API, nu fișiere încărcate), cele mai vechi întâi. */
export async function dueConnections(limit = 5) {
  return db.select({ id: schema.connections.id }).from(schema.connections)
    .where(and(dsql`${schema.connections.kind} <> 'upload'`, dsql`coalesce(${schema.connections.nextSyncAt}, ${schema.connections.lastSyncAt} + interval '12 hours', now()) <= now()`))
    .orderBy(dsql`coalesce(${schema.connections.nextSyncAt}, ${schema.connections.lastSyncAt}) nulls first`).limit(limit);
}

/**
 * Sincronizare cu diferențe: scriem doar produsele noi sau schimbate (preț, stoc, titlu…),
 * iar cele care au dispărut din catalog nu mai sunt oferite agenților ca fiind în stoc.
 * O zi obișnuită atinge câteva sute de rânduri, nu tot catalogul.
 */
export async function saveChangedItems(projectId: string, items: CatalogItem[]) {
  const existing = await db.select().from(schema.products).where(eq(schema.products.projectId, projectId));
  const byId = new Map(existing.map((r) => [r.externalId, r]));
  const fmt = (n: number | null) => (n === null || n === undefined ? null : n.toFixed(2));
  const changed = items.filter((it) => {
    const r = byId.get(it.externalId.slice(0, 200));
    if (!r) return true;
    return r.title !== it.title.slice(0, 500) || r.url !== it.url || (r.cartUrl ?? null) !== (it.cartUrl ?? null) || r.price !== fmt(it.price)
      || r.inStock !== it.inStock || (r.brand ?? null) !== (it.brand ?? null) || (r.category ?? null) !== (it.category ?? null)
      || (r.imageUrl ?? null) !== (it.imageUrl ?? null) || (r.gtin ?? null) !== (it.gtin ?? null) || (r.mpn ?? null) !== (it.mpn?.slice(0, 100) ?? null) || (r.description ?? null) !== (it.description ?? null)
      || (r.delivery ?? null) !== (it.delivery ?? null);
  });
  await saveItems(projectId, changed);
  const seen = new Set(items.map((it) => it.externalId.slice(0, 200)));
  const gone = existing.filter((r) => r.inStock && !seen.has(r.externalId)).map((r) => r.id);
  for (let i = 0; i < gone.length; i += 1000) {
    await db.update(schema.products).set({ inStock: false, updatedAt: new Date() }).where(inArray(schema.products.id, gone.slice(i, i + 1000)));
  }
  return { changed: changed.length, gone: gone.length };
}

/** Salvează (insert sau update) produsele unui proiect, în loturi de 500. */
export async function saveItems(projectId: string, items: CatalogItem[]) {
  for (let i = 0; i < items.length; i += 500) {
    const chunk = items.slice(i, i + 500).map((it) => ({
      projectId, externalId: it.externalId.slice(0, 200), title: it.title.slice(0, 500), url: it.url, cartUrl: it.cartUrl ?? null,
      price: it.price?.toFixed(2) ?? null, currency: it.currency, inStock: it.inStock, brand: it.brand ?? null,
      category: it.category ?? null, imageUrl: it.imageUrl ?? null, gtin: it.gtin ?? null, mpn: it.mpn?.slice(0, 100) ?? null, description: it.description ?? null, delivery: it.delivery ?? null, updatedAt: new Date(),
    }));
    await db.insert(schema.products).values(chunk).onConflictDoUpdate({
      target: [schema.products.projectId, schema.products.externalId],
      set: { title: dsql`excluded.title`, url: dsql`excluded.url`, cartUrl: dsql`excluded.cart_url`, price: dsql`excluded.price`, inStock: dsql`excluded.in_stock`, brand: dsql`excluded.brand`, category: dsql`excluded.category`, imageUrl: dsql`excluded.image_url`, gtin: dsql`excluded.gtin`, mpn: dsql`excluded.mpn`, description: dsql`excluded.description`, delivery: dsql`excluded.delivery`, updatedAt: dsql`now()` },
    });
  }
}

/** Feed încărcat ca fișier (fără URL): îl citim o dată și îl salvăm ca o conexiune „upload”. */
export async function importFeedFile(projectId: string, fileName: string, body: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const items = parseFeed(body, p.currency);
  if (!items.length) throw new Error("Nu am găsit produse în fișier. Verifică să aibă cel puțin titlu și link pentru fiecare produs.");
  await saveItems(projectId, items);
  await savePopularity(projectId, rankFromItems(items));
  await db.insert(schema.connections).values({ projectId, kind: "upload", url: `fișier: ${fileName}`, status: "ok", productCount: items.length, lastSyncAt: new Date() });
  invalidateWorld();
  await ensurePrompts(projectId);
  return items.length;
}

export async function connectStore(projectId: string, opts: { kind?: ConnectorKind | "auto"; url?: string; secret?: string }) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  let kind = opts.kind;
  let url = opts.url?.trim() || projectBase(p);
  // Detectare automată cu un link care nu e chiar magazinul (feed, API, openapi.yaml): îl tratăm ca feed.
  if ((!kind || kind === "auto") && opts.url?.trim() && !/^https?:\/\/[^/]+\/?$/.test(opts.url.trim()) && opts.url.trim().replace(/\/$/, "") !== projectBase(p)) kind = "feed";
  if (!kind || kind === "auto") {
    const d = await detectConnector(projectBase(p));
    if (!d) throw new Error("Nu am putut detecta automat Shopify sau WooCommerce. Adaugă linkul feed-ului (XML, CSV, JSON sau YAML), încarcă fișierul sau alege platforma și pune cheia API.");
    kind = d;
    url = projectBase(p);
  }
  const secret = opts.secret?.trim() ? encrypt(opts.secret.trim()) : null;
  const [c] = await db.insert(schema.connections).values({ projectId, kind, url, secret }).returning();
  return c;
}

// ── Căutări urmărite ───────────────────────────────────────────────────────
/** Reface căutările propuse din catalogul real (vezi tracked-prompts.ts). Nume păstrat pentru apelurile vechi. */
export async function ensurePrompts(projectId: string) {
  return refreshPrompts(projectId);
}

// ── Rulare zilnică pentru un proiect ───────────────────────────────────────
/** După atâtea erori la rând, un AI nu mai e întrebat în aceeași rulare. */
const MAX_STRIKES = 3;
export async function runProject(projectId: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const [org] = await db.select({ plan: schema.orgs.plan }).from(schema.orgs).where(eq(schema.orgs.id, p.orgId));
  // Testul gratuit (onboarding, fără plan): întrebările sunt cele confirmate de client, doar pe AI-urile ieftine.
  const trial = !!p.onboarding && org?.plan === "trial";
  // Doar baza de date, fără AI: scoate produsele ieșite din stoc, completează până la limită. Rulează și fără chei.
  if (!trial) await refreshPrompts(projectId);
  // Fără chei AI nu inventăm răspunsuri: modul DEMO rulează doar dacă e cerut explicit (seed-ul demo).
  if (isDemo() && process.env.ALLOW_DEMO_AI !== "1") return;
  const providers = usableProviders().filter((prov) => !trial || (TRIAL_PROVIDERS as readonly string[]).includes(prov.id));
  const ps = await db.select().from(schema.prompts).where(and(eq(schema.prompts.projectId, projectId), eq(schema.prompts.active, true)));
  const world = await loadWorld();
  const seen: Mention[] = [];
  const { monthlyBudgetUsd } = costConfig();
  let spent = (await projectUsageThisMonth(projectId)).usd;
  let asked = 0;
  let failed = 0;
  const strikes = new Map<string, { n: number; msg: string }>();
  // Progresul real pentru bara de stare („Analiza AI: întrebarea 12 din 30”). Întrebările puse deja azi nu se plătesc din nou:
  // după o repornire, analiza trece repede peste ele și continuă de unde a rămas.
  await reportProgress(0, ps.length);
  for (const [i, pr] of ps.entries()) {
    // Plafonul lunar: ne oprim înainte să-l depășim și anunțăm o singură dată pe zi.
    if (!withinBudget(spent, monthlyBudgetUsd)) {
      await alert(projectId, "ai_budget", "warn", "Am pus luna aceasta toate întrebările incluse în plan. Restul întrebărilor rulează luna viitoare.", true);
      break;
    }
    // Limba întrebării decide piața (un magazin poate urmări și întrebări în maghiară).
    const lang = (pr.language === "hu" || pr.language === "ro" ? pr.language : p.language) as "ro" | "hu";
    const country = (lang === p.language ? p.country : lang === "hu" ? "HU" : "RO") as "RO" | "HU";
    const runs = await Promise.all(providers.map((prov) => runQuery(prov.id, { query: pr.text, language: lang, country }, world,
      { skipReason: (strikes.get(prov.id)?.n ?? 0) >= MAX_STRIKES ? strikes.get(prov.id)!.msg : undefined })));
    // Un AI care greșește de câteva ori la rând (cheie greșită, parametru respins) nu mai e întrebat în această rulare:
    // fără zeci de erori și fără timp pierdut. Întrebările rămase primesc același motiv, ca să se vadă în panou.
    for (const r of runs) {
      if (!r) continue;
      if (r.model === ERROR_MODEL) strikes.set(r.provider, { n: (strikes.get(r.provider)?.n ?? 0) + 1, msg: (strikes.get(r.provider)?.msg ?? r.answer.replace(/^\(Eroare [a-z]+: |\)$/g, "")) });
      else strikes.delete(r.provider);
    }
    await db.insert(schema.promptRuns).values(runs.filter(Boolean).map((r) => ({ promptId: pr.id, runId: r.id }))).onConflictDoNothing();
    for (const r of runs) if (r) seen.push(...(r.mentions as Mention[]));
    spent = (await projectUsageThisMonth(projectId)).usd;
    asked += runs.length;
    failed += runs.filter((r) => r?.model === ERROR_MODEL).length;
    await reportProgress(i + 1, ps.length);
  }
  console.log(`AI ${p.domain}${p.pathPrefix}: ${ps.length} întrebări, ${asked} rulări, ${failed} erori, cost lunar ${spent.toFixed(3)} USD`);
  await registerAiStores(seen);
  // Concurenții care apar mai bine ca tine, din răspunsurile de mai sus (fără apeluri AI noi).
  await detectRivals(projectId);
  await computeStats(projectId);
  await generateActions(projectId);
}

// ── Statistici zilnice ─────────────────────────────────────────────────────
export function summarize(rows: Awaited<ReturnType<typeof projectRuns>>, domain: string, competitorDomains: string[], auditScore: number | null, exclude: ReadonlySet<string> = new Set()) {
  const by = (prov?: string) => rows.filter((r) => !prov || r.run.provider === prov);
  const calc = (rs: typeof rows) => {
    if (!rs.length) return { visibility: 0, avgPosition: null as number | null, sov: 0, n: 0 };
    let hit = 0, posSum = 0, mine = 0, all = 0;
    for (const { run } of rs) {
      const ms = run.mentions as Mention[];
      const me = ms.find((m) => m.domain === domain);
      if (me) { hit++; posSum += me.position; }
      // Cota: din toate recomandările de magazine (nu doar concurenții din listă), la fel ca pe cardul „Cota din recomandări”.
      // Producătorii și propriile magazine (exclude) nu intră în cotă, ca pe cardul de pe prima pagină.
      for (const m of ms) if (m.domain === domain || ((competitorDomains.includes(m.domain) || isStoreLike(m.domain)) && !exclude.has(m.domain))) { all++; if (m.domain === domain) mine++; }
    }
    return { visibility: Math.round((hit / rs.length) * 100), avgPosition: hit ? +(posSum / hit).toFixed(2) : null, sov: all ? Math.round((mine / all) * 100) : 0, n: rs.length };
  };
  const total = calc(by());
  const score = Math.round(total.visibility * 0.5 + total.sov * 0.2 + (auditScore ?? 50) * 0.3);
  return { total, score, perProvider: PROVIDERS.map((p) => ({ provider: p.id, ...calc(by(p.id)) })) };
}

export async function latestAudit(projectId: string) {
  const [a] = await db.select().from(schema.audits).where(and(eq(schema.audits.projectId, projectId), eq(schema.audits.status, "done"))).orderBy(desc(schema.audits.createdAt)).limit(1);
  return a ?? null;
}

export async function computeStats(projectId: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const comps = (await db.select().from(schema.competitors).where(eq(schema.competitors.projectId, projectId))).map((c) => c.domain);
  const audit = await latestAudit(projectId);
  const day = today();
  const rows = (await projectRuns(projectId, day)).filter((r) => r.run.runDate === day);
  if (!rows.length) return;
  const [own, brands] = await Promise.all([storeAliases(p.id), catalogBrands(projectId)]);
  const exclude = new Set(notRivals(rows.flatMap((r) => (r.run.mentions as Mention[]).map((m) => m.domain)), { ownDomains: [p.domain, ...own], brands }));
  exclude.delete(p.domain);
  const s = summarize(rows, p.domain, comps, audit?.score ?? null, exclude);
  const prev = await db.select().from(schema.dailyStats)
    .where(and(eq(schema.dailyStats.projectId, projectId), eq(schema.dailyStats.provider, "all"))).orderBy(desc(schema.dailyStats.day)).limit(2);
  const values = [
    { projectId, day, provider: "all", visibility: s.total.visibility, avgPosition: s.total.avgPosition?.toString() ?? null, shareOfVoice: s.total.sov, score: s.score },
    ...s.perProvider.filter((x) => x.n > 0).map((x) => ({ projectId, day, provider: x.provider, visibility: x.visibility, avgPosition: x.avgPosition?.toString() ?? null, shareOfVoice: x.sov, score: x.visibility })),
  ];
  for (const v of values) {
    await db.insert(schema.dailyStats).values(v).onConflictDoUpdate({ target: [schema.dailyStats.projectId, schema.dailyStats.day, schema.dailyStats.provider], set: { visibility: v.visibility, avgPosition: v.avgPosition, shareOfVoice: v.shareOfVoice, score: v.score } });
  }
  // Un AI fără niciun răspuns real azi (doar erori) nu are scor pentru azi: ștergem un rând scris mai devreme.
  const unchecked = s.perProvider.filter((x) => x.n === 0).map((x) => x.provider);
  if (unchecked.length) await db.delete(schema.dailyStats).where(and(eq(schema.dailyStats.projectId, projectId), eq(schema.dailyStats.day, day), inArray(schema.dailyStats.provider, unchecked)));
  // Alerte: comparăm cu ziua precedentă înregistrată
  const before = prev.find((x) => x.day !== day);
  if (before) {
    const prevPer = await db.select().from(schema.dailyStats).where(and(eq(schema.dailyStats.projectId, projectId), eq(schema.dailyStats.day, before.day)));
    for (const x of s.perProvider) {
      const old = prevPer.find((r) => r.provider === x.provider);
      if (!old || x.n === 0) continue;
      if (old.visibility > 0 && x.visibility === 0) await alert(projectId, "lost_provider", "bad", `Ai ieșit din recomandările ${providerLabel(x.provider)}.`);
      else if (old.visibility === 0 && x.visibility > 0) await alert(projectId, "won_provider", "good", `${providerLabel(x.provider)} a început să te recomande.`);
      else if (x.visibility - old.visibility <= -20) await alert(projectId, "drop", "warn", `Vizibilitatea la ${providerLabel(x.provider)} a scăzut de la ${old.visibility}% la ${x.visibility}%.`);
    }
  }
  // Preț greșit spus de AI: din calculul salvat pe produs (aceeași sursă și aceeași dovadă ca pagina „Produse în AI”),
  // nu din titlurile din mențiuni (KNOWLEDGE B26). Doar prețurile spuse în rulările de azi; alerta duce la dovadă.
  await priceAlerts(projectId, new Set(rows.map((r) => r.run.id)));
}

async function alert(projectId: string, kind: string, severity: string, message: string, dedupeToday = false) {
  if (dedupeToday) {
    const ex = await db.select({ id: schema.alerts.id }).from(schema.alerts)
      .where(and(eq(schema.alerts.projectId, projectId), eq(schema.alerts.kind, kind), gte(schema.alerts.createdAt, new Date(Date.now() - 864e5)))).limit(1);
    if (ex.length) return;
  }
  await db.insert(schema.alerts).values({ projectId, kind, severity, message });
  await emitEvent(projectId, "alert.created", { kind, severity, message });
}

/** Cheia unei alerte de preț: „price:<productId>:<provider>”; pagina Acasă face din ea linkul spre dovadă. */
export const priceAlertKind = (productId: string, provider: string) => `price:${productId}:${provider}`;

async function priceAlerts(projectId: string, todayRunIds: Set<string>) {
  const S = schema.productAiStats, P = schema.products;
  const stats = await db.select({ productId: S.productId, wrongPrices: S.wrongPrices, realPrice: S.realPrice, realSource: S.realSource, title: P.title, price: P.price })
    .from(S).innerJoin(P, eq(P.id, S.productId))
    .where(and(eq(S.projectId, projectId), dsql`jsonb_array_length(${S.wrongPrices}) > 0`)).limit(200);
  for (const s of stats) for (const w of s.wrongPrices) {
    // Comparăm cu prețul cu care a comparat și calculul: de pe site când l-am citit, altfel din catalog.
    const ref = s.realPrice ?? s.price;
    if (!w.runId || !todayRunIds.has(w.runId) || !ref) continue;
    const where = s.realSource === "site" ? "de pe site" : "din catalog";
    await alert(projectId, priceAlertKind(s.productId, w.provider), "warn", `${providerLabel(w.provider)} spune ${fmtLei(w.price)} pentru „${s.title}”, dar prețul ${where} e ${fmtLei(parseFloat(ref))}.`, true);
  }
  await pruneStalePriceAlerts(projectId);
}

const fmtLei = (n: number) => `${n.toLocaleString("ro-RO", { maximumFractionDigits: 2 })} lei`;

// ── Acțiuni recomandate ────────────────────────────────────────────────────
const IMPACT: Record<string, "mare" | "mediu" | "mic"> = { robots: "mare", firewall: "mare", "jsonld-product": "mare", "content-product": "mediu", "jsonld-org": "mediu", trust: "mediu", llms: "mic", sitemap: "mediu", "sitemap-robots": "mic", meta: "mic", speed: "mediu" };
const EFFORT: Record<string, "mic" | "mediu" | "mare"> = { robots: "mic", firewall: "mic", "jsonld-product": "mediu", "content-product": "mare", "jsonld-org": "mic", trust: "mic", llms: "mic", sitemap: "mic", "sitemap-robots": "mic", meta: "mic", speed: "mare" };

/**
 * Cheile acțiunilor din audit care nu mai sunt probleme: doar verificările care au trecut acum
 * (o verificare care nu a putut rula, „info”, nu închide nimic).
 */
export function staleAuditKeys(checks: { id: string; status: string }[]): string[] {
  const passed = new Set(checks.filter((c) => c.status === "pass").map((c) => c.id));
  // Sitemap găsit și declarat: verificarea „declarat în robots.txt” nici nu mai apare, deci e rezolvată.
  if (passed.has("sitemap") && !checks.some((c) => c.id === "sitemap-robots")) passed.add("sitemap-robots");
  return [...passed].map((id) => `audit:${id}`);
}

async function upsertAction(projectId: string, a: { key: string; title: string; why: string; howTo?: string; fixKind?: string; impact: string; effort: string }, baseline: number | null) {
  // Idempotent: rulat de două ori dă același rând; titlul și detaliul se actualizează (ex. timpul de răspuns măsurat acum).
  await db.insert(schema.actions).values({ projectId, ...a, baselineVisibility: baseline })
    // Impactul se recalculează din date (pricy.ro citat în 2 răspunsuri, apoi în 10): nu rămâne cel de la prima creare.
    .onConflictDoUpdate({ target: [schema.actions.projectId, schema.actions.key], set: { title: a.title, why: a.why, howTo: a.howTo, impact: a.impact, effort: a.effort, fixKind: a.fixKind } });
}

export async function generateActions(projectId: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const audit = await latestAudit(projectId);
  const [stat] = await db.select().from(schema.dailyStats).where(and(eq(schema.dailyStats.projectId, projectId), eq(schema.dailyStats.provider, "all"))).orderBy(desc(schema.dailyStats.day)).limit(1);
  const baseline = stat?.visibility ?? null;

  if (audit?.result) {
    const checks = (audit.result as AuditResult).checks;
    const focus = (audit.result as AuditResult).focus;
    for (const c of checks) {
      // „Nu am putut verifica” nu devine niciodată o acțiune „lipsește X”.
      if (c.status === "pass" || c.status === "info" || c.status === "unknown") continue;
      await upsertAction(projectId, { key: `audit:${c.id}`, title: PROBLEM_TITLES[c.id] ?? c.title, why: focusFirstDetail(c, focus), fixKind: c.fixKind, impact: IMPACT[c.id] ?? "mediu", effort: EFFORT[c.id] ?? "mediu" }, baseline);
    }
    // O recomandare din audit a cărei verificare trece acum nu mai rămâne deschisă (ex. sitemap găsit după corectarea detectorului).
    const passing = staleAuditKeys(checks);
    // O recomandare nouă (neîncepută) a cărei verificare nu a putut fi făcută acum dispare: nu afirmăm ce nu știm sigur.
    const unsure = checks.filter((c) => c.status === "unknown").map((c) => `audit:${c.id}`);
    if (unsure.length) await db.delete(schema.actions).where(and(eq(schema.actions.projectId, projectId), inArray(schema.actions.key, unsure), eq(schema.actions.status, "noua")));
    if (passing.length) {
      await db.delete(schema.actions).where(and(eq(schema.actions.projectId, projectId), inArray(schema.actions.key, passing), eq(schema.actions.status, "noua")));
      await db.update(schema.actions).set({ status: "rezolvata", resolvedAt: new Date() })
        .where(and(eq(schema.actions.projectId, projectId), inArray(schema.actions.key, passing), eq(schema.actions.status, "in_lucru")));
    }
  }
  // Surse unde apar concurenții, dar tu nu: doar locuri unde magazinul chiar poate apărea (comparatoare, recenzii,
  // directoare, presă, forumuri, marketplace-uri). Nu alte magazine, site-uri de producător sau propriile magazine.
  const rows = await projectRuns(projectId, daysAgo(14));
  const comps = (await db.select().from(schema.competitors).where(eq(schema.competitors.projectId, projectId))).map((c) => c.domain);
  const [own, brands] = await Promise.all([storeAliases(p.id), catalogBrands(projectId)]);
  const srcCtx: SourceCtx = { ownDomains: [p.domain, ...own], competitorDomains: comps, brands };
  const picked = sourceGaps(rows, { domain: p.domain, competitorDomains: comps, ctx: srcCtx, country: p.country ?? "RO" }).slice(0, 5);
  // Recomandările vechi spre surse care nu mai trec regula (alt magazin, producător, subdomeniu de comparator,
  // marketplace din altă țară) se șterg, dacă nu au fost începute.
  const oldSources = await db.select({ key: schema.actions.key }).from(schema.actions)
    .where(and(eq(schema.actions.projectId, projectId), eq(schema.actions.status, "noua"), dsql`${schema.actions.key} like 'source:%'`));
  const keep = new Set(picked.map((g) => `source:${g.domain}`));
  const drop = oldSources.map((x) => x.key).filter((k) => !keep.has(k));
  if (drop.length) await db.delete(schema.actions).where(and(eq(schema.actions.projectId, projectId), inArray(schema.actions.key, drop), eq(schema.actions.status, "noua")));
  for (const g of picked) {
    const who = g.providers.map(providerLabel).join(", ");
    const asks = g.examples.map((q) => `„${q}”`).join(", ");
    // KNOWLEDGE B46: un comparator e una dintre sursele AI-ului, nu „motivul” și nici soluția garantată.
    await upsertAction(projectId, {
      key: `source:${g.domain}`,
      title: g.kind === "marketplace" ? `${who} citește ${g.domain} când recomandă concurenții` : `${who} citește ${g.domain} (${g.kind}) când recomandă concurenții`,
      why: `În ${g.answers} răspunsuri din ultimele 14 zile, ${who} a citit ${g.domain} și a recomandat concurenți, nu pe tine. De exemplu la ${asks}. E una dintre sursele AI-ului, nu singura.`,
      howTo: `${SOURCE_ADVICE[g.kind] ?? ""}\nRăspunsurile exacte sunt în Vizibilitate → Răspunsuri și în pagina Surse.`,
      fixKind: "source", impact: g.answers >= 5 ? "mare" : "mediu", effort: "mediu",
    }, baseline);
  }
  // Produse pe care AI-urile le recomandă, dar la alt magazin; și prețuri greșite spuse de AI. Din calculul salvat pe
  // produs (aceeași sursă ca pagina Produse în AI), cu primele produse numite ca dovadă.
  await productActions(projectId, baseline);
  // Niciun produs numit: din calculul salvat pe produs (aceeași sursă ca pagina Produse), nu din titlurile vechi din mențiuni.
  const [named] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.productAiStats)
    .where(and(eq(schema.productAiStats.projectId, projectId), dsql`${schema.productAiStats.appearances} > 0`));
  const [totalProducts] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.products).where(eq(schema.products.projectId, projectId));
  if ((named?.n ?? 0) > 0) {
    await db.delete(schema.actions).where(and(eq(schema.actions.projectId, projectId), eq(schema.actions.key, "products:none"), eq(schema.actions.status, "noua")));
  } else if ((totalProducts?.n ?? 0) > 0 && rows.length > 0) {
    await upsertAction(projectId, {
      key: "products:none", title: "Niciun produs nu e recomandat pe nume",
      why: "AI-urile pot menționa magazinul, dar nu recomandă produse anume. Descrierile și datele structurate complete schimbă asta.",
      howTo: "Începe cu primele 20 de produse după vânzări: descriere de 150+ cuvinte, GTIN, brand, recenzii.", fixKind: "content", impact: "mare", effort: "mare",
    }, baseline);
  }
}

async function productActions(projectId: string, baseline: number | null) {
  const S = schema.productAiStats, P = schema.products;
  const top = (where: ReturnType<typeof dsql>) => db.select({ title: P.title, mpn: P.mpn, n: S.appearances, providers: S.providers })
    .from(S).innerJoin(P, eq(P.id, S.productId)).where(and(eq(S.projectId, projectId), where)).orderBy(desc(S.appearances)).limit(3);
  const [counts] = await db.select({
    elsewhere: dsql<number>`count(*) filter (where ${S.appearances} > 0 and ${S.withStore} = 0)::int`,
    wrong: dsql<number>`count(*) filter (where ${S.priceWrong})::int`,
  }).from(S).where(eq(S.projectId, projectId));
  const name = (x: { title: string; mpn: string | null; n: number }) => `${x.title}${x.mpn ? ` (${x.mpn})` : ""}, ${x.n} ${x.n === 1 ? "răspuns" : "răspunsuri"}`;
  const clear = (key: string) => db.delete(schema.actions).where(and(eq(schema.actions.projectId, projectId), eq(schema.actions.key, key), eq(schema.actions.status, "noua")));

  if (counts?.elsewhere) {
    const ex = await top(dsql`${S.appearances} > 0 and ${S.withStore} = 0`);
    await upsertAction(projectId, {
      key: "products:elsewhere",
      title: `${counts.elsewhere} ${counts.elsewhere === 1 ? "produs al tău e recomandat" : "produse ale tale sunt recomandate"} de AI, dar la alt magazin`,
      why: `AI-ul numește produsul, dar trimite cumpărătorul în alt magazin. Cele mai des numite: ${ex.map(name).join("; ")}.`,
      howTo: "Deschide fiecare produs din listă: fișa arată ce magazine a numit AI-ul în locul tău, ce surse a citit și ce prețuri a spus.\nVerifică întâi prețul și stocul (pe site, în feed și pe comparatoarele citate), apoi pagina produsului (descriere, EAN, recenzii).\nÎncepe cu produsele cu cele mai multe răspunsuri.",
      fixKind: "elsewhere", impact: "mare", effort: "mediu",
    }, baseline);
  } else await clear("products:elsewhere");

  if (counts?.wrong) {
    const ex = await top(dsql`${S.priceWrong}`);
    await upsertAction(projectId, {
      key: "products:price",
      title: `AI-urile spun alt preț decât al tău la ${counts.wrong} ${counts.wrong === 1 ? "produs" : "produse"}`,
      why: `Un preț greșit spus de AI face produsul să pară mai scump sau neclar. Exemple: ${ex.map((x) => x.title).join("; ")}.`,
      howTo: "Deschide lista: fiecare produs are rândul exact din răspunsul AI-ului și prețul tău de pe site.\nDacă prețul vechi vine din feed sau din pagină, corectează-l acolo; dacă vine de pe un comparator, actualizează oferta de acolo.",
      fixKind: "price", impact: "mare", effort: "mic",
    }, baseline);
  } else await clear("products:price");
}

/** Măsoară efectul acțiunilor rezolvate de cel puțin 14 zile. */
export async function measureActionEffects(projectId: string) {
  const done = await db.select().from(schema.actions).where(and(eq(schema.actions.projectId, projectId), eq(schema.actions.status, "rezolvata")));
  const [stat] = await db.select().from(schema.dailyStats).where(and(eq(schema.dailyStats.projectId, projectId), eq(schema.dailyStats.provider, "all"))).orderBy(desc(schema.dailyStats.day)).limit(1);
  return done.map((a) => ({
    ...a,
    effect: a.resolvedAt && Date.now() - a.resolvedAt.getTime() > 14 * 864e5 && a.baselineVisibility !== null && stat ? stat.visibility - a.baselineVisibility : null,
  }));
}

// ── Audit pentru proiect ───────────────────────────────────────────────────
export async function auditProject(projectId: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const [a] = await db.insert(schema.audits).values({ projectId, url: projectBase(p), domain: p.domain }).returning();
  const r = await runAuditRow(a.id);
  // Recomandările urmează imediat auditul: cele rezolvate (sau găsite greșit înainte) se închid.
  await generateActions(projectId);
  return r;
}

export async function runAuditRow(auditId: string) {
  const [a] = await db.select().from(schema.audits).where(eq(schema.audits.id, auditId));
  try {
    // Paginile de produs din catalogul conectat sunt cele mai sigure pentru verificarea datelor structurate.
    // Aceleași pagini de la o rulare la alta (ordine fixă), ca scorul să nu depindă de ce produs iese întâmplător.
    const productUrls = a.projectId
      ? (await db.select({ url: schema.products.url }).from(schema.products).where(and(eq(schema.products.projectId, a.projectId), eq(schema.products.inStock, true))).orderBy(asc(schema.products.id)).limit(2)).map((x) => x.url).filter(Boolean)
      : [];
    // Descrierile pe tot catalogul (SQL), nu pe o singură pagină.
    // „Produse focus” calculat cel puțin o dată înainte, ca auditul să aibă și scorul pe focus.
    if (a.projectId) {
      const [pf] = await db.select({ cfg: schema.projects.focusConfig }).from(schema.projects).where(eq(schema.projects.id, a.projectId));
      if (!pf?.cfg?.computedAt) await computeFocus(a.projectId);
    }
    const [descriptions, descriptionsFocus] = a.projectId ? await Promise.all([catalogDescriptionStats(a.projectId), catalogDescriptionStats(a.projectId, true)]) : [undefined, undefined];
    const r = await runAudit(a.url, { productUrls, descriptions, descriptionsFocus });
    // Site inaccesibil: nu salvăm un scor 0 înșelător, marcăm auditul ca eșuat.
    if (r.error && !r.checks.some((c) => c.status === "pass")) throw new Error(r.error);
    // Datele stabile ale firmei lipsă acum, dar găsite la o verificare anterioară, se refolosesc
    const { domain, pathPrefix } = parseStoreUrl(a.url);
    const prev = await getStore(domain, pathPrefix ?? "");
    const merged = mergeStableFacts(r.facts, (prev?.facts as StoreFacts | null) ?? null, prev?.factsCheckedAt ?? null);
    r.facts = merged.facts;
    if (merged.reused.length) r.reusedFacts = merged.reused;
    await recordAudit(a, r);
    await db.update(schema.audits).set({ status: "done", score: r.score, result: r }).where(eq(schema.audits.id, auditId));
    if (a.projectId && r.platform && r.platform !== "necunoscută") {
      await db.update(schema.projects).set({ platform: r.platform }).where(and(eq(schema.projects.id, a.projectId)));
    }
    return r;
  } catch (e) {
    await db.update(schema.audits).set({ status: "error", result: { error: (e as Error).message ?? String(e) } }).where(eq(schema.audits.id, auditId));
    await recordAudit(a, null).catch(() => {});
    throw e;
  }
}

export async function projectsForOrg(orgId: string) {
  return db.select().from(schema.projects).where(eq(schema.projects.orgId, orgId)).orderBy(schema.projects.createdAt);
}

export async function allProjectIds() {
  return (await db.select({ id: schema.projects.id }).from(schema.projects)).map((x) => x.id);
}


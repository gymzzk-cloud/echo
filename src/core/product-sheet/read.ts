import { and, asc, desc, eq, gte, inArray, ne, or, sql as dsql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Mention } from "@/db/schema";
import { daysAgo, normalizeText } from "@/lib/util";
import { ERROR_MODEL } from "../ai/types";
import { applyRules, googleItem, labelsFor, type FeedProduct } from "../feed";
import { openAiRow } from "../feed-channels/openai";
import { effectivePolicy } from "../feed-channels/policy-links";
import { normUrl } from "../product-visibility";
import { googleFeedReport, openAiReport, pageReport } from "./channels";
import type { SheetRun } from "./answers";

/**
 * Citirile fișei unui produs. Fiecare interogare filtrează după magazin (projectId vine din currentProject(), care
 * verifică organizația). Pagina citește un singur produs: nimic pe tot catalogul, nimic în afară de câteva rânduri.
 */

const P = schema.products;
export const SHEET_WINDOW_DAYS = 30;
export const SHEET_MAX_RUNS = 15;

/** Căutarea unui produs în tot catalogul: cod din catalog, cod producător, EAN, link sau cuvintele din nume. Cel mult 10. */
export async function findCatalogProducts(projectId: string, raw: string) {
  const q = raw.trim().slice(0, 300);
  if (!q) return [];
  const cols = { id: P.id, title: P.title, externalId: P.externalId, mpn: P.mpn, gtin: P.gtin, brand: P.brand, price: P.price, currency: P.currency, inStock: P.inStock, url: P.url };
  if (/^https?:\/\/|^www\.|\.[a-z]{2,}\//i.test(q)) {
    const u = normUrl(q);
    return db.select(cols).from(P).where(and(eq(P.projectId, projectId), dsql`regexp_replace(lower(${P.url}), '^https?://(www\\.)?|[?#].*$|/+$', '', 'g') = ${u}`)).limit(10);
  }
  const code = q.replace(/\s+/g, "");
  const exact: SQL = or(eq(P.externalId, q), eq(P.gtin, code), eq(P.mpn, q), dsql`lower(${P.mpn}) = lower(${q})`, dsql`lower(${P.externalId}) = lower(${q})`)!;
  const terms = normalizeText(q).split(" ").filter((w) => w.length > 1).slice(0, 8);
  const named = terms.length ? dsql`(${dsql.join(terms.map((w) => dsql`unaccent_lower(${P.title}) like ${`%${w.replace(/[%_\\]/g, "\\$&")}%`}`), dsql` and `)})` : dsql`false`;
  return db.select(cols).from(P).where(and(eq(P.projectId, projectId), or(exact, named)))
    .orderBy(dsql`(${exact}) desc`, asc(P.popularityRank), desc(P.inStock), asc(P.title)).limit(10);
}

/** Etichetele automate ale unui singur produs, cu aceleași reguli ca feed-ul (labelsFor), din câteva interogări mici. */
async function productLabels(projectId: string, domain: string, p: { id: string; title: string; inStock: boolean; price: string | null; gtin: string | null; imageUrl: string | null; brand: string | null }) {
  const [titles, [clicks], others] = await Promise.all([
    db.execute(dsql`select distinct m->>'productTitle' as t from prompt_runs pr join runs r on r.id = pr.run_id join prompts q on q.id = pr.prompt_id,
      jsonb_array_elements(r.mentions) m where q.project_id = ${projectId} and r.run_date >= ${daysAgo(30)} and m->>'domain' = ${domain} and m->>'productTitle' is not null limit 5000`),
    db.select({ n: dsql<number>`count(*)::int` }).from(schema.clicks)
      .where(and(eq(schema.clicks.projectId, projectId), eq(schema.clicks.productId, p.id), gte(schema.clicks.createdAt, new Date(Date.now() - 30 * 864e5)))),
    p.gtin ? db.select({ min: dsql<string | null>`min(${P.price})` }).from(P).where(and(eq(P.gtin, p.gtin), ne(P.projectId, projectId), dsql`${P.price} is not null`)) : Promise.resolve([]),
  ]);
  const mentioned = new Set((titles as unknown as { t: string }[]).map((r) => normalizeText(r.t)));
  const clickN = new Map([[p.id, clicks?.n ?? 0]]);
  const min = (others as { min: string | null }[])[0]?.min;
  const minOther = new Map(p.gtin && min ? [[p.gtin, parseFloat(min)]] : []);
  return labelsFor(p, { mentioned, clickN, minOther });
}

/** Tot ce arată fișa produsului pe canale: rândul ChatGPT, itemul Google, pagina citită, reparațiile propuse. */
export async function productSheet(projectId: string, productId: string) {
  const [[prod], [project], outputs, edits, rules, [page], [stat], prompts] = await Promise.all([
    db.select().from(P).where(and(eq(P.id, productId), eq(P.projectId, projectId))).limit(1),
    db.select({ name: schema.projects.name, domain: schema.projects.domain, pathPrefix: schema.projects.pathPrefix, country: schema.projects.country, orgId: schema.projects.orgId, storeInfo: schema.projects.storeInfo })
      .from(schema.projects).where(eq(schema.projects.id, projectId)),
    db.select({ channel: schema.feedOutputs.channel, active: schema.feedOutputs.active, settings: schema.feedOutputs.settings, generatedAt: schema.feedOutputs.generatedAt, itemCount: schema.feedOutputs.itemCount })
      .from(schema.feedOutputs).where(and(eq(schema.feedOutputs.projectId, projectId), inArray(schema.feedOutputs.channel, ["openai", "google"]))),
    db.select({ field: schema.productEdits.field, value: schema.productEdits.value, status: schema.productEdits.status, reason: schema.productEdits.reason, confidence: schema.productEdits.confidence })
      .from(schema.productEdits).where(and(eq(schema.productEdits.productId, productId), eq(schema.productEdits.projectId, projectId), inArray(schema.productEdits.status, ["aprobat", "propus"])))
      .orderBy(asc(schema.productEdits.createdAt)),
    db.select().from(schema.feedRules).where(eq(schema.feedRules.projectId, projectId)).orderBy(schema.feedRules.priority),
    db.select().from(schema.productPageChecks).where(and(eq(schema.productPageChecks.projectId, projectId), eq(schema.productPageChecks.productId, productId))).limit(1),
    db.select().from(schema.productAiStats).where(and(eq(schema.productAiStats.projectId, projectId), eq(schema.productAiStats.productId, productId))).limit(1),
    db.select({ id: schema.prompts.id, text: schema.prompts.text, active: schema.prompts.active, suggested: schema.prompts.suggested, intent: schema.prompts.intent })
      .from(schema.prompts).where(and(eq(schema.prompts.projectId, projectId), eq(schema.prompts.productId, productId))),
  ]);
  if (!prod || !project) return null;
  const labels = await productLabels(projectId, project.domain, prod);
  // Același produs ca în fișierul feed-ului: titlurile aprobate (în ordinea aprobării), apoi regulile canalului.
  let fp: FeedProduct = {
    id: prod.id, externalId: prod.externalId, title: prod.title, description: prod.description, url: prod.url, imageUrl: prod.imageUrl,
    price: prod.price ? parseFloat(prod.price) : null, currency: prod.currency, inStock: prod.inStock, brand: prod.brand, category: prod.category, gtin: prod.gtin, mpn: prod.mpn, labels,
  };
  for (const e of edits.filter((x) => x.status === "aprobat")) fp = { ...fp, [e.field]: e.value };
  const out = (ch: string) => outputs.find((o) => o.channel === ch);
  const openaiOut = out("openai"), googleOut = out("google");
  const store = { name: project.name, domain: project.domain, pathPrefix: project.pathPrefix, country: project.country };
  const forOpenAi = applyRules(fp, rules, "openai");
  const forGoogle = applyRules(fp, rules, "google");
  return {
    product: prod, feedProduct: fp, project, stat: stat ?? null, prompts,
    pendingEdits: edits.filter((e) => e.status === "propus"),
    openai: { active: !!openaiOut?.active, generatedAt: openaiOut?.generatedAt ?? null, report: openAiReport(fp, forOpenAi ? openAiRow(forOpenAi, store, effectivePolicy(openaiOut?.settings ?? null, project.storeInfo?.policies)) : null) },
    google: { active: !!googleOut?.active, generatedAt: googleOut?.generatedAt ?? null, report: googleFeedReport(fp, forGoogle ? googleItem(forGoogle) : null) },
    page: page ? { checkedAt: page.checkedAt, url: page.url, report: pageReport(fp, page) } : null,
  };
}

/** Domeniile tuturor magazinelor clientului (nu sunt concurenți unul altuia). */
export async function orgDomains(orgId: string) {
  const rows = await db.select({ domain: schema.projects.domain }).from(schema.projects).where(eq(schema.projects.orgId, orgId));
  return rows.map((r) => r.domain);
}

/**
 * Răspunsurile AI din ultimele 30 de zile despre acest produs: la întrebările urmărite pe el sau în care l-am găsit.
 * Cel mult 15, cele mai noi primele, doar cele legate de întrebările acestui magazin.
 */
export async function productAnswerRuns(projectId: string, productId: string, namedRunIds: string[]): Promise<SheetRun[]> {
  const R = schema.runs, Q = schema.prompts;
  const ids = [...new Set(namedRunIds)].filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 30);
  const rows = await db.selectDistinct({ id: R.id, provider: R.provider, runDate: R.runDate, createdAt: R.createdAt, query: R.query, answer: R.answer, mentions: R.mentions, sources: R.sources })
    .from(schema.promptRuns).innerJoin(R, eq(R.id, schema.promptRuns.runId)).innerJoin(Q, eq(Q.id, schema.promptRuns.promptId))
    .where(and(eq(Q.projectId, projectId), ne(R.model, ERROR_MODEL), gte(R.runDate, daysAgo(SHEET_WINDOW_DAYS)), ids.length ? or(eq(Q.productId, productId), inArray(R.id, ids)) : eq(Q.productId, productId)))
    .orderBy(desc(R.createdAt)).limit(SHEET_MAX_RUNS);
  return rows.map((r) => ({ id: r.id, provider: r.provider, runDate: r.runDate, at: r.createdAt.toISOString(), query: r.query, answer: r.answer, mentions: r.mentions as Mention[], sources: r.sources }));
}

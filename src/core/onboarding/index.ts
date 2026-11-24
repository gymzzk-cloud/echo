import "server-only";
import { and, desc, eq, inArray, isNotNull, notInArray, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Mention } from "@/db/schema";
import { parseStoreUrl, today } from "@/lib/util";
import { enqueue, pendingJobs } from "../jobs";
import { invalidateWorld } from "../ai/engine";
import { ERROR_MODEL } from "../ai/types";
import { claimStore } from "../stores";
import type { AuditResult } from "../audit";
import { buildTrialPrompts } from "./prompts";
import { brandShare, computeTeaser } from "./teaser";
import { advance, emptyOnboarding, TRIAL_PROVIDERS, type Focus, type Market, type Onboarding, type OnboardingStep } from "./types";

/**
 * Testul gratuit de la prima logare, pe date reale:
 * 1. adresa → proiect nou + audit și citirea condițiilor (joburi existente, fără catalog, fără feed);
 * 2. clientul confirmă identitatea, profilul, piețele și accentul;
 * 3. 20 de întrebări pe ChatGPT și Gemini (jobul run_project, în mod test);
 * 4. rezultat parțial; restul se vede după alegerea unui plan.
 * Toate funcțiile primesc organizația și verifică faptul că proiectul îi aparține.
 */
type Project = typeof schema.projects.$inferSelect;

export const isTrialOrg = (org: { plan: string }) => org.plan === "trial";

/** Proiectul în test al organizației (primul cu onboarding), dacă există. */
export async function trialProject(orgId: string) {
  const [p] = await db.select().from(schema.projects)
    .where(and(eq(schema.projects.orgId, orgId), isNotNull(schema.projects.onboarding))).orderBy(schema.projects.createdAt).limit(1);
  return p ?? null;
}

async function owned(orgId: string, projectId: string) {
  const [p] = await db.select().from(schema.projects).where(and(eq(schema.projects.id, projectId), eq(schema.projects.orgId, orgId))).limit(1);
  if (!p?.onboarding) throw new Error("Magazin inexistent sau fără acces.");
  return p as Project & { onboarding: Onboarding };
}

async function save(projectId: string, ob: Onboarding, extra: Partial<Project> = {}) {
  await db.update(schema.projects).set({ ...extra, onboarding: ob }).where(eq(schema.projects.id, projectId));
}

/** Țara din adresă: subfolderul /hu sau domeniul .hu înseamnă Ungaria. */
export function marketOf(domain: string, pathPrefix: string): Market {
  return /^\/hu(\/|$)/i.test(pathPrefix) || domain.endsWith(".hu") ? "HU" : "RO";
}
const langOf = (m: Market) => (m === "HU" ? "hu" : "ro");

/** Numele magazinului din adresă, până îl citim de pe site: „shop-expert.ro” → „Shop Expert”. */
export function nameFromDomain(domain: string) {
  const base = domain.split(".")[0] ?? domain;
  return base.split(/[-_]/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || domain;
}

export async function startTrial(orgId: string, url: string) {
  const info = parseStoreUrl(url);
  const market = marketOf(info.domain, info.pathPrefix);
  const name = nameFromDomain(info.domain);
  const existing = await trialProject(orgId);
  if (existing) return existing.id;
  const [p] = await db.insert(schema.projects).values({
    orgId, name, domain: info.domain, pathPrefix: info.pathPrefix, country: market, language: langOf(market), currency: market === "HU" ? "HUF" : "RON",
    onboarding: emptyOnboarding(name, market),
  }).returning();
  invalidateWorld();
  await claimStore(p);
  // Doar câteva pagini publice: prima pagină, robots.txt, o pagină de produs, sitemap și paginile de condiții.
  await enqueue("audit", { projectId: p.id });
  await enqueue("policies", { projectId: p.id });
  return p.id;
}

/** Ce a găsit scanarea până acum (o citește pagina „Scanare” la 1,5 secunde). */
export async function scanStatus(orgId: string, projectId: string) {
  const p = await owned(orgId, projectId);
  const [a] = await db.select({ status: schema.audits.status, result: schema.audits.result }).from(schema.audits)
    .where(eq(schema.audits.projectId, projectId)).orderBy(desc(schema.audits.createdAt)).limit(1);
  const r = a?.status === "done" ? (a.result as AuditResult) : null;
  const pol = p.storeInfo?.policies;
  const busy = await pendingJobs(["policies"], "projectId", projectId);
  const policyBits = [
    pol?.delivery?.freeOver ? `Transport gratuit peste ${pol.delivery.freeOver}` : pol?.delivery ? "Condiții de livrare găsite" : null,
    pol?.returns?.days ? `Retur ${pol.returns.days} de zile` : pol?.returns ? "Politică de retur găsită" : null,
    ...(pol?.payment?.methods ?? []).slice(0, 4),
  ].filter((x): x is string => !!x);
  return {
    name: storeNameFrom(r, p.domain) ?? p.name,
    domain: `${p.domain}${p.pathPrefix}`,
    audit: a ? a.status : "queued",
    policies: pol ? (pol.error ? "error" : "done") : "queued",
    // Gata când auditul s-a terminat (și cu eroare: jobul se poate reîncerca în fundal) și condițiile nu mai sunt în lucru.
    done: !!a && (a.status === "done" || a.status === "error") && (!!pol || !busy),
    error: a?.status === "error" ? ((a.result as { error?: string } | null)?.error ?? "Site-ul nu a putut fi citit.") : null,
    logo: r?.home?.logo ?? null,
    logos: r?.home?.logos ?? (r?.home?.logo ? [r.home.logo] : []),
    platform: r?.platform && r.platform !== "necunoscută" ? r.platform : null,
    categories: r?.home?.categories ?? [],
    brands: r?.home?.brands ?? [],
    products: r?.home?.products ?? [],
    policyBits,
    blockedBots: (r?.bots ?? []).filter((b) => b.important && b.robots === "blocked").map((b) => b.ua),
    trustmarks: r?.facts.trustmarks ?? [],
    cui: r?.facts.cui ?? null,
  };
}

/**
 * Numele magazinului: cel declarat de site (og:site_name, Organization); titlul paginii doar dacă bucata aleasă
 * conține numele din adresă (titlul „Scule electrice DEWALT | Hardline” nu dă „Scule electrice DEWALT”).
 */
export function storeNameFrom(r: Pick<AuditResult, "facts" | "home"> | null, domain: string) {
  if (!r) return null;
  if (r.home?.siteName) return r.home.siteName;
  const key = (domain.split(".")[0] ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const parts = (r.facts.title ?? "").split(/\s[|–—-]\s|\|/).map((x) => x.trim()).filter(Boolean);
  const hit = parts.find((x) => key.length >= 3 && x.replace(/[^a-z0-9]/gi, "").toLowerCase().includes(key.slice(0, Math.min(key.length, 8))));
  return hit && hit.length <= 40 ? hit : null;
}

/** După scanare: profilul pornește de la ce am găsit, dacă clientul nu l-a completat deja. */
export async function finishScan(orgId: string, projectId: string) {
  const s = await scanStatus(orgId, projectId);
  const p = await owned(orgId, projectId);
  const ob = p.onboarding;
  const name = s.name && s.name.length >= 2 ? s.name : p.name;
  await save(projectId, {
    ...ob,
    step: advance(ob.step, "scan"),
    names: ob.names.length > 1 ? ob.names : [...new Set([name, p.name])],
    categories: ob.categories.length ? ob.categories : s.categories.slice(0, 8),
    brands: ob.brands.length ? ob.brands : s.brands.slice(0, 8),
    products: ob.products.length ? ob.products : s.products.slice(0, 10),
    cui: ob.cui ?? s.cui ?? undefined,
    logo: s.logo ?? ob.logo,
  }, { name });
}

export async function saveIdentity(orgId: string, projectId: string, d: { names: string[]; aliases: string[]; notMine: string[]; cui?: string }) {
  const p = await owned(orgId, projectId);
  const aliases = d.aliases.filter((x) => x !== p.domain);
  await save(projectId, { ...p.onboarding, ...d, aliases, step: advance(p.onboarding.step, "identity") }, { name: d.names[0] ?? p.name });
  // Omonimele nu devin niciodată concurenți automați.
  if (d.notMine.length) await db.insert(schema.competitorDismissals).values(d.notMine.map((domain) => ({ projectId, domain }))).onConflictDoNothing();
  invalidateWorld();
}

export async function saveProfile(orgId: string, projectId: string, d: { categories: string[]; brands: string[]; products: string[]; competitors: string[] }) {
  const p = await owned(orgId, projectId);
  await save(projectId, { ...p.onboarding, categories: d.categories, brands: d.brands, products: d.products, step: advance(p.onboarding.step, "profile") });
  // Lista din formular e lista completă: cei scoși de client ies și din concurenți.
  await db.delete(schema.competitors).where(d.competitors.length
    ? and(eq(schema.competitors.projectId, projectId), notInArray(schema.competitors.domain, d.competitors))
    : eq(schema.competitors.projectId, projectId));
  if (d.competitors.length) {
    await db.insert(schema.competitors).values(d.competitors.map((domain) => ({ projectId, domain, name: nameFromDomain(domain), suggested: false }))).onConflictDoNothing();
  }
  invalidateWorld();
}

export async function saveMarkets(orgId: string, projectId: string, d: { markets: Market[]; city?: string }) {
  const p = await owned(orgId, projectId);
  const markets = d.markets.length ? d.markets : [p.country as Market];
  const main = markets[0];
  await save(projectId, { ...p.onboarding, markets, city: d.city, step: advance(p.onboarding.step, "markets") },
    { country: main, language: langOf(main), currency: main === "HU" ? "HUF" : "RON" });
  await writeQuestions(orgId, projectId);
}

/** Refacem întrebările testului din profil și accent. Le scrie ca alese de client, ca să nu fie înlocuite automat. */
export async function writeQuestions(orgId: string, projectId: string, focus?: Focus) {
  const p = await owned(orgId, projectId);
  const ob: Onboarding = { ...p.onboarding, focus: focus ?? p.onboarding.focus };
  if (await pendingJobs(["run_project"], "projectId", projectId)) return; // nu schimbăm lista în timpul rulării
  const qs = buildTrialPrompts({ storeName: ob.names[0] ?? p.name, categories: ob.categories, brands: ob.brands, products: ob.products, focus: ob.focus, markets: ob.markets, city: ob.city });
  await db.delete(schema.prompts).where(eq(schema.prompts.projectId, projectId));
  if (qs.length) await db.insert(schema.prompts).values(qs.map((q) => ({ projectId, text: q.text, category: q.category, intent: q.intent, language: q.language, suggested: false })));
  await save(projectId, ob);
}

export async function questions(orgId: string, projectId: string) {
  await owned(orgId, projectId);
  return db.select({ id: schema.prompts.id, text: schema.prompts.text, category: schema.prompts.category, intent: schema.prompts.intent, language: schema.prompts.language })
    .from(schema.prompts).where(eq(schema.prompts.projectId, projectId)).orderBy(schema.prompts.createdAt).limit(40);
}

export async function removeQuestion(orgId: string, projectId: string, id: string) {
  await owned(orgId, projectId);
  await db.delete(schema.prompts).where(and(eq(schema.prompts.id, id), eq(schema.prompts.projectId, projectId)));
}

export async function addQuestion(orgId: string, projectId: string, text: string) {
  const p = await owned(orgId, projectId);
  const n = (await questions(orgId, projectId)).length;
  if (n >= 25) throw new Error("Testul gratuit are cel mult 25 de întrebări. Scoate una ca să adaugi alta.");
  await db.insert(schema.prompts).values({ projectId, text, category: "adăugate de tine", intent: "produs", language: p.language, suggested: false });
}

export async function startTrialRun(orgId: string, projectId: string) {
  const p = await owned(orgId, projectId);
  if (p.onboarding.runStartedAt) return; // testul gratuit rulează o singură dată
  await save(projectId, { ...p.onboarding, step: "run", runStartedAt: new Date().toISOString() });
  await enqueue("run_project", { projectId });
}

async function trialRuns(projectId: string, fromDay: string) {
  const rows = await db.select({ promptId: schema.prompts.id, prompt: schema.prompts.text, provider: schema.runs.provider, model: schema.runs.model, mentions: schema.runs.mentions, answer: schema.runs.answer, at: schema.runs.createdAt })
    .from(schema.promptRuns)
    .innerJoin(schema.runs, eq(schema.runs.id, schema.promptRuns.runId))
    .innerJoin(schema.prompts, eq(schema.prompts.id, schema.promptRuns.promptId))
    .where(and(eq(schema.prompts.projectId, projectId), inArray(schema.runs.provider, [...TRIAL_PROVIDERS])))
    .orderBy(desc(schema.runs.createdAt)).limit(200);
  return rows.filter((r) => r.at.toISOString().slice(0, 10) >= fromDay);
}

const ownDomainsOf = (p: Project & { onboarding: Onboarding }) => [p.domain, ...p.onboarding.aliases];

/** Starea rulării de test: progres, clasament live și ultimele răspunsuri (doar fragmente, fără analiză). */
export async function runStatus(orgId: string, projectId: string) {
  const p = await owned(orgId, projectId);
  const from = (p.onboarding.runStartedAt ?? new Date().toISOString()).slice(0, 10);
  const nPrompts = (await questions(orgId, projectId)).length;
  const rows = await trialRuns(projectId, from);
  const ok = rows.filter((r) => r.model !== ERROR_MODEL);
  const busy = await pendingJobs(["run_project"], "projectId", projectId);
  const teaser = computeTeaser(ok.map((r) => ({ promptId: r.promptId, provider: r.provider, mentions: r.mentions as Mention[] })), ownDomainsOf(p), p.name, 6);
  const own = new Set(ownDomainsOf(p));
  return {
    expected: nPrompts * TRIAL_PROVIDERS.length,
    received: rows.length,
    failed: rows.length - ok.length,
    done: !busy && !!p.onboarding.runStartedAt,
    board: teaser.table,
    stream: ok.slice(0, 5).map((r) => {
      const ms = (r.mentions as Mention[]).filter((m) => !own.has(m.domain)).slice(0, 4);
      return { provider: r.provider, prompt: r.prompt, stores: ms.map((m) => m.name ?? m.domain), me: (r.mentions as Mention[]).some((m) => own.has(m.domain)) };
    }),
  };
}

/** Rezultatul parțial: cifrele mari reale; pentru restul doar câte sunt (fără conținut). */
export async function teaserData(orgId: string, projectId: string) {
  const p = await owned(orgId, projectId);
  const from = (p.onboarding.runStartedAt ?? today()).slice(0, 10);
  const rows = (await trialRuns(projectId, from)).filter((r) => r.model !== ERROR_MODEL);
  const t = computeTeaser(rows.map((r) => ({ promptId: r.promptId, provider: r.provider, mentions: r.mentions as Mention[] })), ownDomainsOf(p), p.name);
  const brands = brandShare(rows.map((r) => r.answer), p.onboarding.brands);
  const known = new Set((await db.select({ d: schema.competitors.domain }).from(schema.competitors).where(eq(schema.competitors.projectId, projectId))).map((c) => c.d));
  const dismissed = new Set([...p.onboarding.notMine, ...ownDomainsOf(p)]);
  const newRivals = t.table.filter((s) => !s.me && !known.has(s.domain) && !dismissed.has(s.domain)).slice(0, 3);
  const [{ n: problems }] = await db.select({ n: dsqlCount() }).from(schema.actions).where(and(eq(schema.actions.projectId, projectId), eq(schema.actions.status, "noua")));
  return { ...t, brands, newRivals, problems, providers: [...new Set(rows.map((r) => r.provider))] };
}

const dsqlCount = () => dsql<number>`count(*)::int`;

/** Pasul la care trebuie să ajungă clientul când deschide /start sau panoul. */
export function stepOf(p: { onboarding: Onboarding | null }): OnboardingStep {
  return p.onboarding?.step ?? "scan";
}

export async function addCompetitorFromTrial(orgId: string, projectId: string, domain: string) {
  await owned(orgId, projectId);
  await db.insert(schema.competitors).values({ projectId, domain, name: nameFromDomain(domain), suggested: false }).onConflictDoNothing();
  invalidateWorld();
}

/** Concurenții deja trecuți de client (pentru pasul „Profil”). */
export async function trialCompetitors(orgId: string, projectId: string) {
  await owned(orgId, projectId);
  return (await db.select({ d: schema.competitors.domain }).from(schema.competitors).where(eq(schema.competitors.projectId, projectId)).limit(20)).map((c) => c.d);
}

/**
 * După alegerea unui plan: analiza completă rulează din nou, acum pe toate AI-urile (Claude, Perplexity, Google…)
 * și cu întrebările din catalog. Întrebările deja puse azi pe ChatGPT și Gemini nu se plătesc a doua oară (runQuery).
 */
export async function afterPlanChosen(orgId: string) {
  const ps = await db.select({ id: schema.projects.id }).from(schema.projects)
    .where(and(eq(schema.projects.orgId, orgId), isNotNull(schema.projects.onboarding)));
  for (const p of ps) await enqueue("run_project", { projectId: p.id });
  return ps.length;
}

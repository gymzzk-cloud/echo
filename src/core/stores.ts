import { and, desc, eq, gte, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { parseStoreUrl } from "@/lib/util";
import type { AuditResult, StoreFacts } from "./audit";

/**
 * Registrul de magazine (revendicate sau nu).
 * - Auditul gratuit pentru același site în ultimele 24 de ore se servește din ce avem, fără o nouă verificare.
 * - Datele stabile ale firmei (CUI, nume, telefon) se păstrează 90 de zile dacă o verificare nouă nu le mai găsește
 *   (de ex. site-ul a blocat vizita). Accesul roboților și datele tehnice se verifică de fiecare dată.
 */
export const AUDIT_CACHE_HOURS = 24;
export const STABLE_FACTS_DAYS = 90;

const key = (url: string) => { const { domain, pathPrefix } = parseStoreUrl(url); return { domain, pathPrefix: pathPrefix ?? "" }; };
const countryOf = (domain: string, lang?: string) => (domain.endsWith(".hu") || lang?.startsWith("hu") ? "HU" : domain.endsWith(".ro") || lang?.startsWith("ro") ? "RO" : null);

export async function getStore(domain: string, pathPrefix = "") {
  const [s] = await db.select().from(schema.stores).where(and(eq(schema.stores.domain, domain), eq(schema.stores.pathPrefix, pathPrefix))).limit(1);
  return s ?? null;
}

/** Un audit reușit pentru aceeași adresă, mai nou de 24 de ore (îl refolosim). */
export async function recentAudit(url: string) {
  const [a] = await db.select().from(schema.audits)
    .where(and(eq(schema.audits.url, url), eq(schema.audits.status, "done"), gte(schema.audits.createdAt, new Date(Date.now() - AUDIT_CACHE_HOURS * 3600e3))))
    .orderBy(desc(schema.audits.createdAt)).limit(1);
  return a ?? null;
}

/** Completează faptele stabile lipsă din ultima verificare reușită. Funcție pură, testată. */
export function mergeStableFacts(fresh: StoreFacts, previous: StoreFacts | null, previousAt: Date | null, now = Date.now()): { facts: StoreFacts; reused: string[] } {
  if (!previous || !previousAt || now - previousAt.getTime() > STABLE_FACTS_DAYS * 864e5) return { facts: fresh, reused: [] };
  const facts = { ...fresh };
  const reused: string[] = [];
  if (!facts.cui && previous.cui) { facts.cui = previous.cui; reused.push("cui"); }
  if (!facts.organization?.name && previous.organization?.name) { facts.organization = { ...previous.organization, ...facts.organization }; reused.push("organization"); }
  return { facts, reused };
}

export async function noteAuditRequest(url: string) {
  const k = key(url);
  await db.insert(schema.stores).values({ ...k, country: countryOf(k.domain), auditRequests: 1, source: "audit" })
    .onConflictDoUpdate({ target: [schema.stores.domain, schema.stores.pathPrefix], set: { auditRequests: dsql`${schema.stores.auditRequests} + 1` } });
}

/** Salvează rezultatul unui audit în registru (reușit sau nu). */
export async function recordAudit(audit: { id: string; url: string; projectId: string | null }, r: AuditResult | null) {
  const k = key(audit.url);
  const ok = !!r && !r.error;
  const name = r?.facts.organization?.name ?? r?.facts.title?.split(/[|–—-]/)[0]?.trim().slice(0, 80) ?? null;
  const base = { lastAuditId: audit.id, lastAuditAt: new Date(), lastAuditOk: ok, auditCount: dsql`${schema.stores.auditCount} + 1` };
  const fresh = ok ? { facts: r!.facts, auditScore: r!.score, platform: r!.platform ?? null, factsCheckedAt: new Date(), ...(name ? { name } : {}), country: countryOf(k.domain, r!.facts.lang) } : {};
  await db.insert(schema.stores).values({ ...k, ...(fresh as object), lastAuditId: audit.id, lastAuditAt: new Date(), lastAuditOk: ok, auditCount: 1, country: countryOf(k.domain, r?.facts.lang), source: audit.projectId ? "client" : "audit", claimedProjectId: audit.projectId })
    .onConflictDoUpdate({ target: [schema.stores.domain, schema.stores.pathPrefix], set: { ...base, ...fresh } });
}

/** Magazinele menționate de AI-uri intră și ele în registru (doar domeniu și nume). */
export async function registerAiStores(mentions: { domain: string; name?: string }[]) {
  const uniq = new Map<string, string | undefined>();
  for (const m of mentions) if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(m.domain) && !uniq.has(m.domain)) uniq.set(m.domain, m.name);
  if (!uniq.size) return;
  await db.insert(schema.stores).values([...uniq].map(([domain, name]) => ({ domain, name: name?.slice(0, 80) ?? null, country: countryOf(domain), source: "ai" }))).onConflictDoNothing();
}

/** Când un magazin își face cont, profilul din registru devine revendicat. */
export async function claimStore(project: { id: string; domain: string; pathPrefix: string; name: string; country: string }) {
  await db.insert(schema.stores).values({ domain: project.domain, pathPrefix: project.pathPrefix, name: project.name, country: project.country, source: "client", claimedProjectId: project.id })
    .onConflictDoUpdate({ target: [schema.stores.domain, schema.stores.pathPrefix], set: { claimedProjectId: project.id, name: project.name } });
}

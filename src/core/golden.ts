import { and, eq, inArray, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { runAudit, type AuditResult } from "./audit";
import { notRivals, sourceKind } from "./source-kind";

/**
 * Magazinul etalon: ShopExpert RO. Știm sigur ce are (verificat de mână în browser, 23.11.2026, KNOWLEDGE A0, B29, B32).
 * După fiecare publicare, workerul rulează auditul pe el și compară ce afirmă Echo cu adevărul.
 * O nepotrivire = Echo spune ceva fals; jobul „golden_check” eșuează cu lista lor (vizibilă în /admin/magazine și în loguri).
 */
export const GOLDEN = {
  url: "https://www.shopexpert.com/ro",
  domain: "shopexpert.com",
  pathPrefix: "/ro",
  sitemap: "https://www.shopexpert.com/ro/sitemap.xml",
  cui: "RO16766463",
  /** Alte magazine ale aceluiași proprietar: în analiză sunt magazine distincte, nu „tu” (ZoZo, 24.11.2026, KNOWLEDGE A21). */
  distinctStores: ["shopexpert.ro", "hardlineconstruct.ro"],
  /** Alte site-uri cu nume asemănător: NU sunt ale clientului (ZoZo, 24.11.2026, KNOWLEDGE B60). */
  notOwn: ["shop-expert.ro", "shexpert.ro"],
  brands: ["BOSCH", "MAKITA", "CROMWELL", "DEWALT", "RECORD POWER"],
  /** Site-uri de producător sau care nu vând: nu sunt concurenți. */
  notRivals: ["bosch-professional.com", "makitatools.com", "platform.openai.com"],
} as const;

export type GoldenIssue = { claim: string; truth: string };

/** Ce afirmă auditul despre etalon, comparat cu adevărul. Funcție pură. */
export function goldenAuditIssues(r: AuditResult): GoldenIssue[] {
  const out: GoldenIssue[] = [];
  const c = (id: string) => r.checks.find((x) => x.id === id);
  const prod = c("jsonld-product");
  if (prod && (prod.status === "fail" || prod.missing?.includes("Product"))) out.push({ claim: `Date structurate Product: ${prod.status} („${prod.detail}”)`, truth: "Paginile de produs au JSON-LD Product complet (preț, monedă, stoc, brand, GTIN, MPN)." });
  const sm = c("sitemap");
  if (sm && (sm.status === "warn" || sm.status === "fail")) out.push({ claim: `Sitemap: ${sm.status} („${sm.detail}”)`, truth: `Sitemap valid la ${GOLDEN.sitemap} (≈9.700 adrese).` });
  if (sm?.status === "pass" && r.sitemapUrl && r.sitemapUrl !== GOLDEN.sitemap) out.push({ claim: `Sitemap găsit la ${r.sitemapUrl}`, truth: `Sitemap-ul e ${GOLDEN.sitemap}.` });
  const desc = c("content-product");
  if (desc?.status === "fail" && /nicio descriere|Nu am găsit/i.test(desc.detail)) out.push({ claim: `Descrieri: „${desc.detail}”`, truth: "Paginile de produs au descriere scurtă, Detalii tehnice, Conținut pachet și Avantaje." });
  if (r.facts.cui && r.facts.cui.replace(/\s/g, "") !== GOLDEN.cui) out.push({ claim: `CUI ${r.facts.cui}`, truth: `CUI ${GOLDEN.cui}.` });
  const trust = c("trust");
  if (trust && !r.facts.cui) out.push({ claim: `Semnale de încredere: CUI negăsit („${trust.detail}”)`, truth: `CUI ${GOLDEN.cui} e în Termeni și condiții (J05/1646/2004).` });
  return out;
}

/** Clasificarea domeniilor (surse, concurenți) pe etalon. Funcție pură. */
export function goldenClassifierIssues(): GoldenIssue[] {
  const out: GoldenIssue[] = [];
  const ctx = { ownDomains: [GOLDEN.domain], competitorDomains: [], brands: [...GOLDEN.brands] };
  for (const d of GOLDEN.distinctStores) {
    const k = sourceKind(d, ctx);
    if (k === "site propriu") out.push({ claim: `${d} clasificat „site propriu”`, truth: `${d} e un magazin distinct în analiză (A21).` });
  }
  for (const d of GOLDEN.notOwn) {
    const k = sourceKind(d, ctx);
    if (k === "site propriu") out.push({ claim: `${d} clasificat „site propriu”`, truth: `${d} e alt site, nu al clientului (B60).` });
  }
  for (const d of GOLDEN.notOwn) {
    const k = sourceKind(d, ctx);
    if (k === "site propriu") out.push({ claim: `${d} clasificat „site propriu”`, truth: `${d} e alt site, nu al clientului (B60).` });
  }
  const nr = new Set(notRivals(GOLDEN.notRivals, ctx));
  for (const d of GOLDEN.notRivals) if (!nr.has(d)) out.push({ claim: `${d} poate apărea ca concurent`, truth: `${d} nu e un magazin concurent (producător sau site care nu vinde).` });
  return out;
}

/** Recomandările deschise ale proiectului etalon care contrazic adevărul. */
async function goldenActionIssues(): Promise<GoldenIssue[]> {
  const [p] = await db.select({ id: schema.projects.id }).from(schema.projects)
    .where(and(eq(schema.projects.domain, GOLDEN.domain), eq(schema.projects.pathPrefix, GOLDEN.pathPrefix))).limit(1);
  if (!p) return [];
  const bad = ["audit:sitemap", "audit:jsonld-product", ...[...GOLDEN.distinctStores, ...GOLDEN.notRivals].map((d) => `source:${d}`)];
  const open = await db.select({ key: schema.actions.key, title: schema.actions.title }).from(schema.actions)
    .where(and(eq(schema.actions.projectId, p.id), inArray(schema.actions.key, bad), inArray(schema.actions.status, ["noua", "in_lucru"])));
  const out: GoldenIssue[] = open.map((a) => ({ claim: `Acțiune deschisă: „${a.title}”`, truth: "Nu e o problemă reală la ShopExpert RO." }));
  const [named] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.productAiStats)
    .where(and(eq(schema.productAiStats.projectId, p.id), dsql`${schema.productAiStats.appearances} > 0`));
  if ((named?.n ?? 0) > 0) {
    const none = await db.select({ key: schema.actions.key }).from(schema.actions)
      .where(and(eq(schema.actions.projectId, p.id), eq(schema.actions.key, "products:none"), eq(schema.actions.status, "noua")));
    if (none.length) out.push({ claim: "Acțiune: „Niciun produs nu e recomandat pe nume”", truth: `${named.n} produse sunt numite de AI-uri.` });
  }
  return out;
}

/** Jobul „golden_check”: audit proaspăt pe etalon + clasificări + recomandările deschise. Aruncă eroare la nepotrivire. */
export async function runGoldenCheck() {
  const audit = await runAudit(GOLDEN.url);
  const issues = [...goldenAuditIssues(audit), ...goldenClassifierIssues(), ...(await goldenActionIssues())];
  if (issues.length) {
    const msg = `Verificarea pe magazinul etalon (ShopExpert RO) a găsit ${issues.length} afirmații greșite: ${issues.map((i) => `${i.claim} → adevărat: ${i.truth}`).join(" | ")}`;
    console.error(`GOLDEN FAIL ${msg}`);
    throw new Error(msg);
  }
  console.log(`GOLDEN OK: ${audit.checks.length} verificări de audit și clasificările de surse corecte pe ShopExpert RO.`);
  return { ok: true };
}

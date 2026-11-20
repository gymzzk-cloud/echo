import { and, desc, eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AuditResult } from "./audit";
import { randomToken, sha256 } from "@/lib/util";

/**
 * Scorul de încredere: doar din fapte verificabile, cu fiecare punct explicat.
 * Rămâne privat (în panou) până la validarea juridică. Public doar pentru profiluri revendicate
 * și doar dacă TRUST_SCORE_PUBLIC=1.
 */
export const trustPublic = () => process.env.TRUST_SCORE_PUBLIC === "1";

export type TrustPart = { label: string; points: number; max: number; detail?: string };

export function trustScore(facts: AuditResult["facts"] | undefined, extra: { claimed: boolean; products: number; reviews: { n: number; avg: number | null }; tracked: boolean }) {
  const f = facts;
  const parts: TrustPart[] = [
    { label: "Firma identificabilă (CUI)", max: 15, points: f?.cui ? 15 : 0, detail: f?.cui ? `CUI ${f.cui}` : undefined },
    { label: "Politică de retur", max: 10, points: f?.hasReturnPolicy ? 10 : 0 },
    { label: "Termeni și condiții", max: 5, points: f?.hasTerms ? 5 : 0 },
    { label: "Date de contact", max: 10, points: f?.hasContact ? 10 : 0 },
    { label: "ANPC / SOL", max: 10, points: f?.hasAnpc ? 10 : 0 },
    { label: "Certificări (Trusted, GPeC etc.)", max: 10, points: Math.min(10, (f?.trustmarks.length ?? 0) * 5), detail: f?.trustmarks.join(", ") || undefined },
    { label: "Catalog conectat, prețuri verificate zilnic", max: 15, points: extra.claimed && extra.products > 0 ? 15 : 0, detail: extra.products ? `${extra.products} produse` : undefined },
    {
      label: "Recenzii verificate (doar din comenzi reale)", max: 20,
      points: extra.reviews.n >= 5 && extra.reviews.avg != null ? Math.round(Math.min(1, extra.reviews.n / 30) * 8 + ((extra.reviews.avg - 1) / 4) * 12) : 0,
      detail: extra.reviews.n ? `${extra.reviews.n} recenzii, media ${extra.reviews.avg?.toFixed(1)}` : "minimum 5 recenzii",
    },
    { label: "Vânzările din AI măsurate transparent", max: 5, points: extra.tracked ? 5 : 0 },
  ];
  return { score: parts.reduce((s, p) => s + p.points, 0), parts };
}

export async function reviewStats(projectId: string) {
  const [r] = await db.select({ n: dsql<number>`count(*)::int`, avg: dsql<number | null>`avg(rating)::float` }).from(schema.reviews)
    .where(and(eq(schema.reviews.projectId, projectId), eq(schema.reviews.status, "publicat")));
  return { n: r.n, avg: r.avg };
}

export async function trustForDomain(domain: string) {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.domain, domain)).limit(1);
  const [audit] = await db.select().from(schema.audits).where(and(eq(schema.audits.domain, domain), eq(schema.audits.status, "done"))).orderBy(desc(schema.audits.createdAt)).limit(1);
  const products = project ? (await db.select({ n: dsql<number>`count(*)::int` }).from(schema.products).where(eq(schema.products.projectId, project.id)))[0].n : 0;
  const reviews = project ? await reviewStats(project.id) : { n: 0, avg: null };
  const tracked = project ? (await db.select({ n: dsql<number>`count(*)::int` }).from(schema.events).where(eq(schema.events.projectId, project.id)))[0].n > 0 : false;
  return { project, ...trustScore((audit?.result as AuditResult | undefined)?.facts, { claimed: !!project, products, reviews, tracked }) };
}

// ── Recenzii verificate ────────────────────────────────────────────────────
/** Creează linkul de recenzie pentru o comandă reală (urmărită prin codul Echo). Un singur link per comandă. */
export async function reviewLink(projectId: string, orderId: string) {
  const [order] = await db.select().from(schema.events).where(and(eq(schema.events.projectId, projectId), eq(schema.events.kind, "order"), eq(schema.events.orderId, orderId))).limit(1);
  if (!order) throw new Error("Comanda nu apare în comenzile urmărite. Recenziile verificate se pot cere doar pentru comenzi reale.");
  const token = randomToken(24);
  const [existing] = await db.select().from(schema.reviews).where(and(eq(schema.reviews.projectId, projectId), eq(schema.reviews.orderId, orderId))).limit(1);
  if (existing?.submittedAt) throw new Error("Pentru această comandă există deja o recenzie.");
  if (existing) await db.update(schema.reviews).set({ tokenHash: sha256(token) }).where(eq(schema.reviews.id, existing.id));
  else await db.insert(schema.reviews).values({ projectId, orderId, tokenHash: sha256(token) });
  return `${process.env.APP_URL ?? "http://localhost:3000"}/recenzie/${token}`;
}

export async function reviewByToken(token: string) {
  const [r] = await db.select({ r: schema.reviews, p: schema.projects }).from(schema.reviews).innerJoin(schema.projects, eq(schema.projects.id, schema.reviews.projectId))
    .where(eq(schema.reviews.tokenHash, sha256(token))).limit(1);
  return r ?? null;
}

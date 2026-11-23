import { and, eq, inArray, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Alertele de preț necitite pe care calculul salvat pe produs nu le mai susține dispar
 * (ex. AI-ul a spus prețul de pe site, iar catalogul era în urmă: nu e un preț greșit, KNOWLEDGE B34).
 * Rulează după fiecare calcul pe produs și după statisticile zilnice. Fără importuri din projects, ca să nu facă cerc.
 */
export async function pruneStalePriceAlerts(projectId: string) {
  const S = schema.productAiStats;
  const stats = await db.select({ productId: S.productId, wrongPrices: S.wrongPrices }).from(S)
    .where(and(eq(S.projectId, projectId), dsql`jsonb_array_length(${S.wrongPrices}) > 0`)).limit(500);
  const current = new Set(stats.flatMap((s) => s.wrongPrices.map((w) => `price:${s.productId}:${w.provider}`)));
  const open = await db.select({ id: schema.alerts.id, kind: schema.alerts.kind }).from(schema.alerts)
    .where(and(eq(schema.alerts.projectId, projectId), eq(schema.alerts.read, false), dsql`${schema.alerts.kind} like 'price:%'`));
  const gone = open.filter((x) => !current.has(x.kind)).map((x) => x.id);
  if (gone.length) await db.delete(schema.alerts).where(inArray(schema.alerts.id, gone));
  return gone.length;
}

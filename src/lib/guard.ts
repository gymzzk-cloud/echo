import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAuth } from "./auth";

/** Verifică faptul că magazinul aparține organizației utilizatorului și că rolul permite modificări. */
export async function ownProject(projectId: string, opts: { write?: boolean } = { write: true }) {
  const auth = await requireAuth();
  if (!/^[0-9a-f-]{36}$/.test(projectId)) throw new Error("Magazin inexistent.");
  if (auth.projectIds && !auth.projectIds.includes(projectId)) throw new Error("Magazin inexistent sau fără acces.");
  const [p] = await db.select().from(schema.projects).where(and(eq(schema.projects.id, projectId), eq(schema.projects.orgId, auth.org.id))).limit(1);
  if (!p) throw new Error("Magazin inexistent sau fără acces.");
  if (opts.write && (auth.role === "viewer" || auth.role === "client")) throw new Error("Rolul tău permite doar citirea.");
  return { ...auth, project: p };
}

export const audit = (orgId: string, userId: string, action: string, details?: unknown) =>
  db.insert(schema.auditLog).values({ orgId, userId, action, details: details ?? null });

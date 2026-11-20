import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { randomToken, sha256 } from "./util";

const COOKIE = "echo_session";
const TTL_DAYS = 14;

export async function hashPassword(p: string) {
  return bcrypt.hash(p, 12);
}
export async function verifyPassword(p: string, h: string) {
  return bcrypt.compare(p, h);
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + TTL_DAYS * 864e5);
  await db.insert(schema.sessions).values({ id: sha256(token), userId, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(COOKIE);
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, sha256(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0]?.user ?? null;
}

/** Utilizatorul curent + organizația lui. Redirecționează la login dacă nu e autentificat. */
export async function requireAuth() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const m = await db
    .select({ org: schema.orgs, role: schema.memberships.role, projectIds: schema.memberships.projectIds })
    .from(schema.memberships)
    .innerJoin(schema.orgs, eq(schema.orgs.id, schema.memberships.orgId))
    .where(eq(schema.memberships.userId, user.id))
    .limit(1);
  if (!m[0]) redirect("/cont"); // cont de cumpărător, fără magazin
  // Rolul „client” (la agenții) vede doar magazinele lui; ceilalți văd toate magazinele organizației
  return { user, org: m[0].org, role: m[0].role, projectIds: m[0].role === "client" ? (m[0].projectIds ?? []) : null };
}

// Limită simplă de încercări la login (în memorie; în producție: Redis sau Cloudflare).
const attempts = new Map<string, { n: number; until: number }>();
export function tooManyAttempts(key: string) {
  const a = attempts.get(key);
  return !!a && a.n >= 5 && a.until > Date.now();
}
export function recordFailure(key: string) {
  const a = attempts.get(key);
  const n = a && a.until > Date.now() ? a.n + 1 : 1;
  attempts.set(key, { n, until: Date.now() + 15 * 60e3 });
}

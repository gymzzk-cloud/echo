"use server";

import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { createSession, destroySession, hashPassword, recordFailure, requireAuth, tooManyAttempts, verifyPassword } from "@/lib/auth";
import { decrypt, parseStoreUrl } from "@/lib/util";
import { verifyTotp } from "@/lib/totp";
import { enqueue, syncingConnections } from "@/core/jobs";
import { connectStore, importFeedFile, runAuditRow } from "@/core/projects";
import { setProductTracked } from "@/core/tracked-prompts";
import { promptLimit } from "@/core/prompts";
import { claimStore, noteAuditRequest, recentAudit } from "@/core/stores";
import { invalidateWorld } from "@/core/ai/engine";
import type { ConnectorKind } from "@/core/connectors";

export type FormState = { error?: string; ok?: string } | undefined;

async function clientIp() {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

async function log(orgId: string | null, userId: string | null, action: string, details?: unknown) {
  await db.insert(schema.auditLog).values({ orgId, userId, action, details: details ?? null });
}

/** Verifică faptul că proiectul aparține organizației utilizatorului (separarea strictă între clienți). */
async function ownProject(projectId: string) {
  const { user, org, role, projectIds } = await requireAuth();
  if (projectIds && !projectIds.includes(projectId)) throw new Error("Magazin inexistent sau fără acces.");
  const [p] = await db.select().from(schema.projects).where(and(eq(schema.projects.id, projectId), eq(schema.projects.orgId, org.id))).limit(1);
  if (!p) throw new Error("Magazin inexistent sau fără acces.");
  if (role === "viewer" || role === "client") throw new Error("Rolul tău permite doar citirea.");
  return { user, org, project: p };
}

// ── Audit gratuit ──────────────────────────────────────────────────────────
const auditLimiter = new Map<string, number[]>();
export async function startAudit(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z.object({ url: z.string().min(4).max(300), email: z.string().email().optional().or(z.literal("")) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Scrie adresa magazinului, de exemplu magazinul-meu.ro." };
  let info;
  try { info = parseStoreUrl(parsed.data.url); } catch { return { error: "Adresa nu pare validă." }; }
  if (!/\.[a-z]{2,}$/.test(info.domain) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(info.domain)) return { error: "Adresa nu pare validă." };
  const ip = await clientIp();
  const recent = (auditLimiter.get(ip) ?? []).filter((t) => t > Date.now() - 3600e3);
  if (recent.length >= 10) return { error: "Ai făcut multe audituri în ultima oră. Încearcă din nou mai târziu." };
  const url = info.origin + (info.pathPrefix || "/");
  await noteAuditRequest(url);
  // Același site verificat în ultimele 24 de ore: arătăm rezultatul existent, fără o nouă verificare
  if (form.get("force") !== "1") {
    const cached = await recentAudit(url);
    if (cached) {
      if (parsed.data.email && !cached.email) await db.update(schema.audits).set({ email: parsed.data.email, marketingConsent: form.get("consent") === "on" }).where(eq(schema.audits.id, cached.id));
      redirect(`/audit/${cached.id}`);
    }
  }
  auditLimiter.set(ip, [...recent, Date.now()]);
  const [a] = await db.insert(schema.audits).values({ url, domain: info.domain, email: parsed.data.email || null, marketingConsent: !!parsed.data.email && form.get("consent") === "on" }).returning();
  try { await runAuditRow(a.id); } catch { /* pagina de audit arată eroarea */ }
  redirect(`/audit/${a.id}`);
}

// ── Conturi ────────────────────────────────────────────────────────────────
const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(200),
  password: z.string().min(10, "Parola trebuie să aibă cel puțin 10 caractere.").max(200),
});

export async function register(_: FormState, form: FormData): Promise<FormState> {
  const r = registerSchema.safeParse(Object.fromEntries(form));
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Verifică datele introduse." };
  const d = r.data;
  const email = d.email.toLowerCase();
  const exists = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (exists.length) return { error: "Există deja un cont cu acest email." };
  // Contul se face doar cu email și parolă; magazinul îl adaugă la primul pas al testului gratuit (/start).
  const [user] = await db.insert(schema.users).values({ email, name: d.name, passwordHash: await hashPassword(d.password) }).returning();
  const [org] = await db.insert(schema.orgs).values({ name: d.name }).returning();
  await db.insert(schema.memberships).values({ orgId: org.id, userId: user.id, role: "owner" });
  await log(org.id, user.id, "register");
  await createSession(user.id);
  redirect("/start");
}

async function createProject(orgId: string, name: string, info: ReturnType<typeof parseStoreUrl>, country: "RO" | "HU") {
  const [p] = await db.insert(schema.projects).values({
    orgId, name, domain: info.domain, pathPrefix: info.pathPrefix, country,
    language: country === "HU" ? "hu" : "ro", currency: country === "HU" ? "HUF" : "RON",
  }).returning();
  invalidateWorld();
  await claimStore(p);
  // Încercăm conectarea automată (Shopify/WooCommerce publice). Dacă nu merge, magazinul adaugă feed-ul din Setări.
  try {
    const c = await connectStore(p.id, { kind: "auto" });
    await enqueue("sync", { connectionId: c.id });
  } catch { /* fără conectare automată */ }
  await enqueue("audit", { projectId: p.id });
  await enqueue("run_project", { projectId: p.id }, new Date(Date.now() + 30_000));
  return p.id;
}

export async function addProject(_: FormState, form: FormData): Promise<FormState> {
  const { org, user, role } = await requireAuth();
  if (!["owner", "admin"].includes(role)) return { error: "Doar proprietarul sau un administrator poate adăuga magazine." };
  const r = z.object({ storeName: z.string().min(2).max(100), storeUrl: z.string().min(4).max(300), country: z.enum(["RO", "HU"]) }).safeParse(Object.fromEntries(form));
  if (!r.success) return { error: "Completează numele și adresa magazinului." };
  let info;
  try { info = parseStoreUrl(r.data.storeUrl); } catch { return { error: "Adresa nu pare validă." }; }
  const id = await createProject(org.id, r.data.storeName, info, r.data.country);
  await log(org.id, user.id, "project.add", { domain: info.domain, pathPrefix: info.pathPrefix });
  (await cookies()).set("echo_project", id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/panou");
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").toLowerCase().trim();
  const password = String(form.get("password") ?? "");
  const key = `${await clientIp()}|${email}`;
  if (tooManyAttempts(key)) return { error: "Prea multe încercări. Așteaptă 15 minute." };
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!u || !(await verifyPassword(password, u.passwordHash))) {
    recordFailure(key);
    return { error: "Email sau parolă greșite." };
  }
  if (u.totpEnabled && u.totpSecret) {
    const code = String(form.get("code") ?? "");
    if (!code) return { error: "Contul are verificare în doi pași. Scrie codul din aplicația de autentificare." };
    if (!verifyTotp(decrypt(u.totpSecret), code)) { recordFailure(key); return { error: "Codul de verificare nu este corect." }; }
  }
  await createSession(u.id);
  const [m] = await db.select({ orgId: schema.memberships.orgId }).from(schema.memberships).where(eq(schema.memberships.userId, u.id)).limit(1);
  redirect(m ? "/panou" : "/cont");
}

export async function logout() {
  await destroySession();
  redirect("/");
}

export async function selectProject(form: FormData) {
  const id = String(form.get("projectId"));
  await ownProject(id);
  (await cookies()).set("echo_project", id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/panou");
}

// ── Setări magazin ─────────────────────────────────────────────────────────
export async function connectFeed(_: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get("projectId"));
  const { org, user } = await ownProject(projectId);
  const kind = String(form.get("kind")) as ConnectorKind | "auto";
  const url = String(form.get("feed_url") ?? "").trim();
  const secret = String(form.get("api_key") ?? "").trim();
  if (!["auto", "shopify", "woocommerce", "feed", "gomag", "merchantpro", "prestashop"].includes(kind)) return { error: "Tip de conexiune necunoscut." };
  if (kind === "feed" && !/^https?:\/\//.test(url)) return { error: "Adaugă adresa completă a feed-ului (https://…)." };
  if (["gomag", "merchantpro", "prestashop"].includes(kind) && !secret) return { error: "Pentru această platformă e nevoie de cheia API." };
  try {
    const c = await connectStore(projectId, { kind, url: url || undefined, secret: secret || undefined });
    await enqueue("sync", { connectionId: c.id });
    await log(org.id, user.id, "connection.add", { kind: c.kind });
  } catch (e) {
    return { error: String((e as Error).message ?? e) };
  }
  revalidatePath("/panou/setari");
  return { ok: "Conectat. Sincronizarea catalogului a pornit și durează câteva minute." };
}

export async function uploadFeed(_: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get("projectId"));
  const { org, user } = await ownProject(projectId);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Alege un fișier de feed." };
  if (file.size > 50 * 1024 * 1024) return { error: "Fișierul e prea mare (maxim 50 MB). Folosește un link de feed." };
  try {
    const n = await importFeedFile(projectId, file.name.slice(0, 120), await file.text());
    await log(org.id, user.id, "connection.upload", { name: file.name, n });
    revalidatePath("/panou/setari");
    return { ok: `Am importat ${n} produse din ${file.name}.` };
  } catch (e) {
    return { error: String((e as Error).message ?? e) };
  }
}

export async function uploadBotLog(_: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get("projectId"));
  await ownProject(projectId);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Alege fișierul jurnalului." };
  if (file.size > 50 * 1024 * 1024) return { error: "Maxim 50 MB. Încarcă jurnalul pe câteva zile, nu tot." };
  const { parseAccessLog, saveBotHits } = await import("@/core/bots");
  const hits = parseAccessLog(await file.text());
  if (!hits.length) return { error: "Nu am găsit vizite ale roboților AI. Verifică să fie formatul „combined” (nginx/Apache)." };
  await saveBotHits(projectId, hits);
  revalidatePath("/panou/roboti");
  return { ok: `Am găsit ${hits.length} vizite ale roboților AI.` };
}

/** Șterge o conexiune de catalog (de ex. una greșită). Produsele importate rămân până la următoarea sincronizare. */
export async function removeConnection(form: FormData) {
  const projectId = String(form.get("projectId"));
  const { org, user } = await ownProject(projectId);
  const id = String(form.get("connectionId"));
  await db.delete(schema.connections).where(and(eq(schema.connections.id, id), eq(schema.connections.projectId, projectId)));
  await log(org.id, user.id, "connection.remove", { id });
  revalidatePath("/panou/setari");
}

export async function syncNow(form: FormData) {
  const projectId = String(form.get("projectId"));
  await ownProject(projectId);
  const id = String(form.get("connectionId"));
  const [c] = await db.select().from(schema.connections).where(and(eq(schema.connections.id, id), eq(schema.connections.projectId, projectId)));
  // O singură sincronizare pe conexiune: dacă una e deja la coadă sau în lucru, nu mai adăugăm alta.
  if (c && !(await syncingConnections([c.id])).has(c.id)) {
    await db.update(schema.connections).set({ status: "pending" }).where(eq(schema.connections.id, c.id));
    await enqueue("sync", { connectionId: c.id });
  }
  revalidatePath("/panou/setari");
}

export async function addCompetitor(_: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get("projectId"));
  await ownProject(projectId);
  let info;
  try { info = parseStoreUrl(String(form.get("url") ?? "")); } catch { return { error: "Adresa concurentului nu e validă." }; }
  const name = String(form.get("name") ?? "").trim() || info.domain;
  await db.insert(schema.competitors).values({ projectId, domain: info.domain, name }).onConflictDoNothing();
  await db.delete(schema.competitorDismissals).where(and(eq(schema.competitorDismissals.projectId, projectId), eq(schema.competitorDismissals.domain, info.domain)));
  invalidateWorld();
  revalidatePath("/panou/setari");
  return { ok: `${name} adăugat.` };
}

/** „Urmărește” un magazin găsit în răspunsurile AI (din Vizibilitate). */
export async function trackRival(form: FormData) {
  const projectId = String(form.get("projectId"));
  await ownProject(projectId);
  let info;
  try { info = parseStoreUrl(String(form.get("domain") ?? "")); } catch { return; }
  const name = String(form.get("name") ?? "").trim().slice(0, 80) || info.domain;
  await db.insert(schema.competitors).values({ projectId, domain: info.domain, name }).onConflictDoNothing();
  await db.delete(schema.competitorDismissals).where(and(eq(schema.competitorDismissals.projectId, projectId), eq(schema.competitorDismissals.domain, info.domain)));
  invalidateWorld();
  revalidatePath("/panou/vizibilitate");
  revalidatePath("/panou/setari");
}

export async function removeCompetitor(form: FormData) {
  const projectId = String(form.get("projectId"));
  await ownProject(projectId);
  const [gone] = await db.delete(schema.competitors).where(and(eq(schema.competitors.id, String(form.get("id"))), eq(schema.competitors.projectId, projectId))).returning({ domain: schema.competitors.domain });
  // Ținem minte că l-ai scos, ca detectarea automată să nu-l adauge la loc.
  if (gone) await db.insert(schema.competitorDismissals).values({ projectId, domain: gone.domain }).onConflictDoNothing();
  invalidateWorld();
  revalidatePath("/panou/setari");
  revalidatePath("/panou/vizibilitate");
}

const PromptInput = z.object({
  text: z.string().trim().min(3, "Căutarea trebuie să aibă între 3 și 300 de caractere.").max(300, "Căutarea trebuie să aibă între 3 și 300 de caractere."),
  intent: z.enum(["produs", "cod", "categorie", "brand", "general"]).catch("produs"),
});

export async function addPrompt(_: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get("projectId"));
  const { project, org } = await ownProject(projectId);
  const parsed = PromptInput.safeParse({ text: form.get("text") ?? "", intent: form.get("intent") ?? "produs" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Căutare invalidă." };
  const manual = await db.select({ id: schema.prompts.id }).from(schema.prompts)
    .where(and(eq(schema.prompts.projectId, projectId), eq(schema.prompts.suggested, false), eq(schema.prompts.active, true)));
  const limit = promptLimit(org.plan);
  if (manual.length >= limit) return { error: `Planul tău urmărește cel mult ${limit} căutări. Oprește una ca să adaugi alta.` };
  await db.insert(schema.prompts).values({ projectId, text: parsed.data.text, language: project.language, suggested: false, intent: parsed.data.intent });
  // Căutările adăugate de mână intră în limită: lista propusă se reface în worker (citește tot catalogul).
  await enqueue("prompts", { projectId });
  revalidatePath("/panou/setari");
  return { ok: "Căutare adăugată. Intră în următoarea rulare." };
}

export async function togglePrompt(form: FormData) {
  const projectId = String(form.get("projectId"));
  await ownProject(projectId);
  const id = String(form.get("id"));
  const [p] = await db.select().from(schema.prompts).where(and(eq(schema.prompts.id, id), eq(schema.prompts.projectId, projectId)));
  if (p) await db.update(schema.prompts).set({ active: !p.active }).where(eq(schema.prompts.id, id));
  revalidatePath("/panou/setari");
}

export async function runNow(form: FormData) {
  const projectId = String(form.get("projectId"));
  const { org, user } = await ownProject(projectId);
  await enqueue("audit", { projectId });
  await enqueue("run_project", { projectId });
  await log(org.id, user.id, "project.run");
  revalidatePath("/panou");
}

export async function setActionStatus(form: FormData) {
  const projectId = String(form.get("projectId"));
  await ownProject(projectId);
  const status = z.enum(["noua", "in_lucru", "rezolvata", "ignorata"]).parse(form.get("status"));
  await db.update(schema.actions).set({ status, resolvedAt: status === "rezolvata" ? new Date() : null })
    .where(and(eq(schema.actions.id, String(form.get("id"))), eq(schema.actions.projectId, projectId)));
  revalidatePath("/panou");
  revalidatePath("/panou/actiuni");
}

export async function makeReport(form: FormData) {
  const projectId = String(form.get("projectId"));
  const { user } = await ownProject(projectId);
  await enqueue("report", { projectId, email: form.get("send") ? user.email : "" });
  revalidatePath("/panou/rapoarte");
}

export async function markAlertsRead(form: FormData) {
  const projectId = String(form.get("projectId"));
  await ownProject(projectId);
  await db.update(schema.alerts).set({ read: true }).where(eq(schema.alerts.projectId, projectId));
  revalidatePath("/panou");
}

/** „Urmărește în AI” / „Nu mai urmări” pe un produs din pagina Produse. */
export async function trackProduct(form: FormData) {
  const projectId = String(form.get("projectId"));
  const { org } = await ownProject(projectId);
  const productId = z.string().uuid().parse(String(form.get("productId")));
  await setProductTracked(projectId, productId, form.get("on") === "1", org.plan);
  revalidatePath("/panou/produse");
  revalidatePath(`/panou/produse-ai/${productId}`);
  revalidatePath("/panou/setari");
}

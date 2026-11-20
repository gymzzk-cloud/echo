"use server";

import { and, eq, isNull, gt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { createSession, currentUser, hashPassword, requireAuth } from "@/lib/auth";
import { decrypt, encrypt, randomToken, sha256 } from "@/lib/util";
import { newTotpSecret, verifyTotp } from "@/lib/totp";
import { esc, sendEmail } from "@/lib/email";
import { checkoutUrl, portalUrl, type PlanId } from "@/core/billing";
import { BRAND } from "@/lib/brand";
import type { FormState } from "./actions";

async function requireAdmin() {
  const a = await requireAuth();
  if (!["owner", "admin"].includes(a.role)) throw new Error("Doar proprietarul sau un administrator poate face asta.");
  return a;
}
const log = (orgId: string, userId: string, action: string, details?: unknown) =>
  db.insert(schema.auditLog).values({ orgId, userId, action, details: details ?? null });

// ── Echipă și invitații ────────────────────────────────────────────────────
export async function inviteMember(_: FormState, form: FormData): Promise<FormState> {
  const { org, user } = await requireAdmin();
  const r = z.object({ email: z.string().email().max(200), role: z.enum(["admin", "member", "viewer", "client"]) }).safeParse({ email: form.get("email"), role: form.get("role") });
  if (!r.success) return { error: "Scrie un email valid și alege rolul." };
  const projectIds = r.data.role === "client" ? form.getAll("projectIds").map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x)) : null;
  if (r.data.role === "client" && !projectIds?.length) return { error: "Alege magazinele pe care le vede clientul." };
  const token = randomToken();
  await db.insert(schema.invites).values({ orgId: org.id, email: r.data.email.toLowerCase(), role: r.data.role, projectIds, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 864e5) });
  const link = `${process.env.APP_URL ?? "http://localhost:3000"}/invitatie/${token}`;
  const mail = await sendEmail(r.data.email, `Invitație în ${org.brandName ?? BRAND.name}: ${org.name}`, `<p>${esc(user.name ?? user.email)} te-a invitat în contul ${esc(org.name)}.</p><p><a href="${link}">Acceptă invitația</a> (valabilă 7 zile).</p>`);
  await log(org.id, user.id, "invite.create", { email: r.data.email, role: r.data.role });
  revalidatePath("/panou/cont");
  return { ok: mail.sent ? `Invitație trimisă pe email la ${r.data.email}.` : `Emailul nu e configurat. Trimite tu linkul (valabil 7 zile): ${link}` };
}

export async function revokeInvite(form: FormData) {
  const { org } = await requireAdmin();
  await db.delete(schema.invites).where(and(eq(schema.invites.id, String(form.get("id"))), eq(schema.invites.orgId, org.id)));
  revalidatePath("/panou/cont");
}

export async function removeMember(form: FormData) {
  const { org, user } = await requireAdmin();
  const uid = String(form.get("userId"));
  if (uid === user.id) return;
  const [m] = await db.select().from(schema.memberships).where(and(eq(schema.memberships.orgId, org.id), eq(schema.memberships.userId, uid)));
  if (!m || m.role === "owner") return;
  await db.delete(schema.memberships).where(and(eq(schema.memberships.orgId, org.id), eq(schema.memberships.userId, uid)));
  await log(org.id, user.id, "member.remove", { userId: uid });
  revalidatePath("/panou/cont");
}

async function inviteByToken(token: string) {
  const [inv] = await db.select().from(schema.invites).where(and(eq(schema.invites.tokenHash, sha256(token)), isNull(schema.invites.acceptedAt), gt(schema.invites.expiresAt, new Date()))).limit(1);
  return inv ?? null;
}

export async function acceptInvite(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const inv = await inviteByToken(token);
  if (!inv) return { error: "Invitația a expirat sau a fost deja folosită." };
  let user = await currentUser();
  if (!user) {
    const [exists] = await db.select().from(schema.users).where(eq(schema.users.email, inv.email)).limit(1);
    if (exists) return { error: "Există deja un cont cu acest email. Intră în cont, apoi deschide din nou linkul." };
    const pw = String(form.get("password") ?? "");
    if (pw.length < 10) return { error: "Parola trebuie să aibă cel puțin 10 caractere." };
    [user] = await db.insert(schema.users).values({ email: inv.email, name: String(form.get("name") ?? "").slice(0, 100) || null, passwordHash: await hashPassword(pw) }).returning();
    await createSession(user.id);
  } else if (user.email !== inv.email) {
    return { error: `Invitația este pentru ${inv.email}. Ieși din contul curent și deschide din nou linkul.` };
  }
  // Un utilizator aparține unei singure organizații în MVP: mutăm apartenența
  await db.delete(schema.memberships).where(eq(schema.memberships.userId, user.id));
  await db.insert(schema.memberships).values({ orgId: inv.orgId, userId: user.id, role: inv.role, projectIds: inv.projectIds });
  await db.update(schema.invites).set({ acceptedAt: new Date() }).where(eq(schema.invites.id, inv.id));
  await log(inv.orgId, user.id, "invite.accept", { role: inv.role });
  redirect("/panou");
}

// ── Verificare în doi pași (TOTP) ──────────────────────────────────────────
export async function start2fa() {
  const { user } = await requireAuth();
  await db.update(schema.users).set({ totpSecret: encrypt(newTotpSecret()), totpEnabled: false }).where(eq(schema.users.id, user.id));
  revalidatePath("/panou/cont");
}

export async function confirm2fa(_: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireAuth();
  if (!user.totpSecret) return { error: "Pornește mai întâi activarea." };
  if (!verifyTotp(decrypt(user.totpSecret), String(form.get("code") ?? ""))) return { error: "Codul nu este corect. Verifică ora telefonului și încearcă din nou." };
  await db.update(schema.users).set({ totpEnabled: true }).where(eq(schema.users.id, user.id));
  await log(org.id, user.id, "2fa.enable");
  revalidatePath("/panou/cont");
  return { ok: "Verificarea în doi pași este activă." };
}

export async function disable2fa(_: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await requireAuth();
  if (user.totpSecret && !verifyTotp(decrypt(user.totpSecret), String(form.get("code") ?? ""))) return { error: "Codul nu este corect." };
  await db.update(schema.users).set({ totpEnabled: false, totpSecret: null }).where(eq(schema.users.id, user.id));
  await log(org.id, user.id, "2fa.disable");
  revalidatePath("/panou/cont");
  return { ok: "Verificarea în doi pași a fost oprită." };
}

// ── Agenție și marcă proprie ───────────────────────────────────────────────
export async function saveAgency(_: FormState, form: FormData): Promise<FormState> {
  const { org, user } = await requireAdmin();
  const color = String(form.get("brandColor") ?? "");
  await db.update(schema.orgs).set({
    kind: form.get("kind") === "agency" ? "agency" : "store",
    brandName: String(form.get("brandName") ?? "").trim().slice(0, 60) || null,
    brandColor: /^#[0-9a-f]{6}$/i.test(color) ? color : null,
  }).where(eq(schema.orgs.id, org.id));
  await log(org.id, user.id, "org.brand");
  revalidatePath("/panou", "layout");
  return { ok: "Salvat." };
}

// ── Facturare ──────────────────────────────────────────────────────────────
export async function startCheckout(form: FormData) {
  const { org, user } = await requireAdmin();
  const plan = String(form.get("plan")) as PlanId;
  let url: string;
  try { url = await checkoutUrl(org, user.email, plan); } catch (e) { redirect(`/panou/cont?eroare=${encodeURIComponent(String((e as Error).message))}`); }
  redirect(url);
}

export async function openPortal() {
  const { org } = await requireAdmin();
  let url: string;
  try { url = await portalUrl(org); } catch (e) { redirect(`/panou/cont?eroare=${encodeURIComponent(String((e as Error).message))}`); }
  redirect(url);
}

"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { createSession, currentUser, hashPassword } from "@/lib/auth";
import { addWatch, removeWatch } from "@/core/watches";
import type { FormState } from "./actions";

const safeNext = (n: unknown) => (typeof n === "string" && /^\/[a-z0-9/?=&%._-]*$/i.test(n) && !n.startsWith("//") ? n : "/cont");

/** Cont de cumpărător: doar email și parolă, fără magazin. */
export async function registerBuyer(_: FormState, form: FormData): Promise<FormState> {
  const r = z.object({
    email: z.string().email().max(200),
    password: z.string().min(10, "Parola trebuie să aibă cel puțin 10 caractere.").max(200),
    locale: z.enum(["ro", "hu"]).default("ro"),
  }).safeParse(Object.fromEntries(form));
  if (!r.success) return { error: r.error.issues[0]?.message ?? "Verifică datele." };
  const email = r.data.email.toLowerCase();
  const [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (exists) return { error: "Există deja un cont cu acest email. Intră în cont." };
  const [u] = await db.insert(schema.users).values({ email, passwordHash: await hashPassword(r.data.password), locale: r.data.locale }).returning();
  await createSession(u.id);
  const next = safeNext(form.get("next"));
  const pid = String(form.get("productId") ?? "");
  if (/^[0-9a-f-]{36}$/.test(pid)) await addWatch(u.id, pid);
  redirect(next);
}

/** Butonul „Urmărește” din căutare și comparare. */
export async function watchProduct(form: FormData) {
  const pid = String(form.get("productId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(pid)) return;
  const user = await currentUser();
  const back = safeNext(form.get("back"));
  if (!user) redirect(`/cont/inregistrare?productId=${pid}&next=${encodeURIComponent(back)}`);
  const target = parseFloat(String(form.get("targetPrice") ?? ""));
  await addWatch(user.id, pid, String(form.get("list") ?? "Favorite"), Number.isFinite(target) && target > 0 ? target : undefined);
  revalidatePath("/cont");
  redirect(back.includes("?") ? `${back}&urmarit=1` : `${back}?urmarit=1`);
}

export async function updateWatch(form: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const id = String(form.get("id"));
  const target = parseFloat(String(form.get("targetPrice") ?? ""));
  await db.update(schema.watches).set({
    list: String(form.get("list") ?? "Favorite").slice(0, 40) || "Favorite",
    targetPrice: Number.isFinite(target) && target > 0 ? String(target) : null,
    notifyStock: form.get("notifyStock") === "on",
  }).where(and(eq(schema.watches.id, id), eq(schema.watches.userId, user.id)));
  revalidatePath("/cont");
}

export async function unwatch(form: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  await removeWatch(user.id, String(form.get("id")));
  revalidatePath("/cont");
}

export async function readNotifications() {
  const user = await currentUser();
  if (!user) redirect("/login");
  await db.update(schema.notifications).set({ read: true }).where(eq(schema.notifications.userId, user.id));
  revalidatePath("/cont");
}

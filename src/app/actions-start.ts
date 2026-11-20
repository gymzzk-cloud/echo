"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { parseStoreUrl } from "@/lib/util";
import { checkoutUrl, PLANS, type PlanId } from "@/core/billing";
import {
  addCompetitorFromTrial, addQuestion, finishScan, removeQuestion, saveIdentity, saveMarkets, saveProfile, startTrial, startTrialRun, trialProject, writeQuestions,
} from "@/core/onboarding";
import { cleanDomain, cleanList, domainFromName, type Market } from "@/core/onboarding/types";
import type { FormState } from "@/app/actions";

/** Testul gratuit: fiecare acțiune lucrează doar pe proiectul în test al organizației (nu primește id din formular). */
async function ctx() {
  const { user, org, role } = await requireAuth();
  if (!["owner", "admin"].includes(role)) throw new Error("Doar proprietarul contului poate face testul.");
  const p = await trialProject(org.id);
  return { user, org, p };
}
async function need() {
  const c = await ctx();
  if (!c.p) redirect("/start");
  return { ...c, p: c.p };
}
const log = (orgId: string, userId: string, action: string, details?: unknown) =>
  db.insert(schema.auditLog).values({ orgId, userId, action, details: details ?? null });

export async function beginTrial(_: FormState, form: FormData): Promise<FormState> {
  const { user, org } = await ctx();
  const r = z.object({ url: z.string().min(4).max(300) }).safeParse(Object.fromEntries(form));
  if (!r.success) return { error: "Scrie adresa magazinului, de exemplu magazinul-tau.ro." };
  let info;
  try { info = parseStoreUrl(r.data.url); } catch { return { error: "Adresa nu pare validă. Scrie-o așa: magazinul-tau.ro" }; }
  if (!/\.[a-z]{2,}$/.test(info.domain) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(info.domain)) return { error: "Adresa nu pare validă. Scrie-o așa: magazinul-tau.ro" };
  const id = await startTrial(org.id, r.data.url);
  await log(org.id, user.id, "trial.start", { domain: info.domain });
  (await cookies()).set("echo_project", id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/start/scanare");
}

export async function confirmScan() {
  const { org, p } = await need();
  await finishScan(org.id, p.id);
  redirect("/start/identitate");
}

const list = (f: FormData, k: string, max = 12) => cleanList(String(f.get(k) ?? ""), max);
const domains = (f: FormData, k: string) => list(f, k, 10).map(cleanDomain).filter((d): d is string => !!d);

export async function saveIdentityAction(_: FormState, form: FormData): Promise<FormState> {
  const { org, p } = await need();
  const names = list(form, "names", 6);
  if (!names.length) return { error: "Scrie cel puțin numele magazinului." };
  const cui = String(form.get("cui") ?? "").replace(/\s/g, "").toUpperCase().slice(0, 14);
  await saveIdentity(org.id, p.id, { names, aliases: domains(form, "aliases"), notMine: domains(form, "notMine"), cui: cui || undefined });
  redirect("/start/profil");
}

export async function saveProfileAction(_: FormState, form: FormData): Promise<FormState> {
  const { org, p } = await need();
  const categories = list(form, "categories", 10);
  if (!categories.length) return { error: "Adaugă cel puțin o categorie de produse pe care o vinzi." };
  await saveProfile(org.id, p.id, { categories, brands: list(form, "brands", 10), products: list(form, "products", 10), competitors: list(form, "competitors", 10).map((x) => cleanDomain(x) ?? domainFromName(x, p.country === "HU" ? "hu" : "ro")).filter((d): d is string => !!d) });
  redirect("/start/piete");
}

export async function saveMarketsAction(_: FormState, form: FormData): Promise<FormState> {
  const { org, p } = await need();
  const markets = list(form, "markets", 2).filter((m): m is Market => m === "RO" || m === "HU");
  if (!markets.length) return { error: "Alege cel puțin o piață." };
  const city = form.get("local") === "on" ? String(form.get("city") ?? "").trim().slice(0, 40) || undefined : undefined;
  await saveMarkets(org.id, p.id, { markets, city });
  redirect("/start/intrebari");
}

export async function setFocusAction(form: FormData) {
  const { org, p } = await need();
  const focus = z.enum(["research", "compare", "buy"]).catch("buy").parse(form.get("focus"));
  await writeQuestions(org.id, p.id, focus);
  revalidatePath("/start/intrebari");
}

export async function removeQuestionAction(form: FormData) {
  const { org, p } = await need();
  await removeQuestion(org.id, p.id, String(form.get("id")));
  revalidatePath("/start/intrebari");
}

export async function addQuestionAction(_: FormState, form: FormData): Promise<FormState> {
  const { org, p } = await need();
  const text = String(form.get("text") ?? "").replace(/\s+/g, " ").trim();
  if (text.length < 3 || text.length > 160) return { error: "Scrie întrebarea cum o caută un client, între 3 și 160 de caractere." };
  try { await addQuestion(org.id, p.id, text); } catch (e) { return { error: (e as Error).message }; }
  revalidatePath("/start/intrebari");
  return { ok: "Am adăugat întrebarea." };
}

export async function startRunAction() {
  const { user, org, p } = await need();
  await startTrialRun(org.id, p.id);
  await log(org.id, user.id, "trial.run");
  redirect("/start/rulare");
}

export async function showResultAction() {
  const { p } = await need();
  if (p.onboarding && p.onboarding.step !== "result") {
    await db.update(schema.projects).set({ onboarding: { ...p.onboarding, step: "result", runFinishedAt: new Date().toISOString() } }).where(eq(schema.projects.id, p.id));
  }
  redirect("/start/rezultat");
}

export async function addRivalAction(form: FormData) {
  const { org, p } = await need();
  const d = cleanDomain(String(form.get("domain") ?? ""));
  if (d) await addCompetitorFromTrial(org.id, p.id, d);
  revalidatePath("/start/rezultat");
}

export async function trialCheckout(form: FormData) {
  const { user, org } = await need();
  const plan = z.enum(PLANS.map((x) => x.id) as [PlanId, ...PlanId[]]).parse(form.get("plan"));
  let url: string;
  try { url = await checkoutUrl(org, user.email, plan); } catch (e) { redirect(`/start/rezultat?eroare=${encodeURIComponent((e as Error).message)}`); }
  redirect(url);
}

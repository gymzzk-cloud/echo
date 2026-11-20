"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { audit, ownProject } from "@/lib/guard";
import { encrypt, randomToken } from "@/lib/util";
import { WEBHOOK_EVENTS, newApiKey, safeWebhookUrl } from "@/core/platform";
import { enqueue } from "@/core/jobs";
import type { FormState } from "./actions";

async function admin() {
  const a = await requireAuth();
  if (!["owner", "admin"].includes(a.role)) throw new Error("Doar proprietarul sau un administrator.");
  return a;
}
const done = () => revalidatePath("/panou/dezvoltatori");

export async function createApiKey(_: FormState, form: FormData): Promise<FormState> {
  const { org, user } = await admin();
  const name = String(form.get("name") ?? "").trim().slice(0, 60) || "Cheie API";
  const k = newApiKey();
  await db.insert(schema.apiKeys).values({ orgId: org.id, name, prefix: k.prefix, keyHash: k.hash });
  await audit(org.id, user.id, "apikey.create", { name });
  done();
  return { ok: `Copiază cheia acum, nu o mai afișăm: ${k.raw}` };
}

export async function revokeApiKey(form: FormData) {
  const { org, user } = await admin();
  await db.delete(schema.apiKeys).where(and(eq(schema.apiKeys.id, String(form.get("id"))), eq(schema.apiKeys.orgId, org.id)));
  await audit(org.id, user.id, "apikey.revoke");
  done();
}

export async function addWebhook(_: FormState, form: FormData): Promise<FormState> {
  const { org, user } = await admin();
  const url = String(form.get("url") ?? "").trim();
  if (!safeWebhookUrl(url)) return { error: "Adresa trebuie să fie publică și să înceapă cu https://." };
  const events = form.getAll("events").map(String).filter((e) => WEBHOOK_EVENTS.some((w) => w.id === e));
  if (!events.length) return { error: "Alege cel puțin un eveniment." };
  const secret = randomToken(24);
  await db.insert(schema.webhooks).values({ orgId: org.id, url, events, secret: encrypt(secret) });
  await audit(org.id, user.id, "webhook.add", { url });
  done();
  return { ok: `Webhook adăugat. Secretul pentru verificarea semnăturii (copiază-l acum): ${secret}` };
}

export async function deleteWebhook(form: FormData) {
  const { org } = await admin();
  await db.delete(schema.webhooks).where(and(eq(schema.webhooks.id, String(form.get("id"))), eq(schema.webhooks.orgId, org.id)));
  done();
}

export async function testWebhook(form: FormData) {
  const { org } = await admin();
  const [h] = await db.select().from(schema.webhooks).where(and(eq(schema.webhooks.id, String(form.get("id"))), eq(schema.webhooks.orgId, org.id)));
  if (h) await enqueue("webhook", { webhookId: h.id, event: "test", payload: JSON.stringify({ event: "test", data: { mesaj: "Test de la Echo" }, at: new Date().toISOString() }) });
  done();
}

export async function saveMcpEnabled(_: FormState, form: FormData): Promise<FormState> {
  const { project } = await ownProject(String(form.get("projectId")));
  await db.update(schema.projects).set({ mcpEnabled: form.get("mcpEnabled") === "on" }).where(eq(schema.projects.id, project.id));
  done();
  return { ok: "Salvat." };
}

/** Recitește acum condițiile de pe site (retur, plată, livrare, întrebări). Lucrarea merge în coadă; dublurile sunt refuzate de enqueue. */
export async function rereadPolicies(form: FormData) {
  const { project } = await ownProject(String(form.get("projectId")));
  const last = project.storeInfo?.policies?.checkedAt;
  // Cel mult o recitire la 10 minute: nu încărcăm site-ul magazinului la fiecare clic.
  if (!last || Date.now() - new Date(last).getTime() > 10 * 60e3) await enqueue("policies", { projectId: project.id });
  done();
}

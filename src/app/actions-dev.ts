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

export async function saveStoreInfo(_: FormState, form: FormData): Promise<FormState> {
  const { project } = await ownProject(String(form.get("projectId")));
  const faq = String(form.get("faq") ?? "").split(/\n\s*\n/).map((b) => {
    const [q, ...a] = b.trim().split("\n");
    return { q: (q ?? "").replace(/^[-*?\s]+/, "").slice(0, 200), a: a.join(" ").trim().slice(0, 1000) };
  }).filter((x) => x.q && x.a).slice(0, 40);
  await db.update(schema.projects).set({
    mcpEnabled: form.get("mcpEnabled") === "on",
    storeInfo: { delivery: String(form.get("delivery") ?? "").slice(0, 1000) || undefined, returns: String(form.get("returns") ?? "").slice(0, 1000) || undefined, payment: String(form.get("payment") ?? "").slice(0, 500) || undefined, faq },
  }).where(eq(schema.projects.id, project.id));
  done();
  return { ok: "Salvat. Agenții AI primesc aceste răspunsuri prin serverul MCP al magazinului." };
}

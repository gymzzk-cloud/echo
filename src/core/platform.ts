import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decrypt, randomToken, sha256 } from "@/lib/util";
import { enqueue } from "./jobs";

/** API public (chei per organizație) și webhook-uri semnate HMAC. */
export const WEBHOOK_EVENTS = [
  { id: "order.tracked", label: "Comandă venită din AI" },
  { id: "agent_order.decided", label: "Decizie Agent Gate" },
  { id: "alert.created", label: "Alertă nouă (scădere de vizibilitate, preț greșit)" },
  { id: "review.submitted", label: "Recenzie verificată nouă" },
] as const;

export function newApiKey() {
  const raw = `ek_${randomToken(24)}`;
  return { raw, prefix: raw.slice(0, 10), hash: sha256(raw) };
}

export async function orgFromApiKey(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const key = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!/^ek_[A-Za-z0-9_-]{20,64}$/.test(key)) return null;
  const [k] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.keyHash, sha256(key))).limit(1);
  if (!k) return null;
  await db.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, k.id));
  return k.orgId;
}

/** Adresele webhook trebuie să fie publice și HTTPS (fără rețele interne). */
export function safeWebhookUrl(u: string) {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return false;
    const h = url.hostname;
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^\[/.test(h)) return false;
    if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || /^\d+$/.test(h)) return false;
    return true;
  } catch { return false; }
}

export const signPayload = (secret: string, ts: number, body: string) => createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

export async function emitEvent(projectId: string, event: string, data: Record<string, unknown>) {
  const [p] = await db.select({ orgId: schema.projects.orgId, domain: schema.projects.domain }).from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!p) return;
  const hooks = await db.select().from(schema.webhooks).where(and(eq(schema.webhooks.orgId, p.orgId), eq(schema.webhooks.active, true)));
  for (const h of hooks) if (h.events.includes(event)) await enqueue("webhook", { webhookId: h.id, event, payload: JSON.stringify({ event, projectId, domain: p.domain, data, at: new Date().toISOString() }) });
}

export async function deliverWebhook(webhookId: string, payload: string) {
  const [h] = await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, webhookId));
  if (!h || !h.active || !safeWebhookUrl(h.url)) return;
  const ts = Math.floor(Date.now() / 1000);
  const res = await fetch(h.url, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000),
    headers: { "content-type": "application/json", "x-echo-timestamp": String(ts), "x-echo-signature": `sha256=${signPayload(decrypt(h.secret), ts, payload)}` },
    body: payload,
  });
  await db.update(schema.webhooks).set({ lastStatus: res.status }).where(eq(schema.webhooks.id, h.id));
  if (res.status >= 500 || res.status === 429) throw new Error(`Webhook ${res.status}`); // se reîncearcă
}

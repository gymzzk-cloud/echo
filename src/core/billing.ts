import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { afterPlanChosen } from "./onboarding";

/**
 * Abonamente prin Stripe (Checkout + Portalul clientului + webhook).
 * Fără STRIPE_SECRET_KEY, panoul arată planurile, dar butoanele de plată sunt dezactivate.
 * Prețurile sunt ipoteza de lucru din DECIZII.md și se schimbă doar în Stripe (ID-urile de preț din .env).
 */
export const PLANS = [
  { id: "start", name: "Start", lei: 199, price: "199 lei / lună", features: ["1 magazin", "30 de întrebări urmărite", "3 AI-uri, săptămânal", "Audit și acțiuni"] },
  { id: "pro", name: "Pro", lei: 499, price: "499 lei / lună", features: ["3 magazine", "100 de întrebări", "Toate AI-urile", "Feed-uri pe canale, Agent Gate, API"] },
  { id: "agentie", name: "Agenție", lei: 999, price: "999 lei / lună", features: ["Magazine nelimitate pentru clienți", "Conturi de client", "Rapoarte cu marca agenției", "Suport prioritar"] },
] as const;
export type PlanId = (typeof PLANS)[number]["id"];

export const billingEnabled = () => !!process.env.STRIPE_SECRET_KEY;
const priceFor = (plan: PlanId) => process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];

async function stripe(path: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe ${res.status}`);
  return json;
}

export async function checkoutUrl(org: typeof schema.orgs.$inferSelect, email: string, plan: PlanId) {
  const price = priceFor(plan);
  if (!billingEnabled() || !price) throw new Error("Plata nu este configurată încă (lipsesc cheile Stripe).");
  const app = process.env.APP_URL ?? "http://localhost:3000";
  const params: Record<string, string> = {
    mode: "subscription", "line_items[0][price]": price, "line_items[0][quantity]": "1",
    success_url: `${app}/panou/cont?plata=ok`, cancel_url: `${app}/panou/cont`,
    client_reference_id: org.id, "metadata[orgId]": org.id, "metadata[plan]": plan,
    "subscription_data[metadata][orgId]": org.id, "subscription_data[metadata][plan]": plan,
    "automatic_tax[enabled]": "true", "tax_id_collection[enabled]": "true", locale: "ro",
  };
  if (org.stripeCustomerId) params.customer = org.stripeCustomerId; else params.customer_email = email;
  return (await stripe("checkout/sessions", params)).url as string;
}

export async function portalUrl(org: typeof schema.orgs.$inferSelect) {
  if (!billingEnabled() || !org.stripeCustomerId) throw new Error("Nu există încă un abonament plătit.");
  return (await stripe("billing_portal/sessions", { customer: org.stripeCustomerId, return_url: `${process.env.APP_URL ?? ""}/panou/cont` })).url as string;
}

/** Verifică semnătura Stripe-Signature (t=…,v1=…) cu secretul webhook-ului; toleranță 5 minute. */
export function verifyStripeSignature(body: string, header: string | null, secret: string, now = Date.now()) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return header.split(",").filter((p) => p.startsWith("v1=")).some((p) => {
    const sig = p.slice(3);
    return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  });
}

type StripeEvent = { type: string; data: { object: Record<string, unknown> & { metadata?: Record<string, string> } } };
export async function handleStripeEvent(ev: StripeEvent) {
  const o = ev.data.object;
  const orgId = (o.metadata?.orgId ?? o.client_reference_id) as string | undefined;
  if (!orgId) return;
  if (ev.type === "checkout.session.completed") {
    await db.update(schema.orgs).set({
      stripeCustomerId: o.customer as string, stripeSubscriptionId: o.subscription as string,
      plan: o.metadata?.plan ?? "start", billingStatus: "active",
    }).where(eq(schema.orgs.id, orgId));
    // Testul gratuit a întrebat doar AI-urile ieftine; acum facem analiza completă, cu toate.
    await afterPlanChosen(orgId);
  } else if (ev.type === "customer.subscription.updated" || ev.type === "customer.subscription.deleted") {
    const status = ev.type.endsWith("deleted") ? "canceled" : String(o.status);
    await db.update(schema.orgs).set({
      billingStatus: ({ active: "active", trialing: "trialing", past_due: "past_due", unpaid: "past_due" } as Record<string, string>)[status] ?? "canceled",
      ...(o.metadata?.plan ? { plan: o.metadata.plan } : {}),
    }).where(eq(schema.orgs.id, orgId));
  }
}

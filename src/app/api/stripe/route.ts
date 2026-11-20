import { handleStripeEvent, verifyStripeSignature } from "@/core/billing";

/** Webhook Stripe: actualizează planul și starea plății. Semnătura e obligatorie. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook neconfigurat", { status: 503 });
  const body = await req.text();
  if (!verifyStripeSignature(body, req.headers.get("stripe-signature"), secret)) return new Response("Semnătură invalidă", { status: 400 });
  await handleStripeEvent(JSON.parse(body));
  return Response.json({ received: true });
}

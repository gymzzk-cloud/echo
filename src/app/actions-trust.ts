"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { audit, ownProject } from "@/lib/guard";
import { KNOWN_AGENTS, checkAgentOrder } from "@/core/agent-gate";
import { reviewByToken, reviewLink } from "@/core/trust";
import type { FormState } from "./actions";
import { emitEvent } from "@/core/platform";

export async function savePolicy(_: FormState, form: FormData): Promise<FormState> {
  const { project, org, user } = await ownProject(String(form.get("projectId")));
  const allowed = form.getAll("allowedAgents").map(String).filter((a) => KNOWN_AGENTS.includes(a));
  const extra = String(form.get("extraAgents") ?? "").split(",").map((s) => s.trim()).filter((s) => /^[\p{L}0-9 ._-]{2,40}$/u.test(s)).slice(0, 10);
  const max = Number(form.get("maxOrderValueUnverified"));
  await db.update(schema.projects).set({ agentPolicy: {
    allowedAgents: [...allowed, ...extra], codRequiresSms: form.get("codRequiresSms") === "on", blockUnknownAgents: form.get("blockUnknownAgents") === "on",
    maxOrderValueUnverified: Number.isFinite(max) && max > 0 ? max : 1000,
  } }).where(eq(schema.projects.id, project.id));
  await audit(org.id, user.id, "agentgate.policy");
  revalidatePath("/panou/agent-gate");
  return { ok: "Regulile au fost salvate." };
}

export async function simulateOrder(_: FormState, form: FormData): Promise<FormState> {
  const { project } = await ownProject(String(form.get("projectId")));
  const r = z.object({ agent: z.string().min(2).max(60), paymentMethod: z.enum(["card", "ramburs", "transfer"]), value: z.coerce.number().positive().max(1e7) })
    .safeParse({ agent: form.get("agent"), paymentMethod: form.get("paymentMethod"), value: form.get("value") });
  if (!r.success) return { error: "Completează agentul, plata și valoarea." };
  const res = await checkAgentOrder(project.id, { ...r.data, verified: form.get("verified") === "on", orderRef: "test" });
  revalidatePath("/panou/agent-gate");
  const label = { accepta: "Acceptă", confirma_sms: "Cere confirmare prin SMS", verificare: "Verificare manuală", respinge: "Respinge" }[res.decision];
  return { ok: `Decizie: ${label} (risc ${res.risk}/100). ${res.reasons.join(" ")}` };
}

export async function createReviewLink(_: FormState, form: FormData): Promise<FormState> {
  const { project } = await ownProject(String(form.get("projectId")));
  const orderId = String(form.get("orderId") ?? "").trim().slice(0, 80);
  if (!orderId) return { error: "Scrie numărul comenzii." };
  try {
    const link = await reviewLink(project.id, orderId);
    revalidatePath("/panou/recenzii");
    return { ok: `Trimite clientului acest link (o singură folosire): ${link}` };
  } catch (e) { return { error: (e as Error).message }; }
}

/** Formularul public de recenzie (fără cont): tokenul unic dovedește comanda reală. */
export async function submitReview(_: FormState, form: FormData): Promise<FormState> {
  const token = String(form.get("token") ?? "");
  const row = await reviewByToken(token);
  if (!row) return { error: "Linkul nu este valid." };
  if (row.r.submittedAt) return { error: "Ai trimis deja recenzia pentru această comandă. Mulțumim!" };
  const r = z.object({ rating: z.coerce.number().int().min(1).max(5), text: z.string().max(2000).optional(), authorName: z.string().max(60).optional() })
    .safeParse({ rating: form.get("rating"), text: form.get("text") || undefined, authorName: form.get("authorName") || undefined });
  if (!r.success) return { error: "Alege o notă de la 1 la 5." };
  await db.update(schema.reviews).set({ ...r.data, status: "publicat", submittedAt: new Date() }).where(eq(schema.reviews.id, row.r.id));
  await emitEvent(row.p.id, "review.submitted", { orderId: row.r.orderId, rating: r.data.rating });
  return { ok: "Mulțumim! Recenzia ta apare pe profilul magazinului, marcată „comandă verificată”." };
}

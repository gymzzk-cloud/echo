import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AgentPolicy } from "@/db/schema";
import { emitEvent } from "./platform";

/**
 * Agent Gate: decide ce face magazinul cu o comandă plasată de un agent AI.
 * Riscul principal în RO/HU: ramburs (plata la livrare) comandat automat, apoi refuzat.
 */
export const KNOWN_AGENTS = ["ChatGPT", "Claude", "Gemini", "Perplexity", "Copilot"];
export const DEFAULT_POLICY: AgentPolicy = { allowedAgents: KNOWN_AGENTS, codRequiresSms: true, blockUnknownAgents: false, maxOrderValueUnverified: 1000 };

export type AgentOrderInput = { agent: string; verified: boolean; paymentMethod: "card" | "ramburs" | "transfer"; value: number; recentOrdersSameAgent?: number };
export type Decision = "accepta" | "confirma_sms" | "verificare" | "respinge";

/** Funcție pură, testată. Întoarce decizia, riscul (0–100) și motivele, în limbaj simplu. */
export function decideAgentOrder(policy: AgentPolicy, o: AgentOrderInput): { decision: Decision; risk: number; reasons: string[] } {
  const reasons: string[] = [];
  let risk = 0;
  const known = policy.allowedAgents.some((a) => a.toLowerCase() === o.agent.toLowerCase());
  if (!known) {
    if (policy.blockUnknownAgents) return { decision: "respinge", risk: 100, reasons: [`Agentul „${o.agent}” nu este pe lista celor acceptați.`] };
    risk += 35; reasons.push("Agent necunoscut.");
  }
  if (!o.verified) { risk += 20; reasons.push("Identitatea agentului nu este verificată (semnătură lipsă)."); }
  if (o.paymentMethod === "ramburs") { risk += 25; reasons.push("Plată la livrare: risc de colet refuzat."); }
  if (o.value > policy.maxOrderValueUnverified && !o.verified) { risk += 20; reasons.push(`Valoare peste pragul de ${policy.maxOrderValueUnverified} pentru agenți neverificați.`); }
  if ((o.recentOrdersSameAgent ?? 0) >= 5) { risk += 15; reasons.push("Multe comenzi de la același agent în ultima oră."); }
  risk = Math.min(100, risk);
  let decision: Decision = "accepta";
  if (risk >= 80) decision = "respinge";
  else if (o.value > policy.maxOrderValueUnverified && !o.verified) decision = "verificare";
  else if (o.paymentMethod === "ramburs" && policy.codRequiresSms) decision = "confirma_sms";
  else if (risk >= 50) decision = "verificare";
  if (!reasons.length) reasons.push("Agent cunoscut și verificat, plată sigură.");
  return { decision, risk, reasons };
}

export async function checkAgentOrder(projectId: string, input: AgentOrderInput & { orderRef?: string }) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const recent = await db.select({ id: schema.agentOrders.id }).from(schema.agentOrders)
    .where(and(eq(schema.agentOrders.projectId, projectId), eq(schema.agentOrders.agent, input.agent), gte(schema.agentOrders.createdAt, new Date(Date.now() - 3600e3))));
  const res = decideAgentOrder(p.agentPolicy ?? DEFAULT_POLICY, { ...input, recentOrdersSameAgent: recent.length });
  await db.insert(schema.agentOrders).values({
    projectId, agent: input.agent.slice(0, 60), verified: input.verified, orderRef: input.orderRef?.slice(0, 80) ?? null,
    paymentMethod: input.paymentMethod, value: String(input.value), risk: res.risk, decision: res.decision, reasons: res.reasons,
  });
  await emitEvent(projectId, "agent_order.decided", { agent: input.agent, orderRef: input.orderRef ?? null, value: input.value, paymentMethod: input.paymentMethod, ...res });
  return res;
}

export const recentAgentOrders = (projectId: string) =>
  db.select().from(schema.agentOrders).where(eq(schema.agentOrders.projectId, projectId)).orderBy(desc(schema.agentOrders.createdAt)).limit(50);

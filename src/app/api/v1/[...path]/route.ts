import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { orgFromApiKey } from "@/core/platform";
import { checkAgentOrder } from "@/core/agent-gate";
import { reviewLink } from "@/core/trust";
import { catalogSearch } from "@/core/search";
import { daysAgo } from "@/lib/util";

/**
 * API public v1. Autentificare: Authorization: Bearer ek_…
 *   GET  /api/v1/projects
 *   GET  /api/v1/projects/{id}/visibility?days=30
 *   GET  /api/v1/projects/{id}/actions
 *   GET  /api/v1/projects/{id}/sales?days=30
 *   GET  /api/v1/search?q=…
 *   POST /api/v1/agent-gate      {projectId, agent, verified, paymentMethod, value, orderRef}
 *   POST /api/v1/reviews         {projectId, orderId}
 */
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

async function project(orgId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [p] = await db.select().from(schema.projects).where(and(eq(schema.projects.id, id), eq(schema.projects.orgId, orgId))).limit(1);
  return p ?? null;
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const orgId = await orgFromApiKey(req);
  if (!orgId) return json({ error: "Cheie API lipsă sau invalidă." }, 401);
  const { path } = await params;
  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
  if (path[0] === "projects" && path.length === 1) {
    const list = await db.select({ id: schema.projects.id, name: schema.projects.name, domain: schema.projects.domain, country: schema.projects.country }).from(schema.projects).where(eq(schema.projects.orgId, orgId));
    return json({ data: list });
  }
  if (path[0] === "search") {
    const q = url.searchParams.get("q") ?? "";
    if (q.length < 3) return json({ error: "Parametrul q are minimum 3 caractere." }, 400);
    return json({ data: await catalogSearch(q.slice(0, 300)) });
  }
  if (path[0] === "projects" && path[1]) {
    const p = await project(orgId, path[1]);
    if (!p) return json({ error: "Magazin inexistent." }, 404);
    if (path[2] === "visibility") {
      const rows = await db.select().from(schema.dailyStats).where(and(eq(schema.dailyStats.projectId, p.id), gte(schema.dailyStats.day, daysAgo(days)))).orderBy(schema.dailyStats.day);
      return json({ data: rows.map((r) => ({ day: r.day, provider: r.provider, score: r.score, visibility: r.visibility, shareOfVoice: r.shareOfVoice, avgPosition: r.avgPosition ? Number(r.avgPosition) : null })) });
    }
    if (path[2] === "actions") {
      const rows = await db.select().from(schema.actions).where(eq(schema.actions.projectId, p.id)).orderBy(desc(schema.actions.createdAt)).limit(100);
      return json({ data: rows.map(({ id, title, why, impact, effort, status, createdAt }) => ({ id, title, why, impact, effort, status, createdAt })) });
    }
    if (path[2] === "sales") {
      const rows = await db.select().from(schema.events).where(and(eq(schema.events.projectId, p.id), eq(schema.events.kind, "order"), gte(schema.events.createdAt, new Date(daysAgo(days))))).orderBy(desc(schema.events.createdAt)).limit(1000);
      return json({ data: rows.map((e) => ({ orderId: e.orderId, source: e.source, value: e.value ? Number(e.value) : null, currency: e.currency, at: e.createdAt })) });
    }
  }
  return json({ error: "Rută necunoscută." }, 404);
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const orgId = await orgFromApiKey(req);
  if (!orgId) return json({ error: "Cheie API lipsă sau invalidă." }, 401);
  const { path } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "JSON invalid." }, 400); }
  const p = await project(orgId, String(body.projectId ?? ""));
  if (!p) return json({ error: "projectId lipsă sau fără acces." }, 404);
  if (path[0] === "agent-gate") {
    const r = z.object({ agent: z.string().min(2).max(60), verified: z.boolean().default(false), paymentMethod: z.enum(["card", "ramburs", "transfer"]), value: z.number().nonnegative().max(1e8), orderRef: z.string().max(80).optional() }).safeParse(body);
    if (!r.success) return json({ error: r.error.issues[0]?.message }, 400);
    return json({ data: await checkAgentOrder(p.id, r.data) });
  }
  if (path[0] === "reviews") {
    const orderId = String(body.orderId ?? "").slice(0, 80);
    if (!orderId) return json({ error: "orderId lipsă." }, 400);
    try { return json({ data: { url: await reviewLink(p.id, orderId) } }); } catch (e) { return json({ error: (e as Error).message }, 409); }
  }
  return json({ error: "Rută necunoscută." }, 404);
}

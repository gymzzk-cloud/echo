import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { storeTools } from "@/core/mcp";
import { mcpGet, mcpResponse } from "@/lib/mcp-http";

/**
 * /mcp/magazin/<domeniu> sau /mcp/magazin/<domeniu>/<subfolder> (ex. shopexpert.com/hu):
 * mai multe magazine pot sta pe același domeniu, pe subfoldere de țară.
 */
export async function POST(req: Request, { params }: { params: Promise<{ store: string[] }> }) {
  const parts = (await params).store.map((s) => decodeURIComponent(s).toLowerCase()).filter(Boolean);
  const domain = (parts[0] ?? "").replace(/^www\./, "");
  const prefix = parts.length > 1 ? `/${parts.slice(1).join("/")}` : null;
  const rows = await db.select().from(schema.projects).where(and(eq(schema.projects.domain, domain), eq(schema.projects.mcpEnabled, true)));
  const p = prefix !== null
    ? rows.find((r) => r.pathPrefix.toLowerCase() === prefix)
    : rows.find((r) => !r.pathPrefix) ?? (rows.length === 1 ? rows[0] : rows.find((r) => r.country === "RO") ?? rows[0]);
  if (!p) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Magazin inexistent sau MCP oprit." } }, { status: 404 });
  return mcpResponse(req, { name: `${p.name} (${p.domain}${p.pathPrefix})`, tools: storeTools(p), projectId: p.id });
}
export const GET = mcpGet;

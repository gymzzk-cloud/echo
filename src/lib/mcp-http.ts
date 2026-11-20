import { handleMcp } from "@/core/mcp";

const hits = new Map<string, number[]>();
/** Limită: 60 de cereri pe minut per IP. */
export function limited(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => t > now - 60e3);
  list.push(now); hits.set(ip, list);
  return list.length > 60;
}

export async function mcpResponse(req: Request, server: Parameters<typeof handleMcp>[1]) {
  if (limited(req)) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Prea multe cereri" } }, { status: 429 });
  const text = await req.text();
  if (text.length > 64_000) return new Response("Payload too large", { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }
  const out = await handleMcp(body, { ...server, client: req.headers.get("user-agent") });
  if (out === null) return new Response(null, { status: 202 });
  return Response.json(out, { headers: { "cache-control": "no-store" } });
}

export const mcpGet = () => new Response("Server MCP (Streamable HTTP). Trimite cereri JSON-RPC prin POST.", { status: 405, headers: { allow: "POST" } });

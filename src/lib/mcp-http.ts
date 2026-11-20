import { handleMcp } from "@/core/mcp";

const hits = new Map<string, number[]>();

const ipv4 = (ip: string) => {
  const m = ip.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return m ? m.slice(1).reduce((n, x) => n * 256 + Number(x), 0) : null;
};
/** ip în blocul CIDR (doar IPv4), ex. inCidr("160.79.106.150", "160.79.104.0/21") → true. */
export function inCidr(ip: string, cidr: string) {
  const [base, bits] = cidr.split("/");
  const a = ipv4(ip), b = ipv4(base), n = Number(bits);
  if (a === null || b === null || !(n >= 0 && n <= 32)) return false;
  const size = 2 ** (32 - n);
  return Math.floor(a / size) === Math.floor(b / size);
}

/**
 * Platformele AI (Claude, ChatGPT) trimit cererile tuturor utilizatorilor lor din câteva IP-uri comune,
 * așa că primesc o limită mai mare decât un IP obișnuit. Blocurile: MCP_PLATFORM_CIDRS (implicit cel publicat de Anthropic).
 */
const platformCidrs = () => (process.env.MCP_PLATFORM_CIDRS ?? "160.79.104.0/21").split(",").map((s) => s.trim()).filter(Boolean);

/** Limită: 60 de cereri pe minut per IP; MCP_PLATFORM_RPM (implicit 600) pentru IP-urile platformelor AI. */
export function limited(req: Request, now = Date.now()) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const max = platformCidrs().some((c) => inCidr(ip, c)) ? Math.max(60, Number(process.env.MCP_PLATFORM_RPM) || 600) : 60;
  const list = (hits.get(ip) ?? []).filter((t) => t > now - 60e3);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => t > now - 60e3)) hits.delete(k);
  return list.length > max;
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

export const mcpGet = () => new Response("Server MCP (Streamable HTTP). Trimite cereri JSON-RPC prin POST. Documentație: /conector", { status: 405, headers: { allow: "POST" } });

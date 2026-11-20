import { NextResponse, type NextRequest } from "next/server";
import { recordEvent } from "@/core/tracking";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };

// Limită simplă pe IP, ca să nu poată fi umplută baza cu evenimente false.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const r = (hits.get(ip) ?? []).filter((t) => t > now - 60_000);
  r.push(now); hits.set(ip, r);
  if (hits.size > 50_000) hits.clear();
  return r.length > 120;
}

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ ok: false }, { status: 429, headers: CORS });
  const raw = await req.text();
  if (raw.length > 4000) return NextResponse.json({ ok: false }, { status: 413, headers: CORS });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400, headers: CORS }); }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);
  const r = await recordEvent({
    key: str("key") ?? "", kind: str("kind") ?? "", ref: str("ref"), utm: str("utm"), url: str("url"), session: str("session"),
    click: str("click"), order: str("order"), value: typeof body.value === "number" ? body.value : undefined, currency: str("currency"), origin: req.headers.get("origin"),
  });
  return NextResponse.json(r, { headers: CORS });
}

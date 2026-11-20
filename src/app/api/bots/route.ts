import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db, schema } from "@/db";
import { botFromUserAgent, saveBotHits } from "@/core/bots";
import { today } from "@/lib/util";

/** Primește vizitele roboților AI de la Cloudflare Worker sau plugin. Cheia e cea de urmărire a magazinului. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({ ok: false }, { status: 413 });
  let body: { key?: string; hits?: { bot?: string; ua?: string; path?: string; status?: number }[] };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  if (!body.key || !/^[a-f0-9]{20}$/.test(body.key) || !Array.isArray(body.hits)) return NextResponse.json({ ok: false }, { status: 400 });
  const [p] = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.trackingKey, body.key)).limit(1);
  if (!p) return NextResponse.json({ ok: false }, { status: 404 });
  const hits = body.hits.slice(0, 1000).flatMap((h) => {
    const bot = botFromUserAgent(String(h.bot ?? h.ua ?? ""));
    return bot ? [{ day: today(), bot, path: String(h.path ?? "/").slice(0, 300), status: Number(h.status) || 200 }] : [];
  });
  await saveBotHits(p.id, hits);
  return NextResponse.json({ ok: true, saved: hits.length });
}

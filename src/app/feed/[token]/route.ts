import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { buildFeed, renderFeed } from "@/core/feed";

/** Feed public pe canal, la un URL secret. Canalele (Google, Meta…) îl descarcă periodic. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response("Not found", { status: 404 });
  const [o] = await db.select().from(schema.feedOutputs).where(eq(schema.feedOutputs.token, token)).limit(1);
  if (!o || !o.active) return new Response("Not found", { status: 404 });
  const { project, items } = await buildFeed(o.projectId, o.channel);
  const { type, body } = renderFeed(o.channel, project, items);
  return new Response(body, { headers: { "content-type": type, "cache-control": "public, max-age=900", "x-robots-tag": "noindex" } });
}

import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db, schema } from "@/db";

/** Redirecționare spre produs, cu UTM (magazinul vede de unde vine clientul) și înregistrarea click-ului. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.redirect(new URL("/", req.url));
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id)).limit(1);
  if (!p) return NextResponse.redirect(new URL("/", req.url));
  const s = req.nextUrl.searchParams.get("s");
  const [click] = await db.insert(schema.clicks).values({ productId: p.id, projectId: p.projectId, searchId: s && /^[0-9a-f-]{36}$/.test(s) ? s : null }).returning();
  // ?cos=1: duce direct în coșul magazinului cu produsul adăugat, dacă platforma permite.
  const url = new URL(req.nextUrl.searchParams.get("cos") === "1" && p.cartUrl ? p.cartUrl : p.url);
  url.searchParams.set("utm_source", "echo");
  url.searchParams.set("utm_medium", "ai_search");
  url.searchParams.set("utm_campaign", "comparator");
  // Id-ul click-ului: codul Echo de pe site îl leagă de comandă, ca să calculăm comisionul fără rețea de afiliere.
  url.searchParams.set("echo_click", click.id);
  const aff = process.env.AFFILIATE_PARAM;
  if (aff) { const [k, v] = aff.split("="); if (k && v) url.searchParams.set(k, v); }
  return NextResponse.redirect(url.toString(), 302);
}

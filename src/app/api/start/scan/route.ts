import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { scanStatus, trialProject } from "@/core/onboarding";

export const dynamic = "force-dynamic";

/** Ce a găsit scanarea testului gratuit; pagina „Scanare” o citește la 1,5 secunde până e gata. */
export async function GET() {
  const { org } = await requireAuth();
  const p = await trialProject(org.id);
  if (!p) return NextResponse.json({ error: "Nu există un test pornit." }, { status: 404 });
  return NextResponse.json(await scanStatus(org.id, p.id), { headers: { "cache-control": "no-store" } });
}

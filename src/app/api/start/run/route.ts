import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { runStatus, trialProject } from "@/core/onboarding";

export const dynamic = "force-dynamic";

/** Progresul primei rulări gratuite: câte răspunsuri au venit, clasamentul live și ultimele fragmente. */
export async function GET() {
  const { org } = await requireAuth();
  const p = await trialProject(org.id);
  if (!p) return NextResponse.json({ error: "Nu există un test pornit." }, { status: 404 });
  return NextResponse.json(await runStatus(org.id, p.id), { headers: { "cache-control": "no-store" } });
}

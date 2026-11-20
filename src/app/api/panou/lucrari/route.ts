import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ownProject } from "@/lib/guard";
import { projectBusy } from "@/core/jobs";

export const dynamic = "force-dynamic";
const Q = z.object({ projectId: z.string().uuid() });

/** Starea lucrărilor în fundal ale unui magazin: panoul o întreabă ca să se actualizeze singur la final. */
export async function GET(req: NextRequest) {
  const q = Q.safeParse({ projectId: req.nextUrl.searchParams.get("projectId") });
  if (!q.success) return NextResponse.json({ error: "projectId invalid" }, { status: 400 });
  try {
    await ownProject(q.data.projectId, { write: false });
  } catch {
    return NextResponse.json({ error: "fără acces" }, { status: 403 });
  }
  return NextResponse.json({ busy: await projectBusy(q.data.projectId) }, { headers: { "cache-control": "no-store" } });
}

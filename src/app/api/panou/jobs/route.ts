import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { jobStates } from "@/core/jobs";

export const dynamic = "force-dynamic";

/** Starea lucrărilor magazinului curent; o citește JobWatcher la câteva secunde cât timp ceva e în lucru. */
export async function GET(req: NextRequest) {
  const { project } = await currentProject();
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 20);
  const conns = await db.select({ id: schema.connections.id }).from(schema.connections).where(eq(schema.connections.projectId, project.id));
  const jobs = await jobStates(project.id, conns.map((c) => c.id), ids);
  return NextResponse.json({ jobs }, { headers: { "cache-control": "no-store" } });
}

import { currentProject } from "@/lib/project";
import { approvedFixesForExport } from "@/core/fixes";

/** Reparațiile aprobate ca CSV, ca magazinul să le poată pune și în catalogul lui (de mână sau prin import). */
export async function GET() {
  const { project } = await currentProject();
  const rows = await approvedFixesForExport(project.id);
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = ["cod_produs,url,camp,acum,propus,incredere", ...rows.map((r) => [r.externalId, r.url, r.field, r.previous, r.value, r.confidence].map(q).join(","))].join("\n");
  return new Response(`﻿${body}\n`, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="reparatii-${project.domain}.csv"`, "cache-control": "no-store" },
  });
}

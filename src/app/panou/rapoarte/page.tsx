import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { Card, Empty, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { makeReport } from "@/app/actions";
import { dateShort } from "@/lib/format";
import { busyKinds } from "@/core/jobs";

export default async function Reports() {
  const { project, user } = await currentProject();
  const list = await db.select({ id: schema.reports.id, subject: schema.reports.subject, sentTo: schema.reports.sentTo, createdAt: schema.reports.createdAt })
    .from(schema.reports).where(eq(schema.reports.projectId, project.id)).orderBy(desc(schema.reports.createdAt)).limit(52);
  const generating = (await busyKinds(project.id)).has("report");
  return (
    <div className="space-y-6">
      <PageHeader title="Rapoarte" subtitle="Raportul săptămânal vine pe email luni dimineață. Îl poți genera și acum." />
      <Card>
        <form action={makeReport} className="flex flex-wrap items-center gap-4">
          <input type="hidden" name="projectId" value={project.id} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="send" defaultChecked /> Trimite și pe email la {user.email}</label>
          {generating ? <span className="text-sm text-muted">Raportul se generează…</span> : <SubmitButton pendingText="Generez…">Generează raportul acum</SubmitButton>}
        </form>
        <p className="mt-2 text-xs text-muted">Se generează în fundal; reîncarcă pagina după câteva secunde.</p>
      </Card>
      {list.length === 0 ? <Empty title="Niciun raport încă" /> : (
        <Card title="Rapoarte anterioare">
          <ul className="divide-y divide-border">
            {list.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <Link href={`/panou/rapoarte/${r.id}`} className="font-medium hover:underline">{r.subject}</Link>
                <span className="text-xs text-muted">{dateShort(r.createdAt)}{r.sentTo ? ` · trimis la ${r.sentTo}` : ""}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

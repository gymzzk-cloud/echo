import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { Card, Checkbox, Empty, PageHeader, Working } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { makeReport } from "@/app/actions";
import { dateShort } from "@/lib/format";
import { busyKinds } from "@/core/jobs";
import { CardHelp } from "@/components/card-help";

export default async function Reports() {
  const { project, user } = await currentProject();
  const list = await db.select({ id: schema.reports.id, subject: schema.reports.subject, sentTo: schema.reports.sentTo, createdAt: schema.reports.createdAt })
    .from(schema.reports).where(eq(schema.reports.projectId, project.id)).orderBy(desc(schema.reports.createdAt)).limit(52);
  const generating = (await busyKinds(project.id)).has("report");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Cont" title="Rapoarte" subtitle="Raportul săptămânal vine pe email luni dimineață. Îl poți genera și acum." />
      <Card>
        {generating ? <Working hint="Se generează în fundal; pagina se actualizează singură când e gata.">Raportul se generează</Working> : (
          <>
            <form action={makeReport} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <input type="hidden" name="projectId" value={project.id} />
              <SubmitButton pendingText="Generez…">Generează raportul acum</SubmitButton>
              <Checkbox name="send" defaultChecked label={<>Trimite și pe email la <span className="break-all">{user.email}</span></>} />
            </form>
            <p className="mt-2 text-xs text-muted">Se generează în fundal; pagina se actualizează singură când e gata.</p>
          </>
        )}
      </Card>
      {list.length === 0 ? <Empty title="Niciun raport încă" /> : (
        <Card title="Rapoarte anterioare" description={<CardHelp id="reports.history" />}>
          <ul className="divide-y divide-border">
            {list.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <Link prefetch={false} href={`/panou/rapoarte/${r.id}`} className="font-medium hover:underline">{r.subject}</Link>
                <span className="text-xs text-muted">{dateShort(r.createdAt)}{r.sentTo ? ` · trimis la ${r.sentTo}` : ""}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

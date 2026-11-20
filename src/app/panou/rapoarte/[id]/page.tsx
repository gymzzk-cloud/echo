import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { PageHeader, TextLink } from "@/components/ui";

export default async function ReportView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await currentProject();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [r] = await db.select().from(schema.reports).where(and(eq(schema.reports.id, id), eq(schema.reports.projectId, project.id)));
  if (!r) notFound();
  return (
    <div>
      <PageHeader eyebrow="Rapoarte" title={r.subject} action={<TextLink href="/panou/rapoarte">Înapoi la rapoarte</TextLink>} />
      {/* Raportul e HTML generat de noi și escapat; îl afișăm izolat, fără scripturi */}
      <iframe title="Raport" srcDoc={r.html} sandbox="" className="h-[900px] w-full rounded-xl border border-border bg-bg" />
    </div>
  );
}

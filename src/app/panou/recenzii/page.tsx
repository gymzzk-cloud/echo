import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Field, Input, Notice, PageHeader, Stat, Table, Td } from "@/components/ui";
import { createReviewLink } from "@/app/actions-trust";
import { reviewStats, trustForDomain, trustPublic } from "@/core/trust";
import { dateShort } from "@/lib/format";

export default async function Reviews() {
  const { project } = await currentProject();
  const stats = await reviewStats(project.id);
  const trust = await trustForDomain(project.domain);
  const list = await db.select().from(schema.reviews).where(and(eq(schema.reviews.projectId, project.id), isNotNull(schema.reviews.submittedAt))).orderBy(desc(schema.reviews.submittedAt)).limit(50);
  const orders = await db.select().from(schema.events).where(and(eq(schema.events.projectId, project.id), eq(schema.events.kind, "order"))).orderBy(desc(schema.events.createdAt)).limit(10);
  const pid = <input type="hidden" name="projectId" value={project.id} />;
  return (
    <>
      <PageHeader eyebrow="Vânzări" title="Recenzii verificate și scorul de încredere" subtitle="Recenziile vin doar de la comenzi reale, măsurate de codul Echo. Nu se pot cumpăra, șterge sau filtra: de aceea AI-urile și cumpărătorii au motiv să le creadă." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Recenzii publicate" value={stats.n} />
        <Stat label="Nota medie" value={stats.avg ? stats.avg.toFixed(1) : "–"} />
        <Stat label="Scor de încredere" value={`${trust.score}/100`} hint={trustPublic() ? "public pe profilul tău" : "privat, vizibil doar ție"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Cum se calculează scorul">
          <ul className="space-y-2 text-sm">
            {trust.parts.map((p) => (
              <li key={p.label} className="flex items-start justify-between gap-3">
                <span>{p.label}{p.detail && <span className="block text-xs text-muted">{p.detail}</span>}</span>
                <span className={`num whitespace-nowrap font-medium ${p.points === p.max ? "text-good" : p.points === 0 ? "text-muted" : ""}`}>{p.points}/{p.max}</span>
              </li>
            ))}
          </ul>
          {!trustPublic() && <div className="mt-4"><Notice tone="muted">Scorul devine public doar după validarea juridică. Până atunci profilul arată doar faptele verificabile.</Notice></div>}
        </Card>
        <Card title="Cere o recenzie">
          <ActionForm action={createReviewLink} className="flex items-end gap-2">{pid}<Field label="Numărul comenzii"><Input name="orderId" required /></Field><SubmitButton className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg">Creează link</SubmitButton></ActionForm>
          <p className="mt-3 text-xs text-muted">Linkul se poate crea și automat din API (<code>POST /api/v1/reviews</code>), ca să îl pui în emailul de livrare.</p>
          {orders.length > 0 && <div className="mt-4 text-xs text-muted">Ultimele comenzi urmărite: {orders.map((o) => o.orderId).filter(Boolean).join(", ")}</div>}
        </Card>
        <Card title="Recenzii primite" className="lg:col-span-2">
          {list.length === 0 ? <p className="text-sm text-muted">Nicio recenzie încă.</p> : (
            <Table head={["Data", "Nota", "Recenzie", "Comanda"]}>
              {list.map((r) => <tr key={r.id}><Td className="whitespace-nowrap text-xs">{dateShort(r.submittedAt!)}</Td><Td><Badge tone={(r.rating ?? 0) >= 4 ? "good" : (r.rating ?? 0) <= 2 ? "bad" : "warn"}>{"★".repeat(r.rating ?? 0)}</Badge></Td><Td>{r.text}<div className="text-xs text-muted">{r.authorName}</div></Td><Td className="text-xs">{r.orderId}</Td></tr>)}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

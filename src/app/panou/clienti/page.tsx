import { and, eq, gte, inArray, sql as dsql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { Badge, Card, Delta, PageHeader, Table, Td } from "@/components/ui";
import { selectProject } from "@/app/actions";
import { daysAgo } from "@/lib/util";
import { money } from "@/lib/format";

/** Vederea de agenție: toate magazinele clienților pe o singură pagină. */
export default async function Clients() {
  const { org, projects } = await currentProject();
  if (org.kind !== "agency") redirect("/panou");
  const ids = projects.map((p) => p.id);
  const stats = await db.select().from(schema.dailyStats).where(and(inArray(schema.dailyStats.projectId, ids), eq(schema.dailyStats.provider, "all"), gte(schema.dailyStats.day, daysAgo(8))));
  const actions = await db.select({ projectId: schema.actions.projectId, n: dsql<number>`count(*)::int` }).from(schema.actions).where(and(inArray(schema.actions.projectId, ids), inArray(schema.actions.status, ["noua", "in_lucru"]))).groupBy(schema.actions.projectId);
  const sales = await db.select({ projectId: schema.events.projectId, v: dsql<number>`coalesce(sum(value),0)::float` }).from(schema.events).where(and(inArray(schema.events.projectId, ids), eq(schema.events.kind, "order"), gte(schema.events.createdAt, new Date(Date.now() - 30 * 864e5)))).groupBy(schema.events.projectId);
  const rows = projects.map((p) => {
    const s = stats.filter((x) => x.projectId === p.id).sort((a, b) => a.day.localeCompare(b.day));
    const last = s.at(-1)?.score ?? null, first = s[0]?.score ?? null;
    return { p, score: last, delta: last != null && first != null ? last - first : null, open: actions.find((a) => a.projectId === p.id)?.n ?? 0, sales: sales.find((x) => x.projectId === p.id)?.v ?? 0 };
  }).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0));
  return (
    <>
      <PageHeader eyebrow="Agenție" title="Toți clienții" subtitle="Ordonați după evoluția pe 7 zile: cei care scad sunt primii." />
      <Card>
        <Table head={["Magazin", "Scor", "7 zile", "Acțiuni deschise", "Vânzări din AI (30 zile)", ""]}>
          {rows.map((r) => (
            <tr key={r.p.id}>
              <Td><div className="font-medium">{r.p.name}</div><div className="text-xs text-muted">{r.p.domain}{r.p.pathPrefix}</div></Td>
              <Td className="num font-display text-lg font-semibold">{r.score ?? "–"}</Td>
              <Td><Delta value={r.delta} /></Td>
              <Td>{r.open ? <Badge tone="warn">{r.open}</Badge> : <span className="text-muted">0</span>}</Td>
              <Td className="num">{money(r.sales, r.p.currency)}</Td>
              <Td><form action={selectProject}><input type="hidden" name="projectId" value={r.p.id} /><button className="text-sm text-primary hover:underline">Deschide</button></form></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

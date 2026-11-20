import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { Badge, ButtonLink, Card, Empty, PageHeader, impactTone } from "@/components/ui";
import { setActionStatus } from "@/app/actions";
import { overview } from "@/core/insights";
import { dateShort } from "@/lib/format";

const TABS = [["noua", "De făcut"], ["in_lucru", "În lucru"], ["rezolvata", "Rezolvate"], ["ignorata", "Ignorate"]] as const;

export default async function Actions({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const sp = await searchParams;
  const status = TABS.some(([k]) => k === sp.s) ? sp.s! : "noua";
  const { project } = await currentProject();
  const all = await db.select().from(schema.actions).where(eq(schema.actions.projectId, project.id)).orderBy(desc(schema.actions.createdAt));
  const rank: Record<string, number> = { mare: 0, mediu: 1, mic: 2 };
  const list = all.filter((a) => a.status === status).sort((a, b) => rank[a.impact] - rank[b.impact] || rank[a.effort] - rank[b.effort]);
  const o = status === "rezolvata" ? await overview(project) : null;
  const nowVis = o?.latest?.visibility ?? null;

  const btn = (id: string, s: string, label: string) => (
    <form action={setActionStatus}><input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={s} /><button className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface">{label}</button></form>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Acțiuni" subtitle="Ce să faci ca AI-urile să te recomande mai des, în ordinea impactului. Măsurăm efectul după ce marchezi o acțiune rezolvată." />
      <div className="flex flex-wrap gap-2 text-sm">
        {TABS.map(([k, l]) => <a key={k} href={`?s=${k}`} className={`rounded-lg border px-3 py-1.5 ${k === status ? "border-primary text-primary" : "border-border"}`}>{l} <span className="num text-muted">{all.filter((a) => a.status === k).length}</span></a>)}
      </div>
      {list.length === 0 ? <Empty title={status === "noua" ? "Nimic de făcut acum. Bravo!" : "Nicio acțiune aici"} /> : (
        <div className="space-y-3">
          {list.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{a.title}</div>
                  <p className="mt-1 text-sm text-muted">{a.why}</p>
                  {a.howTo && <details className="mt-2 text-sm"><summary className="cursor-pointer text-primary">Cum fac</summary><p className="mt-2 whitespace-pre-line">{a.howTo}</p></details>}
                  {status === "rezolvata" && a.baselineVisibility !== null && nowVis !== null && (
                    <p className="mt-2 text-xs">Efect: vizibilitatea era {a.baselineVisibility}%, acum {nowVis}% <Badge tone={nowVis > a.baselineVisibility ? "good" : nowVis < a.baselineVisibility ? "bad" : "muted"}>{nowVis - a.baselineVisibility > 0 ? "+" : ""}{nowVis - a.baselineVisibility} pp</Badge>{a.resolvedAt && <span className="text-muted"> · rezolvată pe {dateShort(a.resolvedAt)}</span>}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-1"><Badge tone={impactTone(a.impact)}>Impact {a.impact}</Badge><Badge>Efort {a.effort}</Badge></div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {a.fixKind && a.fixKind !== "source" && a.fixKind !== "price" && <ButtonLink href="/panou/audit#rezolva" size="sm">Rezolvă</ButtonLink>}
                    {status !== "in_lucru" && status !== "rezolvata" && btn(a.id, "in_lucru", "Încep")}
                    {status !== "rezolvata" && btn(a.id, "rezolvata", "Am rezolvat")}
                    {status === "noua" && btn(a.id, "ignorata", "Ignoră")}
                    {(status === "rezolvata" || status === "ignorata") && btn(a.id, "noua", "Redeschide")}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { currentProject } from "@/lib/project";
import { loadBase, leaderboard, perPrompt, trend } from "@/core/insights";
import { PROVIDERS, providerLabel } from "@/core/ai/types";
import { Badge, Card, Empty, PageHeader, Table, Td } from "@/components/ui";
import { TrendChart } from "@/components/client";
import { daysAgo } from "@/lib/util";

const COLORS = ["var(--primary)", "#94a3b8", "#64748b", "#cbd5e1", "#475569"];

export default async function Visibility({ searchParams }: { searchParams: Promise<{ zile?: string; ai?: string }> }) {
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.zile)) ? Number(sp.zile) : 30;
  const { project } = await currentProject();
  const base = await loadBase(project, days);
  const rows = sp.ai ? base.rows.filter((r) => r.run.provider === sp.ai) : base.rows;
  if (!base.rows.length) return <><PageHeader title="Vizibilitate" /><Empty title="Încă nu avem răspunsuri de la AI-uri">Prima rulare pornește automat după înregistrare. Revino în câteva minute.</Empty></>;

  const board = leaderboard(rows, project.domain, base.competitors);
  const top = board.filter((b) => b.name !== "Tu").slice(0, 4);
  const chart = trend(rows, project.domain, top.map((c) => c.domain));
  const prompts = perPrompt(rows.filter((r) => r.run.runDate >= daysAgo(days)), project.domain);
  const link = (q: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ zile: String(days), ai: sp.ai, ...q }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="space-y-6">
      <PageHeader title="Vizibilitate" subtitle="Cât de des te recomandă AI-urile, comparat cu concurenții."
        action={
          <div className="flex flex-wrap gap-2 text-xs">
            {[7, 30, 90].map((d) => <a key={d} href={link({ zile: String(d) })} className={`rounded-lg border px-3 py-1.5 ${d === days ? "border-primary text-primary" : "border-border"}`}>{d} zile</a>)}
            <span className="mx-1 w-px bg-border" />
            <a href={link({ ai: "" })} className={`rounded-lg border px-3 py-1.5 ${!sp.ai ? "border-primary text-primary" : "border-border"}`}>Toate AI-urile</a>
            {PROVIDERS.map((p) => <a key={p.id} href={link({ ai: p.id })} className={`rounded-lg border px-3 py-1.5 ${sp.ai === p.id ? "border-primary text-primary" : "border-border"}`}>{p.label}</a>)}
          </div>
        } />

      <Card title="Evoluția vizibilității">
        {chart.length > 1 ? <TrendChart data={chart} series={[{ key: "tu", label: "Tu", color: COLORS[0] }, ...top.map((c, i) => ({ key: c.domain, label: c.name, color: COLORS[i + 1] }))]} /> : <p className="text-sm text-muted">Graficul apare după a doua zi de măsurători.</p>}
      </Card>

      <Card title="Clasament: tu și concurenții">
        <Table head={["#", "Magazin", "Vizibilitate", "Mențiuni", "Poziția medie"]}>
          {board.map((b, i) => (
            <tr key={b.domain} className={b.name === "Tu" ? "bg-primary-bg/40 font-medium" : ""}>
              <Td className="num text-muted">{i + 1}</Td>
              <Td>{b.name === "Tu" ? `${project.name} (tu)` : b.name}<span className="block text-xs text-muted">{b.domain}</span></Td>
              <Td><div className="flex items-center gap-2"><div className="h-2 w-24 rounded-full bg-surface"><div className="h-2 rounded-full bg-primary" style={{ width: `${b.visibility}%` }} /></div><span className="num">{b.visibility}%</span></div></Td>
              <Td className="num">{b.mentions}</Td>
              <Td className="num">{b.avgPosition ?? "–"}</Td>
            </tr>
          ))}
        </Table>
        {base.competitors.length === 0 && <p className="mt-3 text-xs text-muted">Adaugă concurenți în <a className="underline" href="/panou/setari">Setări</a> ca să-i vezi aici.</p>}
      </Card>

      <Card title={`Pe fiecare întrebare (${prompts.length})`}>
        <p className="mb-4 text-xs text-muted">Ultimul răspuns de la fiecare AI. Numărul e poziția ta în răspuns; „–” înseamnă că lipsești. Deschide rândul ca să vezi cine apare în locul tău.</p>
        <div className="divide-y divide-border">
          {prompts.map((p) => {
            const hits = PROVIDERS.filter((x) => p.byProvider[x.id]?.me).length;
            return (
              <details key={p.id} className="group py-3">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 text-sm font-medium">{p.prompt}{p.category && <span className="ml-2 text-xs font-normal text-muted">{p.category}</span>}</span>
                  <span className="flex gap-1">
                    {PROVIDERS.map((x) => { const b = p.byProvider[x.id]; return <Badge key={x.id} tone={!b ? "muted" : b.me ? "good" : "bad"}>{x.label.slice(0, 3)} {b?.me ? `#${b.me}` : "–"}</Badge>; })}
                  </span>
                  <span className="w-16 text-right text-xs text-muted">{hits}/{PROVIDERS.length}</span>
                </summary>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {PROVIDERS.map((x) => {
                    const b = p.byProvider[x.id];
                    if (!b) return null;
                    return (
                      <div key={x.id} className="rounded-lg border border-border p-3 text-xs">
                        <div className="mb-1 flex justify-between font-medium"><span>{providerLabel(x.id)}</span><span className="text-muted">Primele: {b.top.join(", ") || "–"}</span></div>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-sans leading-relaxed text-muted">{b.answer.replace(/\*\*/g, "")}</pre>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

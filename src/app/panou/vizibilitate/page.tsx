import { currentProject } from "@/lib/project";
import { brandMentions, catalogBrands, loadBase, leaderboard, perPrompt, trend } from "@/core/insights";
import { PROVIDERS, providerLabel } from "@/core/ai/types";
import { Badge, Card, Chips, Empty, PageHeader, SubCard, Table, TextLink, Td } from "@/components/ui";
import { TrendChart } from "@/components/client";
import { daysAgo } from "@/lib/util";
import { rankRivals } from "@/core/rivals";
import { RivalsCard } from "@/components/rivals-card";

// Tu: culoarea de marcă; concurenții: nuanțe de gri (DESIGN §9).
const COLORS = ["var(--primary)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export default async function Visibility({ searchParams }: { searchParams: Promise<{ zile?: string; ai?: string }> }) {
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.zile)) ? Number(sp.zile) : 30;
  const { project } = await currentProject();
  const [base, brands] = await Promise.all([loadBase(project, days), catalogBrands(project.id)]);
  const rows = sp.ai ? base.rows.filter((r) => r.run.provider === sp.ai) : base.rows;
  if (!base.rows.length && !base.failed.length) return <><PageHeader eyebrow="Vizibilitate" title="Vizibilitate AI" /><Empty title="Încă nu avem răspunsuri de la AI-uri">Prima rulare pornește automat după înregistrare. Revino în câteva minute.</Empty></>;

  const board = leaderboard(rows, project.domain, base.competitors);
  const top = board.filter((b) => b.name !== "Tu").slice(0, 4);
  const chart = trend(rows, project.domain, top.map((c) => c.domain));
  const rivals = rankRivals(rows, project.domain);
  const topBrands = brandMentions(rows, brands);
  const failed = sp.ai ? base.failed.filter((r) => r.run.provider === sp.ai) : base.failed;
  const prompts = perPrompt(rows.filter((r) => r.run.runDate >= daysAgo(days)), project.domain, failed);
  const link = (q: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ zile: String(days), ai: sp.ai, ...q }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="space-y-6">
      <div>
        <PageHeader eyebrow="Vizibilitate" title="Vizibilitate AI" subtitle="Cât de des te recomandă AI-urile, comparat cu concurenții." />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
          <Chips items={[7, 30, 90].map((d) => ({ href: link({ zile: String(d) }), label: `${d} zile`, active: d === days }))} />
          <span aria-hidden className="hidden h-6 w-px bg-border lg:block" />
          <Chips items={[{ href: link({ ai: "" }), label: "Toate AI-urile", active: !sp.ai }, ...PROVIDERS.map((p) => ({ href: link({ ai: p.id }), label: p.label, active: sp.ai === p.id }))]} />
        </div>
      </div>

      <RivalsCard report={rivals} projectId={project.id} projectName={project.name} competitors={base.competitors} />

      {topBrands.length > 0 && (
        <Card title="Mărcile din catalogul tău, în răspunsurile AI">
          <p className="mb-4 text-xs text-muted">Ce mărci de produs numesc AI-urile la întrebările tale: în câte răspunsuri apar și pe ce loc, în medie, între mărci. Nu sunt concurenți, sunt mărcile pe care le vinzi.</p>
          <Table head={["#", "Marcă", "Vizibilitate", "Poziția medie"]}>
            {topBrands.map((b, i) => (
              <tr key={b.brand}>
                <Td className="num text-muted">{i + 1}</Td>
                <Td>{b.brand}</Td>
                <Td><div className="flex items-center gap-2"><div className="h-2 w-24 rounded-full bg-surface"><div className="h-2 rounded-full bg-muted" style={{ width: `${b.visibility}%` }} /></div><span className="num">{b.visibility}%</span></div></Td>
                <Td className="num">#{b.avgPosition}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card title="Evoluția vizibilității">
        {chart.length > 1 ? <TrendChart data={chart} series={[{ key: "tu", label: "Tu", color: COLORS[0] }, ...top.map((c, i) => ({ key: c.domain, label: c.name, color: COLORS[i + 1] }))]} /> : <p className="text-sm text-muted">Graficul apare după a doua zi de măsurători.</p>}
      </Card>

      <Card title="Clasament: tu și concurenții" description={`Pe ultimele ${days} zile, din ${rows.length} răspunsuri. Pe Acasă vezi doar ultima măsurătoare, deci procentele pot fi diferite.`}>
        <Table head={["#", "Magazin", "Vizibilitate", "Mențiuni", "Poziția medie"]}>
          {board.map((b, i) => (
            <tr key={b.domain} className={b.name === "Tu" ? "bg-primary-bg/40 font-medium" : ""}>
              <Td className="num text-muted">{i + 1}</Td>
              <Td>{b.name === "Tu" ? `${project.name} (tu)` : b.name}<span className="block text-xs text-muted">{b.domain}</span></Td>
              <Td><div className="flex items-center gap-2"><div className="h-2 w-24 shrink-0 rounded-full bg-surface"><div className="h-2 rounded-full bg-primary" style={{ width: `${b.visibility}%` }} /></div><span className="num">{b.visibility}%</span></div></Td>
              <Td className="num text-right">{b.mentions}</Td>
              <Td className="num text-right">{b.avgPosition ?? "–"}</Td>
            </tr>
          ))}
        </Table>
        {base.competitors.length === 0 && <p className="mt-4 text-xs text-muted">Adaugă concurenți în <TextLink href="/panou/setari" className="text-xs">Setări</TextLink> ca să-i vezi aici.</p>}
      </Card>

      <Card title={`Pe fiecare întrebare (${prompts.length})`} description="Ultimul răspuns de la fiecare AI. Numărul e poziția ta în răspuns; „–” înseamnă că lipsești; „!” înseamnă că AI-ul nu a putut fi întrebat (motivul e în rând) și nu se socotește. Deschide rândul ca să vezi cine apare în locul tău.">
        <div className="divide-y divide-border">
          {prompts.map((p) => {
            const hits = PROVIDERS.filter((x) => p.byProvider[x.id]?.me).length;
            const asked = PROVIDERS.filter((x) => p.byProvider[x.id] && !p.byProvider[x.id].failure).length;
            return (
              <details key={p.id} className="group py-3">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 text-sm font-medium">{p.prompt}{p.category && <span className="ml-2 text-xs font-normal text-muted">{p.category}</span>}</span>
                  <span className="flex flex-wrap gap-1">
                    {PROVIDERS.map((x) => {
                      const b = p.byProvider[x.id];
                      if (b?.failure) return <Badge key={x.id} tone="warn"><span title={`Nu am putut întreba: ${b.failure}`}>{x.short} !</span></Badge>;
                      return <Badge key={x.id} tone={!b ? "muted" : b.me ? "good" : "bad"}>{x.short} {b?.me ? `#${b.me}` : "–"}</Badge>;
                    })}
                  </span>
                  <span className="w-16 text-right text-xs text-muted">{asked ? `${hits}/${asked}` : "–"}</span>
                </summary>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {PROVIDERS.map((x) => {
                    const b = p.byProvider[x.id];
                    if (!b) return null;
                    return (
                      <SubCard key={x.id} className="p-3 text-xs">
                        <div className="mb-1 flex flex-wrap justify-between gap-2 font-medium"><span>{providerLabel(x.id)}</span>{!b.failure && <span className="text-muted">Primele: {b.top.join(", ") || "–"}</span>}</div>
                        {b.failure
                          ? <p className="text-warn">Nu am putut întreba {providerLabel(x.id)}: {b.failure}. Nu știm dacă te-ar fi recomandat, așa că nu intră în scor.</p>
                          : <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-sans leading-relaxed text-muted">{b.answer.replace(/\*\*/g, "")}</pre>}
                      </SubCard>
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

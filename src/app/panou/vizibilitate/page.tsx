import { Suspense } from "react";
import { currentProject } from "@/lib/project";
import { brandMentions, catalogBrands, loadBase, leaderboard, perPrompt, trend } from "@/core/insights";
import { PROVIDERS, providerLabel } from "@/core/ai/types";
import { activeProviders } from "@/core/ai/engine";
import { perEngine } from "@/core/engine-view";
import { engineProducts, engineRuns, progressData } from "@/core/engine-view-read";
import { Card, Chips, Empty, PageHeader, Table, TextLink, Td } from "@/components/ui";
import { TrendChart } from "@/components/client";
import { daysAgo } from "@/lib/util";
import { rankRivals } from "@/core/rivals";
import { RivalsCard } from "@/components/rivals-card";
import { SentimentCard } from "@/components/sentiment-card";
import { sampleQuotes, sentimentBoard } from "@/core/ai/sentiment";
import { EngineCards, type EvidenceLinks } from "@/components/visibility/engine-cards";
import { ProgressCards } from "@/components/visibility/progress-cards";
import { AnswersList } from "@/components/visibility/answers-list";

// Tu: culoarea de marcă; concurenții: nuanțe de gri (DESIGN §9).
const COLORS = ["var(--primary)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

type Project = Awaited<ReturnType<typeof currentProject>>["project"];
type Tab = "" | "concurenti" | "ton" | "raspunsuri";
type Sp = { zile?: string; ai?: string; v?: string; doar?: string };
type Ctx = { project: Project; days: number; ai?: string; only?: "lipsesti" | "apari"; link: (q: Record<string, string | undefined>) => string };

const TABS: { id: Tab; label: string }[] = [
  { id: "", label: "Pe fiecare AI" },
  { id: "concurenti", label: "Concurenți" },
  { id: "ton", label: "Ton" },
  { id: "raspunsuri", label: "Răspunsuri (dovezi)" },
];

/**
 * Vizibilitate AI: întâi „Pe fiecare AI” (cum te prezintă fiecare AI, unul lângă altul, cu dovada fiecărei cifre),
 * apoi file separate pentru concurenți, ton și răspunsurile întregi. Fiecare filă citește doar ce afișează.
 */
export default async function Visibility({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.zile)) ? Number(sp.zile) : 30;
  const tab = (TABS.some((t) => t.id === sp.v) ? sp.v : "") as Tab;
  const ai = PROVIDERS.some((p) => p.id === sp.ai) ? sp.ai : undefined;
  const only = sp.doar === "lipsesti" || sp.doar === "apari" ? sp.doar : undefined;
  const { project } = await currentProject();
  const link = (q: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ v: tab, zile: days === 30 ? undefined : String(days), ai, doar: only, ...q }).filter(([, v]) => v) as [string, string][]).toString();
  const ctx: Ctx = { project, days, ai, only, link };

  return (
    <div className="space-y-6">
      <div>
        <PageHeader eyebrow="Vizibilitate" title="Cum te văd AI-urile" subtitle="Ce spune fiecare AI despre magazinul și produsele tale, comparat cu concurenții, și unde vezi dovada." />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <Chips items={TABS.map((t) => ({ href: link({ v: t.id, ai: t.id ? ai : undefined, doar: t.id === "raspunsuri" ? only : undefined }), label: t.label, active: t.id === tab }))} />
          <Chips items={[7, 30, 90].map((d) => ({ href: link({ zile: String(d) }), label: `${d} zile`, active: d === days }))} />
        </div>
      </div>
      <Suspense key={`${tab}|${days}|${ai}|${only}`} fallback={<Card><p className="text-sm text-muted">Calculăm…</p></Card>}>
        {tab === "" ? <EnginesTab {...ctx} /> : <DetailTab tab={tab} {...ctx} />}
      </Suspense>
    </div>
  );
}

/** Fila implicită: câte un card pe AI și „ce s-a schimbat / ce repari acum”. Fără textul răspunsurilor. */
async function EnginesTab({ project, days, link }: Ctx) {
  const [runs, products, progress] = await Promise.all([engineRuns(project.id, daysAgo(days)), engineProducts(project.id), progressData(project.id)]);
  const list = perEngine(runs.rows, runs.failed, project.domain, products);
  const off = activeProviders().filter((p) => !p.live && !list.some((e) => e.provider === p.id)).map((p) => providerLabel(p.id));
  if (!list.length) return <Empty title="Încă nu avem răspunsuri de la AI-uri">Prima rulare pornește automat după înregistrare. Pagina se actualizează singură când e gata.</Empty>;
  const links: EvidenceLinks = {
    answers: (x, o) => link({ v: "raspunsuri", ai: x, doar: o }),
    products: (x, f) => `/panou/produse-ai?ai=${x}${f ? `&f=${f}` : ""}`,
    tone: (x) => link({ v: "ton", ai: x }),
    rivals: (x) => link({ v: "concurenti", ai: x }),
  };
  return (
    <div className="space-y-6">
      <EngineCards list={list} links={links} off={off} />
      <ProgressCards data={progress} links={{ wrongPrice: "/panou/produse-ai?f=pret", withoutStore: "/panou/produse-ai?f=fara-magazin" }} />
      <p className="text-xs text-muted">
        Cifrele vin din răspunsurile deja primite în ultimele {days} zile, fără întrebări în plus. Produsele și prețurile sunt din ultimele 30 de zile și se recunosc doar după cod, link sau numele complet din catalog.
      </p>
    </div>
  );
}

/** Filele de detaliu: aceleași răspunsuri, filtrate pe un AI dacă e ales. */
async function DetailTab({ tab, project, days, ai, only, link }: Ctx & { tab: Tab }) {
  const base = await loadBase(project, days);
  const rows = ai ? base.rows.filter((r) => r.run.provider === ai) : base.rows;
  const failed = ai ? base.failed.filter((r) => r.run.provider === ai) : base.failed;
  if (!base.rows.length && !base.failed.length) return <Empty title="Încă nu avem răspunsuri de la AI-uri">Prima rulare pornește automat după înregistrare. Pagina se actualizează singură când e gata.</Empty>;
  // Doar AI-urile pornite sau care au răspuns în perioadă: un AI fără cheie nu umple rândurile cu „–”.
  const live = new Set(activeProviders().filter((p) => p.live).map((p) => p.id));
  const seen = new Set([...base.rows, ...base.failed].map((r) => r.run.provider));
  const avail = PROVIDERS.filter((p) => live.has(p.id) || seen.has(p.id) || ai === p.id);
  const aiChips = <Chips items={[{ href: link({ ai: "" }), label: "Toate AI-urile", active: !ai }, ...avail.map((p) => ({ href: link({ ai: p.id }), label: p.label, active: ai === p.id }))]} />;
  const scope = ai ? `la ${providerLabel(ai)}` : "la toate AI-urile";

  if (tab === "raspunsuri") {
    const shown = ai ? avail.filter((p) => p.id === ai) : avail;
    let prompts = perPrompt(rows.filter((r) => r.run.runDate >= daysAgo(days)), project.domain, failed);
    if (only) prompts = prompts.filter((p) => shown.some((x) => { const b = p.byProvider[x.id]; return b && !b.failure && (only === "apari" ? !!b.me : !b.me); }));
    return (
      <div className="space-y-6">
        {aiChips}
        <Card title={`Întrebările urmărite și răspunsurile ${scope} (${prompts.length})`} description="Ultimul răspuns de la fiecare AI, întreg. Numărul din insignă e locul tău în răspuns; „–” înseamnă că lipsești; „!” înseamnă că AI-ul nu a putut fi întrebat și nu se socotește.">
          <Chips className="mb-4" items={[["", "Toate"], ["apari", "Unde apari"], ["lipsesti", "Unde lipsești"]].map(([id, label]) => ({ href: link({ doar: id }), label, active: (only ?? "") === id }))} />
          {prompts.length ? <AnswersList prompts={prompts} shown={shown} open={!!ai} /> : <p className="text-sm text-muted">Nicio întrebare în această selecție.</p>}
        </Card>
      </div>
    );
  }

  const board = leaderboard(rows, project.domain, base.competitors);
  if (tab === "ton") {
    const tone = sentimentBoard(rows, [project.domain, ...base.competitors.map((c) => c.domain)]);
    return (
      <div className="space-y-6">
        {aiChips}
        <SentimentCard board={tone} quotes={sampleQuotes(rows, project.domain)} projectName={project.name}
          visibility={new Map(board.map((b) => [b.domain, b.visibility]))} names={new Map(base.competitors.map((c) => [c.domain, c.name]))} />
      </div>
    );
  }

  // Concurenți
  const top = board.filter((b) => b.name !== "Tu").slice(0, 4);
  const chart = trend(rows, project.domain, top.map((c) => c.domain));
  const topBrands = brandMentions(rows, await catalogBrands(project.id));
  return (
    <div className="space-y-6">
      {aiChips}
      <Card title={`Evoluția vizibilității ${scope}`}>
        {chart.length > 1 ? <TrendChart data={chart} series={[{ key: "tu", label: "Tu", color: COLORS[0] }, ...top.map((c, i) => ({ key: c.domain, label: c.name, color: COLORS[i + 1] }))]} /> : <p className="text-sm text-muted">Graficul apare după a doua zi de măsurători.</p>}
      </Card>
      <RivalsCard report={rankRivals(rows, project.domain)} projectId={project.id} projectName={project.name} competitors={base.competitors} />
      <Card title="Clasament: tu și concurenții urmăriți" description={`Pe ultimele ${days} zile, ${scope}, din ${rows.length} răspunsuri.`}>
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
      {topBrands.length > 0 && (
        <Card title="Mărcile din catalogul tău, în răspunsurile AI" description="În câte răspunsuri apare fiecare marcă pe care o vinzi și pe ce loc, în medie, între mărci. Nu sunt concurenți.">
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
    </div>
  );
}

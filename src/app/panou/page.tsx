import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { overview, trend, leaderboard, whoRecommends, shareOfRecommendations } from "@/core/insights";
import { PROVIDERS, providerLabel } from "@/core/ai/types";
import { Badge, ButtonLink, Card, Delta, Empty, ListRow, Notice, SubCard, Table, Td, TextLink, Working, impactTone } from "@/components/ui";
import { actionTitle } from "@/core/audit/problems";
import { SubmitButton, TrendChart } from "@/components/client";
import { ScoreRing } from "@/components/audit-view";
import { markAlertsRead, runNow, setActionStatus } from "@/app/actions";
import { dateShort } from "@/lib/format";
import { busyKinds } from "@/core/jobs";
import { activeProviders, isDemo } from "@/core/ai/engine";

// Tu: culoarea de marcă; concurenții: nuanțe de gri (DESIGN §9).
const COLORS = ["var(--primary)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

export default async function Home({ searchParams }: { searchParams: Promise<{ "bun-venit"?: string }> }) {
  const sp = await searchParams;
  const { project } = await currentProject();
  const o = await overview(project);
  const [conns, jobs, alerts, actions, prods] = await Promise.all([
    db.select().from(schema.connections).where(eq(schema.connections.projectId, project.id)),
    db.select().from(schema.jobs).where(and(inArray(schema.jobs.status, ["queued", "running"]))).limit(50),
    db.select().from(schema.alerts).where(and(eq(schema.alerts.projectId, project.id), eq(schema.alerts.read, false))).orderBy(desc(schema.alerts.createdAt)).limit(5),
    db.select().from(schema.actions).where(and(eq(schema.actions.projectId, project.id), eq(schema.actions.status, "noua"))).limit(50),
    db.select({ title: schema.products.title, price: schema.products.price }).from(schema.products).where(eq(schema.products.projectId, project.id)).limit(5000),
  ]);
  const busy = await busyKinds(project.id, conns.map((c) => c.id));
  const analysing = busy.has("audit") || busy.has("run_project") || busy.has("sync");
  const noAi = isDemo() && process.env.ALLOW_DEMO_AI !== "1";
  const working = jobs.filter((j) => (j.payload as Record<string, string>).projectId === project.id || conns.some((c) => c.id === (j.payload as Record<string, string>).connectionId));
  const rank: Record<string, number> = { mare: 0, mediu: 1, mic: 2 };
  const top3 = actions.sort((a, b) => rank[a.impact] - rank[b.impact] || rank[a.effort] - rank[b.effort]).slice(0, 3);

  const comps = leaderboard(o.rows.filter((r) => r.run.runDate >= o.rows.map((x) => x.run.runDate).sort().slice(-7)[0]), project.domain, o.competitors).filter((c) => c.name !== "Tu").slice(0, 3);
  const chart = trend(o.rows, project.domain, comps.map((c) => c.domain));
  const score = o.latest?.score ?? null;
  const diff = o.latest && o.weekAgo && o.latest.day !== o.weekAgo.day ? o.latest.score - o.weekAgo.score : null;
  const recommending = o.perProvider.filter((p) => p.visibility > 0).length;
  // Doar AI-urile care au răspuns efectiv; cele cu eroare nu se socotesc ca „nu te recomandă”.
  const checked = o.perProvider.filter((p) => p.checked).length;
  const live = new Set(activeProviders().filter((p) => p.live).map((p) => p.id));
  const unchecked = new Map(o.unchecked.map((u) => [u.provider, u.reason]));
  const who = whoRecommends(o.rows, project.domain, o.audit, prods);
  const share = shareOfRecommendations(o.rows.filter((r) => r.run.runDate >= (o.latest?.day ?? "")), project.domain);
  const perQ = who[0]?.total ?? 0;

  if (!o.latest) {
    return (
      <div className="space-y-6">
        {sp["bun-venit"] && <Notice tone="good">Contul e gata. Analizăm magazinul {project.domain}: audit tehnic, catalog și primele întrebări către AI-uri.</Notice>}
        <Card title="Pregătim primul raport">
          <ul className="text-sm">
            <ListRow end={o.audit ? <Badge tone="good">Gata ({o.audit.score}/100)</Badge> : <Badge tone="warn">În lucru</Badge>}>Audit tehnic</ListRow>
            <ListRow end={conns.some((c) => c.status === "ok") ? <Badge tone="good">{conns.reduce((s, c) => s + c.productCount, 0)} produse</Badge> : conns.length ? <Badge tone={conns.some((c) => c.status === "error") ? "bad" : "warn"}>{conns.some((c) => c.status === "error") ? "Eroare" : "În lucru"}</Badge> : <Badge tone="warn">Neconectat</Badge>}>Catalog de produse</ListRow>
            <ListRow end={noAi ? <Badge>Lipsește cheia AI</Badge> : working.some((j) => j.kind === "run_project") ? <Badge tone="warn">În lucru</Badge> : <Badge>În așteptare</Badge>}>Întrebări la AI-uri</ListRow>
          </ul>
          {!conns.some((c) => c.status === "ok") && <p className="mt-4 text-sm text-muted">Nu am putut conecta automat catalogul. <TextLink href="/panou/setari">Adaugă feed-ul de produse</TextLink> (Google XML sau CSV) ca să urmărim fiecare produs.</p>}
          <div className="mt-6">
            {analysing
              ? <Working hint="Verificăm site-ul, catalogul și întrebăm AI-urile. Durează câteva minute; pagina se actualizează singură când e gata.">Analiza e în lucru</Working>
              : <><form action={runNow}><input type="hidden" name="projectId" value={project.id} /><SubmitButton pendingText="Pornesc…">Pornește analiza acum</SubmitButton></form>
                <p className="mt-2 text-xs text-muted">Analiza rulează în fundal; pagina se actualizează singură când e gata.</p></>}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Scorul și verdictul */}
      <Card>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="shrink-0"><ScoreRing score={score ?? 0} size={120} /></div>
          <div className="min-w-0 flex-1">
            <div className="label">Scor de vizibilitate AI · {project.name}</div>
            <div className="font-display mt-1 text-2xl font-semibold">{!checked ? "Încă nu avem răspunsuri reale de la AI-uri." : recommending ? `Ești recomandat de ${recommending} din ${checked} ${checked === 1 ? "AI verificat" : "AI-uri verificate"}.` : `Niciun AI dintre cele ${checked} verificate nu te recomandă încă.`}</div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <Delta value={diff} /><span>față de acum o săptămână</span>
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted">Apari în răspunsuri</dt><dd className="num font-medium">{o.sum.total.visibility}%</dd></div>
              <div><dt className="text-xs text-muted">Cotă față de concurenți</dt><dd className="num font-medium">{o.sum.total.sov}%</dd></div>
              <div><dt className="text-xs text-muted">Pregătire tehnică</dt><dd className="num font-medium">{o.audit ? `${o.audit.score}/100` : "–"}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-muted">
              Scorul = 50% apariții + 20% cotă + 30% pregătire tehnică.
              {!recommending && (score ?? 0) > 0 && ` Acum ${score} vine doar din pregătirea tehnică a site-ului; crește când AI-urile încep să te recomande.`}
            </p>
            {o.unchecked.length > 0 && (
              <p className="mt-2 text-xs text-warn">
                Scor parțial: {o.unchecked.map((u) => `${providerLabel(u.provider)} nu a putut fi verificat (${u.reason})`).join("; ")}. Nu intră în scor și nici nu înseamnă că lipsești.
              </p>
            )}
          </div>
          <div className="shrink-0 sm:max-w-56 sm:self-start">
            {analysing
              ? <Working hint="Întrebăm AI-urile și verificăm site-ul. Pagina se actualizează singură când e gata.">Analiza e în lucru</Working>
              : <form action={runNow}><input type="hidden" name="projectId" value={project.id} /><SubmitButton variant="secondary" pendingText="Pornesc…">Rulează acum</SubmitButton></form>}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        {/* 2. Evoluția */}
        <Card title="Evoluție pe 30 de zile" action={<TextLink href="/panou/vizibilitate">Detalii</TextLink>}>
          {chart.length > 1
            ? <TrendChart data={chart} series={[{ key: "tu", label: "Tu", color: COLORS[0] }, ...comps.map((c, i) => ({ key: c.domain, label: c.name, color: COLORS[i + 1] }))]} />
            : <p className="text-sm text-muted">Graficul apare după a doua zi de măsurători.</p>}
        </Card>

        {/* 3. Cele 3 lucruri de făcut: insigna deasupra titlului, ca titlurile să înceapă toate la aceeași linie */}
        <Card title="3 lucruri de făcut săptămâna asta" action={<TextLink href="/panou/actiuni">Toate</TextLink>}>
          {top3.length === 0 ? <p className="text-sm text-muted">Nimic urgent. Bravo!</p> : (
            <ul className="space-y-3">
              {top3.map((a) => (
                <li key={a.id}>
                  <SubCard>
                    <Badge tone={impactTone(a.impact)}>Impact {a.impact}</Badge>
                    <h3 className="mt-2 font-semibold">{actionTitle(a)}</h3>
                    <p className="mt-1 text-sm text-muted">{a.why}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {a.fixKind && a.fixKind !== "source" ? <ButtonLink href="/panou/audit#rezolva" size="sm">Rezolvă</ButtonLink> : <ButtonLink href="/panou/actiuni" size="sm">Vezi pașii</ButtonLink>}
                      <form action={setActionStatus}><input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value="rezolvata" /><SubmitButton variant="ghost" size="sm" pendingText="Salvez…">Am rezolvat</SubmitButton></form>
                    </div>
                  </SubCard>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 4. Cine te recomandă și cine nu (ca în ilustrații) */}
      <div>
        <div className="label mb-1">Ultima măsurătoare · {perQ} întrebări pe fiecare AI</div>
        <h2 className="mb-4 text-xl font-semibold sm:text-2xl">Cine te recomandă și cine nu</h2>
        <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
          <Card>
            <Table head={["AI", "Te recomandă", "În locul tău", "Problema", "Săptămâna"]}>
              {who.map((w) => {
                const pp = o.perProvider.find((x) => x.provider === w.provider);
                return (
                  <tr key={w.provider}>
                    <Td>{providerLabel(w.provider)}</Td>
                    {w.total === 0
                      ? <Td className="text-muted">{!live.has(w.provider) ? "neconfigurat" : unchecked.get(w.provider) ? `nu a putut fi întrebat (${unchecked.get(w.provider)})` : "nu a rulat încă"}</Td>
                      : <Td className={`num whitespace-nowrap font-semibold ${w.hits ? "text-good" : "text-bad"}`}>{w.hits ? "✓" : "✕"} {w.hits} din {w.total}</Td>}
                    <Td>{w.instead ?? "–"}</Td>
                    <Td>{w.problem ? <span className={w.problem === "robot blocat" ? "text-bad" : "text-warn"}>{w.problem}</span> : "–"}</Td>
                    <Td><Delta value={pp?.delta ?? null} suffix=" pp" /></Td>
                  </tr>
                );
              })}
            </Table>
          </Card>
          <Card title="Cota din recomandări">
            <ul className="space-y-4">
              {share.map((x) => (
                <li key={x.domain} className="flex items-center gap-3 text-sm">
                  <span className={`w-32 shrink-0 truncate ${x.me ? "font-semibold" : ""}`}>{x.me ? project.name : x.domain}</span>
                  <span className="h-3 min-w-0 flex-1 rounded-full bg-surface"><span className={`block h-3 rounded-full ${x.me ? "bg-primary" : "bg-muted/50"}`} style={{ width: `${Math.max(3, x.pct)}%` }} /></span>
                  <span className="num w-10 text-right font-medium">{x.pct}%</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {alerts.length > 0 && (
        <Card title="Alerte noi" action={<form action={markAlertsRead}><input type="hidden" name="projectId" value={project.id} /><SubmitButton variant="ghost" size="sm" pendingText="Marchez…">Marchează citite</SubmitButton></form>}>
          <ul className="text-sm">
            {alerts.map((a) => <ListRow key={a.id} end={<span className="text-xs text-muted">{dateShort(a.createdAt)}</span>}>{a.message}</ListRow>)}
          </ul>
        </Card>
      )}
      {o.rows.length === 0 && <Empty title="Nicio întrebare rulată încă" />}
    </div>
  );
}

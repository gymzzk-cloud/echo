import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { overview, trend, leaderboard, whoRecommends, shareOfRecommendations } from "@/core/insights";
import { PROVIDERS, providerLabel } from "@/core/ai/types";
import { Badge, ButtonLink, Card, Delta, Empty, Notice, Table, Td, impactTone } from "@/components/ui";
import { SubmitButton, TrendChart } from "@/components/client";
import { ScoreRing } from "@/components/audit-view";
import { markAlertsRead, runNow, setActionStatus } from "@/app/actions";
import { dateShort } from "@/lib/format";
import { busyKinds } from "@/core/jobs";
import { isDemo } from "@/core/ai/engine";

const COLORS = ["var(--primary)", "#94a3b8", "#64748b", "#cbd5e1"];

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
  const who = whoRecommends(o.rows, project.domain, o.audit, prods);
  const share = shareOfRecommendations(o.rows.filter((r) => r.run.runDate >= (o.latest?.day ?? "")), project.domain);
  const perQ = who[0]?.total ?? 0;

  if (!o.latest) {
    return (
      <div className="space-y-6">
        {sp["bun-venit"] && <Notice tone="good">Contul e gata. Analizăm magazinul {project.domain}: audit tehnic, catalog și primele întrebări către AI-uri.</Notice>}
        <Card title="Pregătim primul raport">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span>Audit tehnic</span>{o.audit ? <Badge tone="good">Gata ({o.audit.score}/100)</Badge> : <Badge tone="warn">În lucru</Badge>}</li>
            <li className="flex justify-between"><span>Catalog de produse</span>{conns.some((c) => c.status === "ok") ? <Badge tone="good">{conns.reduce((s, c) => s + c.productCount, 0)} produse</Badge> : conns.length ? <Badge tone={conns.some((c) => c.status === "error") ? "bad" : "warn"}>{conns.some((c) => c.status === "error") ? "Eroare" : "În lucru"}</Badge> : <Badge tone="warn">Neconectat</Badge>}</li>
            <li className="flex justify-between"><span>Întrebări la AI-uri</span>{noAi ? <Badge>Lipsește cheia AI</Badge> : working.some((j) => j.kind === "run_project") ? <Badge tone="warn">În lucru</Badge> : <Badge>În așteptare</Badge>}</li>
          </ul>
          {!conns.some((c) => c.status === "ok") && <p className="mt-4 text-sm text-muted">Nu am putut conecta automat catalogul. <Link prefetch={false} href="/panou/setari" className="text-primary underline">Adaugă feed-ul de produse</Link> (Google XML sau CSV) ca să urmărim fiecare produs.</p>}
          {analysing
            ? <p className="mt-4 text-sm text-muted">Analiza e în lucru. Pagina se actualizează singură când e gata.</p>
            : <><form action={runNow} className="mt-4"><input type="hidden" name="projectId" value={project.id} /><SubmitButton pendingText="Pornesc…">Pornește analiza acum</SubmitButton></form>
              <p className="mt-3 text-xs text-muted">Analiza rulează în fundal; pagina se actualizează singură când e gata.</p></>}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Scorul și verdictul */}
      <Card>
        <div className="flex flex-wrap items-center gap-6">
          <ScoreRing score={score ?? 0} size={128} />
          <div className="min-w-0 flex-1">
            <div className="label">Scor de vizibilitate AI · {project.name}</div>
            <div className="font-display mt-1 text-2xl font-semibold">{!checked ? "Încă nu avem răspunsuri reale de la AI-uri." : recommending ? `Ești recomandat de ${recommending} din ${checked} ${checked === 1 ? "AI verificat" : "AI-uri verificate"}.` : `Niciun AI dintre cele ${checked} verificate nu te recomandă încă.`}</div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted">
              <Delta value={diff} /><span>față de acum o săptămână</span>
              <span>· apari în {o.sum.total.visibility}% din răspunsuri · cotă față de concurenți {o.sum.total.sov}%</span>
            </div>
            {o.unchecked.length > 0 && (
              <p className="mt-2 text-xs text-warn">
                Scor parțial: {o.unchecked.map((u) => `${providerLabel(u.provider)} nu a putut fi verificat (${u.reason})`).join("; ")}. Nu intră în scor și nici nu înseamnă că lipsești.
              </p>
            )}
          </div>
          {analysing
            ? <span className="text-xs text-muted">Analiza e în lucru…</span>
            : <form action={runNow}><input type="hidden" name="projectId" value={project.id} /><SubmitButton pendingText="Pornesc…" className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-surface disabled:opacity-60">Rulează acum</SubmitButton></form>}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        {/* 2. Evoluția */}
        <Card title="Evoluție pe 30 de zile" action={<Link prefetch={false} href="/panou/vizibilitate" className="text-xs text-primary hover:underline">Detalii</Link>}>
          {chart.length > 1
            ? <TrendChart data={chart} series={[{ key: "tu", label: "Tu", color: COLORS[0] }, ...comps.map((c, i) => ({ key: c.domain, label: c.name, color: COLORS[i + 1] }))]} />
            : <p className="text-sm text-muted">Graficul apare după a doua zi de măsurători.</p>}
        </Card>

        {/* 3. Cele 3 lucruri de făcut */}
        <Card title="3 lucruri de făcut săptămâna asta" action={<Link prefetch={false} href="/panou/actiuni" className="text-xs text-primary hover:underline">Toate</Link>}>
          {top3.length === 0 ? <p className="text-sm text-muted">Nimic urgent. Bravo!</p> : (
            <ul className="space-y-4">
              {top3.map((a) => (
                <li key={a.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2"><span className="font-semibold">{a.title}</span><Badge tone={impactTone(a.impact)}>Impact {a.impact}</Badge></div>
                  <p className="mt-1 text-xs text-muted">{a.why}</p>
                  <div className="mt-3 flex gap-2">
                    {a.fixKind && a.fixKind !== "source" ? <ButtonLink href="/panou/audit#rezolva" size="sm">Rezolvă</ButtonLink> : <ButtonLink href="/panou/actiuni" size="sm">Vezi pașii</ButtonLink>}
                    <form action={setActionStatus}><input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value="rezolvata" /><button className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface">Am rezolvat</button></form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 4. Cine te recomandă și cine nu (ca în ilustrații) */}
      <div>
        <div className="label mb-1">Ultima măsurătoare · {perQ} întrebări pe fiecare AI</div>
        <h2 className="mb-4 text-2xl font-semibold">Cine te recomandă și cine nu</h2>
        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <Card>
            <Table head={["AI", "Te recomandă", "În locul tău", "Problema", "Săptămâna"]}>
              {who.map((w) => {
                const pp = o.perProvider.find((x) => x.provider === w.provider);
                return (
                  <tr key={w.provider}>
                    <Td className="text-[15px]">{providerLabel(w.provider)}</Td>
                    <Td className={`num text-[15px] font-semibold ${w.hits ? "text-good" : "text-bad"}`}>{w.hits ? "✓" : "✕"} {w.hits} din {w.total}</Td>
                    <Td className="text-[15px]">{w.instead ?? "–"}</Td>
                    <Td className="text-[15px]">{w.problem ? <span className={w.problem === "robot blocat" ? "text-bad" : "text-warn"}>{w.problem}</span> : "–"}</Td>
                    <Td><Delta value={pp?.delta ?? null} suffix=" pp" /></Td>
                  </tr>
                );
              })}
            </Table>
          </Card>
          <Card title="Cota din recomandări">
            <ul className="space-y-5">
              {share.map((x) => (
                <li key={x.domain} className="flex items-center gap-3 text-[15px]">
                  <span className={`w-36 truncate ${x.me ? "font-semibold" : ""}`}>{x.me ? project.name : x.domain}</span>
                  <span className="h-3 flex-1 rounded-full bg-surface"><span className={`block h-3 rounded-full ${x.me ? "bg-primary" : "bg-muted/50"}`} style={{ width: `${Math.max(3, x.pct)}%` }} /></span>
                  <span className="num w-10 text-right font-medium">{x.pct}%</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {alerts.length > 0 && (
        <Card title="Alerte noi" action={<form action={markAlertsRead}><input type="hidden" name="projectId" value={project.id} /><button className="text-xs text-muted hover:underline">Marchează citite</button></form>}>
          <ul className="space-y-2 text-sm">
            {alerts.map((a) => <li key={a.id} className="flex items-start justify-between gap-3"><span>{a.message}</span><span className="shrink-0 text-xs text-muted">{dateShort(a.createdAt)}</span></li>)}
          </ul>
        </Card>
      )}
      {o.rows.length === 0 && <Empty title="Nicio întrebare rulată încă" />}
    </div>
  );
}

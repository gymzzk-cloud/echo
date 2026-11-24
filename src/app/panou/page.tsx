import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { readSnapshot } from "@/core/panel-snapshot";
import { SnapshotNote } from "@/components/snapshot-note";
import { providerLabel } from "@/core/ai/types";
import { Badge, ButtonLink, Card, Delta, Empty, ListRow, Notice, SubCard, Table, Td, TextLink, Working } from "@/components/ui";
import { SubmitButton, TrendChart } from "@/components/client";
import { markAlertsRead, runNow, setActionStatus } from "@/app/actions";
import { dateShort } from "@/lib/format";
import { busyKinds } from "@/core/jobs";
import { activeProviders, isDemo } from "@/core/ai/engine";
import { CardHelp } from "@/components/card-help";
import { readHomeTodo } from "@/core/home-todo";

// Tu: culoarea de marcă; concurenții: nuanțe de gri (DESIGN §9).
const COLORS = ["var(--primary)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
const TODO_SHOWN = 5;

export default async function Home({ searchParams }: { searchParams: Promise<{ "bun-venit"?: string }> }) {
  const sp = await searchParams;
  const { project } = await currentProject();
  // Cifrele din toate rulările (scor, grafic, cine te recomandă, cote) vin calculate din worker: pagina citește un rând (KNOWLEDGE B48).
  const [snap, conns, jobs, alerts, todo] = await Promise.all([
    readSnapshot(project, "home"),
    db.select().from(schema.connections).where(eq(schema.connections.projectId, project.id)),
    db.select().from(schema.jobs).where(and(inArray(schema.jobs.status, ["queued", "running"]))).limit(50),
    db.select().from(schema.alerts).where(and(eq(schema.alerts.projectId, project.id), eq(schema.alerts.read, false))).orderBy(desc(schema.alerts.createdAt)).limit(5),
    readHomeTodo(project.id),
  ]);
  const o = snap.data;
  const busy = await busyKinds(project.id, conns.map((c) => c.id));
  const analysing = busy.has("audit") || busy.has("run_project") || busy.has("sync");
  const noAi = isDemo() && process.env.ALLOW_DEMO_AI !== "1";
  const working = jobs.filter((j) => (j.payload as Record<string, string>).projectId === project.id || conns.some((c) => c.id === (j.payload as Record<string, string>).connectionId));

  const { comps, chart, who, share } = o;
  // Aceeași cifră ca pe „Cum te văd AI-urile”: ultimul răspuns al fiecărui AI la fiecare întrebare din lista curentă.
  const now = (o as { now?: { hits: number; total: number; pct: number } }).now ?? null;
  // Doar AI-urile care au răspuns efectiv; cele cu eroare nu se socotesc ca „nu te recomandă”.
  const checked = o.perProvider.filter((p) => p.checked).length;
  const live = new Set(activeProviders().filter((p) => p.live).map((p) => p.id));
  const unchecked = new Map(o.unchecked.map((u) => [u.provider, u.reason]));
  const perQ = who[0]?.total ?? 0;

  if (!o.latest) {
    return (
      <div className="space-y-6">
        {sp["bun-venit"] && <Notice tone="good">Contul e gata. Analizăm magazinul {project.domain}: audit tehnic, catalog și primele întrebări către AI-uri.</Notice>}
        <Card title="Pregătim primul raport" description={<CardHelp id="home.firstReport" />}>
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
      {/* 1. O singură cifră: în câte răspunsuri te recomandă AI-urile (aceeași ca pe „Pe fiecare AI”) */}
      <Card>
        <SnapshotNote computedAt={snap.computedAt} stale={snap.stale} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="label">{project.name} în AI-uri</div>
            <div className="font-display mt-1 text-2xl font-semibold">{!checked || !now?.total ? "Încă nu avem răspunsuri reale de la AI-uri." : now.hits ? `Te recomandă în ${now.hits} din ${now.total} răspunsuri (${now.pct}%).` : `Niciun AI nu te recomandă încă, în ${now.total} răspunsuri.`}</div>
            <p className="mt-2 text-sm text-muted">La ultima întrebare pusă fiecărui AI, din lista ta de {perQ} întrebări despre produse. <TextLink href="/panou/vizibilitate">Vezi răspunsurile</TextLink></p>
            {todo.quality && todo.quality.checked > 0 && (
              <p className="mt-2 text-sm text-muted">Feed-ul spre ChatGPT: <span className="num font-medium text-fg">{todo.quality.score}%</span> corect ({todo.quality.perfect.toLocaleString("ro-RO")} din {todo.quality.checked.toLocaleString("ro-RO")} produse fără nicio problemă). <TextLink href="/panou/feed#verificare">Verificarea feed-ului</TextLink></p>
            )}
            {o.unchecked.length > 0 && (
              <p className="mt-2 text-xs text-warn">{o.unchecked.map((u) => `${providerLabel(u.provider)} nu a putut fi întrebat (${u.reason})`).join("; ")}. Nu intră în cifră și nici nu înseamnă că lipsești.</p>
            )}
          </div>
          <div className="shrink-0 sm:max-w-56">
            {analysing
              ? <Working hint="Întrebăm AI-urile și verificăm site-ul. Pagina se actualizează singură când e gata.">Analiza e în lucru</Working>
              : <form action={runNow}><input type="hidden" name="projectId" value={project.id} /><SubmitButton variant="secondary" pendingText="Pornesc…">Rulează acum</SubmitButton></form>}
          </div>
        </div>
      </Card>

      {/* 2. Ce faci acum: o listă, din feed și din acțiuni, cele care ajută cel mai mult primele */}
      <Card title={todo.items.length ? `Ce faci acum: ${todo.items.length} lucruri, cel mai util primul` : "Ce faci acum"} description={<CardHelp id="home.todo" />} action={todo.items.length > TODO_SHOWN ? <TextLink href="/panou/actiuni">Toate</TextLink> : undefined}>
        {todo.items.length === 0 ? <p className="text-sm text-muted">Nimic de reparat acum, din ce am putut verifica.</p> : (
          <ol className="space-y-3">
            {todo.items.slice(0, TODO_SHOWN).map((t, k) => (
              <li key={t.key}>
                <SubCard>
                  <div className="flex flex-wrap items-center gap-2"><span className="num text-sm font-semibold text-muted">{k + 1}.</span><Badge tone={t.tone}>{t.tag}</Badge></div>
                  <h3 className="mt-2 font-semibold">{t.title}</h3>
                  <p className="mt-1 text-sm text-muted">{t.why}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ButtonLink href={t.href} size="sm">Rezolvă</ButtonLink>
                    {t.actionId && <form action={setActionStatus}><input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="id" value={t.actionId} /><input type="hidden" name="status" value="rezolvata" /><SubmitButton variant="ghost" size="sm" pendingText="Salvez…">Am rezolvat</SubmitButton></form>}
                  </div>
                </SubCard>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Evoluția doar când are sens: cu cel puțin o săptămână de măsurători */}
      {chart.length >= 7 && (
        <Card title="Evoluție pe 30 de zile" description={<CardHelp id="home.trend" />} action={<TextLink href="/panou/vizibilitate">Detalii</TextLink>}>
          <TrendChart data={chart} series={[{ key: "tu", label: "Tu", color: COLORS[0] }, ...comps.map((c, i) => ({ key: c.domain, label: c.name, color: COLORS[i + 1] }))]} />
        </Card>
      )}

      {/* 4. Cine te recomandă și cine nu (ca în ilustrații) */}
      <div>
        <div className="label mb-1">Ultima măsurătoare · {perQ} întrebări pe fiecare AI</div>
        <h2 className="mb-4 text-xl font-semibold sm:text-2xl">Cine te recomandă și cine nu</h2>
        <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
          <Card>
            <Table head={["AI", "Te recomandă", "În locul tău", "Problema", "Variația"]}>
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
          <Card title="Cota din recomandări" description={<CardHelp id="home.share" />}>
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
        <Card title="Alerte noi" description={<CardHelp id="home.alerts" />} action={<form action={markAlertsRead}><input type="hidden" name="projectId" value={project.id} /><SubmitButton variant="ghost" size="sm" pendingText="Marchez…">Marchează citite</SubmitButton></form>}>
          <ul className="text-sm">
            {alerts.map((a) => {
              // Alerta de preț duce la dovadă: rândul exact din răspunsul AI, pe fișa produsului.
              const productId = a.kind.startsWith("price:") ? a.kind.split(":")[1] : null;
              return <ListRow key={a.id} end={<span className="text-xs text-muted">{dateShort(a.createdAt)}</span>}>{a.message}{productId && <> <TextLink href={`/panou/produse-ai/${productId}#dovezi`}>Vezi dovada</TextLink></>}</ListRow>;
            })}
          </ul>
        </Card>
      )}
      {o.rowCount === 0 && <Empty title="Nicio întrebare rulată încă" />}
    </div>
  );
}

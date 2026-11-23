import { Suspense } from "react";
import { currentProject } from "@/lib/project";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Chips, Empty, Field, FormActions, ListRow, Notice, PageHeader, Select, Stat, TextLink, Working, type Tone } from "@/components/ui";
import { busyKinds } from "@/core/jobs";
import { fixCounts, listFixes, PAGE_SIZE, type FixStatus } from "@/core/fixes";
import { approveConfident, decideFix, runFixes, saveAutoThreshold } from "@/app/actions-fixes";
import { dateShort } from "@/lib/format";
import { CardHelp } from "@/components/card-help";

type Sp = { s?: string; f?: string; p?: string };

const FIELD_LABEL: Record<string, string> = { title: "Titlu", description: "Descriere", gtin: "GTIN", brand: "Marcă", category: "Categorie" };
const STATUS: { id: FixStatus; label: string }[] = [{ id: "propus", label: "De aprobat" }, { id: "aprobat", label: "Aplicate în feed" }, { id: "respins", label: "Respinse" }];
const confTone = (c: number): Tone => (c >= 80 ? "good" : c >= 60 ? "warn" : "muted");
const THRESHOLDS = [95, 90, 85, 80, 75, 70];

export default async function FixesPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const { project } = await currentProject();
  const busy = await busyKinds(project.id);
  const pid = <input type="hidden" name="projectId" value={project.id} />;
  const run = busy.has("fixes")
    ? <Working hint="Pagina se actualizează singură.">Căutăm reparații</Working>
    : <form action={runFixes}>{pid}<SubmitButton variant="secondary" pendingText="Pornesc…">Caută reparații acum</SubmitButton></form>;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Reparații" title="Reparații de produs" action={run}
        subtitle="Titluri, descrieri, GTIN, marcă și categorie, propuse pentru fiecare produs cu un scor de încredere. Ce aprobi se aplică doar în feed-ul Echo; magazinul tău nu se modifică." />
      <Suspense key={`${sp.s ?? ""}|${sp.f ?? ""}|${sp.p ?? ""}`} fallback={<Card><p className="animate-pulse text-sm text-muted">Calculăm…</p></Card>}>
        <FixesBody projectId={project.id} threshold={project.fixAutoThreshold} checkedAt={project.fixesCheckedAt} sp={sp} busy={busy.has("fixes")} />
      </Suspense>
    </div>
  );
}

async function FixesBody({ projectId, threshold, checkedAt, sp, busy }: { projectId: string; threshold: number | null; checkedAt: Date | null; sp: Sp; busy: boolean }) {
  const status = (STATUS.find((s) => s.id === sp.s)?.id ?? "propus") as FixStatus;
  const field = sp.f && FIELD_LABEL[sp.f] ? sp.f : undefined;
  const page = Math.max(1, Math.min(1000, Number(sp.p) || 1));
  const [counts, list] = await Promise.all([fixCounts(projectId), listFixes(projectId, { status, field, page })]);
  const pid = <input type="hidden" name="projectId" value={projectId} />;
  const total = counts.pending + counts.approved + counts.rejected;
  if (!total) {
    return <Empty title={checkedAt || busy ? "Nicio reparație de propus" : "Nu am căutat încă reparații"}>
      {checkedAt ? `Ultima verificare: ${dateShort(checkedAt)}. Datele produselor tale arată bine; verificăm din nou după fiecare sincronizare a catalogului.` : "Căutarea pornește singură după sincronizarea catalogului sau din butonul de sus. Durează câteva secunde."}
    </Empty>;
  }
  const highPending = counts.rows.filter((r) => r.status === "propus" && (!field || r.field === field)).reduce((a, r) => a + r.high, 0);
  const shown = counts.by(status, field);
  const pages = Math.max(1, Math.ceil(shown / PAGE_SIZE));
  const href = (o: Partial<Sp>) => {
    const q = new URLSearchParams();
    const s = o.s ?? status, f = o.f === undefined ? field : o.f, p = o.p;
    if (s !== "propus") q.set("s", s);
    if (f) q.set("f", f);
    if (p && p !== "1") q.set("p", p);
    const str = q.toString();
    return str ? `?${str}` : "?";
  };

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-3">
        <Stat label="De aprobat" value={counts.pending} hint={highPending ? `${highPending} cu încredere de peste 80%` : "nimic sigur de aprobat dintr-un clic"} />
        <Stat label="Aplicate în feed" value={counts.approved} hint={counts.auto ? `${counts.auto} aplicate automat` : "aprobate de tine"} />
        <Stat label="Aplicare automată" value={threshold ? `≥ ${threshold}%` : "Oprită"} hint={threshold ? "se aplică singure, fără să aștepte" : "aprobi tu fiecare reparație"} />
      </div>

      <Card title="Aplicare automată" description="Alege de la ce încredere o reparație intră singură în feed. Scorul îl calculăm noi: un GTIN găsit în descriere e mai sigur decât un titlu scris de AI. Poți anula oricând orice reparație.">
        <ActionForm action={saveAutoThreshold} className="grid items-start gap-4 md:grid-cols-[1fr_auto]">
          {pid}
          <Field label="Aplică singure reparațiile cu încredere de cel puțin">
            <Select name="threshold" defaultValue={threshold ? String(threshold) : ""}>
              <option value="">Oprit: aprob eu fiecare reparație</option>
              {THRESHOLDS.map((t) => <option key={t} value={t}>{t}%{t === 80 ? " (recomandat)" : ""}</option>)}
            </Select>
          </Field>
          <FormActions><SubmitButton pendingText="Salvez…">Salvează pragul</SubmitButton></FormActions>
        </ActionForm>
      </Card>

      <Card title={`${STATUS.find((s) => s.id === status)!.label}${field ? `: ${FIELD_LABEL[field].toLowerCase()}` : ""} (${shown})`}
        description={<CardHelp id="fixes.list" />}
        action={status === "propus" && highPending > 0 && (
          <form action={approveConfident}>{pid}<input type="hidden" name="min" value="80" />{field && <input type="hidden" name="field" value={field} />}
            <SubmitButton size="sm" pendingText="Aprob…">Aprobă peste 80% ({highPending})</SubmitButton></form>
        )}>
        <div className="mb-4 flex flex-col gap-2">
          <Chips items={STATUS.map((s) => ({ href: href({ s: s.id, f: field ?? "", p: "1" }), label: s.label, count: counts.by(s.id), active: s.id === status }))} />
          <Chips items={[{ href: href({ f: "", p: "1" }), label: "Toate câmpurile", active: !field, count: undefined as number | undefined }, ...Object.entries(FIELD_LABEL).map(([k, l]) => ({ href: href({ f: k, p: "1" }), label: l, count: counts.by(status, k), active: field === k }))].filter((c) => c.active || c.count !== 0)} />
        </div>
        {list.length === 0 ? <p className="text-sm text-muted">Nimic aici.</p> : (
          <ul>
            {list.map(({ e, p }) => (
              <ListRow key={e.id} end={<RowButtons id={e.id} status={e.status as FixStatus} pid={pid} />}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{FIELD_LABEL[e.field] ?? e.field}</Badge>
                  <Badge tone={confTone(e.confidence)}>Încredere {e.confidence}%</Badge>
                  <Badge tone={e.source === "ai" ? "primary" : "muted"}>{e.source === "ai" ? "Scris de AI" : "Din datele tale"}</Badge>
                  {e.auto && <Badge tone="good">Aplicată automat</Badge>}
                </div>
                <a href={p.url} target="_blank" rel="noopener" className="mt-2 block truncate font-medium hover:underline">{p.title}</a>
                <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
                  <dt className="text-muted">Acum</dt><dd className="line-clamp-3 min-w-0 break-words text-muted">{e.previous?.trim() ? e.previous : "(gol)"}</dd>
                  <dt className="text-muted">Propus</dt><dd className="line-clamp-4 min-w-0 break-words font-medium">{e.value ? e.value : "(câmp gol în feed)"}</dd>
                </dl>
                {e.reason && <p className="mt-2 text-xs text-muted">{e.reason}</p>}
              </ListRow>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between gap-4 text-sm">
            {page > 1 ? <TextLink href={href({ p: String(page - 1) })}>← Înapoi</TextLink> : <span />}
            <span className="num text-muted">Pagina {page} din {pages}</span>
            {page < pages ? <TextLink href={href({ p: String(page + 1) })}>Înainte →</TextLink> : <span />}
          </div>
        )}
        <p className="mt-4 text-xs text-muted">
          Reparațiile aprobate intră în feed-urile tale (Google, ChatGPT, Meta…) la următoarea generare, în câteva minute.
          {counts.approved > 0 && <> Le poți pune și în catalogul magazinului: <TextLink href="/panou/reparatii/export">descarcă lista (CSV)</TextLink>.</>}
        </p>
      </Card>
      {threshold && counts.pending > 0 && <Notice>Reparațiile de sub {threshold}% așteaptă aprobarea ta.</Notice>}
    </>
  );
}

function RowButtons({ id, status, pid }: { id: string; status: FixStatus; pid: React.ReactNode }) {
  const f = (to: FixStatus, label: string, variant: "secondary" | "ghost") => (
    <form action={decideFix}>{pid}<input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={to} />
      <SubmitButton variant={variant} size="sm" pendingText="…">{label}</SubmitButton></form>
  );
  if (status === "propus") return <>{f("aprobat", "Aprobă", "secondary")}{f("respins", "Respinge", "ghost")}</>;
  return f("propus", status === "aprobat" ? "Anulează" : "Readu la de aprobat", "ghost");
}

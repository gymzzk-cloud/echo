"use client";
import { useEffect, useRef, useState } from "react";
import { Badge, cx } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ProgressRing } from "./progress-ring";
import { StoreLogo } from "./store-logo";

type Scan = {
  name: string; domain: string; audit: string; policies: string; done: boolean; error: string | null; platform: string | null;
  categories: string[]; brands: string[]; products: string[]; policyBits: string[]; blockedBots: string[]; trustmarks: string[]; cui: string | null; logo: string | null;
};

const STATUS = ["Deschidem prima pagină…", "Citim meniul și categoriile…", "Căutăm mărcile și produsele puse în față…", "Citim livrarea, returul și plata…", "Verificăm robots.txt pentru roboții AI…", "Mai avem puțin…"];

/** Scanarea live: întreabă serverul la 1,5 secunde și completează profilul pe măsură ce vin datele reale. */
export function ScanLive({ action }: { action: () => Promise<void> }) {
  const [s, setS] = useState<Scan | null>(null);
  const [tick, setTick] = useState(0);
  const [late, setLate] = useState(false);
  const started = useRef(Date.now());
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch("/api/start/scan", { cache: "no-store" });
        if (r.ok) { const j = (await r.json()) as Scan; if (!stop) setS(j); if (j.done) return; }
      } catch { /* reîncercăm */ }
      if (Date.now() - started.current > 90_000) setLate(true);
      if (!stop) setTimeout(load, 1500);
    };
    load();
    const t = setInterval(() => setTick((x) => x + 1), 1100);
    return () => { stop = true; clearInterval(t); };
  }, []);

  const auditDone = s?.audit === "done" || s?.audit === "error";
  const polDone = s?.policies === "done" || s?.policies === "error";
  const rows: { k: string; ready: boolean; v: React.ReactNode }[] = [
    { k: "Magazinul", ready: !!s && auditDone, v: s && <span><b className="font-semibold text-fg">{s.name}</b>{s.platform ? ` · platformă ${s.platform}` : ""}{s.cui ? ` · CUI ${s.cui}` : ""}</span> },
    { k: "Ce vinzi", ready: auditDone, v: <Tags items={s?.categories} empty="Nu am găsit meniul. Le completezi tu la pasul Profil." /> },
    { k: "Mărci", ready: auditDone, v: <Tags items={s?.brands} empty="Nu le-am găsit pe prima pagină. Le adaugi tu." /> },
    { k: "Produse în față", ready: auditDone, v: <Tags items={s?.products} empty="Nu am găsit produse pe prima pagină. Le adaugi tu." /> },
    { k: "Livrare, retur, plată", ready: polDone, v: <Tags items={s?.policyBits} tone="good" empty="Nu am găsit paginile de condiții." /> },
    { k: "Roboți AI", ready: auditDone, v: s && (s.blockedBots.length ? <Tags items={s.blockedBots.map((b) => `${b} blocat`)} tone="bad" /> : <Tags items={["Toți roboții AI importanți au acces"]} tone="good" />) },
  ];
  const ready = rows.filter((r) => r.ready).length;
  const pct = s?.done ? 1 : Math.min(0.95, (ready + Math.min(tick, 8) * 0.25) / (rows.length + 2));
  const problems = (s?.blockedBots.length ? 1 : 0) + (s && auditDone && !s.categories.length ? 1 : 0);
  const log = [
    { t: "Am găsit magazinul", ok: auditDone && !s?.error },
    { t: "Am preluat sigla", ok: auditDone && !!s?.logo },
    { t: "Am citit meniul și prima pagină", ok: auditDone && !s?.error },
    { t: "Am verificat robots.txt", ok: auditDone, warn: !!s?.blockedBots.length },
    { t: "Am citit livrarea, returul și plata", ok: polDone },
  ];
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <ProgressRing value={pct} />
        <div className="min-w-0">
          <div className="label">Pasul 2 din 8</div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{s?.done ? "Gata. Asta am aflat despre tine." : "Aflăm ce vinzi"}</h1>
          <p className="text-base text-muted" aria-live="polite">
            {s?.done ? (s.error ? "Site-ul nu ne-a lăsat să-l citim. Completezi tu profilul la pașii următori." : `Am citit câteva pagini publice${problems ? ` · ${problems === 1 ? "o problemă găsită" : `${problems} probleme găsite`}` : ""}.`) : STATUS[Math.min(tick, STATUS.length - 1)]}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <section className="order-2 min-w-0 self-start rounded-xl border border-border bg-bg p-4 sm:p-6 lg:order-1">
          <div className="label mb-3">Ce am citit</div>
          <ul className="space-y-2">
            {log.filter((l) => l.ok).map((l) => (
              <li key={l.t} className="ob-pop flex items-start gap-3 text-sm leading-5">
                <span aria-hidden className={cx("grid size-5 shrink-0 place-items-center rounded-full text-xs font-semibold", l.warn ? "bg-warn-bg text-warn" : "bg-good-bg text-good")}>{l.warn ? "!" : "✓"}</span>
                <span>{l.t}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">Doar câteva pagini publice, ca un vizitator. Fără catalog și fără acces la magazin.</p>
        </section>
        <section className="order-1 min-w-0 overflow-hidden rounded-xl border border-border bg-bg lg:order-2">
          <div className="flex items-center gap-3 border-b border-border px-4 py-4 sm:px-6">
            <StoreLogo key={s?.logo ?? "none"} src={s?.logo} name={s?.name ?? "M"} />
            <div className="min-w-0 flex-1"><div className="truncate text-base font-semibold">{s?.name ?? "…"}</div><div className="truncate text-xs text-muted">{s?.domain}</div></div>
            <Badge tone={s?.done ? "good" : "muted"}>{s?.done ? "Gata" : "Se completează"}</Badge>
          </div>
          <dl>
            {rows.map((r) => (
              <div key={r.k} className={cx("grid grid-cols-1 gap-2 border-t border-border px-4 py-3 first:border-0 sm:px-6 md:grid-cols-[160px_minmax(0,1fr)] md:gap-4", r.ready && "ob-flash")}>
                <dt className="text-sm font-medium leading-6 text-muted">{r.k}</dt>
                <dd className="min-w-0 text-sm leading-6 text-muted">{r.ready ? r.v : <Skeleton />}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      {(s?.done || late) && (
        <form action={action} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-bg p-4 sm:p-6">
          <p className="text-sm text-muted">{s?.done ? "La pasul următor confirmi cine ești. Poți corecta orice." : "Durează mai mult decât de obicei. Poți merge mai departe și completezi tu profilul."}</p>
          <SubmitButton pendingText="Salvăm…">Continuă</SubmitButton>
        </form>
      )}
    </div>
  );
}

function Tags({ items, empty, tone = "muted" }: { items?: string[]; empty?: string; tone?: "muted" | "good" | "bad" }) {
  if (!items?.length) return <span>{empty}</span>;
  return <span className="flex flex-wrap gap-2">{items.map((x) => <Badge key={x} tone={tone} className="ob-pop">{x}</Badge>)}</span>;
}

function Skeleton() {
  return <span aria-hidden className="flex flex-wrap gap-2">{[64, 88, 52].map((w) => <span key={w} style={{ width: w }} className="h-6 rounded-full border border-border bg-surface" />)}</span>;
}

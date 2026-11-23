"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { JobState } from "@/core/jobs";

type Note = { id: string; tone: "good" | "bad"; text: string };
const POLL_MS = 4000;
const time = () => new Date().toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
const UNIT: Partial<Record<JobState["kind"], string>> = { run_project: "întrebarea" };

/**
 * Ce se vede pentru o lucrare: progresul real și o estimare („întrebarea 12 din 30, ~3 min”), sau locul la coadă.
 * Estimarea vine din ritmul de până acum (secunde pe pas); fără pași terminați nu estimăm.
 */
export function jobDetail(j: Pick<JobState, "kind" | "status" | "progress" | "elapsedSec" | "ahead">) {
  if (j.status === "queued") return j.ahead ? `la coadă, după ${j.ahead} ${j.ahead === 1 ? "lucrare" : "lucrări"}` : "pornește acum";
  const p = j.progress;
  if (!p || !p.total) return null;
  const unit = UNIT[j.kind];
  const step = unit ? `${unit} ${Math.min(p.done + 1, p.total)} din ${p.total}` : `${p.done} din ${p.total}`;
  if (!p.done || !j.elapsedSec || p.done >= p.total) return step;
  const left = Math.round(((j.elapsedSec / p.done) * (p.total - p.done)) / 60);
  return `${step}, ${left < 1 ? "sub un minut" : `~${left} min`} rămase`;
}

/**
 * Urmărește lucrările din fundal ale magazinului (analiză, audit, sincronizare, raport, feed…) fără reîncărcarea paginii.
 * Pornește la deschiderea paginii și după orice formular trimis; cât timp ceva e la coadă sau în lucru, întreabă serverul
 * la 4 secunde și arată „În lucru”. Când o lucrare se termină, arată „Gata la HH:MM” sau eroarea și reîncarcă datele
 * paginii (router.refresh), așa că butoanele revin singure. Când nu e nimic în lucru, nu mai întreabă.
 */
export function JobWatcher() {
  const router = useRouter();
  const path = usePathname();
  const [active, setActive] = useState<JobState[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const known = useRef(new Map<string, JobState>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    let jobs: JobState[];
    try {
      const r = await fetch(`/api/panou/jobs?ids=${[...known.current.keys()].join(",")}`, { cache: "no-store" });
      if (!r.ok) return;
      jobs = (await r.json()).jobs;
    } catch {
      timer.current = setTimeout(check, POLL_MS * 2);
      return;
    }
    const now = jobs.filter((j) => j.status === "queued" || j.status === "running");
    const finished = jobs.filter((j) => known.current.has(j.id) && (j.status === "done" || j.status === "failed"));
    for (const j of finished) {
      known.current.delete(j.id);
      const n: Note = j.status === "done"
        ? { id: j.id, tone: "good", text: `${j.label}: gata la ${time()}.` }
        : { id: j.id, tone: "bad", text: `${j.label} nu a reușit${j.error ? `: ${j.error}` : "."}` };
      setNotes((x) => [...x.filter((y) => y.id !== n.id), n].slice(-3));
      setTimeout(() => setNotes((x) => x.filter((y) => y.id !== n.id)), n.tone === "good" ? 8000 : 20000);
    }
    for (const j of now) known.current.set(j.id, j);
    setActive(now);
    if (finished.length) router.refresh();
    if (now.length) timer.current = setTimeout(check, POLL_MS);
  }, [router]);

  // La deschiderea fiecărei pagini.
  useEffect(() => {
    check();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [path, check]);

  // După orice buton din formular: lucrarea ajunge la coadă în câteva sute de milisecunde.
  useEffect(() => {
    const onSubmit = () => setTimeout(check, 1500);
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, [check]);

  if (!active.length && !notes.length) return null;
  // O linie pe lucrare, cu progresul ei; lucrările de același fel fără detalii apar o singură dată.
  const lines = [...new Map(active.map((j) => { const d = jobDetail(j); return [d ? j.id : j.kind, d ? `${j.label}: ${d}` : j.label] as const; })).values()];
  return (
    <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2 text-sm">
      {lines.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-bg px-4 py-3 shadow-lg">
          <span aria-hidden className="mt-1 size-3 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>În lucru: {lines.length === 1 ? lines[0] : <ul className="space-y-1">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}</span>
        </div>
      )}
      {notes.map((n) => (
        <div key={n.id} role="status" className={`rounded-lg border border-border px-4 py-3 shadow-lg ${n.tone === "good" ? "bg-good-bg text-good" : "bg-bad-bg text-bad"}`}>{n.text}</div>
      ))}
    </div>
  );
}

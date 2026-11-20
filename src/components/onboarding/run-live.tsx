"use client";
import { useEffect, useRef, useState } from "react";
import { Badge, cx } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ProgressRing } from "./progress-ring";

type Row = { domain: string; name: string; visibility: number; avgPosition: number | null; me: boolean };
type Run = {
  expected: number; received: number; failed: number; done: boolean; board: Row[];
  stream: { provider: string; prompt: string; stores: string[]; me: boolean }[];
};
const AI: Record<string, string> = { chatgpt: "ChatGPT", gemini: "Gemini", claude: "Claude", perplexity: "Perplexity" };

/** Prima rulare, live: întreabă serverul la 2 secunde; clasamentul și răspunsurile apar pe măsură ce vin. */
export function RunLive({ action, store, trialAi, planAi }: { action: () => Promise<void>; store: string; trialAi: string; planAi: string }) {
  const [s, setS] = useState<Run | null>(null);
  const [late, setLate] = useState(false);
  const started = useRef(Date.now());
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch("/api/start/run", { cache: "no-store" });
        if (r.ok) { const j = (await r.json()) as Run; if (!stop) setS(j); if (j.done) return; }
      } catch { /* reîncercăm */ }
      if (Date.now() - started.current > 6 * 60_000) setLate(true);
      if (!stop) setTimeout(load, 2000);
    };
    load();
    return () => { stop = true; };
  }, []);

  const pct = s?.done ? 1 : s?.expected ? Math.min(0.97, s.received / s.expected) : 0.02;
  const max = Math.max(1, ...(s?.board ?? []).map((r) => r.visibility));
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <ProgressRing value={pct} />
        <div className="min-w-0">
          <div className="label">Pasul 7 din 8</div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{s?.done ? "Gata. Avem primele răspunsuri." : "Întrebăm AI-urile"}</h1>
          <p className="text-base text-muted" aria-live="polite">
            {s ? `${s.received} din ${s.expected} răspunsuri de la ${trialAi}${s.failed ? ` · ${s.failed} nu au răspuns` : ""}` : "Pornim…"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="min-w-0 rounded-xl border border-border bg-bg p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold">Cine e recomandat acum</h2>
            {!s?.done && <Badge tone="warn"><span aria-hidden className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />Live</Badge>}
          </div>
          {!s?.board.length || (s.board.length === 1 && s.board[0].me && !s.received) ? (
            <p className="text-sm text-muted">Clasamentul apare după primele răspunsuri.</p>
          ) : (
            <ol className="space-y-3">
              {s.board.map((r) => (
                <li key={r.domain + r.me} className="ob-pop grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
                  <span className={cx("truncate text-sm", r.me ? "font-semibold text-primary" : "font-medium")}>{r.me ? `${store} (tu)` : r.name}</span>
                  <span className="num text-sm font-medium">{r.visibility}%</span>
                  <span className="col-span-2 h-2 overflow-hidden rounded-full bg-surface">
                    <span className={cx("block h-full rounded-full transition-[width] duration-700", r.me ? "bg-primary" : "bg-muted")} style={{ width: `${Math.max(2, (r.visibility / max) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="min-w-0 rounded-xl border border-border bg-bg p-4 sm:p-6">
          <h2 className="mb-4 text-base font-semibold">Ultimele răspunsuri</h2>
          {!s?.stream.length ? (
            <p className="text-sm text-muted">Primele răspunsuri vin în câteva secunde.</p>
          ) : (
            <ul className="space-y-3">
              {s.stream.map((x, i) => (
                <li key={`${x.provider}-${x.prompt}-${i}`} className="ob-pop space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted">{AI[x.provider] ?? x.provider}</span>
                    <Badge tone={x.me ? "good" : "bad"}>{x.me ? "Te-a recomandat" : "Nu te-a recomandat"}</Badge>
                  </div>
                  <p className="text-sm font-medium">{x.prompt}</p>
                  {x.stores.length > 0 && <p className="truncate text-xs text-muted">A recomandat: {x.stores.join(", ")}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {(s?.done || late) && (
        <form action={action} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-bg p-4 sm:p-6">
          <p className="text-sm text-muted">{s?.done ? `Am pregătit rezultatul: locul tău, cine te întrece și ce mărci apar. Cu un plan întrebăm și ${planAi}.` : "Durează mai mult decât de obicei. Poți vedea ce a venit până acum."}</p>
          <SubmitButton pendingText="Pregătim…">Vezi rezultatul</SubmitButton>
        </form>
      )}
    </div>
  );
}

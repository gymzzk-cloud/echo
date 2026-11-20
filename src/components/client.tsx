"use client";
import { useState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { btn, cx } from "./ui";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

export function CopyButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" data-ui="button" onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }}
      className={btn("secondary", "sm")}>
      {ok ? "Copiat ✓" : "Copiază"}
    </button>
  );
}

export function ThemeToggle() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    let v: string | null = null;
    try { v = localStorage.getItem("theme"); } catch {}
    if (v) document.documentElement.dataset.theme = v;
    setT(v ?? "light"); // implicit luminos; întunecat doar la alegere
  }, []);
  const next = t === "dark" ? "light" : "dark";
  return (
    <button type="button" aria-label="Schimbă tema" className={btn("ghost", "sm")}
      onClick={() => { document.documentElement.dataset.theme = next; try { localStorage.setItem("theme", next); } catch {} setT(next); }}>
      <span aria-hidden>{t === "dark" ? "☀︎" : "☾"}</span><span className="hidden sm:inline">{t === "dark" ? "Luminos" : "Întunecat"}</span>
    </button>
  );
}

export type Series = { key: string; label: string; color: string };
export function TrendChart({ data, series, height = 260, unit = "%" }: { data: Record<string, string | number | null>[]; series: Series[]; height?: number; unit?: string }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="day" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} unit={unit} />
          <Tooltip contentStyle={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={i === 0 ? 2.5 : 1.5} dot={false} connectNulls isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Butonul de trimitere al unui formular cu server action (DESIGN §6.1): aceeași variantă ca butonul normal, cu starea „Se lucrează…”. */
export function SubmitButton({ children, pendingText = "Se lucrează…", variant = "primary", size = "md", className, name, value, formAction, disabled }: {
  children: React.ReactNode; pendingText?: string; variant?: "primary" | "secondary" | "danger" | "ghost" | "side"; size?: "sm" | "md" | "lg"; className?: string;
  name?: string; value?: string; formAction?: (f: FormData) => void | Promise<void>; disabled?: boolean;
}) {
  // useFormStatus din react-dom: arată starea pentru butoanele din formulare cu server actions
  const { pending } = useFormStatus();
  return (
    <button type="submit" data-ui="button" disabled={pending || disabled} name={name} value={value} formAction={formAction} className={cx(btn(variant, size), className)}>
      {pending ? pendingText : children}
    </button>
  );
}

/** Alegerea magazinului din meniul lateral: se schimbă direct la selectare, fără buton „OK”. */
export function ProjectSwitcher({ projects, current, action }: { projects: { id: string; name: string }[]; current: string; action: (f: FormData) => void | Promise<void> }) {
  return (
    <form action={action}>
      <label htmlFor="proj" className="sr-only">Magazin</label>
      <select id="proj" name="projectId" defaultValue={current} onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-11 w-full min-w-0 rounded-lg border border-side-active bg-side-active px-3 text-sm text-side-fg sm:h-10">
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <noscript><button type="submit">OK</button></noscript>
    </form>
  );
}

/** Bloc de cod cu buton de copiere în antet (același aspect peste tot: audit, roboți, vânzări). */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="mt-2 min-w-0 rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-xs text-muted"><span>{label}</span><CopyButton text={code} /></div>
      <pre className="max-h-56 overflow-auto p-3 font-mono text-xs">{code}</pre>
    </div>
  );
}

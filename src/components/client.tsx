"use client";
import { useState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

export function CopyButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }}
      className="rounded-md border border-border bg-bg px-2.5 py-1 text-xs font-medium hover:bg-surface">
      {ok ? "Copiat ✓" : "Copiază"}
    </button>
  );
}

export function ThemeToggle() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => { try { const v = localStorage.getItem("theme"); if (v) { document.documentElement.dataset.theme = v; setT(v); } } catch {} }, []);
  const next = t === "dark" ? "light" : "dark";
  return (
    <button type="button" aria-label="Schimbă tema" className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface"
      onClick={() => { document.documentElement.dataset.theme = next; try { localStorage.setItem("theme", next); } catch {} setT(next); }}>
      {t === "dark" ? "☀︎ Luminos" : "☾ Întunecat"}
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

export function SubmitButton({ children, pendingText = "Se lucrează…", className }: { children: React.ReactNode; pendingText?: string; className?: string }) {
  // useFormStatus din react-dom: arată starea pentru butoanele din formulare cu server actions
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className ?? "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-60"}>
      {pending ? pendingText : children}
    </button>
  );
}

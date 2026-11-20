/** Cercul de progres din scanare și din prima rulare (0–1). */
export function ProgressRing({ value, size = 72 }: { value: number; size?: number }) {
  const r = 30, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" role="img" aria-label={`${Math.round(v * 100)}%`} className="shrink-0">
      <circle cx="36" cy="36" r={r} fill="none" strokeWidth="6" className="stroke-border" />
      <circle cx="36" cy="36" r={r} fill="none" strokeWidth="6" strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-500"
        strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform="rotate(-90 36 36)" />
      <text x="36" y="41" textAnchor="middle" className="fill-fg font-display text-base font-semibold">{Math.round(v * 100)}%</text>
    </svg>
  );
}

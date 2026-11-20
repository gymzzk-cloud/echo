import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";

export const cx = clsx;

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx("rounded-xl border border-border bg-bg p-6", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title && <h2 className="label">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const tones = {
  good: "bg-good-bg text-good", warn: "bg-warn-bg text-warn", bad: "bg-bad-bg text-bad",
  muted: "bg-surface text-muted", primary: "bg-primary-bg text-primary",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Delta({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-xs text-muted">–</span>;
  const tone = value > 0 ? "text-good" : value < 0 ? "text-bad" : "text-muted";
  return <span className={cx("num text-sm font-medium", tone)}>{value > 0 ? `▲ +${value}` : value < 0 ? `▼ ${value}` : "= 0"}{suffix}</span>;
}

export function Stat({ label, value, delta, hint }: { label: string; value: ReactNode; delta?: number | null; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-bg p-6">
      <div className="label">{label}</div>
      <div className="num mt-2 text-3xl font-semibold">{value}</div>
      <div className="mt-1 flex items-center gap-2">{delta !== undefined && <Delta value={delta} />}{hint && <span className="text-xs text-muted">{hint}</span>}</div>
    </div>
  );
}

type BtnProps = { children: ReactNode; variant?: "primary" | "secondary" | "ghost"; className?: string; size?: "sm" | "md" };
export const btn = (variant: BtnProps["variant"] = "primary", size: BtnProps["size"] = "md") =>
  cx("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50",
    size === "sm" ? "px-3 py-1.5 text-xs" : "h-11 px-4 text-sm sm:h-10",
    variant === "primary" && "bg-primary text-primary-fg hover:opacity-90",
    variant === "secondary" && "border border-border bg-bg hover:bg-surface",
    variant === "ghost" && "text-muted hover:bg-surface hover:text-fg");

export function Button({ children, variant, size, className, ...rest }: BtnProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} className={cx(btn(variant, size), className)}>{children}</button>;
}
export function ButtonLink({ children, variant, size, className, href }: BtnProps & { href: string }) {
  return <Link prefetch={false} href={href} className={cx(btn(variant, size), className)}>{children}</Link>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-8 text-center">
      <div className="font-medium">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action, eyebrow }: { title: string; subtitle?: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="label mb-1">{eyebrow}</div>}
        <h1 className="text-3xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <thead><tr className="border-b border-border text-left">{head.map((h, i) => <th key={i} className="label whitespace-nowrap px-3 py-2">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className }: { children: ReactNode; className?: string }) => <td className={cx("border-b border-border px-3 py-2.5 align-top", className)}>{children}</td>;

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx("h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm placeholder:text-muted sm:h-10 focus:border-primary focus:outline-none", props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx("h-11 rounded-lg border border-border bg-bg px-3 text-sm focus:border-primary focus:outline-none sm:h-10", props.className)} />;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block h-5 truncate text-xs font-medium leading-5">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Butonul dintr-un rând cu câmpuri: rezervă locul etichetei, ca să stea la nivelul câmpurilor (DESIGN 6.2.4). Pe telefon ocupă toată lățimea. */
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col [&>*]:w-full md:[&>*]:w-auto">
      <span aria-hidden className="mb-1.5 hidden h-5 md:block" />
      {children}
    </div>
  );
}

export function Notice({ tone = "primary", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={cx("rounded-lg px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}

/** Bulinele „Recomandat de X din N AI”, ca în ilustrații. */
export function AiDots({ n, total, label = true, lang = "ro" }: { n: number; total: number; label?: boolean; lang?: "ro" | "hu" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex gap-1" aria-hidden>{Array.from({ length: total }, (_, i) => <span key={i} className={cx("h-3.5 w-3.5 rounded-[4px]", i < n ? "bg-primary" : "bg-border")} />)}</span>
      {label && <span className={cx("whitespace-nowrap text-sm font-medium", n ? "text-primary" : "text-muted")}>{lang === "hu" ? (n ? `${total} AI-ból ${n} ajánlja` : "Még egy AI sem ajánlja") : n ? `Recomandat de ${n} din ${total} AI` : "Nerecomandat încă de AI"}</span>}
    </span>
  );
}

/** Logo: pătrat verde cu inițiala, ca în ilustrații. */
export function Logo({ name, dark }: { name: string; dark?: boolean }) {
  return (
    <span className={cx("flex items-center gap-2 font-display text-lg font-semibold", dark ? "text-side-fg" : "text-fg")}>
      <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-base font-bold text-primary-fg">{name[0]}</span>{name}
    </span>
  );
}

export const impactTone = (i: string): Tone => (i === "mare" ? "bad" : i === "mediu" ? "warn" : "muted");
export const statusTone = (s: string): Tone => (s === "pass" ? "good" : s === "warn" ? "warn" : s === "fail" ? "bad" : "muted");
export const statusLabel = (s: string) => ({ pass: "OK", warn: "Atenție", fail: "Problemă", info: "Info" }[s] ?? s);

import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";

export const cx = clsx;

/** Card (DESIGN §5, §6.3): chenar 1 px, colțuri 12 px, 24 px înăuntru (16 px pe telefon). Titlul e text de 16 px, greutate 600. */
export function Card({ children, className, title, action, description }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; description?: ReactNode }) {
  return (
    <section className={cx("min-w-0 rounded-xl border border-border bg-bg p-4 sm:p-6", className)}>
      {(title || action) && (
        <div className={cx("flex items-center justify-between gap-4", description ? "mb-1" : "mb-4")}>
          {title && <h2 className="min-w-0 text-base font-semibold">{title}</h2>}
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      {description && <p className="mb-4 text-sm text-muted">{description}</p>}
      {children}
    </section>
  );
}

/** Card în card (DESIGN §5): ex. o acțiune din lista „3 lucruri”. Chenar 1 px, colțuri 8 px. */
export function SubCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("min-w-0 rounded-lg border border-border p-4", className)}>{children}</div>;
}

const tones = {
  good: "bg-good-bg text-good", warn: "bg-warn-bg text-warn", bad: "bg-bad-bg text-bad",
  muted: "bg-surface text-muted", primary: "bg-primary-bg text-primary",
} as const;
export type Tone = keyof typeof tones;

/** Insignă (DESIGN §6.5): o singură formă, mereu pe un rând (nu se rupe și nu se strânge). */
export function Badge({ tone = "muted", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span data-ui="badge" className={cx("inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-medium leading-none", tones[tone], className)}>{children}</span>;
}

/** Stare „în lucru” pentru o lucrare din fundal (CLAUDE.md: butonul care o pornește e înlocuit de asta). */
export function Working({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-start gap-1">
      <Badge tone="warn"><span aria-hidden className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />{children}</Badge>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function Delta({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-xs text-muted">–</span>;
  const tone = value > 0 ? "text-good" : value < 0 ? "text-bad" : "text-muted";
  return <span className={cx("num text-sm font-medium", tone)}>{value > 0 ? `▲ +${value}` : value < 0 ? `▼ ${value}` : "= 0"}{suffix}</span>;
}

export function Stat({ label, value, delta, hint }: { label: string; value: ReactNode; delta?: number | null; hint?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-bg p-4 sm:p-6">
      <div className="label">{label}</div>
      <div className="num font-display mt-2 text-3xl font-semibold">{value}</div>
      <div className="mt-1 flex items-center gap-2">{delta !== undefined && <Delta value={delta} />}{hint && <span className="text-xs text-muted">{hint}</span>}</div>
    </div>
  );
}

/** `side`: varianta „ghost” pentru meniul lateral închis la culoare. */
type Variant = "primary" | "secondary" | "danger" | "ghost" | "side";
type Size = "sm" | "md" | "lg";
type BtnProps = { children: ReactNode; variant?: Variant; className?: string; size?: Size };
/** Butoane (DESIGN §6.1): varianta după funcție, înălțimea după mărime (md = înălțimea unui câmp). */
export const btn = (variant: Variant = "primary", size: Size = "md") =>
  cx("inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors disabled:opacity-50",
    size === "sm" && "h-9 px-3 text-xs sm:h-8",
    size === "md" && "h-11 px-4 text-sm sm:h-10",
    size === "lg" && "h-12 px-6 text-base",
    variant === "primary" && "bg-primary text-primary-fg hover:opacity-90",
    variant === "secondary" && "border border-border bg-bg hover:bg-surface",
    variant === "danger" && "border border-border bg-bg text-bad hover:bg-bad-bg",
    variant === "ghost" && "text-muted hover:bg-surface hover:text-fg",
    variant === "side" && "text-side-muted hover:bg-side-active hover:text-side-fg");

export function Button({ children, variant, size, className, ...rest }: BtnProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} data-ui="button" className={cx(btn(variant, size), className)}>{children}</button>;
}
export function ButtonLink({ children, variant, size, className, href }: BtnProps & { href: string }) {
  return <Link prefetch={false} href={href} data-ui="button" className={cx(btn(variant, size), className)}>{children}</Link>;
}
/** Buton doar cu icon (DESIGN §6.1): `label` devine aria-label. */
export function IconButton({ label, children, className, ...rest }: { label: string; children: ReactNode; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} aria-label={label} title={label} className={cx("inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-fg disabled:opacity-50 sm:size-8", className)}>{children}</button>;
}
/** Doar navigare spre altă pagină, niciodată o acțiune (DESIGN §6.1). */
export function TextLink({ href, children, className, external }: { href: string; children: ReactNode; className?: string; external?: boolean }) {
  const cls = cx("text-sm font-medium text-primary hover:underline", className);
  return external ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a> : <Link prefetch={false} href={href} className={cls}>{children}</Link>;
}
/** Acțiunile unui rând: la capătul din dreapta, cu 8 px între ele (DESIGN §6.1, §6.4). */
export function RowActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex shrink-0 flex-wrap items-center justify-end gap-2", className)}>{children}</div>;
}
/** Rând de listă (DESIGN §6.4): numele și detaliile la stânga, insigna și acțiunile la dreapta. Pe telefon acțiunile trec dedesubt. */
export function ListRow({ children, end, className }: { children: ReactNode; end?: ReactNode; className?: string }) {
  return (
    <li className={cx("flex flex-col gap-2 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4", className)}>
      <div className="min-w-0 flex-1">{children}</div>
      {end && <RowActions className="justify-start sm:justify-end">{end}</RowActions>}
    </li>
  );
}

/** Cipuri de filtrare sau file (DESIGN §5: complet rotunjite, 1 px chenar). Doar navigare: fiecare cip e un link. */
export function Chips({ items, className }: { items: { href: string; label: ReactNode; active?: boolean; count?: number }[]; className?: string }) {
  return (
    <div className={cx("flex flex-wrap gap-2", className)}>
      {items.map((it) => (
        <Link key={it.href} href={it.href} prefetch={false} aria-current={it.active ? "true" : undefined}
          className={cx("inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-sm sm:h-8", it.active ? "border-primary bg-primary-bg font-medium text-primary" : "border-border bg-bg text-muted hover:bg-surface hover:text-fg")}>
          {it.label}{it.count !== undefined && <span className="num text-xs">{it.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center sm:p-8">
      <div className="font-medium">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action, eyebrow }: { title: string; subtitle?: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="label mb-1">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Table({ head, children, className }: { head: ReactNode[]; children: ReactNode; className?: string }) {
  return (
    <div className={cx("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <table className="w-full border-collapse text-sm">
        <thead><tr className="border-b border-border text-left">{head.map((h, i) => <th key={i} className="label whitespace-nowrap px-3 py-3 first:pl-0 last:pr-0">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className }: { children: ReactNode; className?: string }) => <td className={cx("border-b border-border px-3 py-3 align-top first:pl-0 last:pr-0 [tr:last-child_&]:border-0", className)}>{children}</td>;

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx("h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm placeholder:text-muted sm:h-10 focus:border-primary focus:outline-none", props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx("h-11 w-full min-w-0 rounded-lg border border-border bg-bg px-3 text-sm focus:border-primary focus:outline-none sm:h-10", props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx("block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm placeholder:text-muted focus:border-primary focus:outline-none", props.className)} />;
}
/** Încărcare de fișier care arată ca un câmp, cu butonul „Alege fișierul” înăuntru (DESIGN §6.2.9). */
export function FileInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="file" {...props} className={cx("block h-11 w-full min-w-0 rounded-lg border border-border bg-bg p-1 text-sm text-muted file:mr-3 file:h-full file:rounded file:border-0 file:bg-surface file:px-3 file:text-sm file:font-medium file:text-fg sm:h-10", props.className)} />;
}
/** Căsuță de bifat cu toată linia clicabilă (DESIGN §6.2.8). */
export function Checkbox({ label, hint, className, ...rest }: { label: ReactNode; hint?: ReactNode; className?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cx("flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm sm:min-h-10", className)}>
      <span className="flex h-5 shrink-0 items-center"><input type="checkbox" {...rest} className="size-4 accent-[var(--primary)]" /></span>
      <span className="min-w-0">{label}{hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}
/** Grup de căsuțe sau de opțiuni, cu titlu ca o etichetă (DESIGN §6.2.8). */
export function FieldGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cx("min-w-0", className)}>
      <legend className="mb-2 text-xs font-medium">{label}</legend>
      {children}
    </fieldset>
  );
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block h-5 truncate text-xs font-medium leading-5">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Butonul dintr-un rând cu câmpuri: rezervă locul etichetei, ca să stea la nivelul câmpurilor (DESIGN 6.2.4). Pe telefon ocupă toată lățimea. */
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col [&>*]:w-full md:[&>*]:w-auto">
      <span aria-hidden className="mb-2 hidden h-5 md:block" />
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
      <span className="flex gap-1" aria-hidden>{Array.from({ length: total }, (_, i) => <span key={i} className={cx("size-3 rounded", i < n ? "bg-primary" : "bg-border")} />)}</span>
      {label && <span className={cx("whitespace-nowrap text-sm font-medium", n ? "text-primary" : "text-muted")}>{lang === "hu" ? (n ? `${total} AI-ból ${n} ajánlja` : "Még egy AI sem ajánlja") : n ? `Recomandat de ${n} din ${total} AI` : "Nerecomandat încă de AI"}</span>}
    </span>
  );
}

/** Logo: pătrat verde cu inițiala, ca în ilustrații. */
export function Logo({ name, dark }: { name: string; dark?: boolean }) {
  return (
    <span className={cx("flex items-center gap-2 font-display text-lg font-semibold", dark ? "text-side-fg" : "text-fg")}>
      <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-primary text-base font-semibold text-primary-fg">{name[0]}</span>{name}
    </span>
  );
}

export const impactTone = (i: string): Tone => (i === "mare" ? "bad" : i === "mediu" ? "warn" : "muted");
export const statusTone = (s: string): Tone => (s === "pass" ? "good" : s === "warn" ? "warn" : s === "fail" ? "bad" : "muted");
export const statusLabel = (s: string) => ({ pass: "OK", warn: "Atenție", fail: "Problemă", info: "Info" }[s] ?? s);

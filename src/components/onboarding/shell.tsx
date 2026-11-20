import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { logout } from "@/app/actions";
import { SubmitButton, ThemeToggle } from "@/components/client";
import { Logo, cx } from "@/components/ui";
import { ONBOARDING_STEPS, STEP_META, stepIndex, type OnboardingStep } from "@/core/onboarding/types";

/**
 * Cadrul testului gratuit: antet simplu și pașii în stânga (sus pe telefon).
 * `reached` = cel mai departe pas atins; pașii până la el se pot redeschide, ca să corecteze clientul.
 */
export function StartShell({ current, reached, children, eyebrow }: { current: OnboardingStep | "start"; reached?: OnboardingStep; children: ReactNode; eyebrow?: string }) {
  const max = reached ? stepIndex(reached) : -1;
  const cur = current === "start" ? -1 : stepIndex(current);
  const locked = (i: number) => i > max || (reached && stepIndex(reached) >= stepIndex("run") && i < stepIndex("run"));
  return (
    <div className="min-h-screen bg-surface">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-bg px-4 py-3 sm:px-6 lg:px-8">
        <Link prefetch={false} href="/start"><Logo name={BRAND.name} /></Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={logout}><SubmitButton variant="ghost" size="sm" pendingText="Ieșim…">Ieșire</SubmitButton></form>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[208px_minmax(0,1fr)] lg:gap-8 lg:px-8 lg:pt-8">
        <nav aria-label="Pașii testului" className="min-w-0">
          <ol className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-8 lg:flex-col lg:overflow-visible">
            <StepItem n={1} label="Magazinul" href="/start" state={cur === -1 ? "on" : "done"} disabled={max >= 0} />
            {ONBOARDING_STEPS.map((s, i) => (
              <StepItem key={s} n={i + 2} label={STEP_META[s].label} href={STEP_META[s].path}
                state={i === cur ? "on" : i < max || (i === max && i !== cur) ? "done" : "todo"} disabled={!!locked(i) || i === cur} />
            ))}
          </ol>
        </nav>
        <main className="ob-in min-w-0 space-y-6">
          {eyebrow && <div className="label">{eyebrow}</div>}
          {children}
        </main>
      </div>
    </div>
  );
}

function StepItem({ n, label, href, state, disabled }: { n: number; label: string; href: string; state: "on" | "done" | "todo"; disabled: boolean }) {
  const inner = (
    <>
      <span className={cx("grid size-6 shrink-0 place-items-center rounded-full border text-xs font-medium",
        state === "on" && "border-primary bg-primary text-primary-fg", state === "done" && "border-transparent bg-primary-bg text-primary", state === "todo" && "border-border bg-bg text-muted")}>
        {state === "done" ? "✓" : n}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </>
  );
  const cls = cx("flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium", state === "on" ? "border border-border bg-bg text-fg" : "text-muted");
  return <li className="shrink-0">{disabled ? <span aria-current={state === "on" ? "step" : undefined} className={cls}>{inner}</span> : <Link prefetch={false} href={href} className={cx(cls, "hover:bg-bg hover:text-fg")}>{inner}</Link>}</li>;
}

/** Antetul unui pas: titlul mare, o propoziție și, opțional, ce e diferit. */
export function StepHeader({ n, title, children }: { n: number; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="label">Pasul {n} din 8</div>
      <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
      {children && <p className="max-w-2xl text-base text-muted">{children}</p>}
    </div>
  );
}

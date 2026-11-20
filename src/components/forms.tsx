"use client";
import { useActionState, type ReactNode } from "react";
import type { FormState } from "@/app/actions";

/** Formular cu stare: arată eroarea sau confirmarea întoarsă de acțiunea de pe server. */
export function ActionForm({ action, children, className }: { action: (s: FormState, f: FormData) => Promise<FormState>; children: ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <p role="alert" className="col-span-full mt-4 rounded-lg bg-bad-bg px-4 py-3 text-sm text-bad">{state.error}</p>}
      {state?.ok && <p role="status" className="col-span-full mt-4 rounded-lg bg-good-bg px-4 py-3 text-sm text-good">{state.ok}</p>}
    </form>
  );
}

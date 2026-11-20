import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { trialProject } from "@/core/onboarding";
import { STEP_META, type Onboarding } from "@/core/onboarding/types";
import { beginTrial } from "@/app/actions-start";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Badge, Input } from "@/components/ui";
import { StartShell } from "@/components/onboarding/shell";
import { DemoChat } from "@/components/onboarding/demo-chat";
import { AiCoverage } from "@/components/onboarding/ai-coverage";

export const metadata = { title: "Test gratuit" };

/** Primul ecran după cont: adresa magazinului. Dacă testul e deja pornit, clientul revine la pasul lui. */
export default async function Start() {
  const { org, projectIds } = await requireAuth();
  if (org.plan !== "trial" || projectIds) redirect("/panou");
  const p = await trialProject(org.id);
  if (p?.onboarding) redirect(STEP_META[(p.onboarding as Onboarding).step].path);
  return (
    <StartShell current="start">
      <section className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <div className="min-w-0 space-y-6">
          <Badge tone="primary">Test gratuit · fără card · 2 minute</Badge>
          <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">Când cineva întreabă AI-ul ce să cumpere, <span className="text-primary">apare magazinul tău?</span></h1>
          <p className="max-w-xl text-base text-muted">Scrie adresa. Întrebăm AI-urile ce ar căuta clienții tăi și îți arătăm cine e recomandat în locul tău.</p>
          <ActionForm action={beginTrial} className="max-w-xl">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input name="url" placeholder="magazinul-tau.ro" aria-label="Adresa magazinului" autoComplete="url" required className="sm:h-12 sm:text-base" />
              <SubmitButton pendingText="Pornim…" size="lg">Vezi ce știe AI-ul</SubmitButton>
            </div>
          </ActionForm>
          <AiCoverage />
          <p className="text-xs text-muted">Citim doar câteva pagini publice, ca un vizitator. Nu conectezi nimic și nu ne dai acces la magazin.</p>
        </div>
        <DemoChat store="Magazinul tău" />
      </section>
    </StartShell>
  );
}

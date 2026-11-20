import { startPage } from "@/lib/start";
import { saveIdentityAction } from "@/app/actions-start";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Field, Input, Notice } from "@/components/ui";
import { StartShell, StepHeader } from "@/components/onboarding/shell";
import { TagInput } from "@/components/onboarding/tag-input";
import { StoreLogo } from "@/components/onboarding/store-logo";

export const metadata = { title: "Identitate" };

/** Pasul 3: cine ești exact. Fără asta, o mențiune a unui site cu nume asemănător ar conta greșit ca a ta. */
export default async function Identity() {
  const { p } = await startPage("identity");
  const ob = p.onboarding;
  const site = `${p.domain}${p.pathPrefix}`;
  return (
    <StartShell current="identity" reached={ob.step}>
      <StepHeader n={3} title="Cum te recunosc AI-urile?">
        Numărăm doar mențiunile care sunt ale tale. Un site cu nume asemănător din altă țară nu trebuie să-ți strice cifrele.
      </StepHeader>
      <ActionForm action={saveIdentityAction} className="space-y-6">
        <Card title="Magazinul tău" description="Adresa principală și celelalte adrese ale tale. O recomandare pe oricare dintre ele contează pentru tine.">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3"><StoreLogo src={ob.logo} name={p.name} /><Badge tone="primary">{site}</Badge><span className="text-xs text-muted">adresa principală</span></div>
            <TagInput name="aliases" initial={ob.aliases} placeholder="Altă adresă a ta, ex.: magazin-vechi.ro" addLabel="Adaugă adresa" max={10} />
          </div>
        </Card>
        <Card title="Cum îți spun clienții" description="Variantele numelui, cum le scriu oamenii și AI-urile.">
          <TagInput name="names" initial={ob.names} placeholder="Ex.: Shop Expert" addLabel="Adaugă numele" max={6} />
        </Card>
        <Card title="Site-uri care nu sunt ale tale" description="Nume asemănătoare din alte țări sau alte firme. Nu le numărăm nici ca tine, nici ca concurenți.">
          <TagInput name="notMine" initial={ob.notMine} placeholder="Ex.: shopexpert.dk" addLabel="Adaugă site-ul" max={10} />
        </Card>
        <Card title="Firma" description="Opțional. Ne ajută să verificăm că datele de pe site sunt ale tale.">
          <div className="max-w-xs"><Field label="CUI"><Input name="cui" defaultValue={ob.cui ?? ""} placeholder="RO12345678" autoComplete="off" /></Field></div>
        </Card>
        <Notice>Poți reveni oricând la acest pas până pornești prima rulare.</Notice>
        <div className="flex justify-end"><SubmitButton pendingText="Salvăm…">Continuă</SubmitButton></div>
      </ActionForm>
    </StartShell>
  );
}

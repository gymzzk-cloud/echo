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
  // Exemplele pornesc de la adresa clientului: hardlineconstruct.ro → hardlineconstruct.hu, hardlineconstruct.dk.
  const base = p.domain.replace(/\.(co\.uk|com\.ro|[a-z]{2,})$/i, "");
  const tld = p.domain.slice(base.length);
  const others = (list: string[]) => list.map((t) => `${base}${t}`).filter((d) => !d.endsWith(tld) || tld === "");
  const mine = others([".ro", ".hu", ".com", ".eu"]);
  const lookalikes = others([".dk", ".de", ".pl"]);
  return (
    <StartShell current="identity" reached={ob.step}>
      <StepHeader n={3} title="Cum te recunosc AI-urile?">
        Când un AI recomandă un magazin, verificăm dacă ești tu. Spune-ne ce adrese și ce nume sunt ale tale, ca să nu numărăm greșit.
      </StepHeader>
      <ActionForm action={saveIdentityAction} className="space-y-6">
        <Card title="Adresele tale" description={`Ai și alte site-uri? De exemplu ${mine[0] ?? "o adresă veche"} pentru altă țară sau o adresă veche care duce tot la tine. Dacă un AI recomandă oricare dintre ele, o numărăm pentru tine.`}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3"><StoreLogo src={ob.logo} name={p.name} /><Badge tone="primary">{site}</Badge><span className="text-xs text-muted">adresa principală</span></div>
            <TagInput name="aliases" initial={ob.aliases} placeholder="Scrie altă adresă a magazinului tău" addLabel="Adaugă adresa" max={10} suggestions={mine} />
          </div>
        </Card>
        <Card title="Numele magazinului" description={`Cum îți scriu numele clienții și AI-urile. De exemplu ${p.name}, cu spațiu sau prescurtat. Le căutăm pe toate în răspunsuri.`}>
          <TagInput name="names" initial={ob.names} placeholder="Scrie altă variantă a numelui" addLabel="Adaugă numele" max={6} />
        </Card>
        <Card title="Site-uri cu nume asemănător care NU sunt ale tale" description={`Uneori există o firmă cu aproape același nume în altă țară, de exemplu ${lookalikes[0]}. Dacă un AI o recomandă, nu e o recomandare pentru tine. Scrie-le aici și le scoatem din cifre (nu apar nici ca tine, nici ca concurenți).`}>
          <TagInput name="notMine" initial={ob.notMine} placeholder="Scrie adresa site-ului care nu e al tău" addLabel="Adaugă site-ul" max={10} suggestions={lookalikes} />
        </Card>
        <Card title="Firma (opțional)" description="Codul fiscal ne ajută să deosebim firma ta de altele cu nume asemănător.">
          <div className="max-w-xs"><Field label="CUI"><Input name="cui" defaultValue={ob.cui ?? ""} placeholder="Codul fiscal al firmei" autoComplete="off" /></Field></div>
        </Card>
        <Notice>Poți reveni oricând la acest pas până pornești prima rulare.</Notice>
        <div className="flex justify-end"><SubmitButton pendingText="Salvăm…">Continuă</SubmitButton></div>
      </ActionForm>
    </StartShell>
  );
}

import { startPage } from "@/lib/start";
import { saveProfileAction } from "@/app/actions-start";
import { scanStatus, trialCompetitors } from "@/core/onboarding";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Notice } from "@/components/ui";
import { StartShell, StepHeader } from "@/components/onboarding/shell";
import { TagInput } from "@/components/onboarding/tag-input";

export const metadata = { title: "Profil" };

/** Pasul 4: ce vinzi. Pornește de la ce am citit pe prima pagină; clientul corectează și completează. */
export default async function Profile() {
  const { org, p } = await startPage("profile");
  const ob = p.onboarding;
  const [scan, rivals] = await Promise.all([scanStatus(org.id, p.id), trialCompetitors(org.id, p.id)]);
  return (
    <StartShell current="profile" reached={ob.step}>
      <StepHeader n={4} title="Ce vinzi?">
        Din asta scriem întrebările, cum le pune un client care vrea să cumpere. Am completat ce am găsit pe site. Corectează și adaugă.
      </StepHeader>
      <ActionForm action={saveProfileAction} className="space-y-6">
        <Card title="Categorii de produse" description="Ce cauți tu să vinzi cel mai mult. Cel puțin una.">
          <TagInput name="categories" initial={ob.categories} placeholder="Scrie o categorie de produse pe care o vinzi" addLabel="Adaugă categoria" max={10} />
        </Card>
        <Card title="Mărci" description="Mărcile importante pentru tine. Vedem dacă AI-urile le asociază cu magazinul tău.">
          <TagInput name="brands" initial={ob.brands} placeholder="Scrie numele unei mărci pe care o vinzi" addLabel="Adaugă marca" max={10} />
        </Card>
        <Card title="Produse importante" description="Produsele care aduc vânzări. Le folosim exact cum le caută oamenii.">
          <TagInput name="products" initial={ob.products} placeholder="Scrie numele unui produs important" addLabel="Adaugă produsul" max={10} />
        </Card>
        <Card title="De ce să cumpere de la tine" description="Le-am citit automat din paginile de livrare, retur și plată. Se actualizează singure.">
          {scan.policyBits.length
            ? <div className="flex flex-wrap gap-2">{scan.policyBits.map((b) => <Badge key={b} tone="good">{b}</Badge>)}</div>
            : <p className="text-sm text-muted">Nu am găsit încă paginile de condiții. Le căutăm din nou după ce alegi un plan.</p>}
        </Card>
        <Card title="Concurenți" description="Cu cine te comparăm. Scrie-i pe cei pe care îi știi: numele magazinului sau adresa site-ului.">
          <div className="space-y-4">
            <TagInput name="competitors" initial={rivals} placeholder="Scrie numele concurentului sau adresa site-ului lui" addLabel="Adaugă concurentul" max={10} />
            <Notice>După prima rulare îi găsim și noi pe cei pe care AI-urile îi recomandă în locul tău, iar tu alegi dacă îi păstrezi.</Notice>
          </div>
        </Card>
        <div className="flex justify-end"><SubmitButton pendingText="Salvăm…">Continuă</SubmitButton></div>
      </ActionForm>
    </StartShell>
  );
}

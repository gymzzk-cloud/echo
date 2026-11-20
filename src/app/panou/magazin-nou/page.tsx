import { requireAuth } from "@/lib/auth";
import { addProject } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";

export default async function NewStore() {
  await requireAuth();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Adaugă un magazin" subtitle="Fiecare magazin are propriile întrebări, concurenți și rapoarte. Merge și pentru subfoldere, de exemplu magazin.com/hu." />
      <Card>
        <ActionForm action={addProject} className="space-y-4">
          <Field label="Numele magazinului"><Input name="storeName" required placeholder="Magazinul meu" /></Field>
          <Field label="Adresa" hint="Poate include subfolderul de țară: shopexpert.com/hu"><Input name="storeUrl" required placeholder="magazinul-meu.ro" /></Field>
          <Field label="Țara"><Select name="country" defaultValue="RO" className="w-full"><option value="RO">România (lei)</option><option value="HU">Ungaria (forint)</option></Select></Field>
          <Button className="w-full">Adaugă și pornește analiza</Button>
        </ActionForm>
      </Card>
    </div>
  );
}

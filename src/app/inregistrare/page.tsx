import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Card, Field, Input, Select } from "@/components/ui";
import { register } from "@/app/actions";

export const metadata = { title: "Creează cont" };

export default function Register() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-md px-4 py-12">
        <Card>
          <h1 className="text-xl font-semibold">Conectează-ți magazinul</h1>
          <p className="mb-6 mt-1 text-sm text-muted">14 zile gratuit. Detectăm automat platforma și pornim prima analiză în câteva minute.</p>
          <ActionForm action={register} className="space-y-4">
            <Field label="Numele tău"><Input name="name" autoComplete="name" required /></Field>
            <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
            <Field label="Parolă" hint="Cel puțin 10 caractere."><Input name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
            <Field label="Numele magazinului"><Input name="storeName" required /></Field>
            <Field label="Adresa magazinului" hint="Dacă magazinul e pe subfolder (ex. site.com/ro), scrie adresa completă."><Input name="storeUrl" placeholder="magazinul-tau.ro" required /></Field>
            <Field label="Țara"><Select name="country" defaultValue="RO" className="w-full"><option value="RO">România</option><option value="HU">Ungaria</option></Select></Field>
            <SubmitButton pendingText="Creez contul…" className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg disabled:opacity-60">Creează contul</SubmitButton>
          </ActionForm>
          <p className="mt-4 text-center text-sm text-muted">Ai deja cont? <Link href="/login" className="text-primary hover:underline">Intră</Link></p>
        </Card>
      </main>
    </>
  );
}

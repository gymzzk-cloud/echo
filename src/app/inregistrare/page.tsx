import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Card, Field, Input } from "@/components/ui";
import { register } from "@/app/actions";

export const metadata = { title: "Creează cont" };

export default function Register() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-md px-4 py-12">
        <Card>
          <h1 className="text-xl font-semibold">Vezi ce spun AI-urile despre magazinul tău</h1>
          <p className="mb-6 mt-1 text-sm text-muted">Test gratuit, fără card. După cont, scrii adresa magazinului și în câteva minute vezi cine e recomandat în locul tău.</p>
          <ActionForm action={register} className="space-y-4">
            <Field label="Numele tău"><Input name="name" autoComplete="name" required /></Field>
            <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
            <Field label="Parolă" hint="Cel puțin 10 caractere."><Input name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
            <SubmitButton pendingText="Creez contul…" className="w-full">Începe testul gratuit</SubmitButton>
          </ActionForm>
          <p className="mt-4 text-center text-sm text-muted">Ai deja cont? <Link href="/login" className="text-primary hover:underline">Intră</Link></p>
        </Card>
      </main>
    </>
  );
}

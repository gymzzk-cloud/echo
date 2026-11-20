import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Card, Field, Input } from "@/components/ui";
import { login } from "@/app/actions";

export const metadata = { title: "Intră în cont" };

export default function Login() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-sm px-4 py-16">
        <Card>
          <h1 className="mb-6 text-xl font-semibold">Intră în cont</h1>
          <ActionForm action={login} className="space-y-4">
            <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
            <Field label="Parolă"><Input name="password" type="password" autoComplete="current-password" required /></Field>
            <Field label="Cod de verificare" hint="Doar dacă ai activat verificarea în doi pași."><Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" /></Field>
            <SubmitButton className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg disabled:opacity-60">Intră</SubmitButton>
          </ActionForm>
          <p className="mt-4 text-center text-sm text-muted">Nu ai cont? <Link href="/inregistrare" className="text-primary hover:underline">Creează unul</Link></p>
        </Card>
      </main>
    </>
  );
}

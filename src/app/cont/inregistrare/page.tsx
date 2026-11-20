import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Card, Field, Input } from "@/components/ui";
import { registerBuyer } from "@/app/actions-cont";

export const metadata = { title: "Cont gratuit pentru cumpărători" };

export default async function BuyerRegister({ searchParams }: { searchParams: Promise<{ productId?: string; next?: string }> }) {
  const { productId = "", next = "/cont" } = await searchParams;
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-sm px-4 py-16">
        <Card>
          <h1 className="text-xl font-semibold">Cont gratuit</h1>
          <p className="mb-6 mt-1 text-sm text-muted">Urmărești produse, primești alertă când scade prețul sau revin în stoc și îți faci liste. Fără reclame, fără date vândute.</p>
          <ActionForm action={registerBuyer} className="space-y-4">
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="next" value={next} />
            <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
            <Field label="Parolă" hint="Cel puțin 10 caractere."><Input name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
            <Field label="Limba"><select name="locale" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"><option value="ro">Română</option><option value="hu">Magyar</option></select></Field>
            <SubmitButton className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg disabled:opacity-60">Creează contul</SubmitButton>
          </ActionForm>
          <p className="mt-4 text-center text-sm text-muted">Ai deja cont? <Link href="/login" className="text-primary hover:underline">Intră</Link></p>
          <p className="mt-2 text-center text-xs text-muted">Ai un magazin? <Link href="/inregistrare" className="underline">Cont pentru magazine</Link></p>
        </Card>
      </main>
    </>
  );
}

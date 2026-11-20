import { PublicHeader } from "@/components/public-header";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Card, Field, Input, Notice } from "@/components/ui";
import { reviewByToken } from "@/core/trust";
import { submitReview } from "@/app/actions-trust";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recenzie", robots: { index: false } };

export default async function ReviewForm({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await reviewByToken(token);
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-md px-4 py-16">
        {!row ? <Notice tone="warn">Linkul nu este valid.</Notice> : row.r.submittedAt ? <Notice tone="good">Ai trimis deja recenzia. Mulțumim!</Notice> : (
          <Card>
            <h1 className="text-xl font-semibold">Cum a fost comanda de la {row.p.name}?</h1>
            <p className="mb-5 mt-1 text-sm text-muted">Recenzia apare public pe profilul magazinului, cu mențiunea „comandă verificată”. Magazinul nu o poate șterge.</p>
            <ActionForm action={submitReview} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <fieldset><legend className="mb-2 text-sm font-medium">Nota</legend>
                <div className="flex gap-3">{[1, 2, 3, 4, 5].map((n) => <label key={n} className="flex items-center gap-1 text-sm"><input type="radio" name="rating" value={n} required /> {n}★</label>)}</div>
              </fieldset>
              <Field label="Ce ai vrea să știe alți cumpărători?"><textarea name="text" rows={4} maxLength={2000} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm" /></Field>
              <Field label="Numele afișat (opțional)"><Input name="authorName" maxLength={60} /></Field>
              <SubmitButton className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg">Trimite</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </main>
    </>
  );
}

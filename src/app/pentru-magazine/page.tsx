import { PublicFooter, PublicHeader } from "@/components/public-header";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Card, Input } from "@/components/ui";
import { startAudit } from "@/app/actions";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Pentru magazine: audit gratuit de vizibilitate AI" };

const FEATURES = [
  ["Te recomandă AI-urile?", "Vezi zilnic dacă ChatGPT, Gemini, Perplexity și Claude te recomandă, pe ce loc și față de ce concurenți."],
  ["Ce produse și la ce preț", "Ce produse recomandă AI-ul și când spune un preț greșit despre tine."],
  ["Unde lipsești", "Site-urile pe care AI-urile le citesc și unde apar concurenții, dar tu nu."],
  ["Reparare dintr-un click", "Roboți blocați, date de produs lipsă, llms.txt: generăm exact ce trebuie pus pe site."],
  ["Raport și alerte", "Raport săptămânal pe email și alertă imediată când ieși din recomandări."],
  ["Clienți noi din căutarea noastră", "Cumpărătorii care caută la noi ajung direct la produsele tale, cu prețul verificat."],
];

export default function ForStores() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <section className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-semibold sm:text-4xl">Te recomandă ChatGPT când clienții întreabă de produsele tale?</h1>
          <p className="mt-4 text-base text-muted">{BRAND.tagline} Audit gratuit în 2 minute, fără cont.</p>
          <ActionForm action={startAudit} className="mt-8 text-left">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input name="url" required placeholder="magazinul-tau.ro" aria-label="Adresa magazinului" className="text-base" />
              <SubmitButton pendingText="Verific… (până la 1 minut)" className="shrink-0 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-60">Verifică gratuit</SubmitButton>
            </div>
            <Input name="email" type="email" placeholder="Email (opțional, îți trimitem raportul)" aria-label="Email" className="mt-2" />
            <label className="mt-2 flex items-start gap-2 text-xs text-muted"><input type="checkbox" name="consent" className="mt-0.5" /> Vreau să primesc și sfaturi ocazionale despre vizibilitatea în AI. Mă pot dezabona oricând.</label>
            <p className="mt-2 text-xs text-muted">Păstrăm rezultatul auditului (date publice de pe site-ul magazinului) ca să nu verificăm din nou totul de fiecare dată.</p>
          </ActionForm>
        </section>
        <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([t, d]) => (
            <Card key={t}><h2 className="font-semibold">{t}</h2><p className="mt-2 text-sm text-muted">{d}</p></Card>
          ))}
        </section>
        <section className="mt-12 text-center">
          <a href="/inregistrare" className="inline-flex rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-fg hover:opacity-90">Creează cont: 14 zile gratuit</a>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}

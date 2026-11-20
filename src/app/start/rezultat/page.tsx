import { startPage } from "@/lib/start";
import { addRivalAction, trialCheckout } from "@/app/actions-start";
import { teaserData } from "@/core/onboarding";
import { billingEnabled, PLANS } from "@/core/billing";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Notice, Stat, cx } from "@/components/ui";
import { StartShell, StepHeader } from "@/components/onboarding/shell";

export const metadata = { title: "Rezultat" };

const AI: Record<string, string> = { chatgpt: "ChatGPT", gemini: "Gemini" };

/** Pasul 8: o gustare din rezultat. Cifrele mari sunt reale; detaliile se deschid doar cu un plan (nu pleacă spre pagină). */
export default async function Result({ searchParams }: { searchParams: Promise<{ eroare?: string }> }) {
  const { org, p } = await startPage("result");
  const [t, { eroare }] = await Promise.all([teaserData(org.id, p.id), searchParams]);
  const pay = billingEnabled();
  const max = Math.max(1, ...t.table.map((r) => r.visibility));
  return (
    <StartShell current="result" reached={p.onboarding.step}>
      <StepHeader n={8} title={t.visibility ? `AI-urile te recomandă în ${t.visibility}% din răspunsuri` : "AI-urile nu te recomandă încă"}>
        Am pus {t.prompts} întrebări pe {t.providers.map((x) => AI[x] ?? x).join(" și ") || "ChatGPT și Gemini"} și am primit {t.answers} răspunsuri. Iată unde ești față de magazinele recomandate.
      </StepHeader>
      {eroare && <Notice tone="bad">{eroare}</Notice>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Vizibilitate" value={`${t.visibility}%`} hint={`din ${t.answers} răspunsuri`} />
        <Stat label="Locul tău" value={t.rank ? `#${t.rank}` : "–"} hint={`din ${t.storesSeen} magazine văzute`} />
        <Stat label="Întrebări fără tine" value={`${t.missingPrompts}`} hint={`din ${t.prompts}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Cine e recomandat în locul tău" description="Primele magazine, după câte răspunsuri le numesc.">
          <ol className="space-y-3">
            {t.table.map((r, i) => (
              <li key={r.domain + r.me} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
                <span className="num text-sm text-muted">{r.me ? `#${t.rank}` : i + 1}</span>
                <span className={cx("truncate text-sm", r.me ? "font-semibold text-primary" : "font-medium")}>{r.me ? `${p.name} (tu)` : r.name}</span>
                <span className="num text-sm font-medium">{r.visibility}%</span>
                <span className="col-start-2 col-end-4 h-2 overflow-hidden rounded-full bg-surface">
                  <span className={cx("ob-grow block h-full rounded-full", r.me ? "bg-primary" : "bg-muted")} style={{ width: `${Math.max(2, (r.visibility / max) * 100)}%` }} />
                </span>
              </li>
            ))}
          </ol>
        </Card>
        <div className="space-y-6">
          <Card title="Concurenți noi găsiți de AI" description="Magazine recomandate des pe care nu le-ai trecut. Le adaugi cu un clic.">
            {t.newRivals.length ? (
              <ul className="space-y-2">
                {t.newRivals.map((r) => (
                  <li key={r.domain} className="flex items-center justify-between gap-4">
                    <span className="min-w-0 truncate text-sm font-medium">{r.name} <span className="text-muted">· {r.domain}</span></span>
                    <form action={addRivalAction}><input type="hidden" name="domain" value={r.domain} /><SubmitButton size="sm" variant="secondary" pendingText="Adăugăm…">Adaugă</SubmitButton></form>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">Nu am găsit alți concurenți decât cei trecuți de tine.</p>}
          </Card>
          <Card title="Mărcile tale în răspunsuri">
            {t.brands.length
              ? <div className="flex flex-wrap gap-2">{t.brands.map((b) => <Badge key={b.brand} tone="primary">{b.brand} · {b.visibility}%</Badge>)}</div>
              : <p className="text-sm text-muted">Mărcile din profil nu apar încă în răspunsuri.</p>}
          </Card>
        </div>
      </div>

      <section className="space-y-4">
        <div className="label">Se deschid cu un plan</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Locked title="Ce răspunde fiecare AI" text={`Răspunsul complet la toate cele ${t.prompts} întrebări, cu locul tău în fiecare.`} />
          <Locked title={t.problems ? `${t.problems} lucruri de reparat pe site` : "Ce să repari pe site"} text="De ce nu te recomandă și pașii exacți, în ordinea efectului." />
          <Locked title="Sursele citate de AI" text="Site-urile și paginile pe care se bazează răspunsurile." />
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Alege un plan și vezi tot</h2>
          <p className="text-sm text-muted">Urmărim tot catalogul, toate AI-urile, în fiecare săptămână. Anulezi oricând.</p>
        </div>
        {!pay && <Notice tone="warn">Plata online se activează în curând. Până atunci, scrie-ne și îți deschidem contul.</Notice>}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PLANS.map((pl, i) => (
            <form key={pl.id} action={trialCheckout} className={cx("flex flex-col gap-4 rounded-xl border bg-bg p-4 sm:p-6", i === 0 ? "border-primary" : "border-border")}>
              <input type="hidden" name="plan" value={pl.id} />
              <div className="flex items-center justify-between gap-2"><h3 className="text-base font-semibold">{pl.name}</h3>{i === 0 && <Badge tone="primary">Recomandat</Badge>}</div>
              <div className="font-display text-2xl font-semibold">{pl.price}</div>
              <ul className="flex-1 space-y-2 text-sm text-muted">{pl.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
              <SubmitButton variant={i === 0 ? "primary" : "secondary"} pendingText="Deschidem plata…" disabled={!pay} className="w-full">Alege {pl.name}</SubmitButton>
            </form>
          ))}
        </div>
      </section>
    </StartShell>
  );
}

/** Secțiune blocată: conținut de umplutură estompat (nu datele reale, care nu pleacă spre pagină) și lacătul. */
function Locked({ title, text }: { title: string; text: string }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-border bg-bg p-4 sm:p-6">
      <div aria-hidden className="pointer-events-none mb-16 select-none space-y-2 blur-[2px]">
        {[90, 70, 80].map((w) => <div key={w} className="h-3 rounded-full bg-muted opacity-30" style={{ width: `${w}%` }} />)}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4 sm:p-6">
        <span className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden>🔒</span>{title}</span>
        <span className="text-xs text-muted">{text}</span>
      </div>
    </div>
  );
}

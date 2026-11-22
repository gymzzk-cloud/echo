import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Badge, ButtonLink, Card, Checkbox, cx, Field, FormActions, Input, TextLink } from "@/components/ui";
import { startAudit } from "@/app/actions";
import { PLANS } from "@/core/billing";
import { legal } from "@/lib/legal";
import { getStorePageText } from "@/lib/i18n-stores";

/** Testul gratuit pornește din înregistrare; după cont, panoul duce direct la /start. */
const TRIAL_HREF = "/inregistrare";

export async function generateMetadata(): Promise<Metadata> {
  const { s } = await getStorePageText();
  return { title: s.metaTitle, description: s.metaDesc };
}

const Section = ({ id, title, sub, children }: { id?: string; title: string; sub?: string; children: React.ReactNode }) => (
  <section id={id} className="mt-16 scroll-mt-16">
    <h2 className="text-2xl font-semibold">{title}</h2>
    {sub && <p className="mt-2 max-w-2xl text-base text-muted">{sub}</p>}
    <div className="mt-6">{children}</div>
  </section>
);

/** Pagina de prezentare pentru magazine: ce face Echo, cum, cât costă, întrebări și încredere. Fără date din baza de date. */
export default async function ForStores() {
  const { s } = await getStorePageText();
  const l = legal();
  const company = [l.company, l.companyId, l.address].filter(Boolean).join(", ");

  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Mesajul principal */}
        <section className="mx-auto max-w-3xl text-center">
          <p className="label">{s.eyebrow}</p>
          <h1 className="mt-4 text-3xl font-semibold sm:text-5xl">{s.h1}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted">{s.sub}</p>
          <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
            <ButtonLink href={TRIAL_HREF} size="lg">{s.ctaTrial}</ButtonLink>
            <ButtonLink href="#preturi" variant="secondary" size="lg">{s.ctaPrices}</ButtonLink>
          </div>
          <p className="mt-4 text-xs text-muted">{s.ctaNote}</p>
        </section>

        {/* Captură reală din panou, câte una pentru fiecare temă */}
        <figure className="mt-12">
          <div className="overflow-hidden rounded-xl border border-border bg-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/panou-concurenti-luminos.webp" width={1200} height={637} alt={s.shotAlt} className="only-light h-auto w-full" fetchPriority="high" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/img/panou-concurenti-intunecat.webp" width={1200} height={637} alt={s.shotAlt} className="only-dark h-auto w-full" loading="lazy" />
          </div>
          <figcaption className="mt-2 text-center text-xs text-muted">{s.shotCaption}</figcaption>
        </figure>

        <Section title={s.stepsTitle}>
          <ol className="grid gap-6 md:grid-cols-3">
            {s.steps.map((st, i) => (
              <li key={st.t}>
                <Card className="h-full">
                  <span className="num flex size-8 items-center justify-center rounded-full bg-primary-bg text-sm font-semibold text-primary">{i + 1}</span>
                  <h3 className="mt-4 text-base font-semibold">{st.t}</h3>
                  <p className="mt-2 text-sm text-muted">{st.d}</p>
                </Card>
              </li>
            ))}
          </ol>
        </Section>

        <Section title={s.featuresTitle}>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {s.features.map((f) => (
              <Card key={f.t} className="h-full"><h3 className="text-base font-semibold">{f.t}</h3><p className="mt-2 text-sm text-muted">{f.d}</p></Card>
            ))}
          </div>
        </Section>

        <Section id="preturi" title={s.pricingTitle} sub={s.pricingSub}>
          <div className="grid gap-6 md:grid-cols-3">
            {PLANS.map((p) => {
              const txt = s.plans[p.id];
              const featured = p.id === "pro";
              return (
                <section key={p.id} className={cx("flex min-w-0 flex-col rounded-xl bg-bg p-4 sm:p-6", featured ? "border-2 border-primary" : "border border-border")}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">{p.name}</h3>
                    {featured && <Badge tone="primary">{s.popular}</Badge>}
                  </div>
                  <p className="mt-2 text-sm text-muted">{txt.tagline}</p>
                  <p className="mt-4"><span className="num font-display text-3xl font-semibold">{p.lei}</span> <span className="text-sm text-muted">{s.currency} {s.perMonth}</span></p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm">
                    {txt.features.map((f) => <li key={f} className="flex gap-2"><span aria-hidden className="text-good">✓</span><span>{f}</span></li>)}
                  </ul>
                  <ButtonLink href={TRIAL_HREF} variant={featured ? "primary" : "secondary"} className="mt-6 w-full">{s.choose}</ButtonLink>
                </section>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted">{s.pricingNote}</p>
        </Section>

        <Section id="audit" title={s.auditTitle} sub={s.auditSub}>
          <Card>
            <ActionForm action={startAudit}>
              <div className="grid items-start gap-4 md:grid-cols-[1fr_1fr_auto]">
                <Field label={s.auditUrl}><Input name="url" required placeholder="magazinul-tau.ro" /></Field>
                <Field label={s.auditEmail}><Input name="email" type="email" autoComplete="email" /></Field>
                <FormActions><SubmitButton pendingText={s.auditPending}>{s.auditButton}</SubmitButton></FormActions>
              </div>
              <Checkbox name="consent" label={s.auditConsent} className="mt-2" />
              <p className="mt-2 text-xs text-muted">{s.auditNote}</p>
            </ActionForm>
          </Card>
        </Section>

        <Section title={s.trustTitle}>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {s.trust.map((t) => (
              <Card key={t.t} className="h-full"><h3 className="text-base font-semibold">{t.t}</h3><p className="mt-2 text-sm text-muted">{t.d}</p></Card>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            {company && <>{s.operatedBy} {company}. </>}
            <TextLink href="/confidentialitate">{s.privacyLink}</TextLink>
          </p>
        </Section>

        <Section title={s.faqTitle}>
          <Card>
            <div className="divide-y divide-border">
              {s.faq.map((f) => (
                <details key={f.q} className="group py-3 first:pt-0 last:pb-0">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-base font-medium sm:min-h-10">
                    {f.q}<span aria-hidden className="shrink-0 text-muted transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 max-w-3xl text-sm text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </Card>
        </Section>

        <section className="mt-16 rounded-xl border border-border bg-bg p-6 text-center sm:p-12">
          <h2 className="text-2xl font-semibold">{s.finalTitle}</h2>
          <p className="mt-2 text-base text-muted">{s.finalSub}</p>
          <ButtonLink href={TRIAL_HREF} size="lg" className="mt-6">{s.ctaTrial}</ButtonLink>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}

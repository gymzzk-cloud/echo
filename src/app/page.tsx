import Link from "next/link";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { BRAND } from "@/lib/brand";
import { getT } from "@/lib/i18n";

const EXAMPLES = {
  ro: ["aspirator robot sub 1500 lei pentru păr de câine", "cea mai bună bormașină cu acumulator pentru acasă", "adeziv flexibil pentru gresie exterior", "laptop pentru facultate sub 3000 lei", "hrană pentru pisici sterilizate", "cadou pentru un pasionat de grădinărit"],
  hu: ["robotporszívó kutyaszőrre 150000 Ft alatt", "legjobb akkus fúrógép otthonra", "flexibilis csemperagasztó kültérre", "laptop egyetemre 300000 Ft alatt", "macskaeledel ivartalanított macskáknak", "ajándék kertészkedőknek"],
};

export const dynamic = "force-dynamic";

export default async function Home() {
  const { t, lang } = await getT();
  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-3xl font-semibold sm:text-5xl">{t("home.h1a")}<br />{t("home.h1b")}</h1>
        <p className="mt-4 max-w-xl text-base text-muted">{BRAND.name} {t("home.sub")}</p>
        <form action="/cauta" className="mt-8 w-full">
          <label htmlFor="q" className="sr-only">{t("home.placeholder")}</label>
          <div className="flex w-full items-center gap-2 rounded-2xl border border-border bg-bg p-2 shadow-sm focus-within:border-primary">
            <input id="q" name="q" required minLength={3} autoFocus placeholder={t("home.placeholder")} className="w-full bg-transparent px-3 py-3 text-base outline-none placeholder:text-muted" />
            <button className="rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-fg hover:opacity-90">{t("home.button")}</button>
          </div>
        </form>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {EXAMPLES[lang].map((e) => (
            <Link key={e} href={`/cauta?q=${encodeURIComponent(e)}`} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-primary hover:text-fg">{e}</Link>
          ))}
        </div>
      </main>
      <PublicFooter />
    </>
  );
}

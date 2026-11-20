import Link from "next/link";
import type { Metadata } from "next";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { AiDots, Badge, Card, Notice } from "@/components/ui";
import { search } from "@/core/search";
import { isDemo } from "@/core/ai/engine";
import { PROVIDERS, providerLabel } from "@/core/ai/types";
import { money } from "@/lib/format";
import { watchProduct } from "@/app/actions-cont";
import { redirect } from "next/navigation";
import { refineQuery } from "@/core/refine";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `„${q}”: ce recomandă AI-urile` : "Caută" };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; urmarit?: string; f?: string; min?: string; h?: string }> }) {
  const { q = "", urmarit, f, min, h } = await searchParams;
  // Continuarea conversației: „mai ieftin”, „sub 300 lei”, „doar în stoc”, „pentru beton”
  if (f && q) {
    const next = refineQuery(q, f.slice(0, 200), min ? parseFloat(min) : null);
    const hist = [...(h ? h.split("|") : []), q].slice(-4).join("|");
    redirect(`/cauta?q=${encodeURIComponent(next)}&h=${encodeURIComponent(hist)}`);
  }
  const { t, lang } = await getT();
  if (q.trim().length < 3) {
    return (<><PublicHeader /><main className="mx-auto max-w-3xl px-4 py-16"><Notice>{t("search.min3")}</Notice></main></>);
  }
  const { parsed, runs, results, searchId } = await search(q, lang);
  const cur = parsed.country === "HU" ? "HUF" : "RON";
  const m = (v: number | null | undefined) => money(v, cur, lang);
  const demo = isDemo();
  const shown = results.map((r) => r.verifiedPrice ?? r.statedPrices[0]?.price ?? null).filter((x): x is number => !!x);
  // Baza pentru „mai ieftin” când nu există buget: prețul primului rezultat
  const minPrice = shown.length ? String(shown[0]) : "";

  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <form action="/cauta" className="mb-4 flex gap-2">
          <input name="q" defaultValue={q} className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-base focus:border-primary focus:outline-none" aria-label={t("nav.search")} />
          <button className="rounded-xl bg-primary px-5 text-sm font-medium text-primary-fg">{t("nav.search")}</button>
        </form>

        <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">{t("search.understood")}</span>
          {parsed.budgetMax && <Badge tone="primary">{t("search.budget")} {m(parsed.budgetMax)}</Badge>}
          {parsed.budgetMin && <Badge tone="primary">{t("search.over")} {m(parsed.budgetMin)}</Badge>}
          {parsed.keywords.slice(0, 6).map((k) => <Badge key={k}>{k}</Badge>)}
          <Badge>{parsed.country === "HU" ? (lang === "hu" ? "Magyarország" : "Ungaria") : lang === "hu" ? "Románia" : "România"}</Badge>
        </div>

        {h && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{t("search.conversation")}</span>
            {h.split("|").map((x, i) => <a key={i} href={`/cauta?q=${encodeURIComponent(x)}`} className="rounded-full border border-border px-2.5 py-1 hover:bg-surface">{x}</a>)}
            <span>→ <b className="text-fg">{q}</b></span>
          </div>
        )}
        {urmarit && <div className="mb-4"><Notice tone="good">{t("search.watched")} <Link href="/cont" className="underline">{t("search.seeList")}</Link></Notice></div>}
        {demo && <div className="mb-6"><Notice tone="warn">{t("search.demo")}</Notice></div>}

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <section aria-labelledby="clasament">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h1 id="clasament" className="text-3xl font-semibold">{results.length ? t("search.results", { n: Math.min(results.length, 24) }) : t("search.none")}</h1>
              {results.some((r) => r.verifiedPrice) && <span className="rounded-full bg-primary-bg px-3 py-1.5 text-sm font-medium text-primary">{t("search.verifiedBadge")}</span>}
            </div>
            {results.length === 0 ? (
              <Card><p className="text-sm text-muted">Niciun AI nu a recomandat produse concrete pentru această întrebare. Încearcă să adaugi tipul de produs sau bugetul.</p></Card>
            ) : (
              <>
                <form action="/compara" id="compara" />
                <ol className="space-y-3">
                  {results.map((r, i) => {
                    const price = r.verifiedPrice ?? r.statedPrices[0]?.price ?? null;
                    return (
                      <li key={r.key} className={`flex flex-wrap items-center gap-5 rounded-2xl bg-bg p-5 sm:flex-nowrap ${i === 0 ? "border-2 border-primary" : "border border-border"}`}>
                        {r.imageUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={r.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-xl bg-surface object-contain" loading="lazy" />
                          : <div aria-hidden className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-surface"><span className="grid h-11 w-11 place-items-center rounded-full bg-side"><span className="h-4 w-4 rounded-full bg-primary" /></span></div>}
                        <div className="min-w-0 flex-1">
                          <div className="font-display text-lg font-semibold leading-snug">{r.title}</div>
                          <div className="mt-2"><AiDots n={r.providers.length} total={PROVIDERS.length} lang={lang} /></div>
                          {r.providers.length > 0 && <div className="mt-1 text-xs text-muted">{r.providers.map(providerLabel).join(" · ")}</div>}
                        </div>
                        <div className="w-40 shrink-0">
                          <div className="num font-display text-2xl font-semibold">{m(price)}</div>
                          {r.verifiedPrice
                            ? <div className={`text-sm font-medium ${r.inStock === false ? "text-bad" : "text-good"}`}>{r.inStock === false ? t("search.outStock") : t("search.inStock")}</div>
                            : price ? <div className="text-xs text-muted">{t("search.aiPrice")}</div> : null}
                        </div>
                        <div className="w-48 shrink-0 space-y-2">
                          <Link href={`/magazin/${r.domain}`} className="block font-display font-semibold hover:underline">{r.storeName}</Link>
                          <div className="text-xs text-muted">{r.connected ? `Catalog verificat${r.trustFacts ? ` · ${r.trustFacts}/5 date de încredere` : ""}` : r.domain}</div>
                          {r.productId
                            ? <div className="flex flex-wrap items-center gap-2">
                                <a href={`/go/${r.productId}?s=${searchId}${r.cartUrl ? "&cos=1" : ""}`} rel="nofollow sponsored" className="inline-block rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-fg hover:opacity-90">{r.cartUrl ? t("search.cart") : t("search.buy")}</a>
                                <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" form="compara" name="id" value={r.productId} /> {t("search.compare")}</label>
                                <form action={watchProduct}><input type="hidden" name="productId" value={r.productId} /><input type="hidden" name="back" value={`/cauta?q=${encodeURIComponent(q)}`} /><button className="text-xs text-primary hover:underline">{t("search.watch")}</button></form>
                              </div>
                            : <a href={`https://${r.domain}`} rel="nofollow noopener" target="_blank" className="inline-block rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-surface">{t("search.store")}</a>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {results.filter((r) => r.priceCorrected && r.verifiedPrice).slice(0, 3).map((r) => {
                  const stated = r.statedPrices.find((x) => Math.abs(x.price - r.verifiedPrice!) / r.verifiedPrice! > 0.03);
                  return stated ? (
                    <div key={`c-${r.key}`} className="mt-3 flex gap-4 rounded-xl bg-warn-bg px-5 py-4 text-[15px] text-warn">
                      <b>{t("search.corrected")}</b><span>{lang === "hu" ? `${providerLabel(stated.provider)} szerint ${m(stated.price)} az ára: ${r.title}. A webshop katalógusában ellenőrzött ár: ${m(r.verifiedPrice)}.` : `${providerLabel(stated.provider)} a indicat ${m(stated.price)} pentru ${r.title}. Prețul verificat în catalogul magazinului este ${m(r.verifiedPrice)}.`}</span>
                    </div>
                  ) : null;
                })}
                <form action="/cauta" className="mt-6 rounded-2xl border border-border bg-bg p-4">
                  <label htmlFor="f" className="label">{t("search.continue")}</label>
                  <input type="hidden" name="q" value={q} />
                  {h && <input type="hidden" name="h" value={h} />}
                  {minPrice && <input type="hidden" name="min" value={minPrice} />}
                  <div className="mt-2 flex gap-2">
                    <input id="f" name="f" placeholder={t("search.followPh")} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
                    <button className="rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg">{t("search.send")}</button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {t("search.chips").split("|").map((c) => (
                      <button key={c} name="f" value={c} className="rounded-full border border-border px-2.5 py-1 text-muted hover:bg-surface hover:text-fg">{c}</button>
                    ))}
                  </div>
                </form>
                {results.filter((r) => r.productId).length >= 2 && <button form="compara" className="mt-4 rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary-bg">{t("search.compareBtn")}</button>}
                <Link href="/cum-ordonam" className="mt-4 block text-sm text-muted underline">{t("search.how")}</Link>
              </>
            )}
          </section>

          <aside aria-labelledby="per-ai">
            <h2 id="per-ai" className="label mb-3">{t("search.perAi")}</h2>
            <div className="space-y-3">
              {runs.map((run) => (
                <details key={run.id} className="group rounded-xl border border-border bg-bg p-4" open={run.provider === "chatgpt"}>
                  <summary className="flex cursor-pointer list-none items-center justify-between">
                    <span className="font-medium">{providerLabel(run.provider)}</span>
                    <span className="text-xs text-muted">{(run.mentions as unknown[]).length} magazine · {run.mode === "demo" ? "demo" : "live"}</span>
                  </summary>
                  <pre className="mt-3 max-h-80 overflow-auto font-sans text-xs leading-relaxed text-muted">{run.answer.replace(/\*\*/g, "")}</pre>
                  {(run.sources as { url: string }[]).length > 0 && (
                    <div className="mt-2 text-xs text-muted">Surse: {(run.sources as { url: string; title?: string }[]).slice(0, 6).map((s) => s.title ?? s.url).join(", ")}</div>
                  )}
                </details>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted">{t("search.affiliate")}</p>
          </aside>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}

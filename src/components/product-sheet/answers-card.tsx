import { competitorView, likelyReasons } from "@/core/product-sheet/answers";
import { whyNotRecommended } from "@/core/product-sheet/why";
import type { ProductExample } from "@/core/product-visibility";
import type { ChannelReport } from "@/core/product-sheet/channels";
import { orgDomains, productAnswerRuns, SHEET_WINDOW_DAYS } from "@/core/product-sheet/read";
import { providerLabel } from "@/core/ai/types";
import { Badge, Card, Notice, SubCard, TextLink } from "@/components/ui";
import { dateTime } from "@/lib/format";

/**
 * „Când AI-urile aleg pe altcineva”: răspunsurile salvate despre produs, cine apare în locul magazinului,
 * ce comparatoare și pagini citește AI-ul, apoi „De ce nu ești recomandat și ce faci”, punct cu punct, cu dovada.
 * Stă în <Suspense>: e partea cea mai grea a fișei.
 */
export async function AnswersCard(props: {
  projectId: string; productId: string; productUrl: string; ownDomain: string; orgId: string; inStock: boolean; tracked: boolean;
  namedRunIds: string[]; wrongPrices: { provider: string; price: number }[];
  openai: ChannelReport | null; openaiActive: boolean; google: ChannelReport | null; page: ChannelReport | null;
  product: { price: number | null; currency: string; mpn: string | null; gtin: string | null; inStock: boolean };
  country: string | null; pageRating: string | null | undefined; examples: ProductExample[];
}) {
  const [runs, domains] = await Promise.all([productAnswerRuns(props.projectId, props.productId, props.namedRunIds), orgDomains(props.orgId)]);
  const view = competitorView(runs, { ownDomain: props.ownDomain, ownDomains: domains, productUrl: props.productUrl, namedRunIds: new Set(props.namedRunIds) });
  const reasons = likelyReasons({ inStock: props.inStock, openai: props.openai, openaiActive: props.openaiActive, google: props.google, page: props.page, wrongPrices: props.wrongPrices });
  const why = whyNotRecommended({
    product: props.product, ownDomain: props.ownDomain, country: props.country, tracked: props.tracked, openaiActive: props.openaiActive,
    pageRating: props.pageRating, view, examples: props.examples, providerLabel,
  });
  const total = why.length + reasons.length;

  return (
    <>
      <Card title={runs.length ? (view.withoutStore ? `În ${view.withoutStore} din ${runs.length} răspunsuri AI-ul nu te numește` : `Te numește în toate cele ${runs.length} răspunsuri`) : "Încă nu avem răspunsuri AI despre acest produs"}
        description={`Răspunsurile AI-urilor din ultimele ${SHEET_WINDOW_DAYS} de zile la întrebările despre acest produs sau în care apare${runs.length ? ` (cele mai noi ${runs.length})` : ""}. Din răspunsuri deja primite, fără întrebări noi.`}>
        {!runs.length && <p className="text-sm text-muted">{props.tracked
          ? "Produsul e urmărit: îl întrebăm la următoarea analiză AI. Pagina se completează singură după aceea."
          : <>Apasă „Urmărește în AI” sus, ca să întrebăm AI-urile direct despre el la următoarea analiză. Până atunci, vezi ce primește ChatGPT și Google mai jos.</>}</p>}
        {runs.length > 0 && (
          <div className="space-y-4">
            {view.others.length > 0 && <div className="space-y-2">
              <p className="label">Magazine numite în locul tău sau lângă tine</p>
              <div className="flex flex-wrap gap-2">{view.others.map((o) => <Badge key={o.domain} tone={o.marketplace ? "warn" : "muted"}>{o.domain}{o.marketplace ? " (marketplace)" : ""}: {o.count}×</Badge>)}</div>
            </div>}
            {view.comparators.length > 0 && <div className="space-y-2">
              <p className="label">Comparatoare citate de AI</p>
              <div className="flex flex-wrap gap-2">{view.comparators.map((c) => <Badge key={c.domain} tone="warn">{c.domain}: {c.count}×</Badge>)}</div>
            </div>}
            <ul className="space-y-4">
              {view.runs.map((v) => (
                <li key={v.run.id}>
                  <SubCard className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">{providerLabel(v.run.provider)}</span>
                      <span className="num text-muted">{dateTime(v.run.at)}</span>
                      {v.storeNamed || v.productPageCited ? <Badge tone="good">Te numește</Badge> : <Badge tone="warn">Fără tine</Badge>}
                      {v.productNamed && <Badge>Numește produsul</Badge>}
                    </div>
                    <p className="text-sm"><span className="text-muted">Întrebarea: </span>{v.run.query}</p>
                    {v.others.length > 0 && <p className="text-sm"><span className="text-muted">Recomandă: </span>{v.others.slice(0, 6).map((o) => `${o.position}. ${o.domain}`).join(" · ")}</p>}
                    {v.comparators.length > 0 && <p className="text-sm"><span className="text-muted">Citează comparatoare: </span>{v.comparators.join(", ")}</p>}
                    <details className="text-sm">
                      <summary className="cursor-pointer font-medium text-primary">Tot răspunsul și sursele</summary>
                      <p className="mt-2 whitespace-pre-wrap break-words text-muted">{v.run.answer}</p>
                      {v.run.sources.length > 0 && <ul className="mt-2 space-y-1">{v.run.sources.slice(0, 12).map((s, i) => <li key={i} className="break-all text-xs"><TextLink href={s.url} external className="text-xs">{s.title || s.url}</TextLink></li>)}</ul>}
                    </details>
                  </SubCard>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {runs.length > 0 && view.withoutStore > 0 && (
        <Card title={total ? "De ce nu ești recomandat și ce poți face" : "Nu vedem încă de ce nu ești recomandat"}
          description="Ce au citit AI-urile pentru acest produs și unde apari sau nu, din răspunsurile deja primite și din datele produsului, fiecare cu dovada. AI-urile nu spun de ce aleg o sursă, deci sunt observații, nu verdicte.">
          {total > 0
            ? <ol className="space-y-4">
              {why.map((w, i) => (
                <li key={w.key} className="space-y-1 text-sm">
                  <p className="font-medium">{i + 1}. {w.title}.</p>
                  <p className="text-muted">{w.evidence}</p>
                  <p><span className="font-medium">Ce faci: </span>{w.action}</p>
                  {w.links.length > 0 && <p className="flex flex-wrap gap-x-4 gap-y-1">{w.links.map((l) => <TextLink key={l.href} href={l.href} external={l.external} className="break-all">{l.label}</TextLink>)}</p>}
                </li>
              ))}
              {reasons.map((r, i) => <li key={`r${i}`} className="text-sm"><span className="font-medium">{why.length + i + 1}. {r.title}.</span> <span className="text-muted">{r.detail}</span></li>)}
            </ol>
            : <Notice tone="primary">Răspunsurile salvate nu arată un motiv clar (nicio sursă citată, niciun preț). Urmărește produsul în AI ca să adunăm mai multe răspunsuri.</Notice>}
        </Card>
      )}
      {(!runs.length || !view.withoutStore) && reasons.length > 0 && (
        <Card title="Ce poate ține produsul departe de AI-uri" description="Probleme în datele produsului (feed, pagină, stoc) care pot face AI-urile să aleagă pe altcineva.">
          <ol className="space-y-3">{reasons.map((r, i) => <li key={i} className="text-sm"><span className="font-medium">{i + 1}. {r.title}.</span> <span className="text-muted">{r.detail}</span></li>)}</ol>
        </Card>
      )}
    </>
  );
}

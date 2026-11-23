import { notFound } from "next/navigation";
import { z } from "zod";
import { currentProject } from "@/lib/project";
import { productAiDetail, proofAnswers } from "@/core/product-ai-read";
import type { ProductExample } from "@/core/product-visibility";
import { PRODUCT_AI_WINDOW_DAYS } from "@/core/product-visibility-job";
import { providerLabel } from "@/core/ai/types";
import { Badge, Card, Empty, PageHeader, Stat, SubCard, TextLink } from "@/components/ui";
import { dateShort, dateTime, money, num, pct } from "@/lib/format";
import { PRICE_TOLERANCE } from "@/core/product-visibility";
import { CardHelp } from "@/components/card-help";

/** Un produs în AI: cifrele salvate și răspunsurile în care a apărut (cel mult 20, cele mai noi primele). */
export default async function ProductInAi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { project } = await currentProject();
  const row = await productAiDetail(project.id, id);
  if (!row) notFound();
  const s = row.stat;
  const answers = s ? await proofAnswers(project.id, s.examples.map((e) => e.runId)) : new Map<string, string>();
  const back = <TextLink href="/panou/produse-ai">Toate produsele</TextLink>;
  const header = <PageHeader eyebrow="Produse în AI" title={row.title} subtitle={<><span className="num break-all">{[`Cod ${row.externalId}`, row.mpn && row.mpn !== row.externalId && `Cod producător ${row.mpn}`, row.gtin && `EAN ${row.gtin}`, row.brand, money(row.price, row.currency), !row.inStock && "fără stoc"].filter(Boolean).join(" · ")}</span> · <TextLink href={row.url} external>Pagina produsului</TextLink></>} action={back} />;
  if (!s) return <>{header}<Empty title="AI-urile nu au numit acest produs">În ultimele {PRODUCT_AI_WINDOW_DAYS} de zile, produsul nu apare în niciun răspuns la întrebările urmărite. Îl poți urmări din pagina Produse, ca să întrebăm AI-urile direct despre el.</Empty></>;

  return (
    <div className="space-y-6">
      {header}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Apare în" value={`${s.appearances}×`} hint={`la ${s.prompts} ${s.prompts === 1 ? "întrebare" : "întrebări"}`} />
        <Stat label="Loc mediu" value={num(parseFloat(s.avgPosition))} hint={`cel mai bun: ${s.bestPosition}`} />
        <Stat label="Cu magazinul tău" value={`${s.withStore} / ${s.appearances}`} hint={s.withStore ? "răspunsuri care te numesc" : "AI-ul trimite în alt magazin"} />
        <Stat label="Preț spus de AI" value={s.statedPrice ? money(s.statedPrice, row.currency) : "–"} hint={s.priceWrong ? `în catalog ${money(row.price, row.currency)}; greșit la ${s.wrongPrices.map((w) => providerLabel(w.provider)).join(", ")}` : s.statedPrice ? "corect" : "niciun AI nu spune prețul"} />
      </div>

      <Card title="Pe fiecare AI" description={<CardHelp id="productAi.perEngine" />}>
        <div className="flex flex-wrap gap-2">
          {Object.entries(s.providers).sort((a, b) => b[1] - a[1]).map(([p, n]) => <Badge key={p}>{providerLabel(p)}: {n}×</Badge>)}
          {s.wrongPrices.map((w) => <Badge key={`w${w.provider}`} tone="bad">{providerLabel(w.provider)} spune {money(w.price, row.currency)}</Badge>)}
        </div>
      </Card>

      <Card title="Dovezi: unde și cum apare" description="Fiecare apariție, cele mai noi primele: AI-ul, data și ora, întrebarea, rândul exact din răspuns și după ce am recunoscut produsul. Deschide tot răspunsul ca să verifici.">
        <div id="dovezi" className="scroll-mt-6 space-y-4">
          {s.examples.map((e) => <Proof key={`${e.runId}-${e.provider}`} e={e} real={row.price ? parseFloat(row.price) : null} currency={row.currency} answer={answers.get(e.runId)} />)}
        </div>
      </Card>
    </div>
  );
}

const MATCH_LABEL = { cod: "după cod", link: "după linkul produsului", nume: "după numele complet" } as const;

/** O apariție, cu tot ce trebuie ca să o verifici: unde, când, ce a scris AI-ul și de ce e acest produs. */
function Proof({ e, real, currency, answer }: { e: ProductExample; real: number | null; currency: string; answer?: string }) {
  const diff = real && e.statedPrice ? (e.statedPrice - real) / real : null;
  const wrong = diff !== null && Math.abs(diff) > PRICE_TOLERANCE;
  // Prețul evidențiat în rândul citat, exact cum l-a scris AI-ul.
  const quote = (text: string) => {
    const i = e.priceText ? text.indexOf(e.priceText) : -1;
    if (i < 0) return <>„{text}”</>;
    return <>„{text.slice(0, i)}<strong className={wrong ? "text-bad" : "text-fg"}>{e.priceText}</strong>{text.slice(i + e.priceText!.length)}”</>;
  };
  return (
    <SubCard className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{providerLabel(e.provider)}</span>
        <span className="num text-muted">{e.at ? dateTime(e.at) : dateShort(e.runDate)}</span>
        <Badge>Locul {e.position}</Badge>
        {!e.withStore && <Badge tone="warn">Fără magazinul tău</Badge>}
      </div>
      <p className="text-sm"><span className="text-muted">Întrebarea: </span>{e.query}</p>
      <p className="text-sm text-muted">{e.priceLine ? <>„{e.snippet}”</> : quote(e.snippet)}</p>
      {e.priceLine && <p className="text-sm text-muted"><span>Prețul, pe rândul de sub produs: </span>{quote(e.priceLine)}</p>}
      <p className="text-sm"><span className="text-muted">Recunoscut </span>{e.match
        ? <>{MATCH_LABEL[e.match.kind]}: <span className="break-all font-medium">{e.match.value}</span></>
        : "după nume (calcul vechi, se reface automat în câteva minute)"}</p>
      <div className="flex flex-wrap gap-2">
        {e.statedPrice !== null && (wrong
          ? <Badge tone="bad">Spune {money(e.statedPrice, currency)}, în catalog {money(real, currency)} ({diff! > 0 ? "+" : ""}{pct(diff! * 100)})</Badge>
          : <Badge tone="good">Preț corect: {money(e.statedPrice, currency)}</Badge>)}
        {e.statedPrice === null && <Badge>Nu spune prețul</Badge>}
      </div>
      {answer && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-primary">Tot răspunsul AI-ului</summary>
          <p className="mt-2 whitespace-pre-wrap break-words text-muted">{answer}</p>
        </details>
      )}
    </SubCard>
  );
}

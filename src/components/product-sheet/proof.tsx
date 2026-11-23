import type { ProductExample } from "@/core/product-visibility";
import { PRICE_TOLERANCE } from "@/core/product-visibility";
import { providerLabel } from "@/core/ai/types";
import { Badge, SubCard } from "@/components/ui";
import { dateShort, dateTime, money, pct } from "@/lib/format";

const MATCH_LABEL = { cod: "după cod", link: "după linkul produsului", nume: "după numele complet" } as const;

/** O apariție, cu tot ce trebuie ca să o verifici: unde, când, ce a scris AI-ul și de ce e acest produs. */
export function Proof({ e, real, currency, answer }: { e: ProductExample; real: number | null; currency: string; answer?: string }) {
  const diff = real && e.statedPrice ? (e.statedPrice - real) / real : null;
  const wrong = diff !== null && Math.abs(diff) > PRICE_TOLERANCE;
  // Prețul evidențiat în rândul citat, exact cum l-a scris AI-ul.
  const quote = (text: string) => {
    const i = e.priceText ? text.indexOf(e.priceText) : -1;
    if (i < 0) return <>„{text}”</>;
    return <>„{text.slice(0, i)}<strong className={wrong ? "text-bad" : "text-fg"}>{e.priceText}</strong>{text.slice(i + e.priceText!.length)}”</>;
  };
  return (
    <SubCard id={`dovada-${e.runId}`} className="scroll-mt-6 space-y-3 target:ring-2 target:ring-primary">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{providerLabel(e.provider)}</span>
        <span className="num text-muted">{e.at ? dateTime(e.at) : dateShort(e.runDate)}</span>
        <Badge>Locul {e.position}</Badge>
        {!e.withStore && <Badge tone="warn">Fără magazinul tău</Badge>}
      </div>
      <p className="text-sm"><span className="text-muted">Întrebarea: </span>{e.query}</p>
      <p className="text-sm text-muted">{e.priceLine ? <>„{e.snippet}”</> : quote(e.snippet)}</p>
      {e.priceLine && <p className="text-sm text-muted"><span>Prețul la magazinul tău, pe rândul: </span>{quote(e.priceLine)}</p>}
      <p className="text-sm"><span className="text-muted">Recunoscut </span>{e.match
        ? <>{MATCH_LABEL[e.match.kind]}: <span className="break-all font-medium">{e.match.value}</span></>
        : "după nume (calcul vechi, se reface automat în câteva minute)"}</p>
      <div className="flex flex-wrap gap-2">
        {e.statedPrice !== null && (wrong
          ? <Badge tone="bad">Spune {money(e.statedPrice, currency)}, în catalog {money(real, currency)} ({diff! > 0 ? "+" : ""}{pct(diff! * 100)})</Badge>
          : <Badge tone="good">Preț corect: {money(e.statedPrice, currency)}</Badge>)}
        {e.statedPrice === null && <Badge>Nu spune prețul la magazinul tău</Badge>}
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

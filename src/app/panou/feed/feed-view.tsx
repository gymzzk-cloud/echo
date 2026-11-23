import { Badge, Card, Chips, Table, Td, TextLink } from "@/components/ui";
import { productCodes } from "@/lib/product-codes";
import { CardHelp } from "@/components/card-help";
import { CHANNELS } from "@/core/feed";
import type { FeedSummary } from "@/core/feed-summary";
import { money, num } from "@/lib/format";
import { LABELS } from "./labels";

export const DEFAULT_CHANNEL = "openai";
export const channelName = (id: string) => CHANNELS.find((c) => c.id === id)?.name ?? id;
export const channelLink = (channel: string, extra = "") => `/panou/feed?canal=${channel}${extra}`;

/** „Cum arată feed-ul acum”: produsele exact cum pleacă spre canalul ales, după reguli și reparațiile aprobate. */
export function FeedView({ summary, channel, total, at }: { summary: FeedSummary; channel: string; total: number; at: string }) {
  const g = summary.gaps;
  const included = summary.included;
  const excluded = summary.total - included;
  const facts: [string, number, boolean][] = [
    ["fără stoc", g.outOfStock, g.outOfStock > 0], ["fără descriere", g.noDescription, g.noDescription > 0],
    ["fără EAN/GTIN", g.noGtin, g.noGtin > 0], ["fără marcă", g.noBrand, g.noBrand > 0], ["fără preț", g.noPrice, g.noPrice > 0],
  ];
  return (
    <Card title={`Cum arată feed-ul acum: ${channelName(channel)}`} description={<CardHelp id="feed.view" />}>
      <div id="cum-arata" className="scroll-mt-6" />
      <Chips className="mb-4" items={CHANNELS.map((c) => ({ href: `${channelLink(c.id)}#cum-arata`, label: c.name, active: c.id === channel }))} />
      <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span><b className="num font-semibold">{num(included)}</b> din <span className="num">{num(total)}</span> produse pleacă spre {channelName(channel)}{excluded > 0 && <> · <span className="num">{num(excluded)}</span> scoase de reguli</>}.</span>
        {facts.filter(([, , show]) => show).map(([l, n]) => <Badge key={l} tone="warn">{num(n)} {l}</Badge>)}
        {facts.every(([, , show]) => !show) && <Badge tone="good">Toate au preț, stoc, descriere, marcă și EAN</Badge>}
      </p>
      <Table head={["Produs, cum îl primește canalul", "Preț", "Stoc", "Descriere", "Etichete"]}>
        {summary.preview.map((p) => (
          <tr key={p.id}>
            <Td>
              <TextLink href={`/panou/produse-ai/${p.id}`}>{p.title}</TextLink>
              <div className="num break-all text-xs text-muted">{[p.mpn && `Cod producător ${p.mpn}`, p.gtin ? `EAN ${p.gtin}` : "fără EAN", p.brand ?? "fără marcă"].filter(Boolean).join(" · ")}</div>
            </Td>
            <Td className="num whitespace-nowrap text-right">{p.price != null ? money(p.price, p.currency) : <Badge tone="warn">lipsă</Badge>}</Td>
            <Td>{p.inStock ? <Badge tone="good">da</Badge> : <Badge tone="warn">nu</Badge>}</Td>
            <Td className="max-w-xs text-xs text-muted">{p.description?.trim() ? <span className="line-clamp-2">{p.description}</span> : <Badge tone="warn">lipsă</Badge>}</Td>
            <Td className="text-xs text-muted">{p.labels.map((l) => LABELS[l] ?? l).join(", ")}</Td>
          </tr>
        ))}
      </Table>
      <p className="mt-4 text-xs text-muted">Primele {summary.preview.length} din <span className="num">{num(included)}</span> produse, calculat la {at}. Apasă pe un produs ca să vezi fișa lui completă și cum apare în AI-uri. Fișierul întreg îl descarci de la adresa canalului, mai sus.</p>
    </Card>
  );
}

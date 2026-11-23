import { Badge, Button, Card, Input, TextLink } from "@/components/ui";
import { money } from "@/lib/format";

type Hit = { id: string; title: string; externalId: string; mpn: string | null; gtin: string | null; brand: string | null; price: string | null; currency: string; inStock: boolean };

/** „Verifică un produs”: caută în tot catalogul după cod, cod producător, EAN, link sau nume și deschide fișa lui. */
export function ProductSearchCard({ q, hits }: { q: string; hits: Hit[] | null }) {
  return (
    <Card title="Verifică un produs" description="Scrie codul din catalog, EAN-ul, codul producătorului, linkul sau numele. Vezi exact ce primește ChatGPT și Google pentru el, ce lipsește și cine apare în locul tău.">
      <form role="search" className="grid items-start gap-2 md:grid-cols-[1fr_auto]">
        <label htmlFor="cauta" className="sr-only">Cod, EAN, link sau nume</label>
        <Input id="cauta" name="cauta" defaultValue={q} placeholder="ex. un cod, un EAN sau linkul produsului" />
        <Button type="submit" variant="secondary">Caută</Button>
      </form>
      {hits && (hits.length
        ? <ul className="mt-4 divide-y divide-border">
            {hits.map((h) => (
              <li key={h.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <div className="min-w-0">
                  <TextLink href={`/panou/produse-ai/${h.id}`} className="font-medium">{h.title}</TextLink>
                  <span className="num block break-all text-xs text-muted">{[`Cod ${h.externalId}`, h.mpn && h.mpn !== h.externalId && `Cod producător ${h.mpn}`, h.gtin && `EAN ${h.gtin}`, h.brand].filter(Boolean).join(" · ")}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!h.inStock && <Badge tone="warn">Fără stoc</Badge>}
                  <span className="num text-sm">{money(h.price, h.currency)}</span>
                </div>
              </li>
            ))}
          </ul>
        : <p className="mt-4 text-sm text-muted">Niciun produs din catalog pentru „{q}”. Verifică codul sau încearcă o parte din nume.</p>)}
    </Card>
  );
}

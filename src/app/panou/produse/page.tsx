import { Suspense } from "react";
import { currentProject } from "@/lib/project";
import { loadBase, productInsights } from "@/core/insights";
import { providerLabel } from "@/core/ai/types";
import { SubmitButton } from "@/components/client";
import { Badge, ButtonLink, Card, Chips, Empty, Input, PageHeader, Stat, Table, Td, TextLink } from "@/components/ui";
import { money } from "@/lib/format";
import { trackedProducts } from "@/core/tracked-prompts";
import { trackProduct } from "@/app/actions";

type Sp = { f?: string; q?: string };

// Antetul apare imediat; tabelul (calcul pe tot catalogul) vine în Suspense, ca pagina să nu pară blocată.
export default async function Products({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const { project } = await currentProject();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Vizibilitate" title="Produse" subtitle="Ce produse recomandă AI-urile, la ce preț și ce date le lipsesc." />
      <Suspense key={`${sp.f ?? ""}|${sp.q ?? ""}`} fallback={<Card><p className="animate-pulse text-sm text-muted">Calculăm pentru tot catalogul…</p></Card>}>
        <ProductsBody project={project} sp={sp} />
      </Suspense>
    </div>
  );
}

async function ProductsBody({ project, sp }: { project: Awaited<ReturnType<typeof currentProject>>["project"]; sp: Sp }) {
  const { rows } = await loadBase(project, 30);
  const tracked = await trackedProducts(project.id);
  const q = (sp.q ?? "").trim();
  const pi = await productInsights(project, rows, { f: sp.f, q, tracked: [...tracked.keys()] });
  if (!pi.total) return <><Empty title="Nu avem încă produsele tale" action={<ButtonLink href="/panou/setari">Conectează catalogul</ButtonLink>}>Conectează magazinul (Shopify, WooCommerce) sau adaugă feed-ul de produse ca să vedem ce produse recomandă AI-urile.</Empty></>;
  const list = pi.list;
  const missing = (p: (typeof list)[number]) => [!p.gtin && "GTIN", !p.brand && "brand", !p.hasDescription && "descriere", !p.hasImage && "imagine"].filter(Boolean) as string[];
  const filters = [["", "Toate"], ["urmarite", "Urmărite în AI"], ["populare", "Cele mai vândute"], ["recomandate", "Numite de AI"], ["pret", "Preț greșit în AI"], ["incomplete", "Date incomplete"], ["stoc", "Fără stoc"]];

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-3">
        <Stat label="Produse numite de AI" value={`${pi.recommended} / ${pi.total}`} hint={<TextLink href="/panou/produse-ai" className="text-xs">Detalii pe fiecare produs</TextLink>} />
        <Stat label="Prețuri greșite spuse de AI" value={pi.wrongPriceCount} hint={pi.wrongPriceCount ? <TextLink href="/panou/produse-ai?f=pret" className="text-xs">Vezi dovezile</TextLink> : "totul corect"} />
        <Stat label="Produse cu date incomplete" value={pi.incompleteCount} hint="GTIN, brand, descriere, imagine" />
      </div>

      <Card>
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Chips items={filters.map(([k, l]) => ({ href: `?f=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`, label: l, active: (sp.f ?? "") === k }))} />
          <form role="search" className="w-full lg:w-64">
            <input type="hidden" name="f" value={sp.f ?? ""} />
            <label htmlFor="q" className="sr-only">Caută produs</label>
            <Input id="q" name="q" defaultValue={sp.q} placeholder="Caută produs…" />
          </form>
        </div>
        <Table head={["Produs", "Preț", "În AI", "De cine", "Loc mediu", "Probleme", "Urmărit în AI"]}>
          {list.slice(0, 100).map((p) => (
            <tr key={p.id}>
              <Td className="min-w-56"><a href={p.url} target="_blank" rel="noopener" className="font-medium hover:underline">{p.title}</a><span className="block text-xs text-muted">{[p.popularityRank && `Top vânzări #${p.popularityRank}`, p.brand, p.category].filter(Boolean).join(" · ")}</span></Td>
              <Td className="num whitespace-nowrap text-right">{money(p.price ? parseFloat(p.price) : null, p.currency)}</Td>
              <Td className="num text-right">{p.mentions ? `${p.mentions}×` : <span className="text-muted">–</span>}</Td>
              <Td><div className="flex flex-wrap gap-1">{p.providers.map((x) => <Badge key={x}>{providerLabel(x)}</Badge>)}</div></Td>
              <Td className="num text-right">{p.avgPosition ?? "–"}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {p.wrongPrices.map((w, i) => <Badge key={i} tone="bad">{providerLabel(w.provider)} spune {money(w.price, p.currency)}</Badge>)}
                  {!p.inStock && <Badge tone="warn">Fără stoc</Badge>}
                  {missing(p).length > 0 && <Badge tone="warn">Lipsește: {missing(p).join(", ")}</Badge>}
                </div>
              </Td>
              <Td className="text-right">
                <form action={trackProduct} className="flex items-center justify-end gap-2">
                  <input type="hidden" name="projectId" value={project.id} />
                  <input type="hidden" name="productId" value={p.id} />
                  <input type="hidden" name="on" value={tracked.get(p.id) === "ales" ? "0" : "1"} />
                  {tracked.get(p.id) === "automat" && <Badge>Automat</Badge>}
                  {tracked.get(p.id) === "ales"
                    ? <><Badge tone="good">Ales de tine</Badge><SubmitButton variant="ghost" size="sm" pendingText="…">Scoate</SubmitButton></>
                    : p.inStock && <SubmitButton variant="secondary" size="sm" pendingText="…">{tracked.has(p.id) ? "Păstrează" : "Urmărește"}</SubmitButton>}
                </form>
              </Td>
            </tr>
          ))}
        </Table>
        {list.length === 100 && <p className="mt-4 text-xs text-muted">Afișăm primele 100 din {pi.total} produse. Folosește căutarea sau filtrele.</p>}
        {list.length === 0 && <p className="mt-4 text-sm text-muted">Niciun produs pentru acest filtru.</p>}
      </Card>

      <Card title="Unde trimit AI-urile cumpărătorii" description="Magazinele menționate cel mai des în răspunsurile la întrebările tale.">
        <ul className="space-y-2 text-sm">
          {pi.topDestinations.map(([d, n]) => {
            const max = pi.topDestinations[0][1];
            return <li key={d} className="flex items-center gap-3"><span className={`w-32 shrink-0 truncate sm:w-48 ${d === project.domain ? "font-semibold text-primary" : ""}`}>{d}</span><div className="h-2 min-w-0 flex-1 rounded-full bg-surface"><div className="h-2 rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} /></div><span className="num w-10 text-right text-muted">{n}</span></li>;
          })}
        </ul>
      </Card>
    </>
  );
}

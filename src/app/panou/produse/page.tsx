import Link from "next/link";
import { currentProject } from "@/lib/project";
import { loadBase, productInsights } from "@/core/insights";
import { providerLabel } from "@/core/ai/types";
import { Badge, Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ui";
import { money } from "@/lib/format";

export default async function Products({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const sp = await searchParams;
  const { project } = await currentProject();
  const { rows } = await loadBase(project, 30);
  const pi = await productInsights(project, rows);
  if (!pi.list.length) return <><PageHeader title="Produse" /><Empty title="Nu avem încă produsele tale" action={<Link className="text-sm text-primary underline" href="/panou/setari">Conectează catalogul</Link>}>Conectează magazinul (Shopify, WooCommerce) sau adaugă feed-ul de produse ca să vedem ce produse recomandă AI-urile.</Empty></>;

  const q = (sp.q ?? "").toLowerCase();
  let list = pi.list;
  if (sp.f === "recomandate") list = list.filter((p) => p.mentions > 0);
  if (sp.f === "pret") list = list.filter((p) => p.wrongPrices.length);
  if (sp.f === "stoc") list = list.filter((p) => !p.inStock);
  if (sp.f === "incomplete") list = list.filter((p) => !p.gtin || !p.brand || !p.hasDescription || !p.hasImage);
  if (q) list = list.filter((p) => p.title.toLowerCase().includes(q));
  const missing = (p: (typeof list)[number]) => [!p.gtin && "GTIN", !p.brand && "brand", !p.hasDescription && "descriere", !p.hasImage && "imagine"].filter(Boolean) as string[];
  const filters = [["", "Toate"], ["recomandate", "Recomandate de AI"], ["pret", "Preț greșit în AI"], ["incomplete", "Date incomplete"], ["stoc", "Fără stoc"]];

  return (
    <div className="space-y-6">
      <PageHeader title="Produse" subtitle="Ce produse recomandă AI-urile, la ce preț și ce date le lipsesc." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Produse recomandate de AI" value={`${pi.recommended} / ${pi.list.length}`} hint="ultimele 30 de zile" />
        <Stat label="Prețuri greșite spuse de AI" value={pi.wrongPriceCount} hint={pi.wrongPriceCount ? "verifică datele structurate" : "totul corect"} />
        <Stat label="Produse cu date incomplete" value={pi.list.filter((p) => missing(p).length).length} hint="GTIN, brand, descriere, imagine" />
      </div>

      <Card>
        <form className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          {filters.map(([k, l]) => <Link key={k} href={`?f=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`rounded-lg border px-3 py-1.5 ${(sp.f ?? "") === k ? "border-primary text-primary" : "border-border"}`}>{l}</Link>)}
          <input type="hidden" name="f" value={sp.f ?? ""} />
          <input name="q" defaultValue={sp.q} placeholder="Caută produs…" className="ml-auto w-56 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm" />
        </form>
        <Table head={["Produs", "Preț", "Recomandat", "De cine", "Poziție", "Probleme"]}>
          {list.slice(0, 100).map((p) => (
            <tr key={p.id}>
              <Td><a href={p.url} target="_blank" rel="noopener" className="font-medium hover:underline">{p.title}</a><span className="block text-xs text-muted">{[p.brand, p.category].filter(Boolean).join(" · ")}</span></Td>
              <Td className="num whitespace-nowrap">{money(p.price ? parseFloat(p.price) : null, p.currency)}</Td>
              <Td className="num">{p.mentions ? `${p.mentions}×` : <span className="text-muted">–</span>}</Td>
              <Td><div className="flex flex-wrap gap-1">{p.providers.map((x) => <Badge key={x}>{providerLabel(x)}</Badge>)}</div></Td>
              <Td className="num">{p.avgPosition ?? "–"}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {p.wrongPrices.map((w, i) => <Badge key={i} tone="bad">{providerLabel(w.provider)} spune {money(w.price, p.currency)}</Badge>)}
                  {!p.inStock && <Badge tone="warn">Fără stoc</Badge>}
                  {missing(p).length > 0 && <Badge tone="warn">Lipsește: {missing(p).join(", ")}</Badge>}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
        {list.length > 100 && <p className="mt-3 text-xs text-muted">Afișăm primele 100 din {list.length}. Folosește căutarea.</p>}
        {list.length === 0 && <p className="mt-3 text-sm text-muted">Niciun produs pentru acest filtru.</p>}
      </Card>

      <Card title="Unde trimit AI-urile cumpărătorii">
        <p className="mb-3 text-xs text-muted">Magazinele menționate cel mai des în răspunsurile la întrebările tale.</p>
        <ul className="space-y-2 text-sm">
          {pi.topDestinations.map(([d, n]) => {
            const max = pi.topDestinations[0][1];
            return <li key={d} className="flex items-center gap-3"><span className={`w-48 truncate ${d === project.domain ? "font-semibold text-primary" : ""}`}>{d}</span><div className="h-2 flex-1 rounded-full bg-surface"><div className="h-2 rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} /></div><span className="num w-10 text-right text-muted">{n}</span></li>;
          })}
        </ul>
      </Card>
    </div>
  );
}

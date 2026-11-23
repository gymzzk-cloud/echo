import { currentProject } from "@/lib/project";
import { salesSummary, commissionForMonth, sourceLabel, trackingSnippet } from "@/core/tracking";
import { Card, PageHeader, Stat, Table, Td, TextLink } from "@/components/ui";
import { CodeBlock } from "@/components/client";
import { daysAgo } from "@/lib/util";
import { money } from "@/lib/format";
import { CardHelp } from "@/components/card-help";

export default async function Sales() {
  const { project } = await currentProject();
  const s = await salesSummary(project.id, daysAgo(30));
  const month = new Date().toISOString().slice(0, 7);
  const com = await commissionForMonth(project.id, month);
  const snip = trackingSnippet(process.env.APP_URL ?? "http://localhost:3000", project.trackingKey);
  const max = Math.max(1, ...s.list.map((x) => x.value));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Vânzări" title="Vânzări din AI" subtitle="În ultimele 30 de zile: vizite și comenzi venite din ChatGPT, Perplexity, Gemini, Claude, Copilot și căutarea Echo, măsurate de codul nostru de pe site." />
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-5">
        <Stat label="Vizite din AI" value={s.total.visits} />
        <Stat label="Comenzi din AI" value={s.total.orders} hint={s.total.visits ? `conversie ${((s.total.orders / s.total.visits) * 100).toFixed(1)}%` : undefined} />
        <Stat label="Valoare comenzi" value={money(s.total.value, project.currency)} />
        <Stat label="Vizualizări profil Echo" value={s.profileViews} hint={<TextLink href={`/magazin/${project.domain}`} className="text-xs">Vezi profilul</TextLink>} />
        <Stat label="Clicuri din căutarea Echo" value={s.searchClicks} />
      </div>

      <Card title="Pe fiecare AI" description={<CardHelp id="sales.perEngine" />}>
        {s.list.length === 0 ? <p className="text-sm text-muted">Încă nu avem date. Pune codul de mai jos pe site; primele vizite din AI apar aici în câteva minute.</p> : (
          <Table head={["Sursă", "Vizite", "Comenzi", "Conversie", "Valoare"]}>
            {s.list.map((x) => (
              <tr key={x.source}>
                <Td className="whitespace-nowrap font-medium">{sourceLabel(x.source)}</Td>
                <Td className="num text-right">{x.visits}</Td>
                <Td className="num text-right">{x.orders}</Td>
                <Td className="num text-right">{x.visits ? `${((x.orders / x.visits) * 100).toFixed(1)}%` : "–"}</Td>
                <Td><div className="flex items-center gap-2"><div className="hidden h-2 w-32 shrink-0 rounded-full bg-surface sm:block"><div className="h-2 rounded-full bg-primary" style={{ width: `${(x.value / max) * 100}%` }} /></div><span className="num whitespace-nowrap">{money(x.value, project.currency)}</span></div></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Comision Echo, luna aceasta" description={`${com.pct}% din vânzările aduse de căutarea Echo.`}>
        <p className="text-sm">Comenzi venite din căutarea Echo: <b className="num font-semibold">{com.orders}</b> · valoare <b className="num font-semibold">{money(com.value, project.currency)}</b> · comision <b className="num font-semibold">{money(com.commission, project.currency)}</b>.</p>
        <p className="mt-2 text-xs text-muted">Fără rețea de afiliere: comisionul se calculează din comenzile raportate de codul de mai jos și intră pe factura lunară. Comenzile anulate se scad la cerere, cu id-ul comenzii.</p>
      </Card>

      <Card title="Instalare (5 minute)" description={<CardHelp id="sales.install" />}>
        <ol className="space-y-6 text-sm">
          <li>
            <div className="font-medium">1. Pune acest cod în &lt;head&gt;, pe toate paginile</div>
            <CodeBlock code={snip.head} label="HTML" />
          </li>
          <li>
            <div className="font-medium">2. Pe pagina „Mulțumim pentru comandă”, raportează comanda</div>
            <p className="mt-1 text-xs text-muted">Înlocuiește {"{{ID_COMANDA}}"} și {"{{TOTAL}}"} cu variabilele platformei (de exemplu în Shopify: {"{{ order.name }}"} și {"{{ order.total_price | money_without_currency }}"}).</p>
            <CodeBlock code={snip.order} label="HTML" />
          </li>
          <li className="text-xs text-muted">Codul nu folosește cookie-uri și nu trimite date personale: doar sursa vizitei (ex. ChatGPT), id-ul și valoarea comenzii. Urmărim doar vizitele venite din AI-uri.</li>
        </ol>
      </Card>
    </div>
  );
}

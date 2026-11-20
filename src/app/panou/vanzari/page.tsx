import { currentProject } from "@/lib/project";
import { salesSummary, commissionForMonth, sourceLabel, trackingSnippet } from "@/core/tracking";
import { Badge, Card, PageHeader, Stat, Table, Td } from "@/components/ui";
import { CopyButton } from "@/components/client";
import { daysAgo } from "@/lib/util";
import { money } from "@/lib/format";

export default async function Sales() {
  const { project } = await currentProject();
  const s = await salesSummary(project.id, daysAgo(30));
  const month = new Date().toISOString().slice(0, 7);
  const com = await commissionForMonth(project.id, month);
  const snip = trackingSnippet(process.env.APP_URL ?? "http://localhost:3000", project.trackingKey);
  const max = Math.max(1, ...s.list.map((x) => x.value));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Ultimele 30 de zile" title="Vânzări din AI" subtitle="Vizite și comenzi venite din ChatGPT, Perplexity, Gemini, Claude, Copilot și căutarea Echo, măsurate de codul nostru de pe site." />
      <div className="grid gap-4 sm:grid-cols-5">
        <Stat label="Vizite din AI" value={s.total.visits} />
        <Stat label="Comenzi din AI" value={s.total.orders} hint={s.total.visits ? `conversie ${((s.total.orders / s.total.visits) * 100).toFixed(1)}%` : undefined} />
        <Stat label="Valoare comenzi" value={money(s.total.value, project.currency)} />
        <Stat label="Vizualizări profil Echo" value={s.profileViews} hint={<a href={`/magazin/${project.domain}`} className="underline">vezi profilul</a>} />
        <Stat label="Clicuri din căutarea Echo" value={s.searchClicks} />
      </div>

      <Card title="Pe fiecare AI">
        {s.list.length === 0 ? <p className="text-sm text-muted">Încă nu avem date. Pune codul de mai jos pe site; primele vizite din AI apar aici în câteva minute.</p> : (
          <Table head={["Sursă", "Vizite", "Comenzi", "Conversie", "Valoare"]}>
            {s.list.map((x) => (
              <tr key={x.source}>
                <Td className="text-[15px] font-medium">{sourceLabel(x.source)}</Td>
                <Td className="num">{x.visits}</Td>
                <Td className="num">{x.orders}</Td>
                <Td className="num">{x.visits ? `${((x.orders / x.visits) * 100).toFixed(1)}%` : "–"}</Td>
                <Td><div className="flex items-center gap-2"><div className="h-2 w-32 rounded-full bg-surface"><div className="h-2 rounded-full bg-primary" style={{ width: `${(x.value / max) * 100}%` }} /></div><span className="num">{money(x.value, project.currency)}</span></div></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Comision Echo, luna aceasta" action={<Badge>{com.pct}% din vânzările aduse de căutarea Echo</Badge>}>
        <p className="text-sm">Comenzi venite din căutarea Echo: <b className="num">{com.orders}</b> · valoare <b className="num">{money(com.value, project.currency)}</b> · comision <b className="num">{money(com.commission, project.currency)}</b>.</p>
        <p className="mt-2 text-xs text-muted">Fără rețea de afiliere: comisionul se calculează din comenzile raportate de codul de mai jos și intră pe factura lunară. Comenzile anulate se scad la cerere, cu id-ul comenzii.</p>
      </Card>

      <Card title="Instalare (5 minute)">
        <ol className="space-y-5 text-sm">
          <li>
            <div className="font-medium">1. Pune acest cod în &lt;head&gt;, pe toate paginile</div>
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-border bg-surface p-3"><code className="min-w-0 flex-1 break-all font-mono text-xs">{snip.head}</code><CopyButton text={snip.head} /></div>
          </li>
          <li>
            <div className="font-medium">2. Pe pagina „Mulțumim pentru comandă”, raportează comanda</div>
            <p className="mt-1 text-xs text-muted">Înlocuiește {"{{ID_COMANDA}}"} și {"{{TOTAL}}"} cu variabilele platformei (de exemplu în Shopify: {"{{ order.name }}"} și {"{{ order.total_price | money_without_currency }}"}).</p>
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-border bg-surface p-3"><pre className="min-w-0 flex-1 font-mono text-xs">{snip.order}</pre><CopyButton text={snip.order} /></div>
          </li>
          <li className="text-xs text-muted">Codul nu folosește cookie-uri și nu trimite date personale: doar sursa vizitei (ex. ChatGPT), id-ul și valoarea comenzii. Urmărim doar vizitele venite din AI-uri.</li>
        </ol>
      </Card>
    </div>
  );
}

import { PublicFooter, PublicHeader } from "@/components/public-header";
import { Card } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { legal } from "@/lib/legal";
import { buyerTools } from "@/core/mcp";

export const metadata = { title: "Conectorul AI (MCP)" };
export const dynamic = "force-dynamic";

const STORE_TOOLS = [
  ["cauta_in_catalog", "Caută produse în catalogul magazinului, cu preț și stoc."],
  ["pret_si_stoc", "Prețul și stocul actual pentru un produs."],
  ["livrare_si_retur", "Termenul de livrare pe produs, returul și metodele de plată."],
  ["intrebari_frecvente", "Întrebările frecvente ale magazinului."],
  ["link_cumparare", "Linkul spre produs pe site-ul magazinului."],
] as const;

/** Documentația publică a conectorului MCP: cerută de directoarele Claude și ChatGPT. */
export default function ConnectorDocs() {
  const l = legal();
  const url = `${l.appUrl}/mcp`;
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <h1 className="text-2xl font-semibold">Conectorul AI {BRAND.name} (MCP)</h1>
        <p className="text-muted">Cu conectorul {BRAND.name}, Claude, ChatGPT și alți asistenți caută produse în magazinele online verificate din România și Ungaria și răspund cu prețul și stocul din catalogul magazinului, nu din amintiri vechi.</p>

        <Card title="Adresa serverului">
          <p className="break-all rounded-lg border border-border px-3 py-2 font-mono text-sm">{url}</p>
          <p className="mt-3 text-sm text-muted">Transport Streamable HTTP, fără cont și fără autentificare. Toate uneltele doar citesc date; conectorul nu scrie nimic și nu face plăți.</p>
        </Card>

        <Card title="Cum îl adaugi">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li><b>Claude:</b> Setări → Conectori → Adaugă conector personalizat, apoi lipește adresa de mai sus.</li>
            <li><b>ChatGPT:</b> Setări → Aplicații și conectori → Avansat → mod dezvoltator, apoi Creează, cu adresa de mai sus și autentificare „Fără”.</li>
            <li>Întreabă normal, de exemplu: „Caută o bormașină cu percuție sub 400 de lei, în stoc”.</li>
          </ol>
        </Card>

        <Card title="Unelte">
          <ul className="space-y-2 text-sm">
            {buyerTools().map((t) => <li key={t.name}><code className="font-mono">{t.name}</code>: {t.description}</li>)}
          </ul>
        </Card>

        <Card title="Serverul unui singur magazin">
          <p className="text-sm">Fiecare magazin conectat are și serverul lui, la <code className="font-mono">{l.appUrl}/mcp/magazin/&lt;domeniu&gt;</code> (de exemplu <code className="font-mono">/mcp/magazin/shopexpert.com/ro</code>), cu uneltele:</p>
          <ul className="mt-3 space-y-2 text-sm">
            {STORE_TOOLS.map(([n, d]) => <li key={n}><code className="font-mono">{n}</code>: {d}</li>)}
          </ul>
        </Card>

        <Card title="De unde vin datele">
          <p className="text-sm">Prețul și stocul vin din catalogul magazinului, sincronizat cu acordul lui. Livrarea, returul, plata și întrebările frecvente sunt citite de pe site-ul magazinului. Prețul final e mereu cel de pe site-ul magazinului, unde se face plata.</p>
        </Card>

        <Card title="Limite și confidențialitate">
          <p className="text-sm">Cel mult 15 rezultate pe căutare și o limită de cereri pe minut. Ce date primim și cât le păstrăm: <a className="underline" href="/confidentialitate">politica de confidențialitate</a>.</p>
        </Card>

        <Card title="Ajutor">
          <p className="text-sm">{l.supportEmail ? <>Scrie-ne la <a className="underline" href={`mailto:${l.supportEmail}`}>{l.supportEmail}</a>.</> : "Scrie-ne din pagina Pentru magazine."}</p>
        </Card>
      </main>
      <PublicFooter />
    </>
  );
}

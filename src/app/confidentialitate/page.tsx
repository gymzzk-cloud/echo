import { PublicFooter, PublicHeader } from "@/components/public-header";
import { Card } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { legal } from "@/lib/legal";
import { mcpLogDays } from "@/core/mcp";

export const metadata = { title: "Politica de confidențialitate" };
export const dynamic = "force-dynamic";

/** Politica de confidențialitate: site, cont, panou și conectorul AI (MCP). Cerută de directoarele Claude și ChatGPT. */
export default function Privacy() {
  const l = legal();
  const days = mcpLogDays();
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <h1 className="text-2xl font-semibold">Politica de confidențialitate</h1>
        <p className="text-muted">Ultima actualizare: 20.11.2026. Aici spunem ce date colectează {BRAND.name}, de ce, cu cine le împărțim și cât le păstrăm.</p>

        <Card title="Cine răspunde de date">
          <p className="text-sm">
            Operatorul este {l.company ?? `echipa ${BRAND.name}`}{l.companyId ? `, ${l.companyId}` : ""}{l.address ? `, ${l.address}` : ""}.
            {l.supportEmail ? <> Ne scrii la <a className="underline" href={`mailto:${l.supportEmail}`}>{l.supportEmail}</a> pentru orice întrebare sau cerere despre datele tale.</> : null}
          </p>
        </Card>

        <Card title="Conectorul AI (MCP) în Claude, ChatGPT și alți asistenți">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li><b>Ce primim:</b> numele uneltei apelate și parametrii ei (ex. textul căutării, bugetul, id-ul produsului), ora și identificarea programului care apelează (user-agent). Nu primim numele, emailul sau conversația ta cu asistentul.</li>
            <li><b>Nu cerem cont</b> și nu folosim cookie-uri pentru conector. Adresa IP e folosită doar în memorie, un minut, ca să limităm abuzurile; nu o salvăm.</li>
            <li><b>De ce:</b> ca să răspundem la cerere și ca magazinul să vadă ce caută agenții AI în catalogul lui (statistici). Nu folosim datele pentru publicitate și nu le vindem.</li>
            <li><b>Cât păstrăm:</b> jurnalul apelurilor se șterge automat după {days} de zile.</li>
            <li><b>Linkul de cumpărare</b> trece prin {BRAND.name}: salvăm clicul (produsul și ora, fără date despre tine) și adăugăm parametri de urmărire, ca magazinul să știe că vii de la un asistent AI. Plata se face doar pe site-ul magazinului; {BRAND.name} nu procesează plăți.</li>
            <li><b>Nu trimite date personale în căutări</b> (nume, telefon, adresă): conectorul nu are nevoie de ele.</li>
          </ul>
        </Card>

        <Card title="Căutarea pe site și contul de cumpărător">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>Textul căutărilor îl salvăm fără legătură cu persoana, ca să îmbunătățim rezultatele. Îl trimitem la AI-urile întrebate (OpenAI, Anthropic, Google, Perplexity) exact cum l-ai scris.</li>
            <li>Dacă îți faci cont: emailul, numele (opțional), parola criptată și produsele urmărite. Le folosim pentru cont și pentru alertele de preț și stoc pe care le ceri.</li>
          </ul>
        </Card>

        <Card title="Panoul pentru magazine">
          <p className="text-sm">Pentru conturile de magazin păstrăm datele de cont ale echipei, datele firmei, catalogul de produse și setările. Nu păstrăm răspunsurile complete ale API-urilor magazinului și nu trimitem date personale la AI-uri.</p>
        </Card>

        <Card title="Cu cine împărțim datele">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>Magazinul al cărui catalog l-ai căutat vede ce s-a căutat și clicurile spre produsele lui, fără date despre tine.</li>
            <li>Furnizori care ne ajută să funcționăm, doar cât e nevoie: găzduirea (Render), emailul (Resend), plățile magazinelor (Stripe) și AI-urile întrebate la căutare.</li>
            <li>Autorități, doar când legea o cere.</li>
          </ul>
        </Card>

        <Card title="Cât păstrăm datele">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>Apelurile conectorului AI: {days} de zile.</li>
            <li>Conturile: cât timp sunt active. La cererea ta, ștergem contul și datele lui.</li>
            <li>Datele de facturare: cât cere legea contabilă.</li>
          </ul>
        </Card>

        <Card title="Drepturile tale (GDPR)">
          <p className="text-sm">Poți cere acces la date, corectarea sau ștergerea lor, restricționarea prelucrării, portabilitatea sau te poți opune prelucrării.{l.supportEmail ? <> Scrie-ne la <a className="underline" href={`mailto:${l.supportEmail}`}>{l.supportEmail}</a>.</> : null} Poți depune plângere la ANSPDCP (dataprotection.ro).</p>
        </Card>
      </main>
      <PublicFooter />
    </>
  );
}

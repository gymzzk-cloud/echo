import { PublicFooter, PublicHeader } from "@/components/public-header";
import { Card } from "@/components/ui";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Cum ordonăm rezultatele" };

export default function HowWeRank() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <h1 className="text-2xl font-semibold">Cum ordonăm rezultatele</h1>
        <p className="text-muted">Transparență cerută de Directiva Omnibus (UE 2019/2161) și de Regulamentul P2B (UE 2019/1150). Orice schimbare a acestor criterii o publicăm aici.</p>
        <Card title="Criteriile, cu ponderea lor">
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li><b>Câte AI-uri recomandă produsul (40%).</b> Trimitem întrebarea ta la ChatGPT, Gemini, Perplexity și Claude. Un produs recomandat de mai multe urcă.</li>
            <li><b>Potrivirea cu întrebarea (25%).</b> Cât de bine se potrivesc titlul și categoria produsului cu ce ai cerut.</li>
            <li><b>Bugetul și prețul verificat (20%).</b> Produsele peste bugetul tău coboară. Prețurile verificate direct în magazin primesc un plus; produsele fără stoc coboară la final.</li>
            <li><b>Semnale de încredere ale magazinului (15%).</b> Fapte publice: date de firmă, politică de retur, termeni, contact, ANPC/SOL, certificări, catalog conectat.</li>
          </ol>
        </Card>
        <Card title="Ce nu influențează ordinea">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>Abonamentul magazinului la {BRAND.name}. Magazinele plătitoare nu primesc poziții mai bune în clasamentul organic.</li>
            <li>Comisioanele de afiliere. Unele linkuri pot aduce un comision, fără cost pentru tine și fără efect asupra ordinii.</li>
            <li>Rezultatele sponsorizate, dacă vor exista, vor fi separate și marcate clar „Sponsorizat”.</li>
          </ul>
        </Card>
        <Card title="De unde vin prețurile">
          <p className="text-sm">AI-urile pot spune prețuri vechi. Când magazinul are catalogul conectat, afișăm prețul și stocul din catalog și marcăm „Corectat” diferența față de ce a spus AI-ul. Prețul final e mereu cel de pe site-ul magazinului.</p>
        </Card>
      </main>
      <PublicFooter />
    </>
  );
}

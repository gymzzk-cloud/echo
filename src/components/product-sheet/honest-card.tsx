import { Card, TextLink } from "@/components/ui";
import { countryName, merchantsOpen } from "@/core/feed-channels/chatgpt-markets";

/** Ce se poate și ce nu se poate verifica direct în ChatGPT și în Google, spus cinstit, cu linkuri pentru acest produs. */
export function HonestCard({ title, url, country }: { title: string; url: string; country: string | null }) {
  const open = merchantsOpen(country);
  const q = encodeURIComponent(`${title} preț`);
  return (
    <Card title="Ce poți verifica singur în ChatGPT și Google" description="Ce arată platformele direct și ce nu arată, ca să știi ce înseamnă cifrele de aici.">
      <ul className="space-y-3 text-sm">
        {open
          ? <li><span className="font-medium">ChatGPT Merchants</span> <span className="text-muted">(contul în care ai pus adresa feed-ului) arată dacă fișierul a fost preluat și câte produse au fost acceptate sau respinse. Nu arată pe ce loc apare un produs, câte afișări are sau cine apare în locul tău: OpenAI nu dă aceste date magazinelor. De aceea Echo pune regulat aceleași întrebări și păstrează răspunsurile.</span></li>
          : <li><span className="font-medium">ChatGPT Merchants</span> <span className="text-muted">(produsele gratuite în aplicația ChatGPT) nu e deschis încă pentru magazinele din {countryName(country)}: OpenAI îl are doar în SUA. Aici ChatGPT recomandă din paginile pe care le găsește pe web: site-ul tău, comparatoarele și articolele citate. Feed-ul îl poți folosi acum doar pentru reclame (ChatGPT Ads Manager).</span></li>}
        <li><span className="font-medium">Ce măsurăm noi</span> <span className="text-muted">Echo întreabă ChatGPT prin API, cu căutare pe web, ca un cumpărător din {countryName(country)}: răspunsurile vin din paginile găsite pe web, nu dintr-un feed.</span></li>
        <li><span className="font-medium">Cu ochii tăi:</span> <span className="text-muted">deschide ChatGPT într-o fereastră privată și scrie numele sau codul produsului cu „preț”. Răspunsul diferă de la om la om (țară, istoric, memorie), deci o singură încercare nu e o măsurătoare.</span> <TextLink href={`https://chatgpt.com/?q=${q}`} external>Deschide în ChatGPT</TextLink></li>
        <li><span className="font-medium">Google Merchant Center</span> <span className="text-muted">→ Produse arată dacă produsul e aprobat sau respins și de ce, plus afișările și clicurile din Google Shopping. Gemini și Google AI Overviews folosesc aceleași date despre produse, plus ce citesc din pagina ta. Echo nu e încă legat de Merchant Center (e pe listă), așa că aici vezi feed-ul Echo și pagina.</span></li>
        <li><span className="font-medium">Testul Google pentru pagină</span> <span className="text-muted">citește pagina produsului exact ca Google și arată datele de produs găsite.</span> <TextLink href={`https://search.google.com/test/rich-results?url=${encodeURIComponent(url)}`} external>Testează pagina în Google</TextLink></li>
      </ul>
    </Card>
  );
}

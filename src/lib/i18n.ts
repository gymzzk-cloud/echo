import "server-only";
import { cookies, headers } from "next/headers";

/** Interfața în română și maghiară. Limba: cookie „echo_lang”, apoi limba browserului. */
export type Lang = "ro" | "hu";

const RO = {
  "nav.search": "Caută", "nav.forStores": "Pentru magazine", "nav.login": "Intră în cont", "nav.account": "Contul meu", "nav.index": "Indexul AI", "nav.ranking": "Cum ordonăm rezultatele", "nav.connector": "Conector AI", "nav.privacy": "Confidențialitate",
  "footer.pay": "Plata se face întotdeauna pe site-ul magazinului.",
  "home.h1a": "Întrebi o dată.", "home.h1b": "Îți răspund toate AI-urile.",
  "home.sub": "întreabă ChatGPT, Gemini, Perplexity, Claude, Google AI Mode și Copilot în același timp, combină răspunsurile și verifică prețul și stocul direct în magazin.",
  "home.placeholder": "Ce cauți? Scrie ca unui prieten…", "home.button": "Caută",
  "search.understood": "Am înțeles:", "search.budget": "Buget max.", "search.over": "Peste", "search.results": "Cele mai bune {n} rezultate", "search.none": "Niciun rezultat",
  "search.verifiedBadge": "Prețuri și stoc verificate în catalog", "search.inStock": "✓ în stoc, preț verificat", "search.outStock": "✕ stoc epuizat", "search.aiPrice": "preț spus de AI, neverificat",
  "search.cart": "Pune în coș", "search.buy": "Cumpără", "search.compare": "Compară", "search.watch": "Urmărește prețul", "search.store": "Vezi magazinul",
  "search.perAi": "Ce spune fiecare AI", "search.continue": "Continuă: spune ce să schimbăm", "search.followPh": "ex. mai ieftin, sub 300 lei, doar în stoc, pentru beton", "search.send": "Trimite",
  "search.chips": "Mai ieftin|Doar în stoc|Mai puternic|Pentru uz profesional", "search.compareBtn": "Compară produsele bifate", "search.conversation": "Conversația:",
  "search.watched": "Produs adăugat la urmărite. Te anunțăm când scade prețul sau revine în stoc.", "search.seeList": "Vezi lista",
  "search.demo": "Mod demonstrativ: răspunsurile AI sunt simulate până se adaugă cheile API. Produsele și prețurile verificate vin din cataloagele reale ale magazinelor conectate.",
  "search.how": "Cum ordonăm: câte AI-uri recomandă, prețul și stocul verificate, încrederea în magazin. Nimeni nu plătește pentru poziție.",
  "search.affiliate": "Plata se face întotdeauna pe site-ul magazinului. Linkurile pot include un cod de urmărire: magazinul ne poate plăti un comision, fără cost pentru tine și fără influență asupra ordinii.",
  "search.corrected": "Corectat", "search.min3": "Scrie cel puțin 3 caractere.",
};
type Key = keyof typeof RO;
const HU: Record<Key, string> = {
  "nav.search": "Keresés", "nav.forStores": "Webshopoknak", "nav.login": "Belépés", "nav.account": "Fiókom", "nav.index": "AI-index", "nav.ranking": "Hogyan rangsorolunk", "nav.connector": "AI-csatlakozó", "nav.privacy": "Adatvédelem",
  "footer.pay": "A fizetés mindig a webshop oldalán történik.",
  "home.h1a": "Egyszer kérdezel.", "home.h1b": "Minden AI válaszol.",
  "home.sub": "egyszerre kérdezi meg a ChatGPT-t, a Geminit, a Perplexityt, a Claude-ot, a Google AI Mode-ot és a Copilotot, összesíti a válaszokat, és közvetlenül a webshopban ellenőrzi az árat és a készletet.",
  "home.placeholder": "Mit keresel? Írd le, mint egy barátnak…", "home.button": "Keresés",
  "search.understood": "Így értettük:", "search.budget": "Max. keret", "search.over": "Legalább", "search.results": "A {n} legjobb találat", "search.none": "Nincs találat",
  "search.verifiedBadge": "Ár és készlet a katalógusban ellenőrizve", "search.inStock": "✓ raktáron, ellenőrzött ár", "search.outStock": "✕ elfogyott", "search.aiPrice": "az AI által mondott ár, nem ellenőrzött",
  "search.cart": "Kosárba", "search.buy": "Megveszem", "search.compare": "Összehasonlítás", "search.watch": "Árfigyelés", "search.store": "Webshop megnyitása",
  "search.perAi": "Mit mond az egyes AI", "search.continue": "Folytasd: mit változtassunk?", "search.followPh": "pl. olcsóbbat, 30000 Ft alatt, raktáron", "search.send": "Küldés",
  "search.chips": "Olcsóbbat|Csak raktáron|Erősebbet|Profi használatra", "search.compareBtn": "A kijelöltek összehasonlítása", "search.conversation": "Beszélgetés:",
  "search.watched": "Hozzáadva a figyelt termékekhez. Szólunk, ha csökken az ár vagy újra raktáron van.", "search.seeList": "Lista",
  "search.demo": "Bemutató mód: az AI-válaszok szimuláltak, amíg nincsenek API-kulcsok. Az ellenőrzött termékek és árak a csatlakozott webshopok valós katalógusából jönnek.",
  "search.how": "Rangsor: hány AI ajánlja, ellenőrzött ár és készlet, a webshop megbízhatósága. Helyezést senki nem vásárolhat.",
  "search.affiliate": "A fizetés mindig a webshop oldalán történik. A linkek követőkódot tartalmazhatnak: a webshop jutalékot fizethet nekünk, ez neked nem kerül pénzbe, és nem befolyásolja a sorrendet.",
  "search.corrected": "Javítva", "search.min3": "Írj legalább 3 karaktert.",
};

export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get("echo_lang")?.value;
  if (c === "hu" || c === "ro") return c;
  const al = (await headers()).get("accept-language") ?? "";
  return /^hu\b/i.test(al) ? "hu" : "ro";
}

export async function getT() {
  const lang = await getLang();
  const dict = lang === "hu" ? HU : RO;
  return { lang, t: (k: Key, vars?: Record<string, string | number>) => dict[k].replace(/\{(\w+)\}/g, (_, v) => String(vars?.[v] ?? "")) };
}

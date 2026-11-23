import "server-only";
import { getLang, type Lang } from "./i18n";

/**
 * Textele paginii de prezentare pentru magazine (/pentru-magazine), în română și maghiară.
 * Stau separat de dicționarul principal ca acela să rămână mic. Prețurile vin din `PLANS` (src/core/billing.ts).
 * Regulă: nimic inventat (clienți, cifre de rezultat, citate). Doar ce face produsul azi.
 */
type Item = { t: string; d: string };
type Dict = {
  metaTitle: string; metaDesc: string;
  eyebrow: string; h1: string; sub: string; ctaTrial: string; ctaPrices: string; ctaNote: string;
  shotAlt: string; shotCaption: string;
  stepsTitle: string; steps: Item[];
  featuresTitle: string; features: Item[];
  auditTitle: string; auditSub: string; auditUrl: string; auditEmail: string; auditButton: string; auditPending: string; auditConsent: string; auditNote: string;
  pricingTitle: string; pricingSub: string; perMonth: string; currency: string; popular: string; choose: string; pricingNote: string;
  plans: Record<"start" | "pro" | "agentie", { tagline: string; features: string[] }>;
  trustTitle: string; trust: Item[]; operatedBy: string; privacyLink: string;
  faqTitle: string; faq: { q: string; a: string }[];
  finalTitle: string; finalSub: string;
};

const RO: Dict = {
  metaTitle: "Pentru magazine: fă-ți magazinul recomandat de AI",
  metaDesc: "Află dacă ChatGPT, Gemini, Perplexity, Claude și Google AI îți recomandă magazinul, cine apare în locul tău și ce să repari. Test gratuit, prețuri în lei.",
  eyebrow: "Pentru magazine online din România și Ungaria",
  h1: "Când clientul întreabă AI-ul, să răspundă cu magazinul tău.",
  sub: "Echo îți arată dacă ChatGPT, Gemini, Perplexity, Claude și Google AI îți recomandă magazinul, cine apare în locul tău și ce să repari ca să urci.",
  ctaTrial: "Începe testul gratuit", ctaPrices: "Vezi prețurile",
  ctaNote: "Fără card. În câteva minute vezi primele răspunsuri despre magazinul tău.",
  shotAlt: "Panoul Echo: cine apare mai bine ca tine în răspunsurile AI, cu cota fiecărui magazin din recomandări",
  shotCaption: "Captură din panoul Echo, cu date de test.",
  stepsTitle: "Cum funcționează",
  steps: [
    { t: "Scrii adresa magazinului", d: "Citim câteva pagini publice și găsim produsele, brandurile și concurenții tăi. Nu instalezi nimic." },
    { t: "Vezi ce spun AI-urile", d: "Punem întrebările clienților tăi la AI-uri: apari sau nu, pe ce loc și cine e recomandat în locul tău." },
    { t: "Repari și urmărești", d: "Primești reparațiile în ordinea impactului și vezi în fiecare săptămână cum urci, plus vânzările venite din AI." },
  ],
  featuresTitle: "Ce primești în panou",
  features: [
    { t: "Te recomandă AI-urile?", d: "Cât de des apari în răspunsurile ChatGPT, Gemini, Perplexity, Claude și Google AI, pe ce loc și față de ce concurenți." },
    { t: "Cine te întrece", d: "Magazinele recomandate în locul tău la aceleași întrebări, cu cota fiecăruia. Concurenții noi îi găsim singuri în răspunsuri." },
    { t: "Ce produse și la ce preț", d: "Ce produse recomandă AI-ul și când spune despre tine un preț greșit sau un stoc vechi." },
    { t: "Unde lipsești", d: "Site-urile pe care AI-urile le citesc și unde apar concurenții, dar tu nu." },
    { t: "Reparații concrete", d: "Roboți blocați, date de produs lipsă, llms.txt, feed pentru ChatGPT: îți dăm exact ce trebuie pus pe site." },
    { t: "Vânzări măsurate din AI", d: "Vezi comenzile venite de la asistenții AI, ca să știi cât aduce vizibilitatea, nu doar cât de vizibil ești." },
  ],
  auditTitle: "Nu vrei cont încă? Fă auditul tehnic gratuit",
  auditSub: "Verificăm în 2 minute dacă AI-urile pot citi magazinul tău: roboți, date structurate, sitemap, llms.txt.",
  auditUrl: "Adresa magazinului", auditEmail: "Email (opțional, îți trimitem raportul)",
  auditButton: "Verifică gratuit", auditPending: "Verific… (până la 1 minut)",
  auditConsent: "Vreau să primesc și sfaturi ocazionale despre vizibilitatea în AI. Mă pot dezabona oricând.",
  auditNote: "Păstrăm rezultatul auditului (date publice de pe site-ul magazinului) ca să nu verificăm din nou totul de fiecare dată.",
  pricingTitle: "Prețuri în lei, fără surprize",
  pricingSub: "Abonament lunar, fără perioadă minimă. Începi cu testul gratuit și alegi planul abia după ce vezi rezultatele.",
  perMonth: "/ lună", currency: "lei", popular: "Recomandat", choose: "Începe cu testul gratuit",
  pricingNote: "Plata se face prin Stripe. Anulezi oricând din Contul meu.",
  plans: {
    start: { tagline: "Pentru un magazin care vrea să afle unde stă.", features: ["1 magazin", "30 de întrebări urmărite", "3 AI-uri, rulare săptămânală", "Audit tehnic și lista de reparații"] },
    pro: { tagline: "Pentru magazinul care vrea să urce în recomandări.", features: ["3 magazine", "100 de întrebări urmărite", "Toate AI-urile", "Feed-uri pe canale, Agent Gate și API"] },
    agentie: { tagline: "Pentru agențiile care lucrează cu mai multe magazine.", features: ["Magazine nelimitate pentru clienți", "Conturi pentru clienți", "Rapoarte cu marca agenției", "Suport prioritar"] },
  },
  trustTitle: "Datele tale rămân ale tale",
  trust: [
    { t: "Găzduire în UE", d: "Aplicația și baza de date stau în Frankfurt. Respectăm GDPR." },
    { t: "Fără acces de scriere", d: "Nu cerem permisiuni de scriere pe magazin. Doar citim catalogul și paginile publice." },
    { t: "Fără date personale la AI", d: "Întrebările pleacă la AI-uri exact cum le scrii, fără date despre clienții tăi." },
    { t: "Citim ușor", d: "Cerem catalogul doar când s-a schimbat și rar, ca să nu încărcăm site-ul magazinului." },
  ],
  operatedBy: "Echo este operat de", privacyLink: "Politica de confidențialitate",
  faqTitle: "Întrebări frecvente",
  faq: [
    { q: "De unde vin datele?", a: "Punem întrebările pe care le urmărești direct la ChatGPT, Gemini, Perplexity și Claude, prin interfețele lor oficiale. Rezumatele Google AI le citim printr-un serviciu specializat. Păstrăm fiecare răspuns cu data lui, ca să vezi exact ce a spus AI-ul." },
    { q: "Ce primesc în testul gratuit?", a: "Punem 20 de întrebări despre magazinul tău la ChatGPT și Gemini și îți arătăm cât de des apari, pe ce loc ești și primele 5 magazine recomandate. Fără card. Analiza completă, pe toate AI-urile, începe după ce alegi un plan." },
    { q: "Cât de des întrebați AI-urile?", a: "Automat, o dată pe săptămână. Poți porni o rulare în plus din panou; întrebările puse deja în aceeași zi nu se plătesc din nou." },
    { q: "Ce platforme de magazin merg?", a: "Shopify, WooCommerce, Gomag, MerchantPro și PrestaShop, plus orice platformă care are un feed de produse (Google XML, CSV, JSON), cum sunt Shoprenter, Unas sau OpenCart." },
    { q: "Ce date citiți de pe magazin?", a: "Paginile publice și catalogul de produse (preț, stoc, descriere). Nu cerem permisiuni de scriere și nu trimitem date personale la AI-uri." },
    { q: "Pot anula oricând?", a: "Da. Abonamentul e lunar, fără perioadă minimă, și îl anulezi din Contul meu." },
  ],
  finalTitle: "Află în câteva minute ce spun AI-urile despre magazinul tău",
  finalSub: "Testul e gratuit și nu cere card.",
};

const HU: Dict = {
  metaTitle: "Webshopoknak: legyen a te boltod az, amit az AI ajánl",
  metaDesc: "Nézd meg, ajánlja-e a ChatGPT, a Gemini, a Perplexity, a Claude és a Google AI a webshopodat, ki szerepel helyetted, és mit kell javítanod. Ingyenes próba.",
  eyebrow: "Romániai és magyarországi webshopoknak",
  h1: "Ha a vásárló az AI-t kérdezi, a te webshopodat ajánlja.",
  sub: "Az Echo megmutatja, ajánlja-e a ChatGPT, a Gemini, a Perplexity, a Claude és a Google AI a webshopodat, ki szerepel helyetted, és mit kell javítanod, hogy előrébb kerülj.",
  ctaTrial: "Ingyenes próba indítása", ctaPrices: "Árak",
  ctaNote: "Bankkártya nélkül. Néhány perc múlva látod az első válaszokat a webshopodról.",
  shotAlt: "Az Echo felülete: ki szerepel jobban nálad az AI-válaszokban, az egyes webshopok ajánlási arányával",
  shotCaption: "Képernyőkép az Echo felületéről, tesztadatokkal.",
  stepsTitle: "Hogyan működik",
  steps: [
    { t: "Megadod a webshop címét", d: "Elolvasunk néhány nyilvános oldalt, és megtaláljuk a termékeidet, márkáidat és versenytársaidat. Semmit nem kell telepítened." },
    { t: "Látod, mit mondanak az AI-ok", d: "A vásárlóid kérdéseit feltesszük az AI-oknak: szerepelsz-e, hányadik helyen, és kit ajánlanak helyetted." },
    { t: "Javítasz és követed", d: "Hatás szerinti sorrendben kapod a javításokat, és hétről hétre látod, hogyan javulsz, valamint az AI-ból érkező eladásokat." },
  ],
  featuresTitle: "Mit kapsz a felületen",
  features: [
    { t: "Ajánlanak az AI-ok?", d: "Milyen gyakran szerepelsz a ChatGPT, a Gemini, a Perplexity, a Claude és a Google AI válaszaiban, hányadik helyen és mely versenytársakhoz képest." },
    { t: "Ki előz meg", d: "Azok a webshopok, amelyeket ugyanazokra a kérdésekre helyetted ajánlanak, az arányukkal együtt. Az új versenytársakat magunk találjuk meg a válaszokban." },
    { t: "Milyen termékek, milyen áron", d: "Mely termékeket ajánlja az AI, és mikor mond rólad rossz árat vagy elavult készletet." },
    { t: "Hol hiányzol", d: "Azok az oldalak, amelyeket az AI-ok olvasnak, és ahol a versenytársak szerepelnek, te viszont nem." },
    { t: "Konkrét javítások", d: "Letiltott robotok, hiányzó termékadatok, llms.txt, ChatGPT-feed: pontosan megadjuk, mit kell az oldaladra tenni." },
    { t: "Mérhető eladások az AI-ból", d: "Látod az AI-asszisztensektől érkező rendeléseket, így tudod, mennyit hoz a láthatóság, nem csak azt, mennyire vagy látható." },
  ],
  auditTitle: "Még nem kérsz fiókot? Kérj ingyenes technikai auditot",
  auditSub: "2 perc alatt megnézzük, el tudják-e olvasni az AI-ok a webshopodat: robotok, strukturált adatok, sitemap, llms.txt.",
  auditUrl: "A webshop címe", auditEmail: "E-mail (nem kötelező, elküldjük a jelentést)",
  auditButton: "Ingyenes ellenőrzés", auditPending: "Ellenőrzés… (legfeljebb 1 perc)",
  auditConsent: "Kérek alkalmanként tanácsokat az AI-láthatóságról. Bármikor leiratkozhatok.",
  auditNote: "Az audit eredményét (a webshop nyilvános adatait) megőrizzük, hogy ne kelljen mindent újra ellenőrizni.",
  pricingTitle: "Egyszerű havi díj",
  pricingSub: "Havi előfizetés, minimális időtartam nélkül. Az ingyenes próbával kezdesz, és csak az eredmények után választasz csomagot.",
  perMonth: "/ hó", currency: "lej", popular: "Ajánlott", choose: "Ingyenes próba indítása",
  pricingNote: "Az árak román lejben értendők. A fizetés a Stripe-on keresztül történik. Bármikor lemondhatod a Fiókom oldalon.",
  plans: {
    start: { tagline: "Egy webshopnak, amely tudni akarja, hol tart.", features: ["1 webshop", "30 követett kérdés", "3 AI, heti futtatás", "Technikai audit és javítási lista"] },
    pro: { tagline: "Annak a webshopnak, amely előrébb akar kerülni az ajánlásokban.", features: ["3 webshop", "100 követett kérdés", "Minden AI", "Csatornánkénti feedek, Agent Gate és API"] },
    agentie: { tagline: "Ügynökségeknek, amelyek több webshoppal dolgoznak.", features: ["Korlátlan ügyfél-webshop", "Ügyfélfiókok", "Jelentések az ügynökség arculatával", "Kiemelt támogatás"] },
  },
  trustTitle: "Az adataid a tieid maradnak",
  trust: [
    { t: "Tárhely az EU-ban", d: "Az alkalmazás és az adatbázis Frankfurtban fut. Betartjuk a GDPR-t." },
    { t: "Nincs írási jog", d: "Nem kérünk írási jogot a webshophoz. Csak a katalógust és a nyilvános oldalakat olvassuk." },
    { t: "Nincs személyes adat az AI-nál", d: "A kérdések pontosan úgy mennek az AI-okhoz, ahogy megírod, a vásárlóid adatai nélkül." },
    { t: "Kíméletes olvasás", d: "A katalógust csak akkor és ritkán kérjük le, ha változott, hogy ne terheljük a webshopot." },
  ],
  operatedBy: "Az Echo üzemeltetője:", privacyLink: "Adatvédelmi tájékoztató",
  faqTitle: "Gyakori kérdések",
  faq: [
    { q: "Honnan jönnek az adatok?", a: "A követett kérdéseket közvetlenül a ChatGPT-nek, a Gemininek, a Perplexitynek és a Claude-nak tesszük fel, a hivatalos felületeiken keresztül. A Google AI összefoglalóit egy erre szakosodott szolgáltatáson át olvassuk. Minden választ dátummal megőrzünk, hogy pontosan lásd, mit mondott az AI." },
    { q: "Mit kapok az ingyenes próbában?", a: "20 kérdést teszünk fel a webshopodról a ChatGPT-nek és a Gemininek, és megmutatjuk, milyen gyakran szerepelsz, hányadik helyen vagy, és melyik az 5 leggyakrabban ajánlott webshop. Bankkártya nélkül. A teljes elemzés, minden AI-jal, a csomagválasztás után indul." },
    { q: "Milyen gyakran kérdezitek az AI-okat?", a: "Automatikusan hetente egyszer. A felületen indíthatsz soron kívüli futtatást is; az aznap már feltett kérdésekért nem fizetsz újra." },
    { q: "Milyen webshopmotorokkal működik?", a: "Shopify, WooCommerce, Gomag, MerchantPro és PrestaShop, valamint minden olyan rendszer, amely termékfeedet ad (Google XML, CSV, JSON), például Shoprenter, Unas vagy OpenCart." },
    { q: "Milyen adatokat olvastok a webshopból?", a: "A nyilvános oldalakat és a termékkatalógust (ár, készlet, leírás). Nem kérünk írási jogot, és nem küldünk személyes adatot az AI-oknak." },
    { q: "Bármikor lemondhatom?", a: "Igen. Az előfizetés havi, minimális időtartam nélkül, és a Fiókom oldalon mondhatod le." },
  ],
  finalTitle: "Néhány perc alatt megtudod, mit mondanak az AI-ok a webshopodról",
  finalSub: "A próba ingyenes, és nem kell hozzá bankkártya.",
};

export const STORE_PAGE: Record<Lang, Dict> = { ro: RO, hu: HU };

export async function getStorePageText() {
  const lang = await getLang();
  return { lang, s: STORE_PAGE[lang] };
}

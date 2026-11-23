/**
 * Explicațiile de sub titlurile cardurilor din panou (DESIGN §6.3, KNOWLEDGE A9): ce face cardul și la ce te ajută,
 * într-o propoziție sau două, pentru cineva care vede panoul prima oară. Română completă, maghiară alături.
 * Un card nou din panou primește aici textul lui; `tests/design-rules.test.ts` verifică să nu lipsească.
 */
type Help = { ro: string; hu: string };

export const CARD_HELP = {
  // Acasă
  "home.firstReport": { ro: "Ce pregătim după ce ai adăugat magazinul. Durează câteva minute; pagina se actualizează singură.", hu: "Amit a webshop hozzáadása után előkészítünk. Néhány perc; az oldal magától frissül." },
  "home.trend": { ro: "Cât de des te recomandă AI-urile, zi de zi, față de concurenți. Vezi dacă urci sau cobori.", hu: "Milyen gyakran ajánlanak az AI-k, napról napra, a versenytársakhoz képest. Látod, hogy javulsz-e vagy romlasz." },
  "home.todo": { ro: "Cele mai utile reparații de acum, alese după cât te ajută și cât de greu sunt. Începe cu prima.", hu: "A most leghasznosabb javítások, aszerint válogatva, mennyit segítenek és mennyire nehezek. Kezdd az elsővel." },
  "home.share": { ro: "Din toate recomandările de magazine făcute de AI-uri, cât la sută ajung la tine și cât la fiecare concurent.", hu: "Az AI-k összes webshop-ajánlásából hány százalék jut neked és mennyi az egyes versenytársaknak." },
  "home.alerts": { ro: "Schimbări importante de la ultima vizită: ai urcat, ai coborât, a apărut un concurent nou.", hu: "Fontos változások a legutóbbi látogatás óta: feljebb kerültél, lejjebb kerültél, új versenytárs jelent meg." },
  // Vizibilitate
  "vis.engine": { ro: "Cât de des te numește acest AI când oamenii întreabă de produsele tale, pe ce loc și cine apare în locul tău. Fiecare cifră duce la răspunsurile exacte.", hu: "Milyen gyakran említ ez az AI, amikor a termékeidről kérdeznek, hányadik helyen, és ki jelenik meg helyetted. Minden szám a pontos válaszokhoz vezet." },
  "vis.fixNow": { ro: "Ce poți repara chiar acum ca AI-urile să te recomande mai des, cu linkul spre fiecare reparație.", hu: "Mit javíthatsz most, hogy az AI-k gyakrabban ajánljanak, mindegyikhez link a javításhoz." },
  "vis.trend": { ro: "Procentul de răspunsuri în care apari, zi de zi, lângă cei mai vizibili concurenți.", hu: "A válaszok aránya, amelyekben megjelensz, napról napra, a leglátottabb versenytársak mellett." },
  "vis.rivals": { ro: "Magazinele pe care AI-urile le numesc înaintea ta la aceleași produse. Așa afli de la cine pierzi clienți.", hu: "Webshopok, amelyeket az AI-k előtted említenek ugyanazoknál a termékeknél. Így látod, kinek veszítesz vevőket." },
  "vis.sentiment": { ro: "Ce laudă și ce critică AI-urile la tine (preț, livrare, ofertă, încredere), cu sursa fiecărei fraze.", hu: "Mit dicsérnek és mit kritizálnak nálad az AI-k (ár, szállítás, kínálat, bizalom), minden mondat forrásával." },
  // Surse
  "sources.gaps": { ro: "Site-uri citate de AI-uri (comparatoare, bloguri, forumuri) unde apar concurenții, dar tu nu. Dacă ajungi acolo, AI-urile te văd mai des.", hu: "Az AI-k által idézett oldalak (árösszehasonlítók, blogok, fórumok), ahol a versenytársak megjelennek, te nem. Ha ott leszel, az AI-k gyakrabban látnak." },
  "sources.all": { ro: "Toate site-urile din care și-au luat AI-urile informațiile când au răspuns la întrebările tale.", hu: "Minden oldal, ahonnan az AI-k az információt vették, amikor a kérdéseidre válaszoltak." },
  // Reputație și recenzii
  "reputation.trend": { ro: "Cât la sută din ce spun AI-urile despre tine e pozitiv, zi de zi.", hu: "Az AI-k rólad szóló állításainak hány százaléka pozitív, napról napra." },
  "reputation.claims": { ro: "Afirmațiile concrete ale AI-urilor despre magazin. Verifică-le: una greșită se corectează pe site sau în surse.", hu: "Az AI-k konkrét állításai a webshopról. Ellenőrizd őket: a hibásat az oldalon vagy a forrásokban lehet javítani." },
  "reviews.score": { ro: "Scorul de încredere pe care îl arătăm cumpărătorilor, și din ce se compune. Se calculează doar din fapte verificabile.", hu: "A vásárlóknak mutatott bizalmi pontszám és összetevői. Csak ellenőrizhető tényekből számoljuk." },
  "reviews.ask": { ro: "Creezi un link de recenzie pentru o comandă reală. Recenziile din comenzi verificate cresc încrederea AI-urilor în tine.", hu: "Értékelési linket hozol létre egy valós rendeléshez. Az ellenőrzött rendelésekből származó értékelések növelik az AI-k bizalmát." },
  "reviews.list": { ro: "Recenziile lăsate de clienți prin linkurile tale, cu nota și comanda.", hu: "A vásárlók által a linkjeiden keresztül írt értékelések, pontszámmal és rendeléssel." },
  // Vânzări
  "sales.perEngine": { ro: "Câți vizitatori și câte comenzi îți aduce fiecare AI. Așa vezi ce valoare are vizibilitatea în bani.", hu: "Hány látogatót és rendelést hoz az egyes AI-k. Így látod, mennyit ér pénzben a láthatóság." },
  "sales.install": { ro: "Codul care numără vizitele și comenzile venite din AI-uri. Îl pui o singură dată pe site.", hu: "A kód, amely számolja az AI-kból érkező látogatásokat és rendeléseket. Egyszer kell az oldalra tenni." },
  // Rapoarte
  "reports.history": { ro: "Rapoartele generate până acum, cu data și adresa la care au fost trimise. Deschide unul ca să vezi cum ai evoluat.", hu: "Az eddig készült jelentések dátummal és a címmel, ahová elküldtük. Nyiss meg egyet, hogy lásd, hogyan fejlődtél." },
  // Audit
  "audit.group.acces": { ro: "Dacă roboții AI pot intra pe site și citi paginile. Fără acces, AI-urile nu te pot recomanda.", hu: "Be tudnak-e jutni az AI-robotok az oldalra és olvasni az oldalakat. Hozzáférés nélkül az AI-k nem ajánlhatnak." },
  "audit.group.date": { ro: "Informațiile pe care AI-urile le citesc direct din cod (preț, stoc, marcă, EAN). Cu ele îți înțeleg corect produsele.", hu: "Az AI-k által közvetlenül a kódból olvasott adatok (ár, készlet, márka, EAN). Ezekkel értik meg helyesen a termékeidet." },
  "audit.group.continut": { ro: "Dacă textele de pe site răspund la ce întreabă cumpărătorii. AI-urile citează paginile care răspund clar.", hu: "Válaszolnak-e az oldal szövegei a vásárlók kérdéseire. Az AI-k a világosan válaszoló oldalakat idézik." },
  "audit.group.incredere": { ro: "Semnele că magazinul e real și sigur (date firmă, contact, retur). AI-urile recomandă mai ușor un magazin de încredere.", hu: "Jelek, hogy a webshop valós és biztonságos (cégadatok, kapcsolat, visszaküldés). Az AI-k könnyebben ajánlanak megbízható webshopot." },
  "audit.group.viteza": { ro: "Cât de repede se încarcă paginile. Un site lent e citit mai rar de roboți și părăsit de clienți.", hu: "Milyen gyorsan töltődnek be az oldalak. A lassú oldalt a robotok ritkábban olvassák, a vevők elhagyják." },
  "audit.bots": { ro: "Ce roboți AI lasă robots.txt să citească site-ul. Un robot blocat nu poate afla nimic despre produsele tale.", hu: "Mely AI-robotokat engedi a robots.txt olvasni. Egy tiltott robot semmit sem tudhat meg a termékeidről." },
  "audit.fix": { ro: "Pașii de urmat pe site, sau de dat programatorului. După ce îi faci, rulează auditul din nou ca să verificăm.", hu: "A lépések az oldalon, vagy a fejlesztőnek átadva. Utána futtasd újra az auditot, és ellenőrizzük." },
  // Feed
  "feed.labels": { ro: "Etichete puse automat pe fiecare produs (recomandat de AI, fără vânzări, preț peste piață…). Ajung în feed ca custom_label, ca să faci campanii separate pentru fiecare grup.", hu: "Minden termékre automatikusan tett címkék (AI ajánlja, nincs eladás, piaci ár felett…). custom_label-ként kerülnek a feedbe, így csoportonként külön kampányt indíthatsz." },
  "feed.chatgpt": { ro: "Lista de produse pe care o citește ChatGPT când recomandă cumpărături. Echo o face singur din catalog și o reface zilnic; tu doar lipești adresa în ChatGPT.", hu: "A terméklista, amelyet a ChatGPT olvas vásárlási ajánláskor. Az Echo magától készíti a katalógusból és naponta frissíti; neked csak be kell másolnod a címet a ChatGPT-be." },
  "feed.channels": { ro: "Același catalog, în formatul cerut de Google, Meta, comparatoare și marketplace-uri. Pornești un canal și primești adresa pe care o dai platformei.", hu: "Ugyanaz a katalógus a Google, a Meta, az árösszehasonlítók és piacterek formátumában. Bekapcsolsz egy csatornát, és megkapod a címet, amelyet a platformnak adsz." },
  "feed.fixes": { ro: "Titluri, descrieri, EAN, marcă și categorie îmbunătățite pentru fiecare produs, cu un scor de încredere. Ce aprobi intră doar în feed, nu pe site.", hu: "Termékenként javított címek, leírások, EAN, márka és kategória, megbízhatósági pontszámmal. Amit jóváhagysz, csak a feedbe kerül, a webshopba nem." },
  "feed.view": { ro: "Produsele exact cum le trimitem canalului ales, după reguli și reparații. Uită-te aici întâi: dacă vezi titluri fără marcă, produse fără stoc sau descrieri lipsă, regulile de mai jos le repară.", hu: "A termékek pontosan úgy, ahogy a kiválasztott csatornának küldjük, szabályok és javítások után. Először itt nézd meg: ha márka nélküli címet, készlethiányt vagy hiányzó leírást látsz, az alábbi szabályok kijavítják." },
  "feed.rules": { ro: "Schimbări automate „dacă… atunci…” aplicate produselor înainte să plece în feed, fără să atingi site-ul. Te ajută să scoți produsele fără stoc, să pui marca în titlu ca AI-urile să te găsească, să completezi ce lipsește sau să grupezi produse pentru campanii. Mai jos îți propunem doar regulile de care feed-ul tău are nevoie acum.", hu: "Automatikus „ha… akkor…” változtatások a termékeken, mielőtt a feedbe kerülnek, a webshop érintése nélkül. Segít kivenni a készlethiányos termékeket, márkát tenni a címbe, hogy az AI-k megtaláljanak, pótolni a hiányzó adatokat vagy kampányokhoz csoportosítani. Lent csak azokat a szabályokat javasoljuk, amelyekre a feednek most szüksége van." },
  "fixes.list": { ro: "Îmbunătățirile propuse pentru fiecare produs (titlu, descriere, EAN, marcă, categorie), cu scorul de încredere. Le aprobi sau le respingi; ce aprobi intră doar în feed, nu pe site.", hu: "Termékenként javasolt javítások (cím, leírás, EAN, márka, kategória) megbízhatósági pontszámmal. Jóváhagyod vagy elutasítod őket; amit jóváhagysz, csak a feedbe kerül, a webshopba nem." },
  // Agent Gate
  "gate.rules": { ro: "Ce se întâmplă cu o comandă plasată de un agent AI: o accepți, ceri confirmare, o verifici manual sau o respingi. Te ferește de comenzi false sau riscante.", hu: "Mi történik egy AI-ügynök által leadott rendeléssel: elfogadod, megerősítést kérsz, kézzel ellenőrzöd vagy elutasítod. Megvéd a hamis vagy kockázatos rendelésektől." },
  "gate.try": { ro: "Simulezi o comandă de la un agent ca să vezi ce decizie ar lua regulile tale, fără nicio comandă reală.", hu: "Szimulálsz egy ügynöki rendelést, hogy lásd, mit döntenének a szabályaid, valós rendelés nélkül." },
  "gate.orders": { ro: "Comenzile primite de la agenți AI, cu riscul calculat și decizia luată.", hu: "Az AI-ügynököktől érkezett rendelések a kiszámolt kockázattal és a döntéssel." },
  // Roboți AI
  "bots.daily": { ro: "De câte ori au intrat roboții AI pe site în fiecare zi. Mai multe vizite înseamnă că AI-urile îți citesc mai des paginile.", hu: "Hányszor jártak az AI-robotok az oldalon naponta. Több látogatás azt jelenti, hogy az AI-k gyakrabban olvassák az oldalaidat." },
  "bots.pages": { ro: "Paginile pe care roboții AI le citesc cel mai des. Pe acestea merită să ai prețul, stocul și descrierea la zi.", hu: "Az AI-robotok által leggyakrabban olvasott oldalak. Ezeken érdemes naprakészen tartani az árat, a készletet és a leírást." },
  "bots.log": { ro: "Încarci jurnalul serverului și vedem ce roboți AI au vizitat site-ul. Nu trebuie instalat nimic.", hu: "Feltöltöd a szervernaplót, és megnézzük, mely AI-robotok jártak az oldalon. Semmit nem kell telepíteni." },
  "bots.cloudflare": { ro: "Dacă site-ul e pe Cloudflare, un mic cod ne trimite singur vizitele roboților AI, în fiecare zi.", hu: "Ha az oldal a Cloudflare-en van, egy kis kód naponta magától elküldi nekünk az AI-robotok látogatásait." },
  // Setări
  "settings.catalog": { ro: "De unde luăm produsele (feed, API sau platforma magazinului). Cu catalogul real verificăm prețurile spuse de AI-uri și propunem întrebări pe produsele tale.", hu: "Honnan vesszük a termékeket (feed, API vagy a webshop platformja). A valós katalógussal ellenőrizzük az AI-k által mondott árakat, és a termékeidre javasolunk kérdéseket." },
  "settings.aiCosts": { ro: "Ce AI-uri întrebăm, cât costă întrebările luna aceasta și cât a rămas din buget. Nu se cheltuie peste plafon.", hu: "Mely AI-kat kérdezzük, mennyibe kerülnek a kérdések ebben a hónapban, és mennyi maradt a keretből. A plafon felett nem költünk." },
  // Dezvoltatori
  "dev.mcp": { ro: "O adresă prin care ChatGPT, Claude și alți asistenți îți citesc direct catalogul, prețul și stocul. Așa răspund corect despre produsele tale.", hu: "Egy cím, amelyen a ChatGPT, a Claude és más asszisztensek közvetlenül olvassák a katalógusodat, árat és készletet. Így helyesen válaszolnak a termékeidről." },
  "dev.mcpCalls": { ro: "Ultimele întrebări puse de asistenții AI prin serverul tău MCP. Vezi ce caută cumpărătorii prin AI.", hu: "Az AI-asszisztensek legutóbbi kérdései az MCP-szervereden keresztül. Látod, mit keresnek a vásárlók AI-n át." },
  "dev.apiKeys": { ro: "Chei pentru programatorul tău, ca să citească datele Echo din alte aplicații. O cheie se poate revoca oricând.", hu: "Kulcsok a fejlesztődnek, hogy más alkalmazásokból olvassa az Echo adatait. Egy kulcs bármikor visszavonható." },
  "dev.webhooks": { ro: "Echo anunță singur o adresă a ta când se întâmplă ceva (comandă venită din AI, alertă nouă, recenzie nouă), ca să legi alte sisteme.", hu: "Az Echo magától értesít egy általad megadott címet, ha történik valami (AI-ból jött rendelés, új riasztás, új értékelés), így más rendszereket köthetsz be." },
  // Cont
  "account.team": { ro: "Cine are acces la panou și la ce magazine. Invită colegi și alege ce pot face.", hu: "Kinek van hozzáférése a panelhez és mely webshopokhoz. Hívj meg kollégákat, és válaszd ki, mit tehetnek." },
  "account.2fa": { ro: "Un cod din telefon cerut la intrare, pe lângă parolă. Contul rămâne sigur chiar dacă cineva află parola.", hu: "Belépéskor a jelszó mellett egy telefonos kódot is kérünk. A fiók akkor is biztonságban marad, ha valaki megtudja a jelszót." },
  "account.agency": { ro: "Pentru agenții: administrezi magazinele clienților dintr-un singur cont și le trimiți rapoarte cu marca ta.", hu: "Ügynökségeknek: egy fiókból kezeled az ügyfelek webshopjait, és a saját márkáddal küldesz jelentéseket." },
  "account.billing": { ro: "Planul tău și perioada de probă. De aici alegi alt plan și vezi facturile.", hu: "A csomagod és a próbaidő. Innen választasz másik csomagot és látod a számlákat." },
} satisfies Record<string, Help>;

export type CardHelpId = keyof typeof CARD_HELP;

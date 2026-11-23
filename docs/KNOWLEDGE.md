# Echo: memoria permanentă a proiectului

> Se citește **primul**, înainte de orice lucru la Echo, de oricine (om sau Claude). Aici stă tot ce am învățat: ce urmărim și ce nu mai facem.
> Copia principală e în repo, `docs/KNOWLEDGE.md`. O copie identică stă în fișierele proiectului: `agentready/fundatie/KNOWLEDGE.md`.
> Versiunea 1, 22.11.2026. Scris din memoria proiectului, din documentele din `fundatie/`, din `CLAUDE.md`, `docs/DESIGN.md` și din toate discuțiile cu ZoZo din 19–22.11.2026.

## Cum se folosește

- **Partea A** spune ce trebuie să facem și ce urmărim mereu. Fiecare punct are motivul și felul în care îl aplicăm.
- **Partea B** spune ce NU mai facem. Fiecare punct e o greșeală reală, cu data, în forma „Nu / În schimb / De ce”.
- **Partea C** e regula de întreținere: cum și când se completează documentul.
- Când o regulă de aici se ciocnește cu altceva, ordinea e: ce spune ZoZo acum → acest document → `CLAUDE.md` → restul documentelor.

---

## Pe scurt, despre proiect

- **Ce e Echo:** o platformă care arată magazinelor online din România și Ungaria dacă le recomandă AI-urile (ChatGPT, Claude, Gemini, Google AI Overviews etc.), de ce nu, și le repară problemele. Are și o parte gratuită pentru cumpărători (căutare prin toate AI-urile, magazine de încredere). Numele „Echo.ai” e provizoriu, ales pe 19.11.2026 („un semn care se întoarce la tine cu feedback”).
- **Cine lucrează:** ZoZo (proprietar, scrie în română) și Claude. Răspunsurile și textele pentru utilizator sunt în română; codul și commiturile în engleză.
- **Unde:** repo `gymzzk-cloud/echo` (privat). Online: https://echo-ai-9fnz.onrender.com (Render, workspace „ZoZo”). Un merge pe `main` publică automat.
- **Magazinele noastre de test:** shopexpert.com/ro (întâi), shopexpert.com/hu (mai târziu), hardlineconstruct.ro.
- **Documente obligatorii:** `CLAUDE.md` (reguli de lucru), `docs/DESIGN.md` + `docs/design/ghid-vizual.html` (design), `PLAN-TEHNIC.md` și `FUNCTII.md` din `fundatie/`.

---

## A. Ce trebuie / ce urmărim

### A0. Doar date reale, verificate (regula de bază)

0. **Echo lucrează doar din realitate: ce e efectiv în feed-urile trimise AI-urilor, ce apare efectiv în răspunsurile AI și ce e pe site-ul live.** *(ZoZo, 23.11.2026: „este important ca echo să cumpere realitatea, ce este în feeduri ai, ce apare din răspunsurile ai, și fără să greșim… doar din date reale putem lucra”; „așa tot ce facem e inutil dacă nu oferim informații corecte”)*
   De ce: o singură afirmație falsă face clientul să nu mai creadă nimic din panou.
   Cum:
   - Nicio afirmație din presupuneri. Fiecare cifră, problemă sau recomandare vine dintr-o sursă reală (feed, răspuns AI salvat, pagina live) și are lângă ea linkul spre dovadă.
   - Când nu am putut verifica (timeout, firewall, pagină pe care nu o recunoaștem), scriem **„nu am putut verifica”**, nu „lipsește”. O verificare nesigură nu intră în scor și nu creează acțiuni (starea `unknown` din audit).
   - Nu inventăm date nici în codul propus („Rezolvă”): siglă, zile de retur, livrare sau plată necitite de pe site rămân „[completează]”.
   - **Nimic nu e raportat „gata” până nu e verificat pe producție pe ShopExpert RO**, magazinul etalon: deschidem paginile panoului pe https://echo-ai-9fnz.onrender.com și comparăm cu shopexpert.com/ro. După fiecare publicare, workerul rulează singur verificarea pe etalon (`src/core/golden.ts`, rezultatul în /admin/magazine); dacă găsește o afirmație falsă, nu raportăm gata.
   - Adevărul despre etalon (verificat de mână, 23.11.2026): JSON-LD Product complet pe produse; sitemap la `/ro/sitemap.xml` (≈9.700 adrese, răspunde în ~11 s); CUI RO16766463 în Termeni; produsele au „Detalii tehnice / Avantaje / Conținut pachet”; fără bloc Organization; fără `lang` pe `<html>`; fără ANPC/SOL; shopexpert.ro și hardlineconstruct.ro sunt ale aceluiași client.

0b. **Orice listă e ordonată după importanță și spune câte arată din câte sunt.** *(ZoZo, 23.11.2026: „mereu să ții cont de ordinea de importanță, sau să întrebi înainte cum vrei să fie sortarea sau câte produse afișăm”)*
   De ce: dacă lista e tăiată fără să spunem, clientul crede că produsul lipsește (B39: „GSR 18V-65 (SOLO)” nu apărea la căutare).
   Cum:
   - Înainte de orice listă nouă (căutare, tabel, top, propuneri), hotărâm ordinea după ce contează pentru magazin: potrivirea exactă (cod producător, EAN) întâi, apoi ce e mai relevant (vânzări, apariții în AI, gravitatea problemei), apoi restul.
   - Spunem mereu câte arătăm și câte am găsit („Arătăm 50 din 63”), cu paginare sau cu un sfat de restrângere. Nicio listă nu se taie în tăcere.
   - Când nu e clar ce ordine sau câte rânduri vrea ZoZo, **întrebăm înainte** de a construi, cu o propunere recomandată.

0c. **Scorul se arată separat pe „Produse focus” (prioritar) și pe „Tot magazinul”, fiecare cu numărul de produse.** *(ZoZo, 23.11.2026: „Produse focus – analiza 80/100 – x produse, separat analiza întreg magazin 70/100 – y produse … să afișăm focus prioritar”)*
   De ce: într-un catalog mare, produsele mărunte și irelevante (șaibe, benzi) trag scorul în jos, iar un scor dintr-un singur produs ales la întâmplare sărea între 83 și 88.
   Cum:
   - Setul focus, din date reale, pentru orice magazin (`src/core/focus.ts`, calculat în worker): produsele alese de magazin, cele mai vândute (când platforma ne dă topul), cele numite deja de AI-uri și cele din categoriile de focus (propuse automat, alese în Setări, opțional filtrate pe mărci).
   - Orice cifră spune pe ce set e socotită. Verificările pe produse (descrieri) se fac pe tot catalogul în SQL, nu pe o pagină aleasă la întâmplare.
   - Înainte de feed: doar ce vedem pe site (meniu, prima pagină, sitemap), spus exact („~9.700 de pagini în sitemap”, nu „produse”); fără sitemap spunem asta, fără cifre ghicite.

### A1. Mod de lucru și publicare

1. **Nimic nu rămâne nepublicat.** *(ZoZo, 20.11.2026)*
   De ce: ZoZo testează doar pe site-ul live; o modificare uitată pe o ramură nu există pentru el.
   Cum: orice modificare terminată se unește în `main` și se publică (ZoZo a aprobat dinainte). La finalul fiecărei sarcini verificăm că nu a rămas niciun PR deschis sau ramură neunită și că deploy-ul e live.

2. **Nu publicăm cât timp ZoZo testează live.** *(ZoZo, 20.11.2026: „sper să nu întrerupi cu update”)*
   De ce: fiecare deploy repornește serverul și workerul, deci întrerupe analiza și pagina pe care o privește.
   Cum: dacă ZoZo a spus că testează, lucrul terminat stă în PR, neunit, și îl unim când spune că a terminat. Spunem asta în răspuns. Strângem corecturile și publicăm o dată, nu de zece ori.

3. **Fiecare funcție e o funcție reală din panou, pe care magazinul o folosește singur.** *(ZoZo, 20.11.2026: „ar trebui să facă feedul panoul Echo, nu tu”)*
   De ce: vrem să testăm produsul, nu ce face Claude de mână.
   Cum: nu generăm nimic manual pentru ZoZo (feed, raport, link). Construim butonul în panou și îi dăm pașii de test ca unui magazin.

4. **Construim acum, corectăm după test.** *(ZoZo, 19.11.2026: „De ce zici 3 luni? Hai să creăm totul acum”)*
   De ce: ZoZo vrea un produs pe care să-l încerce pe magazinele lui cât mai repede.
   Cum: facem pași mici, dar compleți și publicați; corecturile vin din testele reale pe ShopExpert.

5. **O regulă spusă de ZoZo se scrie imediat în regulile de lucru.** *(ZoZo, 20.11.2026: „am rugat să notăm aceste lucruri în modul de lucru, să nu mai pățim”)*
   Cum: în aceeași tură o trecem în acest document și, dacă e tehnică, și în `CLAUDE.md`.

6. **Linkul live, nu capturi, când ZoZo testează.** *(ZoZo, 20.11.2026: „nu am nevoie de capturi, vreau să văd live”)*
   Cum: îi dăm linkul public și pașii. Capturile rămân obligatorii doar în PR, pentru schimbările de interfață (regula din `CLAUDE.md`).

7. **Răspunsuri scurte și directe, în română simplă.** ZoZo cere des „dă-mi doar URL-ul”, „cum fac”. Întâi răspunsul sau pasul, apoi detaliile.

8. **Înainte de orice cheltuială nouă cu AI, facem o estimare de cost.** *(ZoZo, 20.11.2026: „să faci înainte un calcul aprox. de cost”)*
   Cum: arătăm costul pe analiză și pe lună și cerem acordul pentru orice cheltuială mai mare (mai multe AI-uri sau mai multe întrebări).

### A2. Date reale și cifre corecte

9. **Doar date reale în panou.** *(ZoZo, 20.11.2026: „vad doar rezultate reale acum? nu sunt date inventate?”, „să golim datele ireale”)*
   De ce: cifrele inventate fac produsul inutil.
   Cum: fără produse de test și fără răspunsuri AI simulate (`ALLOW_DEMO_AI=1` doar pentru demo, niciodată pe contul real). Seed-ul de producție e profilul real ShopExpert (`SEED_MODE=real`).

10. **Identitatea magazinului se potrivește strict: piață, domeniu, alias-uri, limbă.** *(ZoZo, 20.11.2026: „mi-a dat rezultat Trustpilot pentru shopexpert.dk… altfel nu e util nimic”)*
    Cum: o mențiune contează pentru magazin doar dacă duce la un domeniu sau alias al lui, pe piața lui. Omonimele (shopexpert.dk) se exclud. Onboarding-ul are un pas „Identitate” confirmat de client.

11. **Când un AI nu a putut fi întrebat, spunem motivul, nu „nu ești prezent”.** *(ZoZo, 20.11.2026)*
    Cum: rulările cu eroare sau peste limită apar ca „nu am putut întreba” cu motivul, nu intră în scor și nu se numără ca absență.

12. **Aceleași cifre se leagă între pagini.** Scorul, „Apari în răspunsuri” și cota față de concurenți vin din aceeași rulare și arată același număr peste tot (corectat pe 20.11.2026). Fiecare cifră spune perioada și sursa.

13. **Produse cu același titlu la prețuri diferite nu sunt o eroare la ShopExpert.** *(ZoZo, 20.11.2026)* Sunt coduri diferite, cu termene de livrare diferite. Nu le raportăm ca problemă.

13b. **Orice cifră despre un produs vine cu identificarea lui și cu dovada.** *(ZoZo, 23.11.2026: „nu apare și cod de produs… după ce criteriu zice că ChatGPT zice 385 lei sau Claude 326… trebuie să îmi arăți ceva să găsesc mai întâi dacă chiar așa apare, apoi să rezolv problemele”)*
    De ce: clientul verifică întâi că problema e reală, abia apoi o repară.
    Cum: pe fiecare produs arătăm codul din catalog, EAN-ul și linkul spre pagina lui. Pentru fiecare apariție în AI păstrăm și arătăm AI-ul, data și ora, întrebarea, rândul exact cu prețul și criteriul după care am recunoscut produsul (cod, link sau numele complet), plus tot răspunsul. Un produs se recunoaște doar după aceste criterii sigure, niciodată după câteva cuvinte comune (PR #43).

13c. **Magazinul alege singur ce produse întrebăm AI-urile.** *(ZoZo, 23.11.2026: „să pot numi eu alte produse dacă vreau, să șterg și să adaug altele din catalog… fiecare magazin știe mai bine ce produse să verifice”)*
    Cum: pagina „Produse urmărite” (`/panou/produse-urmarite`): caută după cod, EAN, cod producător sau nume, sau lipește o listă de coduri; „Scoate” oprește întrebarea și lista automată nu o mai pune la loc; cele propuse automat (cele mai vândute, din fiecare categorie) umplu locurile libere. Aceeași limită pe plan ca întrebările alese de mână, același buget lunar, nicio întrebare plătită de două ori. „Urmărește în AI” din fișa produsului intră în aceeași listă.

### A3. Întrebările urmărite (ce întrebăm AI-urile)

14. **Întrebările vin din catalogul real și seamănă cu ce caută un om.** *(ZoZo, 20.11.2026)*
    Cum: nume de produs (marcă + model), cod de producător, EAN, „model + preț”, „model cel mai ieftin”, tip de produs (opțional + marcă), doar din produse în stoc.

15. **Produsele populare și importante au prioritate, pentru orice client, nu doar ShopExpert.** *(ZoZo, 20.11.2026)*
    Cum: `popularity_rank` din feed (vânzări, bestseller), sortarea de popularitate a platformei; butonul „Urmărește în AI” pe Produse fixează un produs.

16. **Păstrăm și întrebările generale pe tip de produs, în stilul Peec, dar nu pe cele vagi.** *(ZoZo, 20.11.2026: „trebuie să rămână și alea generale, caut un fierăstrău circular cel mai bun preț, eventual pe fiecare brand”)*
    Cum: mixul de ~30: ~24 de întrebări de intenție pe tipurile reale din catalog, ~4 produse vândute des, 2 despre magazin.

17. **Căutările reale din Google (Search Console) sunt următorul pas, încă neimplementat.**

### A4. Concurenți și recomandări

18. **Concurenții care apar mai bine decât magazinul se adaugă automat.** *(ZoZo, 20.11.2026)*
    Cum: din răspunsurile AI deja salvate, fără cost nou; intră cine e recomandat în locul magazinului de cel puțin 2 ori (maximum 8). Marketplace-urile (eMAG, Altex, Flanco) contează, marcate „marketplace”. Clientul poate scrie și el concurenți, iar noi îi spunem că mai adăugăm ce găsim după rulare.

19. **Ne măsurăm cu Peec și cu realitatea.** *(ZoZo, 20.11.2026: „aici imediat a găsit competitori importanți: Dedeman, AtelierulTău”)* Rezultatele trebuie să găsească repede concurenții reali. Magazinele și mărcile producătorilor stau separat.

20. **Recomandările sunt doar lucruri pe care magazinul le poate face.** *(ZoZo, 20.11.2026)* Recenzii, comparatoare, forumuri, presă, propriul site. La site-urile producătorilor, cel mult „intră în lista de distribuitori”.

21. **Magazinele proprii ale clientului nu sunt concurenți sau surse.** *(ZoZo, 20.11.2026)*

### A5. Viteză (prioritate de top)

22. **Fiecare pagină a panoului răspunde sub 1 secundă în producție.** *(ZoZo, 20.11.2026: „viteza este foarte importantă”)*
    De ce: pe Render gratuit (0,1 procesor) panoul părea înghețat.
    Cum: regulile „Viteză” din `CLAUDE.md`: nimic pe tot catalogul la deschiderea paginii, calcule grele în worker și salvate, paginare, `count`/`group by` în SQL, `Map`/`Set` în loc de bucle în bucle, index pe filtrele noi, partea grea în `<Suspense>`, `prefetch={false}` în panou. Înainte de merge: `PERF_SEED=15000 pnpm perf`; după publicare verificăm `responseTimeMS` în logurile Render.

23. **Clicul din meniu arată imediat că se încarcă** (spinner, schelet `loading.tsx`).

### A6. Lucrări în fundal

24. **Butonul care pornește o lucrare dispare cât timp lucrarea e la coadă sau în lucru.** *(ZoZo, 20.11.2026: „să nu mă lase să apăs butonul pornește analiza acum… în așteptare la fel ar trebui să dispară”)*
    Cum: `busyKinds()` / `syncingConnections()`; serverul refuză oricum dublurile în `enqueue()`. Joburile mai vechi de 30 de minute sunt considerate blocate.

25. **Starea se actualizează singură, fără refresh.** *(ZoZo, 20.11.2026: „așa nu știi când se termină și tot dai refresh”)*
    Cum: `JobWatcher` în layout-ul panoului arată „În lucru: …”, apoi „gata la HH:MM” sau eroarea, și reîncarcă datele paginii. Orice lucrare nouă primește un nume în `JOB_LABELS`.

### A7. Preluarea datelor de la magazine

26. **Preluarea e ușoară pentru magazine.** *(ZoZo, 20.11.2026: „să ții cont cum iei datele, să nu fie greoi pentru magazine… să luăm balansat când e nevoie”)*
    Cum: totul trece prin `politeFetch` (o cerere pe host, pauze, `Retry-After`), cereri condiționate (ETag/Last-Modified), sincronizare la 12 h + decalaj per magazin, cel mult 5 sincronizări pornite odată, scriem în bază doar ce s-a schimbat, refolosim cache-ul (audit 24 h, date firmă 90 de zile, politici 30 de zile). Detalii: `docs/adr/0002-preluare-usoara.md`.

27. **Nu citim produsele pagină cu pagină de pe site.** Produsele vin dintr-o singură sursă de date (feed, API, catalogul public al platformei); din site citim cel mult 15–20 de pagini.

28. **Condițiile magazinului se citesc automat, fără câmpuri manuale.** *(ZoZo, 20.11.2026: „nu are rost, scoate”)*
    Cum: livrarea și stocul vin pe fiecare produs din catalog; returul, plata și întrebările frecvente se citesc de pe site de jobul `policies`. Nu readucem câmpuri de completat; îmbunătățim extractorul.

29. **Un singur feed de intrare pe magazin; Echo face din el toate ieșirile** (ChatGPT, Google Merchant etc.). Acceptăm XML, CSV, YAML/OpenAPI și API-uri cu cheie *(ZoZo, 19.11.2026: „să accepte și YAML”)*.

30. **Un audit gratuit salvează magazinul în registrul nostru**, chiar nerevendicat, ca să nu refacem verificările *(ZoZo, 20.11.2026)*. Consimțământul de marketing e separat.

### A8. Costuri AI

31. **Cât mai puțini tokeni, cost cât mai mic.** *(ZoZo, 20.11.2026: „optimizat rentabil, să nu forțăm unde nu trebuie”)*
    Cum: modele ieftine implicit (gpt-5-mini low, claude-haiku-5-5, Gemini Flash, Perplexity sonar), răspuns plafonat, întrebarea pleacă exact cum e scrisă, aceeași întrebare pe același AI o singură dată pe zi, rulare automată o dată la 7 zile, buget lunar per magazin (5 $ implicit), AI-urile fără cheie nu sunt întrebate. Detalii: secțiunea „Costuri AI” din `CLAUDE.md`.

32. **Testul gratuit folosește doar AI-urile ieftine, dar le numește pe toate.** *(ZoZo, 20.11.2026)* Gratuit: ChatGPT și Gemini. După alegerea unui plan pornește singură analiza completă, cu Claude, Perplexity, Google și ce mai adăugăm.

### A9. Design și interfață

33. **Un singur fișier de design, respectat strict peste tot.** *(ZoZo, 20.11.2026, după modelul proiectului „chonsilio”)*
    Cum: `docs/DESIGN.md`: același buton pentru aceeași funcție (un singur verde pe card, ștergerea roșie), carduri, chenare și spații din scară, formulare aliniate sus, insigne pe un rând, fără scroll orizontal la 360/768/1366 px, luminos și întunecat. Verificăm cu `pnpm test` (`tests/design-rules.test.ts`) și `pnpm ui:check`.

34. **Fișierul de design are un exemplu desenat pentru fiecare regulă, Corect lângă Greșit.** *(ZoZo, 20.11.2026: „perfect așa”)* E `docs/design/ghid-vizual.html`. Orice regulă nouă primește și ilustrația ei.

35. **Culorile rămân cum sunt** (luminos și întunecat, verde-teal ca principală). *(ZoZo, 20.11.2026: „retrag ce am zis de culori… doar să lucrăm la detalii”)* Nu schimbăm paleta fără să întrebăm. Tema implicită în onboarding e cea luminoasă.

36. **Meniul are grupuri clare** (Vizibilitate, Vânzări, Reparații, Cont…), ca antete de secțiune, nu ca butoane la fel cu paginile. *(ZoZo, 20.11.2026; făcut în PR #23)*

37. **Titlurile cardurilor spun problema și nu contrazic conținutul.** („Pagina principală se încarcă greu”, nu „Pagina principală răspunde rapid”.)

38. **Textele din câmpuri sunt generale și clare pentru orice magazin**, de exemplu „Scrie numele concurentului sau adresa site-ului lui”. *(ZoZo, 20.11.2026)*

38b. **Fiecare card din panou are sub titlu o explicație pentru începători: ce face și la ce te ajută.** *(ZoZo, 23.11.2026, despre cardul „Reguli” din Feed: „la ce ajută? … ar trebui să aibă sub titlu o descriere pentru a înțelege la ce se folosește… că așa nimeni n-o să știe”)*
    De ce: clientul e proprietar de magazin, nu specialist în feed-uri sau AI; un card pe care nu-l înțelege nu e folosit.
    Cum: `description={<CardHelp id="…" />}` pe orice `<Card title>`, cu textul în `src/lib/card-help.ts` (RO + HU). Testul din `tests/design-rules.test.ts` pică dacă lipsește. Regula e și în `docs/DESIGN.md` §6.3.

38c. **O unealtă arată întâi datele reale și spune singură dacă ai nevoie de ea.** *(ZoZo, 23.11.2026: „de ce nu arătăm acum cum arată feed-ul, clientul să vadă produsele cum apar, să știe dacă trebuie introdusă regula sau nu”)*
    Cum: pe pagina Feed, „Cum arată feed-ul acum” arată produsele exact cum pleacă spre fiecare canal (ChatGPT, Google, Meta…) și câte n-au stoc, descriere, marcă sau EAN; „Reguli” propune doar regulile care ar schimba ceva pe produsele lui, cu exemple „înainte → după” și buton „Adaugă regula”, iar când nu e nevoie spune „Nu trebuie să adaugi nicio regulă”. Exemplele gata făcute completează formularul.

### A10. Onboarding și planuri

39. **Onboarding-ul e un test gratuit în stilul Peec, interactiv și „catchy”.** *(ZoZo, 20.11.2026)* Clientul dă site-ul, vede o scanare animată (cu sigla magazinului, cerută și apreciată de ZoZo), completează categorii, mărci, produse, piețe și concurenți (precompletate din site), apoi vede o primă rulare live. Fără feed, API sau catalog în această fază.

40. **Prima rulare dă doar o „gustare”.** *(ZoZo, 20.11.2026)* Vizibilitate %, locul, top 5 magazine. Analiza detaliată rămâne blocată până la alegerea unui plan, iar datele blocate nu se trimit în browser înainte de plată.

### A11. Feed, MCP și AI-uri

41. **Feed-ul ChatGPT se pornește din panou** (Reparații → Feed și canale), cu adresă `/feed/<token>.csv` pusă în ChatGPT ca „hosted URL”. OpenAI a acceptat 27.818 din 27.828 de produse ShopExpert (20.11.2026).
41b. **ChatGPT Ads Manager folosește același feed** (ads.openai.com → Tools → Feeds, adresă găzduită): aceeași schemă de produse OpenAI ca ChatGPT Merchants, deci nu facem un al doilea canal. Pașii apar pe cardul ChatGPT (PR #85, 23.11.2026). ZoZo l-a importat pe 23.11.2026; previzualizarea reclamei nu a putut deschide shopexpert.com (Cloudflare).
42. **MCP-ul nu e un feed.** E conectorul prin care un AI întreabă magazinul live. Ajunge la public doar după listarea în directoarele Claude și ChatGPT; un conector adăugat în contul tău îl vede doar contul tău.
43. **Pentru listarea MCP mai trebuie:** domeniu propriu, Render plătit, datele firmei, logo pătrat; Cloudflare de pe shopexpert.com trebuie să lase roboții AI verificați. Recomandat: un singur conector Echo pentru toate magazinele.
44. **Cheile AI sunt puse** (OpenAI, Anthropic, Gemini cu facturare). Nu le mai cerem. Google AI Overviews merge prin SerpApi (`SERPAPI_API_KEY`, 100 de căutări gratuite pe lună). Din 22.11.2026: Google AI Mode și Copilot tot prin SerpApi (aceleași credite, pornite implicit), Grok prin `XAI_API_KEY` (console.x.ai), Meta AI prin `META_API_KEY` (Meta Model API, doar din SUA în 2026, fără căutare web). Un AI fără cheie apare „Fără cheie” în Setări și nu e întrebat.

### A12. Securitate și infrastructură

45. **Regulile „Securitate: niciodată” din `CLAUDE.md` sunt absolute:** fără secrete în cod, mesaje sau loguri (cheia ShopExpert stă doar în variabila de mediu), fără date personale în prompturi, fiecare interogare filtrează după `org_id`.
46. **Nu atingem serviciile Render `ai-widget-*`** (alt proiect al lui ZoZo). Baza de date gratuită expiră pe 20.12.2026; trebuie trecută pe plan plătit (~6 $/lună) înainte.
47. **Pe Render, planul „Pro” e al workspace-ului; serverul echo-ai are tipul lui, „Free”.** Free adoarme după 15 minute și are 0,1 procesor. Starter (7 $/lună) nu adoarme.
48. **Nu modificăm migrările deja aplicate.** Migrările noi sunt aditive.

### A13. Direcție și ce urmează

49. **Valoarea plătită a Echo e monitorizarea vizibilității în AI față de concurenți + diagnostic și reparații**, vândută mult prin agenții. Conectarea (feed, MCP) o dau platformele și gratuit. *(analiză 19.11.2026, după întrebarea lui ZoZo despre riscuri)*
50. **În lucru din 22.11.2026 (toate cerute de ZoZo, de testat pe ShopExpert săptămâna următoare):** reparații de produs cu aprobare, vizibilitatea AI pe fiecare produs, sentimentul AI față de magazin, Grok/Copilot/AI Mode/Meta, pagina de prezentare refăcută. Sursa: `fundatie/gap-ranketta.md`.
51. **Pe listă, neînceput:** Google Merchant Center / Google Ads în Echo, cu etichete personalizate (hero, „bad business” etc.) după reguli alese de fiecare magazin: comenzi, ROAS, valoare. *(ZoZo, 20.11.2026)*

---

## B. Greșeli din care învățăm / ce NU facem

Fiecare punct e o corectură reală de la ZoZo (sau prinsă de noi și confirmată), cu data.

**B1. Design scris doar în text** *(19.11.2026 și 20.11.2026)*
- Nu: un fișier de design doar cu reguli scrise și coduri de culoare.
- În schimb: fiecare regulă cu exemplu desenat, Corect lângă Greșit (ghidul vizual).
- De ce: ZoZo nu „vede” regulile din text („nu îmi spune nimic așa fișierul”).

**B2. Interfață care nu respectă fișa de design** *(20.11.2026, 09:00 și 12:46)*
- Nu: decalaje, butoane diferite pentru aceeași funcție, insigne rupte („acele 3 avertizări nu sunt deloc aranjate bine”).
- În schimb: înainte de a livra orice ecran rulăm `tests/design-rules.test.ts` și `pnpm ui:check` și ne uităm la capturi pe telefon, luminos și întunecat.
- De ce: ZoZo vede imediat lipsa de aliniere și pierde încrederea în produs.

**B3. Previzualizare cu elemente care se ating sau se suprapun** *(20.11.2026, 13:56)*
- Nu: căsuțe nealiniate, fundal suprapus peste text, elemente lipite unele de altele.
- În schimb: verificăm spațiile și alinierea în previzualizare la fel de strict ca în aplicație.
- De ce: „nu arată profesional”.

**B4. Onboarding banal** *(20.11.2026, 13:32)*
- Nu: un flux static, cu o hartă desenată simplist.
- În schimb: dinamic și atrăgător: răspunsuri AI care se scriu live, scanare animată, hartă reală, cifre animate. ZoZo a confirmat versiunea refăcută („arată mult mai bine”).
- De ce: primul contact decide dacă un client își face cont.

**B5. Onboarding care cere prea mult** *(20.11.2026, 13:28)*
- Nu: feed, API sau catalog în testul gratuit.
- În schimb: doar site-ul și ce completează clientul, ca la Peec.
- De ce: vizitatorul vrea doar să vadă ce știe Echo; restul vine după plan.

**B6. Exemple legate de alt magazin** *(20.11.2026, 14:31 și 14:34)*
- Nu: exemple ca „shopexpert.dk” sau „atelierultau” în câmpurile pe care le vede orice client.
- În schimb: texte generale („Scrie numele concurentului sau adresa site-ului lui”) sau exemple construite din domeniul clientului însuși.
- De ce: pentru alt magazin exemplul nu spune nimic și textul devine neclar.

**B7. Scanare care ia date greșite de pe site** *(20.11.2026, 14:30)*
- Nu: numele magazinului luat din titlul unei categorii („Scule electrice DEWALT”), mărci negăsite pe prima pagină.
- În schimb: numele din site (og:site_name, siglă, domeniu), mărcile căutate și în titlu, meniu și sigle; testăm scanarea pe toate magazinele noastre, nu doar pe unul.
- De ce: profilul greșit strică tot ce urmează.

**B8. Întrebări urmărite generice** *(20.11.2026, 09:09; 13:01; 13:57)*
- Nu: „merită brandul Y”, „recomandă-mi”, „care e cel mai bun X” fără legătură cu catalogul, sau produse inventate.
- În schimb: căutări ca ale unui om, din catalogul real, pe produse populare (punctele 14–16 din partea A).
- De ce: rostul Echo e să arate situații reale: când clientul caută X, apare magazinul sau nu?

**B9. Date inventate sau „mod demo” pe contul real** *(20.11.2026, 08:56; 09:12; 10:07)*
- Nu: produse de test, răspunsuri AI simulate, „30 din 30” care par reale.
- În schimb: doar date reale; dacă un AI nu are cheie, nu e întrebat.
- De ce: o cifră falsă distruge încrederea în toate celelalte.

**B10. Butoane care se pot apăsa de mai multe ori** *(20.11.2026, 09:05 și 10:06)*
- Nu: „Sincronizează” sau „Pornește analiza acum” vizibile cât lucrarea e la coadă sau în lucru.
- În schimb: butonul dispare sau devine „… e în lucru”, iar serverul refuză dublurile.
- De ce: se umple coada cu lucrări inutile și costuri duble.

**B11. Să-i spui lui ZoZo „reîncarcă pagina”** *(20.11.2026, 12:52; prins din nou de noi la 14:11)*
- Nu: stări care se schimbă doar după refresh, sau instrucțiuni „reîncarcă pagina”.
- În schimb: `JobWatcher` actualizează singur starea; în pașii de test scriem că se actualizează singur.
- De ce: altfel nu știi când s-a terminat.

**B12. Viteza nescrisă în reguli și „instant” spus prea devreme** *(20.11.2026, 11:51 și 12:11)*
- Nu: să tratăm viteza abia când ZoZo se plânge; să spunem „se deschide instant” pe baza măsurătorii locale.
- În schimb: regula „Viteză” din prima zi; după publicare verificăm timpii reali în logurile Render (0,1 procesor poate fi de zeci de ori mai lent decât local).
- De ce: „merge extrem de încet, dau clic pe meniu și nu face nimic”.

**B13. Funcții făcute de mână de Claude** *(20.11.2026, 12:17)*
- Nu: să generăm noi feed-ul sau linkul și să i-l dăm lui ZoZo.
- În schimb: construim funcția în panou și o testează ca un magazin.
- De ce: „ar trebui să facă feedul panoul Echo, nu tu”.

**B14. Câmpuri manuale pentru date care se pot citi automat** *(20.11.2026, 12:21)*
- Nu: câmpuri de completat pentru livrare, retur, plată, FAQ.
- În schimb: livrarea din catalog pe fiecare produs, restul citit de pe site.
- De ce: un text general e mai prost decât datele reale pe produs, iar magazinul nu trebuie să facă nimic.

**B15. Lucru rămas nepublicat** *(20.11.2026, 12:18)*
- Nu: să încheiem o sarcină cu PR-uri deschise sau ramuri neunite.
- În schimb: la final verificăm explicit că totul e unit și live.
- De ce: „să verificăm asta mereu, să nu uităm să publicăm ceva”.

**B16. AI cu eroare prezentat ca „nu ești recomandat”** *(20.11.2026, 12:53)*
- Nu: scor 0 sau „lipsești” când de fapt AI-ul a dat eroare (Claude refuza căutarea pentru țara RO; cheile aveau spații).
- În schimb: arătăm motivul („nu am putut întreba”), excludem din scor și reparăm cauza.
- De ce: „este total altceva”.

**B17. Mențiuni ale altui magazin cu același nume** *(20.11.2026, 13:14)*
- Nu: Trustpilot pentru shopexpert.dk socotit ca ShopExpert RO; shopexpert.ro nerecunoscut ca magazinul propriu.
- În schimb: potrivire strictă pe piață, domeniu și alias-uri (punctul 10).
- De ce: statisticile devin false.

**B18. Recomandări imposibile** *(20.11.2026, 14:56)*
- Nu: „apari pe Bosch Professional / makitatools.com”.
- În schimb: doar acțiuni la îndemâna magazinului (punctul 20).
- De ce: „nu sunt recomandări utile, logice”.

**B19. Magazinele proprii ca rivali sau surse** *(20.11.2026, 14:57)*
- Nu: hardlineconstruct.ro propus ca loc unde ShopExpert „să se facă prezent”.
- În schimb: toate magazinele aceluiași client sunt excluse din concurenți și surse.
- De ce: „e foarte aiurea partea asta”.

**B20. Tonul greșit al afirmațiilor** *(20.11.2026, 14:58)*
- Nu: afirmații pozitive („livrările au venit fără probleme”) etichetate „Negativ”.
- În schimb: clasificare care ține cont de negație, cu sursa lângă fiecare afirmație.
- De ce: tonul AI-ului față de magazin iese mai rău decât e.

**B21. Deploy în timpul testului** *(20.11.2026, 14:40)*
- Nu: să publicăm cât ZoZo analizează în panou.
- În schimb: ținem PR-ul gata și publicăm când spune că a terminat (punctul 2).
- De ce: deploy-ul repornește analiza și pagina.

**B22. Instrucțiuni bazate pe informații vechi** *(20.11.2026, 12:56)*
- Nu: să-i cerem lui ZoZo să schimbe din nou cheile, deși le schimbase deja.
- În schimb: verificăm starea actuală (loguri, memorie) înainte să cerem ceva; nu mai cerem chei.
- De ce: îl punem să muncească degeaba și pare că nu ascultăm.

**B23. Linkuri care nu merg la ZoZo** *(19.11.2026, 21:29; 20.11.2026, 08:13)*
- Nu: adrese locale (localhost) sau din containerul nostru („this site can't be reached”).
- În schimb: doar linkul public de pe Render.
- De ce: ZoZo testează din browserul lui.

**B24. Plan fără analiza riscurilor** *(19.11.2026, 18:37–18:39)*
- Nu: să propunem un produs fără să întrebăm dacă îl dau gratuit platformele (Shopify, GoMag, WooCommerce).
- În schimb: analizăm riscurile pentru toate platformele și mutăm valoarea unde nu e comoditizată (punctul 49).
- De ce: „de ce nu analizezi toate riscurile?”.

**B25. Prea multe propuneri noi în timpul testului** *(20.11.2026, 14:21)*
- Nu: o listă lungă de lucruri noi de încercat când ZoZo vrea să verifice ce avem.
- În schimb: corectăm și legăm ce există, apoi testăm rezultatele în panou.
- De ce: „sunt prea multe de fapt… să corectăm, corelăm ce avem și să testăm”.

**B26. Produs recunoscut după câteva cuvinte comune, fără dovadă** *(23.11.2026, 11:41)*
- Nu: să legăm „BOSCH Kit de accesorii” de orice rând cu „Bosch” și „accesorii”, apoi să arătăm „Claude: 326,39 lei” fără să spunem de unde.
- În schimb: recunoaștere doar după cod, link sau numele complet, iar lângă fiecare preț spus de AI, dovada (AI, dată și oră, întrebare, rândul exact, criteriul).
- De ce: ZoZo nu putea verifica dacă prețul chiar apare așa.

**B27. Pagina de vizibilitate ca o listă lungă de tabele, fără răspuns pe fiecare AI** *(23.11.2026, 11:57)*
- Nu: o singură pagină cu concurenți, ton, mărci, grafic și toate întrebările una după alta, din care nu reiese cum te prezintă ChatGPT, Claude sau Google și cum te ajută Echo.
- În schimb: „Cum te văd AI-urile” începe cu câte un card pe fiecare AI, unul lângă altul (apari în X din Y răspunsuri, locul mediu, cine apare în locul tău, produse numite, prețuri greșite, ton), fiecare cifră cu link spre răspunsurile exacte; apoi „Ce s-a schimbat de când folosești Echo” și „Ce repari acum”. Concurenții, tonul și răspunsurile întregi stau în file separate.
- De ce: „e puțin haotic pentru mine… cum ar trebui să verific cum mă ajută”.

**B28. Laude și critici fără sursă, puse uneori pe seama magazinului greșit** *(23.11.2026, 11:59)*
- Nu: să arătăm „Ce laudă / Ce critică AI-urile la tine” doar cu fraza și AI-ul, și să lipim de magazin o frază despre alt vânzător („chei fixe indisponibile la CROMWELL Romania”).
- În schimb: lângă fiecare laudă și critică, sursa (întrebarea, AI-ul, ziua, linkurile citate, răspunsul întreg cu fraza evidențiată); o frază care numește alt vânzător nu e a magazinului de deasupra.
- De ce: ZoZo: „aici ar trebui să afișezi și sursele… să ne putem asigura că sunt corecte și despre noi este”.

**B29. „Adaugă schema.org” și „nu ai sitemap” la un magazin care le are de ani de zile** *(23.11.2026, 12:05)*
- Nu: să citim doar JSON-LD, doar `/sitemap.xml` din rădăcină și doar paginile de produs cu „/produs/” în adresă, apoi să spunem „lipsesc datele structurate” sau „nu am găsit un sitemap” când de fapt nu am găsit noi locul. La ShopExpert RO produsele au JSON-LD Product complet (preț, monedă, stoc, brand, GTIN, MPN), iar sitemap-ul e la `/ro/sitemap.xml` (9.711 adrese); `/sitemap.xml` răspunde cu o pagină HTML și robots.txt nu are linia „Sitemap:”.
- În schimb: citim JSON-LD, Microdata și RDFa; luăm pagina de produs din catalog, din pagina principală sau din sitemap; căutăm sitemap-ul în robots.txt, sub prefixul de limbă (`/ro/sitemap.xml`), în rădăcină și în variantele index/.gz; dacă firewall-ul ne refuză, încercăm o dată ca browser. Recomandăm doar ce lipsește cu adevărat, numind câmpurile (ex. „lipsește doar blocul Organization”, „Sitemap-ul nu e declarat în robots.txt”, „lipsesc brand, GTIN”), iar sub fiecare verificare arătăm „Ce am găsit și unde” (adresele verificate și ce era acolo). Recomandările vechi a căror verificare trece acum se închid singure. Sitemap-urile generate la cerere pot răspunde greu (ShopExpert: ~11 s, 1,5 MB), deci le așteptăm până la 45 s și verificăm pe producție, nu doar în teste (PR #48).
- De ce: ZoZo: „de ce zice să corectez să am schema.org, că avem făcut de 12 ani… la fel și sitemap scrie că nu avem deși este”. O recomandare greșită face clientul să nu mai creadă restul auditului.

**B30. Unealtă fără explicație și fără datele pe care lucrează** *(23.11.2026, 12:21–12:22)*
- Nu: un card intitulat doar „Reguli”, cu un formular „Dacă / Condiție / Atunci” și exemplul „Marcă este bosch”, fără să spunem la ce folosește și fără să arătăm feed-ul pe care îl schimbă.
- În schimb: sub titlu, ce face și la ce te ajută; lângă el, feed-ul așa cum îl primește fiecare canal; regulile propuse doar când ajută, cu „înainte → după” pe produse reale.
- De ce: ZoZo: „la ce ajută? optimizare sau ce? nu înțeleg… așa nimeni n-o să știe” și „clientul să vadă produsele cum apar, să știe dacă trebuie introdusă regula sau nu”.

**B31. „Claude: 3.700 lei” luat de la alt magazin din aceeași listă** *(23.11.2026, 12:29)*
- Nu: să socotim drept „preț spus de AI” orice preț de lângă produs (alt magazin, un comparator) sau dintr-un răspuns mai vechi, în timp ce dovada arată „Nu spune prețul”, iar „Vezi unde a spus-o” duce la alt răspuns.
- În schimb: prețul spus de AI e doar cel de pe rândul care numește magazinul (sau are linkul lui), în partea de răspuns despre acel produs; se salvează rularea care l-a spus, iar linkul duce exact la dovada ei, cu rândul evidențiat. Lista și dovezile arată același preț.
- De ce: ZoZo: „aici spune că Claude a zis greșit prețul, deși dacă dau pe vezi unde, apare corect” (BOSCH GBH 4-32 DFR, ShopExpert 2.635 lei în răspuns).

**B32. Panou cu afirmații false la ShopExpert RO, prinse abia de client** *(23.11.2026, 12:31)*
- Nu: să arătăm ca fapte lucruri neverificate: „nu ai sitemap” când sitemap-ul doar a răspuns greu; „nicio descriere de produs” când descrierea stă în tab-uri; „CUI 0/15” când CUI-ul e în Termeni; „Niciun produs nu e recomandat pe nume” lângă „38 produse numite”; „Fă-te prezent pe makitatools.com / bosch-professional.com / hardlineconstruct.ro” (producători și propriul magazin); „contactează evostore.ro pentru o recenzie” (alt magazin); orice site necunoscut etichetat „editorial / blog”; Bosch Professional și platform.openai.com drept concurenți; alerte de preț din potrivirea veche după titlu; „clienții apreciază…” etichetat Negativ și „să se evite magazinul” Pozitiv; „Livrare în toată țara, plată cu cardul sau ramburs” și `logo.png` inventate în codul propus; „47 / 20000 produse” când catalogul are 28.192.
- În schimb: regula A0: doar date reale, „nu am putut verifica” când nu știm sigur, dovada lângă fiecare afirmație, aceleași cifre din aceeași sursă pe toate paginile, verificare automată pe magazinul etalon după fiecare publicare și verificare manuală pe producție înainte de „gata”.
- De ce: ZoZo: „dar așa tot ce facem e inutil dacă nu oferim informații corecte”.

**B33. „57 / 28192” la Produse în AI, citit ca „doar 57 apar în AI” sau „analizăm 28.000 de produse”** *(23.11.2026, 12:40–12:42)*
- Nu: să punem numărul de produse numite peste tot catalogul, ca o fracție, când am citit doar răspunsurile la câteva zeci de întrebări urmărite.
- În schimb: arătăm doar câte produse sunt numite și din câte răspunsuri; o notă spune că restul catalogului nu a fost verificat („nu știm încă, nu înseamnă că lipsesc”) și duce la „Produse urmărite”, unde magazinul alege ce produse întrebăm.
- De ce: ZoZo: „acum începe analiza la 28000 produse?”, „e derutant, așa cred că doar 57 de produse apar în AI din 28000”.

**B34. „Reparații” de titlu pentru produse care au deja titlul bun pe site și în feed** *(23.11.2026, 12:45)*
- Nu: să comparăm cu o bucată din date. API-ul ShopExpert dă numele în două câmpuri (`title` = „BOSCH GCM 305-216 S”, `short_description` = „Ferăstrău circular staționar cu sanie de glisare 1300 W, Ø216”), iar site-ul (H1) și feed-ul magazinului le arată împreună. Echo păstra doar `title` (și folosea subtitlul drept descriere, deși 15.856 produse au descriere lungă), apoi propunea 3.261 de titluri care „adăugau” un tip pe care produsul îl avea deja (ex. „…, acumulator”, „Ferăstrău circular…”), plus categoria la plural lipită în titlu („Bosch GTA 50 W, ferăstraie staționare”).
- În schimb: la preluare, numele produsului e cel de pe site (titlu + subtitlu când sursa le dă separat; descrierea lungă rămâne descriere); propunerile se fac doar față de ce trimite Echo efectiv în feed, iar la fiecare propunere arătăm sursa valorii „Acum” (câmpul, sursa sincronizată, „Vezi produsul în feed”, „pe site”). Reguli fără AI nu mai lipesc categoria în titlu. Înainte să spunem „lipsește X” verificăm o pagină reală de produs. La GTIN: în API, câmpul `ean` are la 1.004 produse un cod de producător (ex. „197280-8”, „0601372201 + 1600A002U5”), la 58 o cifră de control greșită, iar 4.516 produse nu au EAN. Feed-ul Echo lasă deja gol un cod care nu e GTIN, deci propunem doar un EAN real găsit în datele magazinului sau scoaterea unui cod pe care feed-ul chiar l-ar trimite; titlurile scrise numai cu majuscule devin „ca în propoziție”, fără propuneri doar pentru majusculele mărcii. Descrierea: la ShopExpert, multe produse (ex. CROMWELL 17mm IMPACT SOCKET, MAKITA BL4080F) nu au descriere nici în API, nici pe site; „Detalii tehnice” are doar atribute, unele de ambalaj („Lungime ambalaj (mm): 2.60”). Dimensiunile ambalajului și valorile zero nu intră în descriere, iar o descriere AI care le pomenește nu se propune (ZoZo, 23.11, 17:49: „de ce îmi apare la Cromwell lungime și dimensiuni în feed”).
- De ce: ZoZo: „în feed shopexpert ro apare acumulator… din start ar fi trebuit să intre corect fără reparație, cum verificăm”. O reparație inutilă îl face pe client să nu mai creadă și reparațiile bune.

**B35. Preț „greșit” comparat cu un catalog care nu are prețul de pe site** *(23.11.2026, 12:56)*
- Nu: să marcăm prețul spus de AI ca greșit doar față de prețul din API-ul de catalog, care la ShopExpert poate fi mai mare decât cel de pe site (2.848 în catalog, 2.635 pe site).
- În schimb: pentru produsele cu preț spus de AI citim pagina produsului (schema.org, o cerere pe produs, cel mult o dată pe zi, maxim 40 după fiecare calcul) și comparăm cu prețul de pe site; afișăm „pe site X, în catalog Y, citit la HH:MM”. Până o citim, comparăm cu catalogul (actualizat la fiecare preluare, apoi recalculăm) și spunem asta.
- De ce: ZoZo: „în catalog apare mai scump, în catalog nu actualizăm prețurile”, „altfel oricând pot fi diferențe de preț”.

**B36. Codul intern al magazinului ca prim cod al produsului în panou** *(23.11.2026, 17:54)*
- Nu: „Cod 1221852” (id-ul intern din catalog) în fața fiecărui produs, ca și cum ar fi codul după care îl caută cineva.
- În schimb: codul producătorului și EAN-ul (`productCodes()` din `src/lib/product-codes.ts`); codul intern apare doar când produsul nu are niciunul, marcat „Cod intern”. Căutarea după codul intern merge în continuare.
- De ce: ZoZo: „codurile interne de unde sunt? nu ne ajută, cod producător și EAN să apară în panou”.

**B37. Un scor de calitate care pare un scor de apariție** *(23.11.2026, 18:00)*
- Nu: în fișa produsului „ChatGPT (feed) 95”, iar în listă coloana „AI-uri: Claude 1”, fără să spunem că primul e calitatea datelor, iar al doilea cine a numit produsul.
- În schimb: fiecare cifră spune ce măsoară („Date trimise la ChatGPT: calitatea feed-ului, din 100, nu de câte ori apari”, „Numit de”).
- De ce: ZoZo: „afară apare doar că are Claude, deși dacă intru pe el apar toate scorurile, ChatGPT și Gemini la fel scor 95”.

**B38. Feed-ul cu subtitlul în loc de descriere, deși magazinul are descriere** *(23.11.2026, 17:54)*
- Nu: să ne bazăm doar pe lista de produse a unui API. La ShopExpert, `/search?details=1` nu trimite descrierea la ~12.000 de produse care o au, iar `/product?id=` o trimite (ex. BOSCH GSR 12V-32, 1221852: „Prima mașină de găurit și înșurubat de 12 V de la Bosch Professional…”). Feed-ul ChatGPT/Google primea subtitlul („Masina de gaurit si insurubat brushless…”), adică tot titlul. Și entitățile HTML („&icirc;”) ajungeau ca atare în feed.
- În schimb: când lista nu dă descrierea, o citim din pagina de detaliu a API-ului, încet (500 pe tranșă, o cerere odată, cu pauză), o păstrăm (tabelul `product_details`) și o reverificăm după 30 de zile; feed-ul și reparațiile se refac după. Decodăm entitățile HTML. Înainte să spunem că un produs „nu are descriere” sau „nu are imagine”, verificăm pagina de detaliu și pagina de pe site (imaginea lipsește chiar la 228 de produse din 28.129).
- De ce: ZoZo: „la descriere pare că feed e greșit, arată din nou titlul… deci feed către ChatGPT și AI-uri sunt greșite”.

**B39. Căutarea din „Produse urmărite” tăia variantele unui model** *(23.11.2026, 19:31)*
- Nu: să arătăm doar primele 10 produse găsite. La „gsr 18v-65” sunt peste 10 variante (kit, cu acumulatori, solo), iar „BOSCH GSR 18V-65 (SOLO)” (06019N3200) nu apărea deloc, fără să spunem că lista e tăiată.
- În schimb: arătăm până la 50 de produse, spunem câte am găsit și, când sunt mai multe, cum să restrângi căutarea (cod producător, „solo”). O parte din codul producătorului („N3200”) găsește și codurile care o conțin.
- De ce: ZoZo: „aici în listă nu apare varianta solo cu cod N3200”.

**B40. Costurile noastre de AI arătate în panoul magazinului** *(23.11.2026, 19:38)*
- Nu: „Cost estimat pe lună $3.31” în Produse urmărite, „Cost estimat / Buget lunar / Tokeni” în Setări, alerta „Am atins bugetul lunar pentru AI (5 USD)”. Sunt costurile noastre la furnizorii de AI, nu ale clientului.
- În schimb: magazinul vede doar ce AI-uri întrebăm, câte întrebări pe rulare și câte luna asta; costurile, tokenii și plafonul pe fiecare magazin sunt doar în pagina internă `/admin/costuri`.
- De ce: ZoZo: „asta este un panou al clientului, el nu trebuie să vadă aceste costuri, eventual doar noi… nu este corect să pui aici în magazin aceste date”.

**B41. Un buton din panou care recalculează tot catalogul în timp ce aștepți** *(23.11.2026, 19:42)*
- Nu: „Adaugă” în Produse urmărite (și „Urmărește în AI”, „Adaugă căutare”) refăcea lista automată de întrebări citind toate cele ~28.000 de produse în cererea din panou: 10–16 s pe Render, iar ZoZo a apăsat de două ori. Produsul adăugat apărea apoi la întâmplare în listă.
- În schimb: cererea doar salvează alegerea (câteva rânduri) și pune la coadă lucrarea „Actualizarea listei de întrebări” (job `prompts`), pe care o face workerul; pagina se actualizează singură când e gata. Produsele alese de tine apar primele, cele adăugate ultimele sus.
- De ce: ZoZo: „merge extrem de încet panoul… de 2 ori am dat adaugă”, „le-a adăugat doar că aiurea în ordine și nu mi-am dat seama”. Și: „în regulă trebuia să fie scrisă și asta… cum lucrăm și construim așa”.
- Regula (scrisă și în CLAUDE.md, „Viteză”): nicio acțiune din panou nu face lucru pe tot catalogul în timpul cererii. Salvează doar alegerea și pune restul la coadă. La fiecare acțiune nouă verificăm, înainte de PR, ce citește și cât durează pe 15.000 de produse.

**B42. Asistentul care răspunde greu și nu arată că lucrează** *(23.11.2026, 19:49)*
- Nu: la fiecare clic (și pe întrebările gata făcute) pagina „Întreabă asistentul” chema Claude Opus cu gândire, până la 4.000 de tokeni, în cererea paginii, fără niciun semn că lucrează. Clientul crede că butonul nu merge. Și era modelul cel mai scump, contrar regulii de costuri.
- În schimb: întrebările gata făcute au răspuns pe loc, din reguli, fără AI. Întrebarea scrisă de client merge la modelul ieftin (Haiku / gpt-5-mini, gândire „low”, cel mult 600 de tokeni), cu costul salvat pe magazin și răspunsul păstrat pe zi. La clic apare imediat „Caut răspunsul…”, iar butoanele se blochează până vine răspunsul.
- De ce: ZoZo: „aștept foarte mult până primesc răspuns și nici măcar nu am feedback că rulează ceva… nu e interactiv cu clientul”.

**B43. Panoul lent peste tot cât lucrează workerul, și clicuri fără niciun semn** *(23.11.2026, 19:44)*
- Nu: workerul (sincronizare, citirea descrierilor, feed refăcut, reparații) rula cu aceeași prioritate ca panoul, pe același server de 0,15 procesor, deci paginile ajungeau la 7–15 s, iar „Adaugă” părea că nu merge. Pagina Feed recalcula tot feed-ul (28.000 de produse) la fiecare deschidere, pentru că descrierile citite schimbau catalogul la câteva secunde. Căutările din panou citeau tot catalogul. Un clic pe un link, filtru sau căutare nu arăta nimic până venea pagina.
- În schimb: workerul pornește cu `nice -n 19` (procesorul merge întâi la panou); feed-ul și reparațiile se refac la a opta tranșă de descrieri, nu la a patra; pagina Feed citește un rezumat calculat în worker (`feed_summaries`); căutările folosesc indexuri trigram; orice clic care schimbă pagina arată imediat „Se încarcă…” (`NavProgress`), căutările merg fără reîncărcarea paginii (`Form` din next/form), iar un test (`tests/button-feedback.test.ts`) pică dacă un buton sau formular nu arată starea.
- De ce: ZoZo: „merge extrem de încet panoul iar… de 2 ori am dat adaugă, așa încet merge încât nici nu le-a adăugat”, „merge f f greu interfața peste tot”, „nici măcar nu am feedback că rulează ceva în fundal sau ce se întâmplă, nu merge butonul”.

**B44. Răspunsuri AI care dispar din panou când se schimbă lista de întrebări** *(23.11.2026, prinsă de noi la GA5030R)*
- Nu: lista automată de întrebări ștergea întrebările propuse care nu mai erau în listă, iar odată cu ele (prin `prompt_runs`, cascade) și legăturile spre răspunsurile deja primite și plătite. Fișa MAKITA GA5030R a trecut în aceeași seară de la 4 apariții la „Încă nu avem răspunsuri”.
- În schimb: o întrebare propusă care iese din listă și are răspunsuri se **retrage** (`prompts.retired_at`, nu mai e întrebată, nu se vede în Setări), iar răspunsurile ei rămân în toate cifrele din ultimele 30 de zile. Se șterg doar întrebările fără niciun răspuns. Dacă revine în listă, se repornește aceeași (fără dublură).
- De ce: regula A0, doar date reale: un răspuns primit nu dispare din dovezi doar pentru că am schimbat ce întrebăm de acum încolo.

**B45. Testul „în ChatGPT apar” făcut cu conectorul Echo pornit** *(23.11.2026, 18:13)*
- Nu: să comparăm panoul cu ChatGPT-ul din contul nostru, unde conectorul Echo (MCP) și memoria știu de ShopExpert: acolo ShopExpert apare mereu, cu stocul exact („peste 10 bucăți”), care nu e nici pe site, nici în feed.
- În schimb: testul de cumpărător se face în fereastră privată, fără cont sau cu alt cont, fără conectori și fără memorie. Panoul măsoară ce vede un cumpărător obișnuit (API cu căutare pe web, din România).
- De ce: ZoZo: „însă dacă eu întreb în ChatGPT îmi dă shopexpert direct”; răspunsul venea din conectorul nostru, nu din ce vede publicul.

**B46. Lipsa de pe un comparator prezentată ca motivul sau soluția** *(23.11.2026, 18:14)*
- Nu: „ShopExpert nu e pe compari.ro” spus ca explicația pentru care AI-urile nu-l recomandă, sau listarea acolo ca soluția.
- În schimb: arătăm sursele pe care le-au citit efectiv AI-urile pentru produs (site-ul magazinului, comparatoare, articole, marketplace-uri, recenzii) și unde apare sau nu magazinul în ele. Fiecare sursă e una dintre cele citite, nu singura; ce faci e o opțiune a magazinului, cu costul și limita ei, nu o garanție.
- De ce: ZoZo: „shopexpert nu e pe compari, asta nu înseamnă că nu este prezent pe piață”.

**B47. „ChatGPT nu numește produsul” spus fără întrebarea din spate** *(23.11.2026, 18:17)*
- Nu: rândul „Niciodată” la GA5030R lăsa să se înțeleagă că ChatGPT nu arată ShopExpert pentru produs. De fapt Echo nu întrebase ChatGPT direct despre GA5030R. Îl întrebase doar „polizoare unghiulare mici cel mai bun preț”. În aplicație, la „GA5030R” + „cumpărare”, ChatGPT arată ShopExpert pe locul 2 (261 lei + 20 lei livrare, preț luat de pe Discount.ro; pe site sunt 269 lei).
- În schimb: fiecare „nu te numește” spune la ce întrebări și pe ce cale (ChatGPT prin API, căutare pe web din România), iar pentru ChatGPT spunem că aplicația poate arăta altceva (carduri de produs, oferte din comparatoare, feed). Ca să vedem ce vede un cumpărător care caută produsul, îl urmărim în AI (întrebare directă pe nume și cod).
- De ce: ZoZo: „deci la noi analiza nu e bună? … acolo arată că nu e shopexpert la acest produs”.

---

**B48. Acasă, Produse, Surse și Reputație recalculau toate răspunsurile la fiecare deschidere** *(23.11.2026, 20:15)*
- Nu: la fiecare deschidere, pagina citea toate rulările din 30 de zile (mii de răspunsuri cu mențiuni și surse) și făcea calculele în cerere. Pagina Produse număra în plus tot catalogul și sorta 28.000 de produse ca să arate 100. Pe Render gratuit, Acasă avea 0,4–1,4 s, Produse 1,4 s, iar căutarea din Produse în AI 1,7 s, peste regula de 1 s.
- În schimb: workerul calculează cifrele acestor pagini (job `panel`, `src/core/panel-snapshot.ts`) după fiecare rulare AI, audit, calcul pe produs, feed și sincronizare, plus o dată pe zi. Le salvează în `panel_snapshots`, iar pagina citește un singur rând. Un `stamp` mic (rulări, concurenți, audit, produse numite de AI, ziua) arată dacă au apărut date noi. Atunci pagina arată cifrele salvate, cu ora calculului, și cere un calcul nou, iar `JobWatcher` o reîncarcă la final. Lista din Produse citește primele 100 de rânduri direct din index (`products_project_stock_rank_idx`). O pagină nouă care calculează pe toate rulările primește o cheie în `panel_snapshots`, nu un calcul în cerere.
- De ce: ZoZo a cerut ca fiecare pagină să răspundă sub 1 s (regula „Viteză”). Local, cu procesorul limitat ca pe Render: Acasă a scăzut de la 2 s la 0,2 s, Produse de la 1,3 s la 0,3 s, iar Surse și Reputație au ajuns la 0,1 s.

**B49. Eroarea OpenAI la feed atribuită formatului, fără dovadă** *(23.11.2026, 20:36)*
- Nu: la „The feed service could not complete this request” (OpenAI, „Update products with hosted URL”) am schimbat feed-ul ChatGPT din CSV în TSV pe baza unui singur raport de pe forum. Am mai spus că OpenAI nu ceruse niciodată feed-ul, deși pe 20.11 importase 27.818 rânduri CSV de la aceeași adresă (feed ID bpfeed_e9874da5…). Logurile Render pe care le-am citit acopereau doar câteva ore.
- În schimb: formatul care a mers (CSV) nu se schimbă fără dovadă. Întâi verificăm adresa din afară (status, timp, headers, primele rânduri) și spunem doar ce am verificat, cu intervalul de loguri citit. Am revenit la CSV: adresa `.csv` funcționează, iar `.tsv` servește același fișier.
- De ce: corectura coordonatorului, cu datele importului OpenAI din 20.11. O afirmație despre logurile noastre trebuie să spună ce interval acoperă (A0, doar date verificate).

**B50. Marca nevalidă trimisă goală în feed-ul ChatGPT** *(23.11.2026, 20:55)*
- Nu: PR #36 golea mărcile nevalide („N/A”, simboluri, doar cifre) și trimitea rândul fără marcă, presupunând că OpenAI acceptă o marcă goală. OpenAI a respins aceleași 10 produse și la importul din Ads Manager, motivul fiind „fără brand”.
- În schimb: marca e obligatorie pentru OpenAI. Un produs fără marcă validă nu intră în feed-ul ChatGPT (motiv „fără marcă”). Cardul ChatGPT îl listează (cod, produs, marca din magazin), iar fișa produsului spune ce trebuie reparat. Marca nu se ghicește din titlu sau din adresă. Produsul intră singur după ce magazinul o completează.
- De ce: ZoZo: „acelasi 10 produse au eroare in feed … fara brand”. O regulă despre ce acceptă OpenAI se verifică pe motivul respingerii, nu pe presupuneri (A0).

**B51. Butoanele secundare albe pe card alb, fără contrast** *(23.11.2026, 21:06)*
- Nu: butoanele `secondary` și `danger` („Regenerează acum”, „Adaugă regula”…) aveau fundal alb și chenarul cel mai deschis (`--border`, #E1E8E6) pe un card alb, deci nu se vedeau pe pagină.
- În schimb: aceste butoane au chenarul `--border-strong` (#7F918C luminos, #5C736D întunecat) și text `fg`, cu contrast de cel puțin 3:1 față de card. Chenarele cardurilor și ale câmpurilor rămân deschise. Regula e în `docs/DESIGN.md` (tokenuri și §6.1), iar componenta e una singură (`btn` din `src/components/ui.tsx`), deci se aplică pe tot panoul.
- De ce: ZoZo: „butoanele … cu fundal alb nu sunt vizibile în pagină”.

**B52. Etichete de feed din lipsa datelor („Fără vânzări / fără AI”)** *(23.11.2026, 21:06)*
- Nu: eticheta automată `zombie` („Fără vânzări / fără AI”) se punea pe orice produs fără clicuri în căutarea Echo și nenumit de AI. Așa a ajuns pe 28.146 de produse ShopExpert, deși nu avem date de vânzări de la platformă, iar AI-urile au fost întrebate direct doar despre câteva zeci de produse. Eticheta pleca în feed ca custom_label, deci campaniile s-ar fi făcut pe o etichetă falsă. Lângă ea, „Recomandat de AI: 45” părea tot ce analizăm.
- În schimb: o etichetă de feed vine doar din date verificate. `recomandat_ai` = numit de AI în răspunsuri; `ai_nu_apare` = întrebat direct (răspuns valid în 30 de zile) și nu apare; un produs neîntrebat nu primește etichetă AI („nu știm”). Fără vânzări reale de la platformă nu există etichetă de vânzări. Cardul „Etichete automate” spune pe câte produse se sprijină fiecare cifră („X din Y încă neîntrebate”) și că nu avem date de vânzări.
- De ce: ZoZo: „de ce apar 28 mii de produse fără AI și doar 45 recomandat de AI … nu este corect cum afișează”. Lipsa datelor nu e o performanță slabă (A0).

**B53. Căutări pe produs fără intenție de cumpărare și „a cerut clarificare” numărat ca „nu te numește”** *(23.11.2026, 21:10)*
- Nu: căutările automate pe un produs (și cele din „Urmărește în AI”) erau uneori doar numele („Makita GA5030R Polizor unghiular”) sau doar codul. La ele ChatGPT răspunde cu specificații sau cu o întrebare („Vrei specificații sau prețuri?”), fără niciun magazin, iar panoul număra răspunsul ca „AI-ul nu te numește”.
- În schimb: regulă de sistem, pentru toate magazinele: orice căutare generată pentru un produs urmărit sau focus are intenție de cumpărare, ca un cumpărător real („<produs> preț”, „<cod> preț”, „vreau să cumpăr…”, „de unde cumpăr…”, „…cel mai ieftin”). Căutările vechi alese de magazin, scrise doar cu numele, primesc singure „preț” (cele cu răspunsuri se retrag, istoricul rămâne). Un răspuns care nu numește niciun magazin și doar întreabă ceva înapoi e „A cerut clarificare”, separat de „nu te numește”, și nu intră la „nu numește produsul”.
- De ce: ZoZo a arătat că în aplicația ChatGPT, după „GA5030R” urmat de „cumpărare”, apare ShopExpert. Numele singur nu măsoară dacă ești recomandat, iar o întrebare înapoi nu e o recomandare a altui magazin (A0).

**B54. „Rulează acum” fără progres, luată de la capăt la fiecare publicare** *(23.11.2026, 21:13)*
- Nu: între 20:53 și 21:13 am publicat de 5 ori. Fiecare publicare a repornit workerul, iar analiza pornită de ZoZo a fost pusă la coadă după citirile programate (`run_at` = acum). Bara de stare arăta doar „În lucru: Analiza AI”, fără să spună cât s-a făcut sau cât mai durează. Gemini, fără cotă pe zi, era încercat cu 16 variante de model la fiecare întrebare.
- În schimb: workerul scrie progresul real (`jobs.progress`, de exemplu întrebarea 12 din 30), iar JobWatcher arată „Analiza AI: întrebarea 12 din 30, ~3 min rămase” sau „la coadă, după N lucrări”. O lucrare întreruptă se reia prima și trece repede peste întrebările deja puse azi (nu se plătesc din nou). Gemini fără cotă e sărit până la resetarea Google (08:00 UTC). Nu publicăm cât rulează o analiză cerută de magazin: întâi verificăm în panou că nu apare „Analiza AI”.
- De ce: ZoZo: „am dat analizează din nou, rulează încă și acum…”.

## C. Regula de întreținere (permanentă)

1. **De fiecare dată când ZoZo spune că ceva e greșit**, punctul se adaugă imediat, în aceeași tură, în **partea B**, în forma „Nu / În schimb / De ce”, cu data.
2. **De fiecare dată când ZoZo spune că ceva e bun** sau confirmă o alegere, punctul se adaugă imediat în **partea A**, cu motivul și felul în care îl aplicăm („folosim”).
3. Se scrie exact ce s-a spus, fără să inventăm. Dacă nu e clar ce a vrut, întrebăm și abia apoi scriem.
4. Se actualizează **ambele copii**: `docs/KNOWLEDGE.md` în repo (prin PR, unit și publicat) și `agentready/fundatie/KNOWLEDGE.md` în fișierele proiectului.
5. Dacă un punct nou contrazice unul vechi, îl înlocuim pe cel vechi și notăm data schimbării. Nu păstrăm reguli moarte.
6. Regulile tehnice noi intră și în `CLAUDE.md`; cele de interfață și în `docs/DESIGN.md` și în ghidul vizual.
7. Orice lucru nou la Echo începe cu citirea acestui fișier.

---

## Surse

- Memoria proiectului (`MEMORY.md` și fișierele legate de ea).
- `fundatie/`: `CLAUDE.md`, `DESIGN.md`, `PLAN-TEHNIC.md`, `FUNCTII.md`, `DECIZII.md`, `gap-ranketta.md`.
- Repo: `CLAUDE.md`, `docs/DESIGN.md`, `docs/adr/`.
- Discuțiile cu ZoZo din chatul proiectului și din toate firele, 19–22.11.2026.

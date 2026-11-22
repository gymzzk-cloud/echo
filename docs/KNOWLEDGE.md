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

### A10. Onboarding și planuri

39. **Onboarding-ul e un test gratuit în stilul Peec, interactiv și „catchy”.** *(ZoZo, 20.11.2026)* Clientul dă site-ul, vede o scanare animată (cu sigla magazinului, cerută și apreciată de ZoZo), completează categorii, mărci, produse, piețe și concurenți (precompletate din site), apoi vede o primă rulare live. Fără feed, API sau catalog în această fază.

40. **Prima rulare dă doar o „gustare”.** *(ZoZo, 20.11.2026)* Vizibilitate %, locul, top 5 magazine. Analiza detaliată rămâne blocată până la alegerea unui plan, iar datele blocate nu se trimit în browser înainte de plată.

### A11. Feed, MCP și AI-uri

41. **Feed-ul ChatGPT se pornește din panou** (Reparații → Feed și canale), cu adresă `/feed/<token>.csv` pusă în ChatGPT ca „hosted URL”. OpenAI a acceptat 27.818 din 27.828 de produse ShopExpert (20.11.2026).
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

---

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

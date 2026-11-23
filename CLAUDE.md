# AgentReady: reguli de lucru

> Fișierul pe care îl citește oricine lucrează la cod, om sau Claude, înainte de orice modificare. Se pune în rădăcina repo-ului.
> Versiunea 0.1, 19.11.2026.

## Context

AgentReady are două părți pe același motor:
- **căutarea pentru cumpărători** (gratuită), care întreabă toate AI-urile, verifică prețurile și arată magazine de încredere;
- **panoul pentru magazine** (abonament), care arată dacă le recomandă AI-urile, de ce nu, și le repară problemele.

**Primul fișier de citit: `docs/KNOWLEDGE.md`**, memoria permanentă a proiectului: ce urmărim (partea A) și greșelile pe care nu le mai repetăm (partea B). Când ZoZo spune că ceva e greșit sau bun, punctul se adaugă imediat acolo, în partea potrivită (regula din partea C).

Toate funcțiile sunt în `docs/FUNCTII.md`, planul tehnic în `docs/PLAN-TEHNIC.md`, iar regulile vizuale în `docs/DESIGN.md`. **Toate trei sunt obligatorii.**

## Doar date reale (regula de bază, KNOWLEDGE A0)

- Orice afirmație din panou vine din feed-ul real, din răspunsurile AI salvate sau din pagina live, cu link spre dovadă. Nimic din presupuneri.
- O verificare care n-a putut fi făcută (timeout, firewall, structură nerecunoscută) are starea `unknown` („nu am putut verifica”): nu spune „lipsește”, nu intră în scor, nu creează acțiuni.
- Nimic nu e „gata” până nu e verificat pe producție pe ShopExpert RO (magazinul etalon). Workerul rulează `golden_check` (`src/core/golden.ts`) după fiecare publicare; rezultatul e în /admin/magazine.

## Priorități, în ordinea asta

1. Securitate și separarea datelor între clienți
2. Corectitudinea cifrelor
3. Viteză
4. Ușurință în folosire
5. Funcții noi

Când două priorități se ciocnesc, câștigă cea de mai sus.

## Comenzi

```
pnpm install          # instalare
pnpm dev              # pornește web + worker local
pnpm test             # teste unitare și de integrare
pnpm test:e2e         # teste Playwright (fluxurile critice)
pnpm lint && pnpm typecheck
pnpm db:migrate       # aplică migrările
```

## Fluxul de lucru

1. **O sarcină = o ramură = un PR.** Ramura poartă un nume de forma `feat/audit-robots`, `fix/pret-gresit`, `chore/ci`.
2. **Commituri mici și clare**, în stilul Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
3. **Nimic direct pe `main`.** `main` e mereu gata de lansare. Totul trece prin PR și CI verde.
4. **PR-ul descrie** ce face, de ce, cum s-a testat și include capturi de ecran pentru orice schimbare de interfață.
5. **Lansare automată**: `main` merge pe staging automat, iar producția pornește la un tag sau o aprobare manuală.
6. **Decizii importante** (o tehnologie nouă, o schimbare de arhitectură) se scriu ca ADR scurt în `docs/adr/NNN-titlu.md`: contextul, decizia și alternativele respinse.

## Definiția lui „gata”

O sarcină e gata doar când:
- [ ] Codul trece de typecheck, lint și toate testele
- [ ] Are teste pentru logica nouă: calculele au teste unitare, iar fluxurile critice au test e2e
- [ ] Interfața respectă lista de verificare din `DESIGN.md`
- [ ] Textele sunt în `packages/i18n` (RO completat, HU măcar marcat de tradus)
- [ ] Nu scade performanța (bugetul din CI e verde)
- [ ] Erorile sunt tratate și raportate în Sentry, iar utilizatorul vede un mesaj util
- [ ] Documentația e actualizată, dacă s-a schimbat comportamentul

## Reguli de cod

- **TypeScript strict**, fără `any`. Tipurile se generează din schemă și se reutilizează.
- **Validare cu Zod** la orice intrare: formulare, API, webhook-uri, răspunsuri AI.
- **Logica de business stă în `packages/core`**, nu în componente sau în rute. Componentele doar afișează.
- **Fiecare AI și fiecare platformă de magazin au propriul adaptor**, cu aceeași interfață. Un AI nou înseamnă un fișier nou, nu `if`-uri prin cod.
- **Joburile de fundal sunt idempotente**: rulate de două ori, dau același rezultat.
- **Nicio operație lentă în request-ul web.** Apelurile la AI, crawl și sincronizare merg în coadă.
- **Fiecare interogare la baza de date filtrează după `org_id`**, prin helper-ul comun, niciodată de mână.
- **Fără valori scrise direct**: culorile vin din tokens, textele din i18n, configurația din variabile de mediu validate.
- Nume clare în engleză pentru cod, iar textele pentru utilizator în română.
- Fișiere mici: o componentă sau o funcție pe responsabilitate. Peste ~300 de rânduri, împărțim.

## Viteză (regulă permanentă: panoul răspunde imediat)

- **Ținta**: orice pagină a panoului răspunde în **sub 1 secundă** pe serverul de producție (azi Render gratuit: 0,1 procesor), iar clicul din meniu arată imediat că se încarcă (spinner și schelet `loading.tsx`).
- **Nimic pe tot catalogul la deschiderea paginii.** Pagina citește doar ce afișează: coloanele de care are nevoie, cu `limit` și paginare (maxim 50–100 de rânduri pe ecran). Totalurile și numărătorile se fac în SQL (`count`, `group by`), nu în JavaScript pe mii de rânduri.
- **Calculele grele se fac în worker și se salvează** (etichete, scoruri, agregate), iar pagina doar le citește. Dacă un calcul trebuie făcut la cerere, se păstrează în cache, cu invalidare la schimbare.
- **Fără bucle pătratice**: nicio căutare `filter`/`find` într-o listă mare în interiorul altei bucle. Se folosesc `Map`/`Set`.
- **Interogări cu index**: orice filtru nou pe o coloană folosită des primește index, prin migrare aditivă.
- **Partea grea a unei pagini stă în `<Suspense>`**: antetul și ce e ușor apar imediat, iar tabelele calculate pe tot catalogul vin după, cu un mesaj „Calculăm…”.
- **Linkurile din panou nu preîncarcă pagini** (`prefetch={false}` pe toate `<Link>`-urile din panou și pe `ButtonLink`): pe 0,1 procesor, fiecare preîncărcare costă cam o secundă.
- **Se măsoară înainte de fiecare merge** care atinge o pagină sau o interogare: `pnpm perf` (vezi `scripts/perf-pages.ts`) pe o bază cu un catalog realist (15.000 de produse). O pagină peste prag nu intră în `main`. Pragul local nu garantează producția: pe Render gratuit am văzut pagini de până la 50 de ori mai lente decât local, așa că după publicare se verifică și `responseTimeMS` din logurile Render.
- Pornirea serverului rămâne scurtă: fără procese în plus la fiecare trezire, iar workerul pornește după serverul web.

## Lucrări în fundal: fără dubluri (regulă permanentă)

- **Orice buton care pornește o lucrare** (analiză, audit, sincronizare, raport, rulare AI etc.) **dispare sau e înlocuit cu „… e în lucru”** cât timp acea lucrare e **la coadă sau în lucru**. „În așteptare” contează la fel ca „în lucru”.
- Pagina află starea prin `busyKinds(projectId)` / `syncingConnections(ids)` din `src/core/jobs.ts`.
- **Serverul refuză dublurile oricum**: `enqueue()` nu adaugă un job identic (același tip și aceleași date) dacă unul e deja la coadă sau în lucru. Butonul ascuns e doar pentru claritate, protecția reală e pe server.
- Un job mai vechi de 30 de minute e considerat blocat, ca butonul să revină după un restart.
- **Starea se actualizează singură, fără reîncărcarea paginii**: `JobWatcher` (din `src/components/job-watcher.tsx`, pus o dată în layout-ul panoului) întreabă `/api/panou/jobs` la 4 secunde cât timp ceva e la coadă sau în lucru, arată „În lucru: …”, iar la final arată „… gata la HH:MM” sau eroarea și reîncarcă datele paginii, ca butonul să revină. Când nu e nimic în lucru, nu mai întreabă.
- O lucrare nouă care trebuie să apară acolo primește un nume în `JOB_LABELS` (`src/core/jobs.ts`) și pune `projectId` (sau `connectionId`) în datele jobului.
- Orice funcție nouă care pornește lucru în fundal respectă aceste puncte.

## Securitate: niciodată

- Nu punem secrete în cod, în commituri sau în loguri (chei API, chei de magazin, parole).
- Nu logăm răspunsurile complete ale API-urilor de magazin (pot conține date personale).
- Nu dezactivăm validarea, CSRF sau verificarea semnăturii webhook-urilor „temporar”.
- Nu cerem permisiuni de scriere pe magazin fără acordul explicit al clientului și fără o funcție care să le ceară.
- Nu rulăm migrări distructive fără backup și fără un plan de revenire.
- Nu trimitem date personale în prompturile către AI-uri.

## Costuri AI (regulă permanentă: cât mai puțini tokeni)

- Orice cod nou care apelează un AI trece prin adaptoarele din `src/core/ai/` și prin `runQuery`, care salvează costul și tokenii fiecărei rulări.
- **Model ieftin implicit**: ChatGPT `gpt-5-mini` cu gândire `low`, Claude `claude-haiku-5-5`, Gemini Flash fără gândire, Perplexity `sonar`, Grok cel mai ieftin model xAI disponibil (ales singur, cel mult 2 căutări), Meta AI `muse-spark-1.3` (fără căutare web). Un model mare doar unde s-a arătat că e nevoie, prin variabila de mediu a adaptorului.
- **Planuri gratuite respectate în motor** (`src/core/ai/limits.ts`): un adaptor își declară limitele (`limits()`: pe minut, pe zi, credite pe lună, zile de refolosire). Gemini: `GEMINI_RPM`, iar pe planul gratuit (`GEMINI_FREE_TIER=1`) și `GEMINI_DAILY_LIMIT`; supraîncărcarea (500/503) se reîncearcă de 2 ori cu pauze, apoi trecem la alt model Flash stabil. Google AI Overviews prin SerpApi: `SERPAPI_MONTHLY_LIMIT` credite, rulare refolosită `SERP_REUSE_DAYS` zile, doar motoarele din `SERP_ENGINES`. Peste limită nu întrebăm, iar rularea apare ca „nu am putut întreba”, nu ca „nu ești recomandat”.
- **Răspuns plafonat**: `AI_MAX_OUTPUT_TOKENS` (implicit 2000), cel mult 2 căutări web pe întrebare, context de căutare „low”.
- **Întrebarea pleacă exact cum o scrie clientul**, fără instrucțiuni în plus: ar costa tokeni și ar strica măsurătoarea.
- **Nicio întrebare plătită de două ori**: aceeași întrebare pe același AI rulează o singură dată pe zi și e folosită de toate magazinele care o urmăresc.
- **La termen, nu la fiecare clic**: rularea automată se face o dată la `AI_RUN_EVERY_DAYS` zile (implicit 7). „Rulează acum” nu plătește din nou întrebările deja puse azi.
- **Buget lunar per magazin**: `AI_MONTHLY_BUDGET_USD` (implicit 5, 0 = fără plafon). La atingerea lui rularea se oprește și magazinul primește o alertă.
- **AI-urile fără cheie nu sunt întrebate** și nu primesc răspunsuri simulate (decât cu `ALLOW_DEMO_AI=1`, doar pentru demo).
- Consumul (întrebări, tokeni, cost, buget rămas) se vede în Setări → „AI-uri și costuri”.
- Următorul pas: rulările programate prin Batch API (OpenAI și Anthropic, ~50% mai ieftin), cu ADR, pentru că schimbă fluxul worker-ului (rezultatele vin în câteva ore).

## Testare

- Calcule (scoruri, procente, agregate): teste unitare cu cazuri limită (zero date, un singur concurent, AI căzut).
- Adaptoare AI: teste pe răspunsuri reale salvate (fixtures), fără apeluri live în CI.
- Fluxuri critice e2e: înscriere, conectare magazin, primul raport, plată, invitare coleg.
- Bug reparat = test nou care ar fi prins bug-ul.

## Preluare ușoară a datelor (regulă permanentă)

- Orice citire de la un magazin trece prin `politeFetch`, cere feed-ul condiționat (ETag/Last-Modified), se face doar la termen (12h + decalaj per magazin) și refolosește datele din cache. Detalii: `docs/adr/0002-preluare-usoara.md`.

## Când lucrează Claude

- Citește `KNOWLEDGE.md`, `PLAN-TEHNIC.md`, `DESIGN.md` și acest fișier înainte de prima modificare.
- Când ZoZo corectează ceva sau confirmă că e bun, adaugă punctul în `docs/KNOWLEDGE.md` în aceeași tură (și în copia din `fundatie/`).
- Face pași mici, verificabili, fiecare cu testele lui. Nu rescrie module întregi neîntrebat.
- Nu adaugă dependențe noi fără un motiv scris în PR.
- Când nu e sigur de o decizie de produs, întreabă. Când e o decizie tehnică mică, alege varianta simplă și o notează în PR.
- Rulează local lint, typecheck și testele afectate înainte de PR.
- Pentru schimbări de interfață atașează capturi de ecran (luminos, întunecat, telefon).

## Limbă

- Cod, nume de variabile și commituri: engleză.
- Texte pentru utilizator, documentație de produs și discuții cu echipa: română.

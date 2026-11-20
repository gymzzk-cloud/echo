# AgentReady: reguli de lucru

> Fișierul pe care îl citește oricine lucrează la cod, om sau Claude, înainte de orice modificare. Se pune în rădăcina repo-ului.
> Versiunea 0.1, 19.11.2026.

## Context

AgentReady are două părți pe același motor:
- **căutarea pentru cumpărători** (gratuită), care întreabă toate AI-urile, verifică prețurile și arată magazine de încredere;
- **panoul pentru magazine** (abonament), care arată dacă le recomandă AI-urile, de ce nu, și le repară problemele.

Toate funcțiile sunt în `docs/FUNCTII.md`, planul tehnic în `docs/PLAN-TEHNIC.md`, iar regulile vizuale în `docs/DESIGN.md`. **Toate trei sunt obligatorii.**

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

## Securitate: niciodată

- Nu punem secrete în cod, în commituri sau în loguri (chei API, chei de magazin, parole).
- Nu logăm răspunsurile complete ale API-urilor de magazin (pot conține date personale).
- Nu dezactivăm validarea, CSRF sau verificarea semnăturii webhook-urilor „temporar”.
- Nu cerem permisiuni de scriere pe magazin fără acordul explicit al clientului și fără o funcție care să le ceară.
- Nu rulăm migrări distructive fără backup și fără un plan de revenire.
- Nu trimitem date personale în prompturile către AI-uri.

## Costuri AI

- Orice cod nou care apelează un AI trece prin `packages/ai-runners`, care înregistrează costul pe client.
- Folosim cel mai ieftin model care face treaba (extragerea are model mic, analiza are model mare).
- Rezultatele identice se cache-uiesc. Întrebările comune pe categorie se rulează o singură dată pe zi.

## Testare

- Calcule (scoruri, procente, agregate): teste unitare cu cazuri limită (zero date, un singur concurent, AI căzut).
- Adaptoare AI: teste pe răspunsuri reale salvate (fixtures), fără apeluri live în CI.
- Fluxuri critice e2e: înscriere, conectare magazin, primul raport, plată, invitare coleg.
- Bug reparat = test nou care ar fi prins bug-ul.

## Preluare ușoară a datelor (regulă permanentă)

- Orice citire de la un magazin trece prin `politeFetch`, cere feed-ul condiționat (ETag/Last-Modified), se face doar la termen (12h + decalaj per magazin) și refolosește datele din cache. Detalii: `docs/adr/0002-preluare-usoara.md`.

## Când lucrează Claude

- Citește `PLAN-TEHNIC.md`, `DESIGN.md` și acest fișier înainte de prima modificare.
- Face pași mici, verificabili, fiecare cu testele lui. Nu rescrie module întregi neîntrebat.
- Nu adaugă dependențe noi fără un motiv scris în PR.
- Când nu e sigur de o decizie de produs, întreabă. Când e o decizie tehnică mică, alege varianta simplă și o notează în PR.
- Rulează local lint, typecheck și testele afectate înainte de PR.
- Pentru schimbări de interfață atașează capturi de ecran (luminos, întunecat, telefon).

## Limbă

- Cod, nume de variabile și commituri: engleză.
- Texte pentru utilizator, documentație de produs și discuții cu echipa: română.

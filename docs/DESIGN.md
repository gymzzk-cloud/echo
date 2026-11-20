# Echo: reguli de design

> Fișierul pe care îl respectă **fiecare ecran, componentă și email**. Dacă o regulă trebuie încălcată, o schimbăm întâi aici, cu motiv, și abia apoi în cod.
> Versiunea 0.2, 20.11.2026. Tokenurile sunt în `src/app/globals.css`, componentele în `src/components/ui.tsx`.
> **Ghidul vizual** (fiecare regulă desenată, cu exemple Corect și Greșit): `docs/design/ghid-vizual.html`. Se deschide în browser.

## 0. Regula de aur

**Același lucru arată la fel peste tot.** Aceeași funcție are același buton, același tip de conținut stă în același fel de card, aceeași distanță se repetă la fel pe toate paginile. Dacă un ecran are nevoie de ceva ce nu există aici, adăugăm întâi regula și componenta, apoi le folosim.

Interzis în pagini (`src/app/**`):
- `<button>`, `<input>` (în afară de `type="hidden"`), `<select>`, `<textarea>` scrise de mână: folosim componentele din `src/components/ui.tsx`;
- culori scrise direct (`#hex`, `rgb()`, `text-white`, `bg-black`): folosim tokenurile;
- clase de chenar, umbră, colțuri sau înălțime copiate pe elemente proprii (`rounded-lg border px-3 py-2...`): dacă e nevoie de ele, e nevoie de o componentă.

## 1. Principii

1. **Răspunsul întâi.** Fiecare ecran răspunde la o întrebare. Răspunsul (cifra, verdictul) e sus și mare, detaliile dedesubt.
2. **5 secunde.** Un proprietar de magazin fără cunoștințe tehnice înțelege ecranul în 5 secunde: cum stau, cum evoluez, ce fac acum.
3. **Fiecare problemă are o acțiune**, cu buton sau pas concret.
4. **Liniște vizuală.** Mult spațiu, puține culori, o singură acțiune principală pe card. Culoarea înseamnă ceva, nu decorează.
5. **Cifre pe care le poți crede.** Sursa, data și intervalul sunt vizibile. Nu ascundem scăderile.

## 2. Culori (tokenuri)

Definite o singură dată în `src/app/globals.css`, cu valori pentru luminos și întunecat. În cod folosim doar numele Tailwind de mai jos.

| Token CSS | Clasă | Luminos | Întunecat | Folosire |
|---|---|---|---|---|
| `--surface` | `bg-surface` | #F7F9F8 | #0F1715 | fundalul paginii, fundalul rândurilor la hover |
| `--bg` | `bg-bg` | #FFFFFF | #16211E | carduri, câmpuri, antet |
| `--border` | `border-border` | #E1E8E6 | #24332F | toate chenarele și separatoarele |
| `--text` | `text-fg` | #13231F | #E4ECEA | text principal |
| `--text-muted` | `text-muted` | #5B6D68 | #93A6A1 | text secundar, ajutor, etichete |
| `--primary` | `bg-primary` / `text-primary` | #0D7A6A | #4CC3AD | marca, acțiunea principală, „tu” în grafice, link-uri |
| `--primary-bg` | `bg-primary-bg` | #DFF2EE | #16332D | fundal discret pentru informații de marcă |
| `--good` / `--good-bg` | `text-good` / `bg-good-bg` | #1F8A4C | #5FCF8E | stare: bine, apari, rezolvat |
| `--warn` / `--warn-bg` | `text-warn` / `bg-warn-bg` | #B4610F | #E3A35A | stare: atenție, parțial, demo |
| `--bad` / `--bad-bg` | `text-bad` / `bg-bad-bg` | #B23B3B | #E37D7D | stare: problemă, lipsești, ștergere |
| `--side*` | `bg-side`, `text-side-fg`... | #13231F | #0B1210 | doar meniul lateral |
| `--ai1..4` | | | | culorile fixe ale AI-urilor în grafice |

Reguli:
- **Verdele de marcă (`primary`) se folosește puțin**: butonul principal (unul pe card), elementul activ din meniu, seria „tu” din grafice, link-urile. Nu colorăm titluri, chenare sau fundaluri mari cu el.
- **Verde, galben și roșu de stare doar pentru stare**, niciodată decorativ. Starea are mereu și text sau simbol (▲ +4, ✕, „Lipsești”), pentru daltoniști.
- Concurenții în grafice: nuanțe de gri (tokenuri `--chart-2..4`, de adăugat la prima folosire), tu: `--primary`.
- Contrast minim WCAG AA: 4,5:1 pentru text, 3:1 pentru chenarele câmpurilor și grafice.
- Modul luminos și cel întunecat sunt egale ca importanță. Orice ecran se verifică în amândouă. Comutatorul din antet are prioritate față de setarea sistemului.

## 3. Tipografie

- Text: **Inter**. Titluri mari (h1) și cifre mari: **Sora**. Etichete mici cu majuscule (clasa `.label`): **JetBrains Mono**.
- Scara, fără alte mărimi: 12 (`text-xs`) · 14 (`text-sm`, textul de bază în panou) · 16 (`text-base`, textul de bază pe site) · 20 · 24 · 30 · 48 px.
- Greutăți: 400 text, 500 etichete și butoane, 600 titluri. Nimic altceva.
- Cifrele: mereu `num` (`tabular-nums`), ca să stea aliniate.
- Titluri în stilul propoziției („Vizibilitate pe AI-uri”), nu Title Case. Cel mult 2 niveluri de titlu pe ecran.
- `.label` (majuscule mici) doar pentru context: antetul tabelelor, eticheta de deasupra unei cifre, „sprânceana” de deasupra titlului paginii.

## 4. Spații

- Unitate de 4 px. Folosim doar: 4, 8, 12, 16, 24, 32, 48, 64 (`1, 2, 3, 4, 6, 8, 12, 16` în Tailwind). Fără `py-2.5`, `gap-5`, `mt-7` și alte valori intermediare.
- **Între carduri și secțiuni: 24 px** (`space-y-6` sau `gap-6`), pe toate paginile.
- **În card: 24 px** (`p-6`), pe telefon 16 px (`p-4`).
- Titlul cardului → conținut: 16 px. Descrierea de sub titlu → conținut: 16 px.
- Între câmpurile unui formular: 16 px (`gap-4`). Între butoane alăturate: 8 px (`gap-2`).
- Rând de listă sau tabel: 12 px sus și jos (`py-3`), separatoare `border-border`.
- Lățimea maximă a conținutului: `max-w-6xl` (1152 px), centrat, în panou și pe site.
- Margini laterale ale paginii: 16 px pe telefon, 24 px de la `sm`, 32 px de la `lg`.

## 5. Chenare, colțuri, umbre

| Element | Chenar | Colțuri | Umbră |
|---|---|---|---|
| Card | 1 px `border-border` | 12 px (`rounded-xl`) | niciuna |
| Card evidențiat (primul rezultat, planul curent) | 2 px `border-primary` | 12 px | niciuna |
| Câmp, buton, select | 1 px `border-border` (focus: `border-primary`) | 8 px (`rounded-lg`) | niciuna |
| Insignă (badge), cip de filtrare | fără / 1 px | complet rotunjit (`rounded-full`) | niciuna |
| Notificare în pagină (Notice) | fără, doar fundal de stare | 8 px | niciuna |
| Card în card (ex. o acțiune în lista „3 lucruri”) | 1 px `border-border` | 8 px | niciuna |
| Notificare plutitoare („În lucru: …”, `JobWatcher`) | 1 px `border-border` | 8 px | `shadow-lg`, singura umbră permisă (plutește peste pagină) |

- Nu punem card în card în card. Cel mult două niveluri.
- Nu amestecăm `rounded-xl`, `rounded-2xl` și `rounded-md` pe același tip de element.
- Separator în interiorul unui card: `border-t border-border` cu 24 px deasupra și dedesubt.

## 6. Componente

Toate stau în `src/components/ui.tsx` (când depășește ~300 de rânduri, se împarte în `src/components/ui/*`). O componentă nouă se adaugă acolo, nu se copiază în pagină.

### 6.1 Butoane: varianta se alege după funcție

| Variantă | Când | Exemple |
|---|---|---|
| `primary` (plin, verde) | acțiunea pentru care ai venit pe card; **una singură pe card** | Conectează, Salvează, Caută, Cumpără, Rezolvă, Trimite invitația |
| `secondary` (alb, cu chenar) | acțiuni suplimentare | Adaugă, Importă, Sincronizează, Rulează acum, Exportă, Testează |
| `danger` (alb, text roșu) | elimină sau revocă ceva | Șterge, Elimină, Revocă, Anulează invitația |
| `ghost` (fără chenar) | comutatoare și acțiuni discrete în rânduri | Oprește / Pornește, Am rezolvat, Marchează citite, Respinge |
| `TextLink` (text verde) | **doar navigare** spre altă pagină, niciodată o acțiune | Detalii, Toate, Vezi lista |
| `Chips` (cipuri rotunjite) | filtre și file care schimbă ce arată pagina | 7 / 30 / 90 zile, De făcut / Rezolvate, exemplele de întrebări |

Mărimi: `md` (implicit) are exact înălțimea unui câmp: **40 px, 44 px pe telefon**. `sm` (32 px, 36 px pe telefon) doar pentru acțiunile din rânduri de tabel sau listă. `lg` (48 px) doar pentru căutarea de pe prima pagină.

Reguli:
- Textul spune ce face butonul („Conectează magazinul”, „Adaugă concurent”), nu „OK” sau „Trimite”.
- Ordinea: principalul primul (stânga), apoi secundarele, iar ștergerea ultima.
- Butonul de trimitere al unui formular cu server action folosește `SubmitButton`, care arată starea „Se lucrează…”. Aceeași variantă ca butonul normal pentru aceeași funcție.
- Acțiunile unui rând stau mereu la capătul din dreapta al rândului (`RowActions`), aliniate la dreapta, cu `size="sm"`.
- Buton doar cu icon (×): `IconButton`, cu `aria-label` obligatoriu.

### 6.2 Formulare și alinierea lor

Cauza decalajelor de până acum: grila era aliniată jos (`items-end`), iar textul de ajutor de sub unele câmpuri le împingea în sus. Regula de acum:

1. **Toate câmpurile au aceeași înălțime** (40 px, 44 px pe telefon), egală cu a butonului `md`.
2. **Eticheta are înălțime fixă** (20 px + 8 px spațiu), deci câmpurile dintr-un rând încep la aceeași linie.
3. **Textul de ajutor stă sub câmp** și nu mută nimic: grila e aliniată **sus** (`items-start`), niciodată jos.
4. **Butonul dintr-un rând cu câmpuri** stă într-o zonă care rezervă locul etichetei (`FormActions inline`), deci e la nivelul câmpurilor, nu al textului de ajutor.
5. Câmpurile dintr-un rând au lățimi egale, cu excepția celor scurte prin natura lor (platformă, tip, rol): acestea au lățime fixă (~200 px).
6. Pe telefon (sub `md`), totul se pune pe o coloană, iar butonul principal ocupă toată lățimea.
7. Eticheta e mereu deasupra câmpului, niciodată în stânga lui. Placeholder-ul e exemplu, nu etichetă.
8. Căsuțele de bifat (`Checkbox`) au toată linia clicabilă; grupurile de căsuțe au titlu ca o etichetă (`FieldGroup`).
9. Încărcarea unui fișier arată ca un câmp (același chenar și aceeași înălțime), cu butonul „Alege fișierul” în interior.
10. Erorile și confirmările unui formular apar sub el, prin `ActionForm`, ca `Notice` roșu sau verde.

Așezări permise pentru un formular (`FormGrid`): o coloană; 2, 3 sau 4 coloane egale; câmp + buton; 2 câmpuri + buton; 3 câmpuri + buton; câmp îngust + 2 câmpuri + buton. Nu inventăm altele pe pagină.

### 6.3 Carduri

- `Card` cu titlu: titlul e text normal, 16 px, greutate 600 (nu majuscule). În dreapta titlului poate sta un `TextLink` („Detalii”) sau un buton `sm`, aliniat pe mijlocul titlului.
- Descrierea de sub titlu: `text-sm text-muted`, cel mult 2 rânduri.
- Nota de la final (surse, explicații): `text-xs text-muted`, la 16 px după conținut.
- Carduri alăturate într-un rând au aceeași înălțime (grila le întinde) și același padding.
- Carduri cifră (`Stat`): eticheta (`.label`), cifra mare (Sora, 30 px), variația (▲/▼ colorat) și, opțional, o explicație scurtă.

### 6.4 Liste și tabele

- Listă de obiecte (conexiuni, concurenți, întrebări): rânduri cu separator, cu numele și detaliile la stânga, insigna de stare, apoi acțiunile la dreapta.
- Tabel: antet cu `.label`, cifrele aliniate la dreapta și cu `num`, ultimul rând fără separator.
- Pe telefon, un tabel cu mai mult de 3 coloane devine listă de carduri. Până la conversie, tabelul derulează orizontal **în interiorul cardului**, niciodată pagina.
- Stare goală (`Empty`): ce va apărea aici și ce pas trebuie făcut, cu un buton.

### 6.5 Insigne și notificări

- Titlul unei probleme spune **problema**, nu criteriul verificat: „Pagina principală se încarcă greu”, nu „Pagina principală răspunde rapid”. Acțiunile din audit își iau titlul din `src/core/audit/problems.ts`.
- O lucrare din fundal aflată la coadă sau în lucru se arată cu `Working` (insignă galbenă cu spinner și o propoziție despre ce urmează), în locul butonului care o pornește.

- `Badge`: o singură formă (complet rotunjită, 12 px, greutate 500), **mereu pe un singur rând** (nu se rupe, nu se strânge). Într-un card cu titlu lung, insigna stă deasupra titlului, nu lângă el. Tonuri: `good`, `warn`, `bad`, `muted`, `primary`. Pentru stări (Nou, În lucru, Rezolvat, Ignorat) și etichete scurte.
- `Notice`: mesaj pe toată lățimea, în culoarea stării. Unul singur odată, deasupra conținutului la care se referă.

### 6.6 Antetul paginii

`PageHeader` pe fiecare pagină din panou: sprânceana (`.label`, grupul din meniu), titlul (Sora, 30 px; 24 px pe telefon), o propoziție de subtitlu, iar acțiunea principală a paginii, dacă există, în dreapta. 24 px până la primul card.

## 7. Meniul panoului

Structura actuală: grupuri (Vizibilitate, Vânzări, Reparații, Cont), fiecare cu paginile lui.

**De rezolvat (cerut de ZoZo, 20.11.2026):** titlurile de grup se văd prea puțin și par la fel ca paginile, ceea ce derutează. Regulile pentru meniu:
- Titlul de grup trebuie să se distingă clar de pagini, ca un antet de secțiune: icon propriu (Lucide), text mai deschis la culoare și mai gros decât acum, separator sau spațiu de 24 px deasupra fiecărui grup.
- Paginile din grup stau ușor indentate sub titlu, ca să se vadă cui aparțin.
- Pagina activă: fundal `side-active` și text gros. Grupul paginii active are și titlul evidențiat.
- Pe telefon și tabletă, meniul devine o bandă orizontală cu grupurile vizibile ca file separate, nu o singură linie lungă de pagini.
- Cel mult 7 pagini pe grup și cel mult 5 grupuri.

## 8. Responsivitate

Puncte de rupere (Tailwind), aceleași peste tot:

| Nume | De la | Ce se schimbă |
|---|---|---|
| (telefon) | 360 px | o coloană, câmpuri și butoane de 44 px, padding de card 16 px, meniul ca bandă sus |
| `sm` | 640 px | câmpuri și butoane de 40 px, padding de card 24 px |
| `md` | 768 px | formularele trec pe rânduri, grilele de 2 coloane |
| `lg` | 1024 px | meniul lateral fix, grile de 3 și 4 coloane |
| `xl` | 1280 px | coloana laterală (ex. „3 lucruri de făcut”) lângă conținut |

Reguli:
- Proiectăm întâi pentru telefon, apoi adăugăm coloane. Fiecare grilă pornește de la o coloană.
- **Nicio pagină nu derulează orizontal**, la nicio lățime. Textul lung (adrese, chei, coduri) folosește `break-all` sau `truncate`, iar elementele flex care conțin text au `min-w-0`.
- Zone de atingere de minim 44×44 px pe telefon.
- Imaginile au dimensiuni fixe sau `max-w-full`, ca să nu mute pagina la încărcare.
- Se verifică la 360, 768, 1024 și 1366 px, luminos și întunecat.

## 9. Grafice

- Un grafic = o idee. Titlul spune concluzia („Ai urcat la Gemini în ultimele 2 săptămâni”).
- Tu: `--primary`, linie mai groasă. Concurenții: nuanțe de gri. AI-urile: culori fixe, aceleași peste tot.
- Axa Y de la 0 pentru procente. Cel mult 5 serii.
- Textul graficelor folosește tokenurile (`var(--text-muted)`), ca să se vadă în ambele moduri.

## 10. Text

- Prietenos, direct, cu „tu”, fără jargon.
- Butoanele spun ce fac. Erorile spun ce s-a întâmplat și ce poți face, fără coduri tehnice.
- Diacritice corecte, mereu (ș, ț cu virgulă).
- Formate locale prin `src/lib/format.ts` (`Intl`): 1.299,90 lei · 12 990 Ft · 20.11.2026.

## 11. Interacțiune

- Orice click are reacție vizibilă în cel mult 100 ms (stare de apăsare, „Se lucrează…”).
- Focus vizibil pe orice element (contur `--primary` de 2 px). Tastatura funcționează peste tot.
- Confirmăm doar acțiunile care nu se pot anula.

## 12. Lista de verificare pentru orice ecran

Două verificări automate prind o parte din listă:
- `pnpm test` rulează `tests/design-rules.test.ts`: fără elemente native scrise de mână, culori directe, mărimi de text sau spații în afara scării, colțuri greșite și umbre, în `src/app/panou` și `src/components`.
- `pnpm ui:check` (cu aplicația pornită) deschide fiecare pagină din panou la 360, 768 și 1366 px, luminos și întunecat, verifică să nu existe scroll orizontal, insigne sau butoane rupte pe două rânduri și salvează capturile în `ui-shots/` pentru PR.

- [ ] Folosește doar componentele din `ui.tsx` și culorile din tokenuri (nimic scris de mână)
- [ ] O singură acțiune principală (buton verde) pe card; celelalte butoane au varianta funcției lor
- [ ] Câmpurile dintr-un rând încep la aceeași linie; butonul e la nivelul câmpurilor
- [ ] Spațiile sunt din scara de la §4 (24 între carduri, 24 în card, 16 între câmpuri)
- [ ] Chenarele și colțurile sunt cele din §5
- [ ] Funcționează la 360, 768 și 1366 px, fără scroll orizontal
- [ ] Funcționează în modul luminos și în cel întunecat
- [ ] Răspunsul principal se vede sus, fără scroll; fiecare problemă are acțiune
- [ ] Există stare goală, de încărcare și de eroare
- [ ] Contrast AA, focus vizibil, zone de atingere de 44 px pe telefon
- [ ] Texte cu diacritice corecte, cifre cu format local și `num`

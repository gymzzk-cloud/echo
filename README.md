# Echo (MVP + fazele 2 și 3)

Echo face magazinele online din România și Ungaria vizibile în asistenții AI (ChatGPT, Gemini, Perplexity, Claude, Google AI Overviews, Google AI Mode, Copilot) și oferă cumpărătorilor o căutare care întreabă toate AI-urile deodată, cu prețuri verificate.

Două părți, un singur motor:
- **Cumpărători** (public, RO și HU): `/` căutare, `/cauta` (cu continuare: „mai ieftin”, „doar în stoc”), `/compara`, `/cont` (produse urmărite, alerte de preț și stoc, liste), `/magazin/<domeniu>` (fapte verificabile, recenzii din comenzi reale), `/index-ai`, `/cum-ordonam`.
- **Magazine** (cont): `/pentru-magazine` (audit gratuit), `/inregistrare`, `/panou`:
  - Vizibilitate: Acasă, Vizibilitate AI, Produse, Surse, Ce spune AI-ul, Întreabă asistentul (+ Toți clienții pentru agenții)
  - Vânzări: Vânzări din AI (cod propriu de urmărire, fără Profitshare), Recenzii verificate și scorul de încredere
  - Reparații: Audit tehnic, Acțiuni, Roboții AI, Feed și canale (reguli, etichete, titluri, 8 canale), Agent Gate
  - Cont: Rapoarte, Setări magazin (Shopify, WooCommerce, GoMag, MerchantPro, PrestaShop, feed XML/CSV/JSON/YAML, încărcare fișier), API și MCP, Echipă și abonament (invitații, roluri, 2FA, marcă proprie, Stripe)
- **Intern**: `/admin/magazine`, registrul tuturor magazinelor văzute (audit gratuit, menționate de AI, clienți), revendicate sau nu. Acces doar pentru `ADMIN_EMAILS`. Auditul gratuit pentru același site se refolosește 24 de ore; CUI-ul și datele firmei se păstrează 90 de zile dacă o verificare nouă nu le mai găsește.
- **Pentru agenți AI și sisteme**: server MCP `/mcp` (toate magazinele verificate) și `/mcp/magazin/<domeniu>` (un magazin), API `/api/v1/*` cu chei, webhook-uri semnate HMAC, feed-uri pe canale la `/feed/<token>`.

Planul, regulile de design și de lucru sunt în `agentready/fundatie/` (PLAN-TEHNIC.md, DESIGN.md, CLAUDE.md, FUNCTII.md, DECIZII.md).

## Pornire locală

Ai nevoie de **Node.js 22+** și **PostgreSQL 16** (local sau Docker).

```bash
# 1. Baza de date (varianta Docker)
docker run -d --name echo-db -p 5432:5432 \
  -e POSTGRES_USER=agentready -e POSTGRES_PASSWORD=agentready -e POSTGRES_DB=agentready postgres:16

# 2. Configurare
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # pune rezultatul la ENCRYPTION_KEY

# 3. Instalare, tabele, date de test
npm install
npm run db:migrate
npm run db:seed          # cont demo + cele 3 magazine de test + 14 zile de istoric

# 4. Pornire (două terminale)
npm run dev              # aplicația pe http://localhost:3000
npm run worker           # rulările zilnice, sincronizări, audituri, rapoarte
```

Cont demo: **demo@echo.local** / **echo-demo-2026**.

### Despre datele de test
- `db:seed` încearcă întâi să conecteze real cele 3 magazine (shopexpert.com/ro, shopexpert.com/hu, hardlineconstruct.ro). Dacă nu sunt Shopify/WooCommerce sau nu e internet, folosește **produse inventate** din `fixtures/` (conexiunea apare ca `fixture:…` în Setări). Înlocuiește-le din **Setări → Catalogul de produse** cu adresa feed-ului Google (XML) sau CSV.
- Tot din `db:seed`: vânzări, recenzii, comenzi de la agenți și vizite de roboți **inventate**, ca paginile noi să aibă ce arăta; plus un cont de cumpărător `cumparator@echo.local` / `echo-demo-2026`.
- Auditul tehnic rulează pe site-urile reale. Dacă un site blochează vizitatorii automați, auditul spune asta: e exact problema care blochează și AI-urile.

## Mod demo și chei API

Fără chei, toate AI-urile rulează în **mod demo** (răspunsuri simulate, deterministe, fără cost). Panoul arată „Mod demo”. Pentru date reale, completează în `.env`:

| Cheie | De unde |
|---|---|
| `OPENAI_API_KEY` | platform.openai.com |
| `GEMINI_API_KEY` | aistudio.google.com → „Get API key” (planul gratuit merge; limitele sunt în `GEMINI_RPM` și `GEMINI_DAILY_LIMIT`) |
| `SERPAPI_API_KEY` | serpapi.com → Dashboard → „Your Private API Key”, pentru Google AI Overviews, Google AI Mode și Copilot (planul gratuit: 100 de căutări pe lună, comune; `SERP_ENGINES` alege motoarele) |
| `XAI_API_KEY` | console.x.ai → API Keys, pentru Grok (cu căutare web) |
| `META_API_KEY` | developer.meta.com → Meta Model API, pentru Meta AI (fără căutare web; în 2026 doar din SUA) |
| `PERPLEXITY_API_KEY` | perplexity.ai/settings/api |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `RESEND_API_KEY` (opțional) | resend.com, pentru emailul săptămânal |

Fiecare AI fără cheie rămâne în demo; celelalte trec pe live. Răspunsurile sunt păstrate o zi și refolosite între magazine pentru aceeași întrebare, ca să ținem costul jos.

## Comenzi

| Comandă | Ce face |
|---|---|
| `npm run dev` / `build` / `start` | aplicația Next.js |
| `npm run worker` | coada de joburi (Postgres) și programul zilnic |
| `npm run db:generate` / `db:migrate` | migrații Drizzle |
| `npm run db:seed` | date de test (recreează contul demo) |
| `npm run typecheck` / `npm test` | TypeScript și testele unitare |

## Structură

```
src/
  app/            pagini (public + /panou) și acțiunile de server (actions.ts)
  components/     UI comun (ui.tsx), grafice și formulare client
  core/
    audit/        auditul tehnic și reparațiile „Rezolvă”
    connectors/   Shopify, WooCommerce, GoMag, MerchantPro, PrestaShop, feed XML/CSV/JSON/YAML
    ai/           motorul AI: live (6 surse), demo, extragerea mențiunilor
    tracking.ts   vânzări din AI și comisionul Echo
    watches.ts    contul de cumpărător: urmăriri și alerte
    refine.ts     continuarea conversației în căutare
    feed.ts       reguli de feed, etichete, titluri, ieșiri pe canale
    agent-gate.ts deciziile pentru comenzile plasate de agenți
    trust.ts      scorul de încredere și recenziile verificate
    mcp.ts        serverele MCP
    platform.ts   API public, chei, webhook-uri
    billing.ts    abonamente Stripe
    assistant.ts  asistentul din panou
    bots.ts       roboții AI (jurnale, Cloudflare)
    projects.ts   sincronizare, rulări zilnice, statistici, alerte, acțiuni
    insights.ts   calculele pentru paginile panoului
    search.ts     căutarea pentru cumpărători și clasamentul combinat
    report.ts     raportul săptămânal
    jobs.ts       coada de joburi
  db/             schema Drizzle, migrații, seed
  worker/         procesul de fundal
fixtures/         cataloage de test (produse inventate)
tests/            teste unitare (vitest)
docs/adr/         deciziile tehnice
```

## Securitate, pe scurt
Sesiuni în cookie httpOnly cu token hash-uit, parole bcrypt, 2FA opțional (TOTP), roluri (proprietar, administrator, membru, doar citire, client de agenție limitat la magazinele lui), chei API stocate doar ca hash, webhook-uri doar spre adrese publice HTTPS și semnate HMAC, semnătura Stripe verificată, limită de încercări la login, fiecare acțiune verifică faptul că magazinul aparține organizației tale, cheile sensibile criptate AES-256-GCM, validare zod pe toate formularele, antete de securitate, jurnal de audit. Detalii în `fundatie/PLAN-TEHNIC.md`.

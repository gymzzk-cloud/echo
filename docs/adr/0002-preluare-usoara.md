# ADR 0002 · Preluare ușoară a datelor de la magazine

Data: 2026-11-20 · Stare: acceptată (regulă permanentă cerută de ZoZo)

## Context
Echo citește feed-uri, API-uri și pagini de la sute de magazine. Dacă le citim des, toate deodată sau în paralel, încărcăm serverele lor și riscăm să fim blocați.

## Decizie
Orice cod nou care ia date de la un magazin respectă aceste reguli:

1. **Prin `politeFetch`** (`src/core/connectors/polite.ts`): o singură cerere odată per magazin, pauză între pagini (`CATALOG_PAGE_PAUSE_MS`, implicit 400 ms), user-agent `EchoCatalogBot`, respectă `Retry-After` la 429/503.
2. **Doar dacă s-a schimbat**: feed-urile se cer cu `If-None-Match` / `If-Modified-Since`. La 304 nu descărcăm și nu procesăm nimic.
3. **Doar când e nevoie**: sincronizare la `CATALOG_SYNC_HOURS` (implicit 12h), cu decalaj stabil 0–2h per magazin ca să nu cadă toate la aceeași oră. Workerul pune maximum 5 sincronizări pe ciclu.
4. **După erori, mai rar**: x2, apoi x4 (plafon), resetat la primul succes.
5. **Refolosim ce știm**: auditul gratuit e refolosit 24h, datele stabile (CUI, firmă) 90 de zile. Căutarea și MCP-ul citesc din baza noastră, nu din magazin.

## Consecințe
Prețurile și stocul pot fi întârziate până la ~14h. Magazinul poate cere o sincronizare manuală din panou când are nevoie urgent.

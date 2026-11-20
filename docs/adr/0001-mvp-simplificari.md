# ADR 0001: Simplificări pentru MVP

Data: 19.11.2026 · Stare: acceptată

## Context
PLAN-TEHNIC.md descrie un monorepo (web, worker, pachete comune) și o coadă BullMQ pe Redis. Pentru MVP vrem cât mai puține piese de rulat, ca testarea pe magazinele noastre să înceapă imediat.

## Decizie
1. **O singură aplicație Next.js** cu un proces `worker` separat în același repo, în loc de monorepo. Codul de domeniu stă în `src/core/` fără dependențe de Next, ca să-l putem muta într-un pachet fără rescriere.
2. **Coadă de joburi în Postgres** (`SELECT … FOR UPDATE SKIP LOCKED`), în loc de BullMQ/Redis. Suficientă pentru sute de magazine; o singură bază de date de administrat.
3. **Extragerea mențiunilor euristică** (domenii, nume cunoscute, prețuri, potrivire de cuvinte), fără un model suplimentar. O înlocuim cu extragere prin AI când avem date reale pentru comparație.
4. **Mod demo** când lipsesc cheile API: tot produsul se poate testa fără costuri.
5. **Limitarea încercărilor de login în memorie**. La mai multe instanțe trece în Postgres sau Redis.

## Consecințe
Pornire cu `npm run dev` + `npm run worker` și un Postgres. Când depășim ~1.000 de magazine sau ~100.000 de rulări pe zi, trecem coada pe Redis și separăm worker-ul în pachet propriu (PLAN-TEHNIC, secțiunea scalare).

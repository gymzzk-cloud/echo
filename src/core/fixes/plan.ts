import type { FixCandidate } from "./rules";

/**
 * Ce scriem după o căutare de reparații (logică pură, testată unitar). Un rând pe produs și câmp:
 * - propunere nouă: se adaugă (aprobată automat dacă pragul e pornit și încrederea îl atinge);
 * - propunere în așteptare: se actualizează doar dacă s-a schimbat textul sau scorul;
 * - decizie luată (aprobat / respins): rămâne, cât timp datele produsului sunt aceleași. Dacă produsul s-a schimbat
 *   în catalog și propunerea e alta, o punem din nou la aprobat;
 * - o propunere AI cu aceleași date de intrare nu e înlocuită de una din reguli (AI-ul nu se plătește de două ori);
 * - propunerile în așteptare care nu mai au motiv (catalogul a fost reparat) se șterg; la fel deciziile vechi,
 *   dacă datele produsului s-au schimbat de atunci și reparația nu mai e propusă.
 */

export type ExistingFix = { id: string; productId: string; field: string; value: string; status: string; source: string; inputHash: string | null; confidence: number };
export type FixWrite = Omit<FixCandidate, "productId"> & { productId: string; status: "propus" | "aprobat"; auto: boolean; inputHash: string };

export function planFixWrites(candidates: FixCandidate[], existing: ExistingFix[], hashOf: Map<string, string>, threshold: number | null) {
  const ex = new Map(existing.map((e) => [`${e.productId}|${e.field}`, e]));
  const upsert: FixWrite[] = [];
  const seen = new Set<string>();
  const decide = (c: FixCandidate) => (threshold !== null && c.confidence >= threshold ? { status: "aprobat" as const, auto: true } : { status: "propus" as const, auto: false });
  for (const c of candidates) {
    const k = `${c.productId}|${c.field}`;
    seen.add(k);
    const hash = hashOf.get(c.productId) ?? "";
    const e = ex.get(k);
    if (!e) { upsert.push({ ...c, inputHash: hash, ...decide(c) }); continue; }
    const sameInput = e.inputHash === hash;
    if (sameInput && e.source === "ai" && c.source !== "ai") continue;
    if (e.status !== "propus") {
      if (sameInput || e.value === c.value) continue;
      upsert.push({ ...c, inputHash: hash, ...decide(c) });
      continue;
    }
    if (e.value === c.value && e.confidence === c.confidence && sameInput) continue;
    upsert.push({ ...c, inputHash: hash, ...decide(c) });
  }
  const remove = existing.filter((e) => {
    if (seen.has(`${e.productId}|${e.field}`)) return false;
    const sameInput = e.inputHash === (hashOf.get(e.productId) ?? "");
    if (e.status === "propus") return !(e.source === "ai" && sameInput);
    // O decizie (aprobat / respins) rămâne cât timp produsul e același. Dacă datele produsului s-au schimbat și
    // reparația nu mai are motiv, o scoatem: altfel un titlu aprobat pe date vechi ar înlocui titlul bun din catalog.
    return !sameInput && hashOf.has(e.productId);
  }).map((e) => e.id);
  return { upsert, remove };
}

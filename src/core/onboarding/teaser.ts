import type { Mention } from "@/db/schema";
import { isStoreLike } from "../ai/domains";

/**
 * Rezultatul parțial al testului gratuit: doar cifrele mari (vizibilitate, locul tău, cine e recomandat).
 * Detaliile (ce răspunde AI-ul pe fiecare întrebare, ce să repari, sursele) nu se calculează aici:
 * ele nu pleacă spre pagină până la alegerea unui plan. Funcție pură, testabilă fără bază de date.
 */
export type TeaserRun = { promptId: string; provider: string; mentions: Mention[] };
export type StoreRow = { domain: string; name: string; visibility: number; avgPosition: number | null; me: boolean };

export function computeTeaser(runs: TeaserRun[], ownDomains: string[], storeName: string, top = 5) {
  const own = new Set(ownDomains);
  const answers = runs.length;
  const by = new Map<string, { name: string; hits: number; pos: number[] }>();
  let myHits = 0;
  const myPos: number[] = [];
  const missingPrompts = new Set<string>();
  const seenPrompt = new Map<string, boolean>();
  for (const r of runs) {
    const mine = r.mentions.find((m) => own.has(m.domain));
    if (mine) { myHits++; myPos.push(mine.position); }
    seenPrompt.set(r.promptId, (seenPrompt.get(r.promptId) ?? false) || !!mine);
    const counted = new Set<string>();
    for (const m of r.mentions) {
      if (own.has(m.domain) || !isStoreLike(m.domain) || counted.has(m.domain)) continue;
      counted.add(m.domain);
      const e = by.get(m.domain) ?? { name: m.name ?? m.domain, hits: 0, pos: [] };
      e.hits++; e.pos.push(m.position);
      by.set(m.domain, e);
    }
  }
  for (const [p, hit] of seenPrompt) if (!hit) missingPrompts.add(p);
  const pct = (n: number) => (answers ? Math.round((n / answers) * 100) : 0);
  const avg = (xs: number[]) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null);
  const me: StoreRow = { domain: ownDomains[0] ?? "", name: storeName, visibility: pct(myHits), avgPosition: avg(myPos), me: true };
  const others: StoreRow[] = [...by.entries()].map(([domain, e]) => ({ domain, name: e.name, visibility: pct(e.hits), avgPosition: avg(e.pos), me: false }));
  const all = [...others, me].sort((a, b) => b.visibility - a.visibility || (a.me ? 1 : 0) - (b.me ? 1 : 0));
  const rank = all.findIndex((s) => s.me) + 1;
  // Top 5 cu tine mereu în listă: dacă nu ești între primii, ocupi ultimul loc din tabel cu locul tău real.
  const head = all.slice(0, top);
  const table = head.some((s) => s.me) ? head : [...all.slice(0, top - 1), me];
  return { answers, myHits, visibility: me.visibility, avgPosition: me.avgPosition, rank, storesSeen: all.length, table, missingPrompts: missingPrompts.size, prompts: seenPrompt.size };
}

/** Mărcile din profil menționate în răspunsuri (text), în % din răspunsuri. */
export function brandShare(answers: string[], brands: string[], top = 5) {
  const n = answers.length;
  return brands.map((b) => {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "iu");
    const hits = answers.filter((a) => re.test(a)).length;
    return { brand: b, visibility: n ? Math.round((hits / n) * 100) : 0 };
  }).filter((x) => x.visibility > 0).sort((a, b) => b.visibility - a.visibility).slice(0, top);
}

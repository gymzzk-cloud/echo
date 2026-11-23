import type { Mention } from "@/db/schema";
import { PROVIDERS } from "./ai/types";
import { rankRivals } from "./rivals";
import { sentimentBoard } from "./ai/sentiment";

/**
 * „Pe fiecare AI”: cum te prezintă fiecare AI, unul lângă altul, din răspunsurile deja salvate (fără apeluri AI).
 * Funcții pure, testate în tests/engine-view.test.ts. Citirile din bază sunt în engine-view-read.ts.
 */

export type EngineRow = { promptId: string; run: { provider: string; runDate: string; mentions: unknown } };
export type EngineFailure = { provider: string; runDate: string; reason: string };
/** Cifrele de produs salvate de worker (`product_ai_stats`), pe fiecare AI. */
export type EngineProducts = { provider: string; named: number; wrongPrice: number };

export type EngineView = {
  provider: string;
  /** Răspunsuri primite în perioadă (fără cele eșuate). */
  answers: number;
  /** Răspunsuri care te numesc. */
  hits: number;
  /** % din răspunsuri care te numesc. */
  visibility: number;
  avgPosition: number | null;
  /** Vizibilitatea la ultima măsurătoare față de cea dinainte (puncte procentuale); null dacă e una singură. */
  delta: number | null;
  lastDay: string | null;
  /** Magazinul care apare cel mai des la acest AI, altul decât tine, și cât de des. */
  leader: { domain: string; name: string; visibility: number } | null;
  /** Magazinul care te întrece cel mai des (apare când lipsești sau înaintea ta). */
  instead: { name: string; times: number } | null;
  /** Tonul față de tine: −100…+100, null = prea puține păreri. */
  tone: number | null;
  named: number;
  wrongPrice: number;
  /** Ultima încercare a eșuat: motivul (nu înseamnă „nu te recomandă”). */
  failure: string | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0);

/** Cifrele pe fiecare AI. Ordinea: AI-urile care au răspuns, cele mai vizibile întâi; apoi cele care n-au putut fi întrebate. */
export function perEngine(rows: EngineRow[], failed: EngineFailure[], domain: string, products: EngineProducts[] = [], excluded: string[] = []): EngineView[] {
  const byProvider = new Map<string, EngineRow[]>();
  for (const r of rows) {
    const list = byProvider.get(r.run.provider) ?? [];
    list.push(r);
    byProvider.set(r.run.provider, list);
  }
  const lastFailure = new Map<string, EngineFailure>();
  for (const f of failed) {
    const prev = lastFailure.get(f.provider);
    if (!prev || prev.runDate < f.runDate) lastFailure.set(f.provider, f);
  }
  const prod = new Map(products.map((p) => [p.provider, p]));

  const out: EngineView[] = [];
  for (const { id } of PROVIDERS) {
    const rs = byProvider.get(id) ?? [];
    const fail = lastFailure.get(id);
    if (!rs.length && !fail) continue;
    let hits = 0, posSum = 0;
    const byDay = new Map<string, [number, number]>();
    for (const r of rs) {
      const me = ((r.run.mentions as Mention[]) ?? []).find((m) => m.domain === domain);
      const d = byDay.get(r.run.runDate) ?? [0, 0];
      d[1]++;
      if (me) { hits++; posSum += me.position; d[0]++; }
      byDay.set(r.run.runDate, d);
    }
    const days = [...byDay.keys()].sort();
    const lastDay = days.at(-1) ?? null;
    const dayVis = (d: string) => pct(byDay.get(d)![0], byDay.get(d)![1]);
    const delta = days.length > 1 ? dayVis(days.at(-1)!) - dayVis(days.at(-2)!) : null;
    const rivals = rs.length ? rankRivals(rs, domain, excluded) : null;
    const lead = rivals?.rivals.slice().sort((a, b) => b.appearances - a.appearances)[0];
    const beat = rivals?.rivals.find((r) => r.beats > 0);
    const tone = rs.length ? sentimentBoard(rs, [domain])[0].overall.score : null;
    // Eșecul contează doar dacă e mai nou decât ultimul răspuns bun (altfel AI-ul a răspuns între timp).
    const failure = fail && (!lastDay || fail.runDate >= lastDay) ? fail.reason : null;
    out.push({
      provider: id, answers: rs.length, hits, visibility: pct(hits, rs.length), avgPosition: hits ? round1(posSum / hits) : null, delta, lastDay,
      leader: lead && lead.appearances > 0 ? { domain: lead.domain, name: lead.name, visibility: pct(lead.appearances, rs.length) } : null,
      instead: beat ? { name: beat.name, times: beat.beats } : null,
      tone, named: prod.get(id)?.named ?? 0, wrongPrice: prod.get(id)?.wrongPrice ?? 0, failure,
    });
  }
  return out.sort((a, b) => Number(!!b.answers) - Number(!!a.answers) || b.visibility - a.visibility || b.answers - a.answers);
}

/** Verdictul de sus, într-o propoziție: câte AI-uri te recomandă, unde stai cel mai bine și unde lipsești. */
export function engineVerdict(list: EngineView[], label: (p: string) => string) {
  const asked = list.filter((e) => e.answers > 0);
  const yes = asked.filter((e) => e.hits > 0);
  const missing = asked.filter((e) => e.hits === 0).map((e) => label(e.provider));
  const best = [...yes].sort((a, b) => b.visibility - a.visibility)[0];
  if (!asked.length) return { headline: "Încă nu avem răspunsuri de la AI-uri în perioada aleasă.", best: null, missing };
  const headline = yes.length
    ? `Te recomandă ${yes.length} din ${asked.length} ${asked.length === 1 ? "AI" : "AI-uri"}.`
    : asked.length === 1 ? `${label(asked[0].provider)} nu te recomandă încă.` : `Niciun AI dintre cele ${asked.length} întrebate nu te recomandă încă.`;
  return { headline, best: best ? { name: label(best.provider), visibility: best.visibility } : null, missing };
}

/** O măsurătoare zilnică salvată (`daily_stats`). */
export type DayStat = { day: string; provider: string; visibility: number; score: number };

/**
 * „Ce s-a schimbat de când folosești Echo”: prima măsurătoare față de ultima, total și pe fiecare AI.
 * Nu spunem că Echo a produs schimbarea; arătăm doar cifrele, ca să le poți verifica.
 */
export function progressSince(stats: DayStat[]) {
  const all = stats.filter((s) => s.provider === "all").sort((a, b) => a.day.localeCompare(b.day));
  const first = all[0] ?? null;
  const last = all.at(-1) ?? null;
  const perProvider: { provider: string; from: number; to: number; fromDay: string; toDay: string }[] = [];
  for (const { id } of PROVIDERS) {
    const ps = stats.filter((s) => s.provider === id).sort((a, b) => a.day.localeCompare(b.day));
    if (ps.length < 2) continue;
    perProvider.push({ provider: id, from: ps[0].visibility, to: ps.at(-1)!.visibility, fromDay: ps[0].day, toDay: ps.at(-1)!.day });
  }
  return {
    first, last,
    measurements: all.length,
    visibilityDelta: first && last && first.day !== last.day ? last.visibility - first.visibility : null,
    scoreDelta: first && last && first.day !== last.day ? last.score - first.score : null,
    perProvider: perProvider.sort((a, b) => (b.to - b.from) - (a.to - a.from)),
  };
}

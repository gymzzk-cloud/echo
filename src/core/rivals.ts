import type { Mention } from "@/db/schema";
import { brandLabel } from "./ai/extract";

/**
 * Concurenții „care apar mai bine ca tine”, găsiți în răspunsurile AI deja salvate (fără apeluri AI noi).
 * Pentru fiecare răspuns (o căutare urmărită × un AI × o zi) comparăm locul tău cu al celorlalte magazine:
 * un magazin „te întrece” când apare și tu lipsești, sau apare înaintea ta.
 * Funcții pure, testate în tests/rivals.test.ts.
 */

/** Marketplace-uri mari: sunt concurenți reali la aceleași produse, dar le marcăm separat. */
export const MARKETPLACES = new Set(["emag.ro", "emag.hu", "altex.ro", "flanco.ro", "cel.ro", "evomag.ro", "okazii.ro", "olx.ro", "vatera.hu", "jofogas.hu", "mediagalaxy.ro", "media-markt.hu", "mediamarkt.hu"]);

/** Site-uri care nu vând: comparatoare, forumuri, presă, rețele sociale, AI-uri. Nu devin concurenți. */
const NON_STORE = /(^|[.-])(wiki|wikipedia|reddit|youtube|youtu|facebook|instagram|tiktok|twitter|linkedin|pinterest|quora|medium|github|forum|blog|news|stiri|digi24|hotnews|ziare|adevarul|libertatea|protv|mediafax|g4media|playtech|zf|wall-street|economica|index|444|telex|hvg|origo|24|portfolio|compari|pricy|arukereso|shopmania|price|pricerunner|idealo|trustpilot|anpc|google|bing|openai|chatgpt|anthropic|claude|gemini|perplexity)[.-]/;
const NON_STORE_EXACT = new Set(["x.com", "t.co", "gov.ro", "gov.hu"]);

export function isStoreLike(domain: string) {
  if (NON_STORE_EXACT.has(domain) || /\.(gov|edu)(\.|$)/.test(domain)) return false;
  return !NON_STORE.test(`.${domain}.`);
}

export type RivalRow = { promptId: string; run: { provider: string; runDate: string; mentions: unknown } };

export type Rival = {
  domain: string;
  name: string;
  marketplace: boolean;
  /** Răspunsuri în care apare. */
  appearances: number;
  /** Răspunsuri în care apare și tu lipsești. */
  instead: number;
  /** Răspunsuri în care apar amândoi, dar el e înaintea ta. */
  ahead: number;
  /** instead + ahead: de câte ori te întrece. */
  beats: number;
  /** Câte căutări urmărite diferite (aceleași produse ca tine) îl aduc. */
  prompts: number;
  avgPosition: number | null;
  /** Procent din toate recomandările de magazine (tu + ceilalți). */
  share: number;
};

export type RivalReport = {
  rivals: Rival[];
  me: { appearances: number; prompts: number; avgPosition: number | null; share: number };
  /** Răspunsuri analizate. */
  answers: number;
};

/** Același magazin pe alt domeniu (aceeași marcă): nu e concurent. */
export const isOwnBrand = (domain: string, ownDomain: string) => domain === ownDomain || brandLabel(domain) === brandLabel(ownDomain);

const prettyName = (domain: string) => {
  const label = domain.split(".").slice(0, -1).pop() ?? domain;
  return label.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
};

/** Clasează magazinele din răspunsuri după de câte ori apar mai bine ca tine. */
export function rankRivals(rows: RivalRow[], ownDomain: string, excluded: string[] = []): RivalReport {
  const skip = new Set([ownDomain, ...excluded]);
  const acc = new Map<string, { name?: string; appearances: number; instead: number; ahead: number; prompts: Set<string>; pos: number[] }>();
  let mine = 0, minePos = 0, totalStoreMentions = 0;
  const myPrompts = new Set<string>();
  for (const r of rows) {
    const ms = (r.run.mentions as Mention[]) ?? [];
    const me = ms.find((m) => m.domain === ownDomain);
    if (me) { mine++; minePos += me.position; totalStoreMentions++; myPrompts.add(r.promptId); }
    const seen = new Set<string>();
    for (const m of ms) {
      if (skip.has(m.domain) || seen.has(m.domain) || isOwnBrand(m.domain, ownDomain) || !isStoreLike(m.domain)) continue;
      seen.add(m.domain);
      totalStoreMentions++;
      const a = acc.get(m.domain) ?? { name: m.name, appearances: 0, instead: 0, ahead: 0, prompts: new Set<string>(), pos: [] };
      if (!a.name && m.name) a.name = m.name;
      a.appearances++;
      a.prompts.add(r.promptId);
      a.pos.push(m.position);
      if (!me) a.instead++;
      else if (m.position < me.position) a.ahead++;
      acc.set(m.domain, a);
    }
  }
  const pct = (n: number) => (totalStoreMentions ? Math.round((n / totalStoreMentions) * 100) : 0);
  const rivals: Rival[] = [...acc.entries()].map(([domain, a]) => ({
    domain,
    name: a.name ?? prettyName(domain),
    marketplace: MARKETPLACES.has(domain),
    appearances: a.appearances,
    instead: a.instead,
    ahead: a.ahead,
    beats: a.instead + a.ahead,
    prompts: a.prompts.size,
    avgPosition: a.pos.length ? +(a.pos.reduce((s, x) => s + x, 0) / a.pos.length).toFixed(1) : null,
    share: pct(a.appearances),
  })).sort((x, y) => y.beats - x.beats || y.appearances - x.appearances || (x.avgPosition ?? 99) - (y.avgPosition ?? 99) || x.domain.localeCompare(y.domain));
  return { rivals, me: { appearances: mine, prompts: myPrompts.size, avgPosition: mine ? +(minePos / mine).toFixed(1) : null, share: pct(mine) }, answers: rows.length };
}

export const RIVAL_MIN_BEATS = 2;
export const RIVAL_MAX_AUTO = 8;

/**
 * Ce concurenți adăugăm automat: cei care te întrec de cel puțin `minBeats` ori,
 * fără cei deja urmăriți sau scoși de client, până la `maxAuto` adăugați automat în total.
 */
export function pickAutoRivals(
  rivals: Rival[],
  opts: { tracked: string[]; dismissed: string[]; autoCount: number; minBeats?: number; maxAuto?: number },
): Rival[] {
  const { minBeats = RIVAL_MIN_BEATS, maxAuto = RIVAL_MAX_AUTO } = opts;
  const room = Math.max(0, maxAuto - opts.autoCount);
  const tracked = new Set(opts.tracked), dismissed = new Set(opts.dismissed);
  return rivals.filter((r) => r.beats >= minBeats && !tracked.has(r.domain) && !dismissed.has(r.domain)).slice(0, room);
}

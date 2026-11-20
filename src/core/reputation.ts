import type { Rows } from "./insights";
import type { StoreFacts } from "./audit";
import { PROVIDERS } from "./ai/types";

/**
 * „Ce spune AI-ul despre tine”: răspunsurile la întrebările despre magazin (intent „brand”),
 * tonul fiecărui AI, ce afirmă despre tine și ce afirmații contrazic faptele verificate pe site.
 */

/**
 * Tonul unei afirmații, fără apeluri AI: cuvinte negative și pozitive, cu negație.
 * „nu a avut probleme”, „fără probleme”, „riscul de probleme e minim” sunt pozitive;
 * „unul dintre puținele magazine care au…” e laudă, nu „puține”.
 */
const W = (src: string) => new RegExp(src, "iu");
const NEG_WORDS = W(String.raw`(?<![\p{L}])(plâng\p{L}*|reclama\p{L}*|întârzi\p{L}*|probleme?|lips\p{L}+|țeap\p{L}*|refuz\p{L}*|anula\p{L}*|slab\p{L}*|dificil\p{L}*|greu de găsit|nu am găsit|puține|puțin[ei] (recenzii|informații|date|păreri)|negativ\p{L}*|nemulțum\p{L}*|panasz\p{L}*|késés\p{L}*|probléma\p{L}*|nem találtam|kevés)(?![\p{L}])`);
const NEG_STRONG = W(String.raw`nu (îl |o |le )?recomand|evit(ă|ați)|țeapă|nu răspund|nu (mai )?livr|nu ajunge`);
const POS_WORDS = W(String.raw`(?<![\p{L}])(încreder\p{L}*|recomand\p{L}*|bun[ăe]?|rapid\p{L}*|competitiv\p{L}*|clar\p{L}*|mulțum\p{L}*|liniștit|de top|gam(ă|a) (bună|largă|completă)|în stoc|autorizat\p{L}*|oficial\p{L}*|(unul|una) dintre puținele|megbízható|ajánl\p{L}*|gyors\p{L}*|jó)(?![\p{L}])`);
// O vorbă negativă e anulată de o negație cu cel mult 4 cuvinte înainte sau de „minim / redus / rar” după ea.
const NEGATED = W(String.raw`(?<![\p{L}])(nu|fără|niciun\p{L}*|nicio|n-a|n-au|nincs|nem|soha)(?![\p{L}])(\s+\S+){0,4}?\s+(probleme?|întârzi\p{L}*|plâng\p{L}*|reclama\p{L}*|probléma\p{L}*|késés\p{L}*)`);
const MITIGATED = W(String.raw`(probleme?|risc\p{L}*)[^.]{0,60}(minim|redus|scăzut|mic|rar)`);

export type Claim = { text: string; tone: "pozitiv" | "negativ" | "neutru"; provider: string; contradicts?: string; sources: string[] };

const sentences = (t: string) => t.replace(/\*\*/g, "").split(/(?<=[.!?])\s+|\n+/).map((x) => x.replace(/^[-*•\s]+/, "").trim()).filter((x) => x.length > 15);
export const toneOf = (s: string): Claim["tone"] => {
  if (NEG_STRONG.test(s)) return "negativ";
  const positive = POS_WORDS.test(s) || NEGATED.test(s) || MITIGATED.test(s);
  const negative = NEG_WORDS.test(s.replace(NEGATED, "").replace(MITIGATED, "").replace(/(unul|una) dintre puținele/giu, ""));
  return negative && !positive ? "negativ" : positive && !negative ? "pozitiv" : "neutru";
};

const DOMAIN_IN_TEXT = /\b([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:ro|hu|com|net|org|eu|info|biz))\b/gi;
/** De unde vine afirmația: site-ul numit în ea (ex. „un client de pe cumpar.net”), altfel sursele citate de AI în acel răspuns. */
function sourcesOf(sentence: string, run: { sources: unknown }) {
  const named = [...sentence.matchAll(DOMAIN_IN_TEXT)].map((m) => m[1].toLowerCase().replace(/^www\./, ""));
  if (named.length) return [...new Set(named)].slice(0, 2);
  const cited = ((run.sources as { url: string }[] | null) ?? []).map((x) => { try { return new URL(x.url).hostname.replace(/^www\./, ""); } catch { return null; } }).filter((x): x is string => !!x);
  return [...new Set(cited)].slice(0, 2);
}

/** Afirmații pe care le putem verifica cu datele din audit. */
function contradiction(s: string, facts: StoreFacts | null): string | undefined {
  if (!facts) return;
  const l = s.toLowerCase();
  if (/(date|informații).{0,30}firm.{0,30}(greu|nu|lips)|cui/.test(l) && facts.cui) return `Site-ul afișează CUI ${facts.cui}. Pune-l în subsol și în datele structurate Organization ca AI-urile să-l găsească.`;
  if (/retur.{0,40}(nu|lips|neclar)/.test(l) && facts.hasReturnPolicy) return "Ai politică de retur publicată. Leag-o din subsol și adaug-o în datele structurate (MerchantReturnPolicy).";
  if (/garanți.{0,30}(nu|lips)/.test(l)) return "Adaugă garanția pe pagina de produs și în datele structurate.";
}

export function reputation(rows: Rows, domain: string, storeName: string, facts: StoreFacts | null) {
  const brand = rows.filter((r) => r.intent === "brand");
  const day = brand.map((r) => r.run.runDate).sort().at(-1);
  const latest = brand.filter((r) => r.run.runDate === day);
  const claims: Claim[] = [];
  const perProvider = PROVIDERS.map((p) => {
    const rs = latest.filter((r) => r.run.provider === p.id);
    let pos = 0, neg = 0, knows = 0;
    for (const r of rs) {
      const ss = sentences(r.run.answer);
      if (!/nu am găsit suficiente|nem találtam elég/i.test(r.run.answer)) knows++;
      for (const s of ss) {
        const t = toneOf(s);
        if (t === "pozitiv") pos++; if (t === "negativ") neg++;
        if (t !== "neutru" || s.toLowerCase().includes(storeName.toLowerCase())) claims.push({ text: s, tone: t, provider: p.id, contradicts: contradiction(s, facts), sources: sourcesOf(s, r.run) });
      }
    }
    const score = pos + neg ? Math.round((pos / (pos + neg)) * 100) : null;
    return { provider: p.id, questions: rs.length, knows, pos, neg, score };
  });
  // Afirmațiile identice de la mai multe AI-uri se grupează.
  const grouped = new Map<string, Claim & { providers: string[] }>();
  for (const c of claims) { const k = c.text.toLowerCase(); const e = grouped.get(k) ?? { ...c, providers: [] }; if (!e.providers.includes(c.provider)) e.providers.push(c.provider); for (const x of c.sources) if (!e.sources.includes(x)) e.sources.push(x); grouped.set(k, e); }
  const list = [...grouped.values()].sort((a, b) => (b.contradicts ? 1 : 0) - (a.contradicts ? 1 : 0) || (a.tone === "negativ" ? -1 : 1) - (b.tone === "negativ" ? -1 : 1) || b.providers.length - a.providers.length);
  const trend = [...new Set(brand.map((r) => r.run.runDate))].sort().map((d) => {
    let pos = 0, neg = 0;
    for (const r of brand.filter((x) => x.run.runDate === d)) for (const s of sentences(r.run.answer)) { const t = toneOf(s); if (t === "pozitiv") pos++; if (t === "negativ") neg++; }
    return { day: d.slice(5).split("-").reverse().join("."), ton: pos + neg ? Math.round((pos / (pos + neg)) * 100) : 50 };
  });
  void domain;
  return { perProvider, claims: list.slice(0, 40), trend, hasData: latest.length > 0 };
}

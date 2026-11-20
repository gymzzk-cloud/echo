import type { Rows } from "./insights";
import type { StoreFacts } from "./audit";
import { PROVIDERS } from "./ai/types";

/**
 * „Ce spune AI-ul despre tine”: răspunsurile la întrebările despre magazin (intent „brand”),
 * tonul fiecărui AI, ce afirmă despre tine și ce afirmații contrazic faptele verificate pe site.
 */

const POS = ["încredere", "recomand", "bune", "bun ", "rapid", "competitiv", "clar", "gamă bună", "răspunde repede", "megbízható", "ajánl", "gyors", "jó"];
const NEG = ["plâng", "întârzier", "greu de găsit", "nu am găsit", "puține", "lipsă", "probleme", "nu recomand", "țeapă", "panasz", "késés", "nem találtam", "kevés"];

export type Claim = { text: string; tone: "pozitiv" | "negativ" | "neutru"; provider: string; contradicts?: string };

const sentences = (t: string) => t.replace(/\*\*/g, "").split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 15);
const toneOf = (s: string): Claim["tone"] => {
  const l = s.toLowerCase();
  const n = NEG.filter((w) => l.includes(w)).length, p = POS.filter((w) => l.includes(w)).length;
  return n > p ? "negativ" : p > n ? "pozitiv" : "neutru";
};

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
        if (t !== "neutru" || s.toLowerCase().includes(storeName.toLowerCase())) claims.push({ text: s, tone: t, provider: p.id, contradicts: contradiction(s, facts) });
      }
    }
    const score = pos + neg ? Math.round((pos / (pos + neg)) * 100) : null;
    return { provider: p.id, questions: rs.length, knows, pos, neg, score };
  });
  // Afirmațiile identice de la mai multe AI-uri se grupează.
  const grouped = new Map<string, Claim & { providers: string[] }>();
  for (const c of claims) { const k = c.text.toLowerCase(); const e = grouped.get(k) ?? { ...c, providers: [] }; if (!e.providers.includes(c.provider)) e.providers.push(c.provider); grouped.set(k, e); }
  const list = [...grouped.values()].sort((a, b) => (b.contradicts ? 1 : 0) - (a.contradicts ? 1 : 0) || (a.tone === "negativ" ? -1 : 1) - (b.tone === "negativ" ? -1 : 1) || b.providers.length - a.providers.length);
  const trend = [...new Set(brand.map((r) => r.run.runDate))].sort().map((d) => {
    let pos = 0, neg = 0;
    for (const r of brand.filter((x) => x.run.runDate === d)) for (const s of sentences(r.run.answer)) { const t = toneOf(s); if (t === "pozitiv") pos++; if (t === "negativ") neg++; }
    return { day: d.slice(5).split("-").reverse().join("."), ton: pos + neg ? Math.round((pos / (pos + neg)) * 100) : 50 };
  });
  void domain;
  return { perProvider, claims: list.slice(0, 40), trend, hasData: latest.length > 0 };
}

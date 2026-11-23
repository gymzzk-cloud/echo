import type { Rows } from "./insights";
import type { StoreFacts } from "./audit";
import { PROVIDERS } from "./ai/types";
import { clauseOpinions, fold } from "./ai/sentiment";

/**
 * „Ce spune AI-ul despre tine”: răspunsurile la întrebările despre magazin (intent „brand”),
 * tonul fiecărui AI, ce afirmă despre tine și ce afirmații contrazic faptele verificate pe site.
 */

export type Claim = { text: string; tone: "pozitiv" | "negativ" | "mixt" | "neutru"; provider: string; contradicts?: string; prompt?: string; runDate?: string };

const sentences = (t: string) => t.replace(/\*\*/g, "").split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x.length > 15);

/** Fraze care nu spun nimic despre magazin: titluri, introduceri („Iată un rezumat…”), sfaturi generale. */
const META = /^(iata|iată|recomandari|recomandări|concluzie\s*:?$|daca vrei|dacă vrei|sfat\s*:?$|pe scurt|rezumat)|:\s*$/i;
/** Expresii care pomenesc o problemă fără să fie o critică („în cazul problemelor”, „dacă apar probleme”). */
const CONTEXT_ONLY = /(in cazul|în cazul|daca apar|dacă apar|pentru)\s+(unor\s+|eventualelor\s+)?problem\w*/gi;

/**
 * Tonul unei fraze, cu aceleași reguli ca fila „Ton” (negație, aspecte, părți de frază): o frază cu laudă și critică
 * e „mixt”, una fără nimic e „neutru”. Corectează B20: „clienții apreciază…” nu mai iese „Negativ”, iar „să se evite” nu iese „Pozitiv”.
 */
export function toneOf(s: string): Claim["tone"] {
  if (META.test(s.trim())) return "neutru";
  const parts = fold(s.replace(CONTEXT_ONLY, " ")).split(/[;,]|\s(?:dar|insa|iar|but|viszont|azonban)\s/).map((x) => x.trim()).filter(Boolean);
  let pos = 0, neg = 0;
  for (const c of parts) for (const o of clauseOpinions(c)) { if (o.tone > 0) pos++; else neg++; }
  return pos && neg ? "mixt" : pos ? "pozitiv" : neg ? "negativ" : "neutru";
}

/** Afirmații pe care le putem verifica cu datele din audit. */
function contradiction(s: string, facts: StoreFacts | null): string | undefined {
  if (!facts) return;
  const l = s.toLowerCase();
  // Cuvinte întregi: „termenul” nu conține „nu”, „circuit” nu conține „CUI” (fals pozitiv văzut pe 23.11.2026).
  if (/(date|informații)\s.{0,30}firm\w*.{0,30}(greu|\bnu\b|lips\w*)|\bcui\b.{0,30}(\bnu\b|lips\w*|greu)/.test(l) && facts.cui) return `Site-ul afișează CUI ${facts.cui}. Pune-l în subsol și în datele structurate Organization ca AI-urile să-l găsească.`;
  if (/retur\w*.{0,40}(\bnu (are|există|exista|e|este)\b|lips\w*|neclar\w*)/.test(l) && facts.hasReturnPolicy) return "Ai politică de retur publicată. Leag-o din subsol și adaug-o în datele structurate (MerchantReturnPolicy).";
  if (/garanți\w*.{0,30}(\bnu (are|există|exista|e|este|oferă|ofera)\b|lips\w*)/.test(l)) return "Adaugă garanția pe pagina de produs și în datele structurate.";
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
        if (t !== "neutru" || s.toLowerCase().includes(storeName.toLowerCase())) claims.push({ text: s, tone: t, provider: p.id, contradicts: contradiction(s, facts), prompt: r.prompt ?? undefined, runDate: r.run.runDate });
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

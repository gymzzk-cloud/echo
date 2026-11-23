/**
 * Sentimentul: cum vorbește un AI despre un magazin, pe aspecte (preț, livrare, ofertă, încredere, servicii).
 * Se extrage din textul răspunsului, în același pas cu mențiunile, fără niciun apel AI în plus:
 * frazele care numesc magazinul (și rândurile de sub el, într-o listă) se caută după cuvinte de laudă
 * sau de critică („livrare rapidă”, „prețuri mai mari”, „recenzii mixte”), în română și maghiară.
 * Funcții pure, testate în tests/sentiment.test.ts.
 */

export const ASPECTS = [
  { id: "pret", label: "Preț" },
  { id: "livrare", label: "Livrare" },
  { id: "oferta", label: "Ofertă" },
  { id: "incredere", label: "Încredere" },
  { id: "servicii", label: "Servicii" },
] as const;
export type Aspect = (typeof ASPECTS)[number]["id"];
export const aspectLabel = (a: Aspect | null) => (a ? ASPECTS.find((x) => x.id === a)!.label : "General");

/** O părere a AI-ului despre magazin: aspectul (null = general), tonul și fraza din care am luat-o. */
export type Opinion = { aspect: Aspect | null; tone: 1 | -1; quote: string };

/** Cel mult atâtea păreri păstrăm pe mențiune (rularea e salvată în baza de date). */
export const MAX_OPINIONS = 6;
const QUOTE_MAX = 160;

/** Litere mici, fără diacritice (ș → s, ő → o), ca listele de cuvinte să fie scurte. */
export const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ş/g, "s").replace(/ţ/g, "t");

const re = (src: string) => new RegExp(`(?:^|[^a-z0-9])(?:${src})(?=[^a-z0-9]|$)`, "g");

/** Cuvintele care arată despre ce aspect e vorba (pe text fără diacritice). */
const ASPECT_WORDS: Record<Aspect, RegExp> = {
  pret: re("pret\\w*|costa|costuri\\w*|tarif\\w*|reduceri\\w*|promoti\\w*|discount\\w*|arak\\w*|arai\\w*|aru|arban|arazas\\w*|akcio\\w*|kedvezmeny\\w*"),
  livrare: re("livr\\w*|transport\\w*|curier\\w*|expedi\\w*|easybox|ridicare\\w*|ridici|kiszallit\\w*|szallit\\w*|futar\\w*|hazhoz\\w*"),
  oferta: re("gama|game|gamei|sortiment\\w*|stoc\\w*|selecti\\w*|varietate\\w*|diversitate\\w*|valasztek\\w*|keszlet\\w*|kinalat\\w*"),
  incredere: re("incredere|recenzi\\w*|review\\w*|rating\\w*|garanti\\w*|retur\\w*|reputati\\w*|sigurant\\w*|autorizat\\w*|oficial\\w*|ertekel\\w*|velemeny\\w*|garancia\\w*|megbizhat\\w*|visszakuld\\w*|visszaru\\w*|hivatalos\\w*"),
  servicii: re("suport\\w*|relatii cu clientii|relatii clienti|asistenta\\w*|consultant\\w*|consilier\\w*|service\\w*|call center|ugyfelszolgalat\\w*|tanacsad\\w*|szerviz\\w*"),
};

/** Cuvinte de laudă (+1) sau critică (-1). `aspect` = cuvântul ține de un singur aspect („ieftin” = preț). */
type Cue = { re: RegExp; tone: 1 | -1; aspect?: Aspect; soft?: boolean };
const CUES: Cue[] = [
  // Preț
  { re: re("ieftin\\w*|accesibil\\w*|competitiv\\w*|avantajos\\w*|avantajoas\\w*|olcso\\w*|kedvezo|megfizethet\\w*|jutanyos\\w*"), tone: 1, aspect: "pret" },
  { re: re("pret\\w* (?:mic|mici|bun|bune|redus|reduse|scazut|scazute)|cel mai mic pret|reduceri\\w*|promoti\\w*|discount\\w*|akcio\\w*|kedvezmeny\\w*|leaarazas\\w*"), tone: 1, aspect: "pret" },
  { re: re("scump\\w*|piperat\\w*|draga|dragabb\\w*|pret\\w* (?:mare|mari|ridicat|ridicate|mai mare|mai mari)|mai mare pret|magas ar\\w*|magasabb ar\\w*"), tone: -1, aspect: "pret" },
  // Livrare
  { re: re("livrare (?:gratuita|rapida|in 24|in aceeasi zi|express)|transport gratuit|ingyenes szallitas\\w*|gyors szallitas\\w*|ingyenes kiszallitas\\w*"), tone: 1, aspect: "livrare" },
  { re: re("intarzi\\w*|lent\\w*|lassu\\w*|kesik|kesve|kesesek\\w*|kesedelem\\w*"), tone: -1, aspect: "livrare" },
  // Ofertă
  { re: re("larg\\w*|variat\\w*|diversificat\\w*|vast\\w*|bogat\\w*|completa|complete|bine aprovizionat\\w*|in stoc|disponibil|disponibile|szeles\\w*|bo kinalat\\w*|raktaron|keszleten"), tone: 1, aspect: "oferta" },
  { re: re("stoc limitat|stocuri limitate|lipsa din stoc|lipsesc din stoc|indisponibil\\w*|epuizat\\w*|nincs keszleten|korlatozott keszlet\\w*|szuk kinalat\\w*"), tone: -1, aspect: "oferta" },
  // Încredere
  { re: re("de incredere|fiabil\\w*|reputatie buna|reputatie solida|bine cotat\\w*|bine apreciat\\w*|autorizat\\w*|oficial\\w*|consacrat\\w*|cunoscut\\w*|renumit\\w*|serios|seriosi|retur gratuit|retur usor|garantie extinsa|megbizhato\\w*|hivatalos\\w*|nepszeru\\w*|ismert\\w*"), tone: 1, aspect: "incredere" },
  { re: re("recenzii mixte|recenzii negative|pareri mixte|reclamati\\w*|plangeri\\w*|nesigur\\w*|neserios\\w*|teapa|inselatori\\w*|vegyes velemeny\\w*|negativ velemeny\\w*|panasz\\w*|megbizhatatlan\\w*"), tone: -1, aspect: "incredere", soft: true },
  // Servicii
  { re: re("amabil\\w*|competent\\w*|profesionist\\w*|consultanta (?:buna|de specialitate)|segitokesz\\w*|szakszeru\\w*"), tone: 1, aspect: "servicii" },
  { re: re("greu de contactat|nu raspund\\w*|raspund greu|nehezen elerheto\\w*"), tone: -1, aspect: "servicii" },
  // Generale: aspectul vine din fraza („livrare rapidă” → livrare; „rapid” singur → general)
  { re: re("bun|buna|bune|buni|foarte bun\\w*|excelent\\w*|exceptional\\w*|rapid\\w*|prompt\\w*|gratuit\\w*|pozitiv\\w*|recomandat\\w*|ideal\\w*|solid\\w*|jo|jok|kivalo\\w*|gyors\\w*|ingyenes\\w*|pozitiv\\w*|ajanlott\\w*|remek\\w*"), tone: 1 },
  { re: re("slab\\w*|prost\\w*|problem\\w*|negativ\\w*|dificil\\w*|limitat\\w*|mixt\\w*|dezamagit\\w*|nemultumi\\w*|rossz\\w*|gyenge\\w*|problema\\w*|korlatozott\\w*|lassu\\w*"), tone: -1 },
];
/** Negația dinainte schimbă tonul: „nu e ieftin”, „fără probleme”, „nem olcsó”. */
const NEGATION = /(?:^|[^a-z])(nu|nici|fara|nem|nincs|sem|not|no)\s+(?:\S+\s+){0,3}$/;
/** Nota din recenzii („4,7/5”, „4.5 stele”): de la 4 în sus e laudă, sub 3 e critică. */
const RATING = /(\d(?:[.,]\d)?)\s*(?:\/\s*5|din 5|stele|stars|csillag)/;

/** Fraza fără marcaje Markdown, scurtată, pentru afișare. */
const tidy = (s: string) => {
  const t = s.replace(/\*\*|__|`|#+\s*/g, "").replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
  return t.length > QUOTE_MAX ? t.slice(0, QUOTE_MAX - 1).trimEnd() + "…" : t;
};

/** Aspectele dintr-o propoziție, cu locul lor (ca să alegem pe cel mai apropiat de cuvântul de laudă/critică). */
function aspectsIn(clause: string) {
  const out: { aspect: Aspect; at: number }[] = [];
  for (const [aspect, rx] of Object.entries(ASPECT_WORDS) as [Aspect, RegExp][]) {
    for (const m of clause.matchAll(rx)) out.push({ aspect, at: m.index! });
  }
  return out;
}

/** Părerile dintr-o propoziție (text fără diacritice), fără dubluri pe același aspect și ton. */
export function clauseOpinions(clause: string): { aspect: Aspect | null; tone: 1 | -1 }[] {
  const aspects = aspectsIn(clause);
  const found: { aspect: Aspect | null; tone: 1 | -1; at: number; end: number }[] = [];
  const taken: [number, number][] = [];
  for (const c of CUES) {
    for (const m of clause.matchAll(c.re)) {
      const at = m.index!, end = at + m[0].length;
      // Un cuvânt prins deja de o regulă mai precisă („livrare rapidă”) nu se mai socotește încă o dată („rapid”).
      if (taken.some(([a, b]) => at < b && end > a)) continue;
      taken.push([at, end]);
      const negated = NEGATION.test(clause.slice(Math.max(0, at - 40), at + 1));
      const tone = (negated ? -c.tone : c.tone) as 1 | -1;
      // „Plângeri legate de livrare” e o critică a livrării; „plângeri” singur rămâne la încredere.
      let aspect: Aspect | null = c.soft && aspects.some((x) => x.aspect !== c.aspect) ? null : c.aspect ?? null;
      if (!aspect && aspects.length) aspect = aspects.reduce((b, x) => (Math.abs(x.at - at) < Math.abs(b.at - at) ? x : b)).aspect;
      found.push({ aspect, tone, at, end });
    }
  }
  const r = clause.match(RATING);
  if (r) {
    const v = parseFloat(r[1].replace(",", "."));
    if (v >= 4 && v <= 5) found.push({ aspect: "incredere", tone: 1, at: r.index!, end: r.index! + r[0].length });
    else if (v < 3) found.push({ aspect: "incredere", tone: -1, at: r.index!, end: r.index! + r[0].length });
  }
  const seen = new Set<string>();
  return found.sort((a, b) => a.at - b.at).filter((f) => {
    const k = `${f.aspect}|${f.tone}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map(({ aspect, tone }) => ({ aspect, tone }));
}

/** Împarte o propoziție în părți la virgulă, punct și virgulă și „dar/însă/iar”, ca lauda și critica să nu se amestece. */
const clauses = (sentence: string) => sentence.split(/[;,]|\s(?:dar|[îi]ns[ăa]|iar|but|however|viszont|azonban)\s/i).map((s) => s.trim()).filter(Boolean);
const isBullet = (line: string) => /^\s*(?:[-*•]|\d+[.)])\s/.test(line) || /^\s{2,}\S/.test(line);
const isHeading = (line: string) => /^\s*(?:#{1,6}\s|\*\*|\d+[.)]\s+\*\*|[-*•]\s+\*\*)/.test(line);
const isTableRow = (line: string) => /^\s*\|/.test(line);

/** Prepoziții după care vine numele unui vânzător: „la X”, „de pe X”; în maghiară „X-nél”. */
const MERCHANT_RE = /(?:^|[^\p{L}])(?:la|pe|din|at|from)\s+(\p{Lu}[\p{L}\d&'.-]*(?:\s+\p{Lu}[\p{L}\d&'.-]*)*)/gu;
const HU_MERCHANT_RE = /(\p{Lu}[\p{L}\d&'.-]*?)-?(?:nál|nél)(?![\p{L}])/gu;
const ANY_DOMAIN = /\b(?:[a-z0-9-]+\.)+(?:ro|hu|com|eu|net|shop|store|de|pl)\b/gi;
/** Cuvinte cu majusculă după „la” care nu sunt vânzători. */
const NOT_MERCHANT = new Set(["final", "fel", "nevoie", "momentul", "comanda", "livrare", "inceput", "romania", "ungaria", "magyarorszag"]);

/**
 * Numește fraza un alt vânzător, pe care nu-l recunoaștem? Domeniu necunoscut („cromwell.ro”)
 * sau nume propriu după „la / pe / din” („la CROMWELL Romania”) care nu e al niciunui magazin știut.
 */
function otherMerchant(sentence: string, matchers: { rx: RegExp[] }[]) {
  const known = (s: string) => {
    const f = ` ${fold(s)} `;
    return matchers.some((m) => m.rx.some((rx) => rx.test(f)));
  };
  for (const m of sentence.matchAll(ANY_DOMAIN)) if (!known(m[0])) return true;
  for (const re of [MERCHANT_RE, HU_MERCHANT_RE]) {
    for (const m of sentence.matchAll(re)) {
      const name = m[1].replace(/[.'-]+$/, "");
      if (name.length < 3 || NOT_MERCHANT.has(fold(name))) continue;
      if (!known(name)) return true;
    }
  }
  return false;
}

/**
 * Părerile despre fiecare magazin dintr-un răspuns.
 * `names`: pentru fiecare domeniu, textele după care îl recunoaștem (domeniul, numele, marca), fără diacritice.
 * O frază e a magazinului dacă îl numește; rândurile de sub un titlu sau punct cu numele lui (sub-puncte)
 * sunt tot ale lui, până apare alt magazin sau un paragraf obișnuit. O frază care compară două magazine
 * („X e mai ieftin decât Y”) e doar a primului numit.
 */
export function storeOpinions(text: string, names: Map<string, string[]>): Map<string, Opinion[]> {
  const out = new Map<string, Opinion[]>();
  const matchers = [...names.entries()].map(([domain, ns]) => ({
    domain,
    rx: ns.filter((n) => n.length >= 3).map((n) => new RegExp(`(?:^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^a-z0-9]|$)`)),
  })).filter((m) => m.rx.length);
  const named = (s: string) => {
    const f = fold(s);
    const hits: { domain: string; at: number }[] = [];
    for (const m of matchers) {
      let best = -1;
      for (const rx of m.rx) { const i = f.search(rx); if (i >= 0 && (best < 0 || i < best)) best = i; }
      if (best >= 0) hits.push({ domain: m.domain, at: best });
    }
    return hits.sort((a, b) => a.at - b.at).map((h) => h.domain);
  };
  const add = (domain: string, quote: string, ops: { aspect: Aspect | null; tone: 1 | -1 }[]) => {
    const list = out.get(domain) ?? [];
    for (const o of ops) {
      if (list.length >= MAX_OPINIONS) break;
      if (list.some((x) => x.aspect === o.aspect && x.tone === o.tone)) continue;
      list.push({ ...o, quote: tidy(quote) });
    }
    if (list.length) out.set(domain, list);
  };

  let current: string[] = [];
  let currentFromHeading = false;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const lineStores = named(line);
    if (lineStores.length) {
      current = lineStores;
      currentFromHeading = isHeading(line) || isBullet(line) || isTableRow(line);
    } else if (!(isBullet(line) && currentFromHeading)) {
      // Paragraf obișnuit fără nume de magazin: nu știm despre cine e.
      current = [];
    }
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      const here = named(sentence);
      const comparative = /\b(?:decat|fata de|comparativ|mint|versus|vs)\b/.test(fold(sentence));
      // O frază fără numele nostru care vorbește despre alt vânzător („indisponibile la CROMWELL Romania”) nu e a noastră.
      const inherited = current.length === 1 || !lineStores.length ? current : [];
      const who = here.length ? (comparative ? here.slice(0, 1) : here) : otherMerchant(sentence, matchers) ? [] : inherited;
      if (!who.length) continue;
      for (const part of clauses(sentence)) {
        const ops = clauseOpinions(fold(part));
        if (!ops.length) continue;
        if (!named(part).length && otherMerchant(part, matchers)) continue;
        // Partea care numește alt magazin decât cel al frazei (ex. „, iar la Dedeman livrarea e lentă”) e a aceluia.
        const partStores = named(part);
        for (const d of partStores.length ? (comparative ? partStores.slice(0, 1) : partStores) : who) add(d, sentence, ops);
      }
    }
  }
  return out;
}

export type SentimentScore = {
  /** -100 (doar critici) … +100 (doar laude); null = prea puține păreri. */
  score: number | null;
  positive: number;
  negative: number;
};
export type StoreSentiment = {
  domain: string;
  overall: SentimentScore;
  aspects: Record<Aspect, SentimentScore>;
  /** Răspunsuri în care apare magazinul / în care AI-ul spune ceva despre el. */
  answers: number;
  withOpinion: number;
};

/** Sub atâtea păreri nu dăm un scor: o singură frază nu e o tendință. */
export const MIN_OPINIONS = 2;
const score = (p: number, n: number): SentimentScore => ({ positive: p, negative: n, score: p + n >= MIN_OPINIONS ? Math.round(((p - n) / (p + n)) * 100) : null });

type SentimentRow = { run: { mentions: unknown } };
type OpinionMention = { domain: string; opinions?: Opinion[] };

/** Scorul de sentiment al fiecărui magazin cerut, din mențiunile deja salvate. */
export function sentimentBoard(rows: SentimentRow[], domains: string[]): StoreSentiment[] {
  const want = new Set(domains);
  const acc = new Map<string, { answers: number; withOpinion: number; all: [number, number]; by: Map<Aspect, [number, number]> }>();
  for (const d of domains) acc.set(d, { answers: 0, withOpinion: 0, all: [0, 0], by: new Map() });
  for (const r of rows) {
    const seen = new Set<string>();
    for (const m of (r.run.mentions as OpinionMention[]) ?? []) {
      if (!want.has(m.domain) || seen.has(m.domain)) continue;
      seen.add(m.domain);
      const a = acc.get(m.domain)!;
      a.answers++;
      if (m.opinions?.length) a.withOpinion++;
      for (const o of m.opinions ?? []) {
        a.all[o.tone > 0 ? 0 : 1]++;
        if (o.aspect) {
          const x = a.by.get(o.aspect) ?? [0, 0];
          x[o.tone > 0 ? 0 : 1]++;
          a.by.set(o.aspect, x);
        }
      }
    }
  }
  return domains.map((domain) => {
    const a = acc.get(domain)!;
    const aspects = Object.fromEntries(ASPECTS.map(({ id }) => { const x = a.by.get(id) ?? [0, 0]; return [id, score(x[0], x[1])]; })) as Record<Aspect, SentimentScore>;
    return { domain, overall: score(a.all[0], a.all[1]), aspects, answers: a.answers, withOpinion: a.withOpinion };
  });
}

/** De unde vine o laudă sau o critică: întrebarea, AI-ul, ziua, linkurile citate și răspunsul întreg. */
export type QuoteSource = { runId: string; provider: string; runDate: string; prompt: string | null; sources: { url: string; title?: string }[]; answer: string };
/** O frază cu sursa ei; `aspects` = toate aspectele lăudate (sau criticate) în ea, `total` = în câte răspunsuri apare. */
export type SourcedOpinion = Opinion & QuoteSource & { aspects: (Aspect | null)[]; total: number };
type QuoteRow = { prompt?: string | null; run: { id: string; mentions: unknown; provider: string; runDate: string; answer: string; sources: unknown } };

/**
 * Cele mai recente fraze de laudă și de critică despre un magazin, fiecare cu sursa ei, ca proprietarul
 * să verifice că e corectă și chiar despre el. Aceeași frază din mai multe rulări apare o dată (`total` = de câte ori).
 */
export function sampleQuotes(rows: QuoteRow[], domain: string, perTone = 6) {
  const sorted = [...rows].sort((a, b) => b.run.runDate.localeCompare(a.run.runDate));
  const pick = (tone: 1 | -1) => {
    const out = new Map<string, SourcedOpinion>();
    for (const r of sorted) {
      const m = ((r.run.mentions as OpinionMention[]) ?? []).find((x) => x.domain === domain);
      for (const o of m?.opinions ?? []) {
        if (o.tone !== tone) continue;
        // Aceeași frază lăudată pe două aspecte („livrare bună, prețuri competitive”) apare o singură dată, cu ambele.
        const key = o.quote;
        const prev = out.get(key);
        if (prev) {
          if (!prev.aspects.includes(o.aspect)) prev.aspects.push(o.aspect);
          else if (prev.runId !== r.run.id) prev.total++;
          continue;
        }
        if (out.size >= perTone) continue;
        out.set(key, { ...o, aspects: [o.aspect], total: 1, runId: r.run.id, provider: r.run.provider, runDate: r.run.runDate, prompt: r.prompt ?? null, sources: (r.run.sources as QuoteSource["sources"]) ?? [], answer: r.run.answer });
      }
    }
    return [...out.values()];
  };
  return { positive: pick(1), negative: pick(-1) };
}

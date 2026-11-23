import { normalizeText } from "@/lib/util";

/**
 * Vizibilitatea pe produs: în ce răspunsuri AI (deja salvate) apare fiecare produs din catalogul magazinului,
 * pe ce loc și la ce preț. Doar text, fără apeluri AI. Calculul rulează în worker; pagina citește rezultatul salvat.
 *
 * Un produs e recunoscut doar după criterii verificabile, salvate ca dovadă lângă fiecare apariție:
 * - „cod”: EAN-ul sau codul producătorului scris în răspuns;
 * - „link”: linkul spre pagina produsului de pe magazin, pe rândul respectiv;
 * - „nume”: numele complet al produsului, exact cum e în catalog (cuvintele întregi, în ordine).
 * Nu ghicim după câteva cuvinte comune: „BOSCH Kit de accesorii” nu se potrivește pe orice rând cu „Bosch” și „accesorii”.
 */

export type CatalogProduct = { id: string; title: string; brand: string | null; gtin: string | null; mpn: string | null; price: number | null; currency: string; url: string; inStock: boolean };
export type MatchKind = "cod" | "link" | "nume";
export type ProductMatch = { kind: MatchKind; value: string };
export type ProductHit = {
  productId: string; position: number; statedPrice: number | null; statedCurrency: string | null;
  /** Textul exact al prețului („326,39 lei”) și rândul unde l-am găsit, dacă e altul decât rândul produsului. */
  priceText: string | null; priceLine: string | null; snippet: string; match: ProductMatch;
};

/** Cel mult 20 de exemple de răspunsuri păstrate pe produs (plus dovada fiecărui preț spus). */
export const MAX_EXAMPLES = 20;
/** Peste 5% diferență între prețul spus de AI și cel din catalog = preț greșit (aceeași regulă ca în restul panoului). */
export const PRICE_TOLERANCE = 0.05;
/** Cel mai lung nume căutat, în cuvinte (numele mai lungi se recunosc doar după cod sau link). */
const MAX_NAME_WORDS = 12;

const normCode = (c: string | null) => (c ? c.toLowerCase().replace(/[^a-z0-9]/g, "") : "");
export function normUrl(u: string) {
  return u.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
}
const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };

type Entry = { p: CatalogProduct; name: string; words: number };
export type ProductIndex = { entries: Entry[]; names: Map<string, number[]>; codes: Map<string, { i: number; label: string }[]>; urls: Map<string, number[]> };

/** Un nume prea scurt sau fără marcă/cifre („Set”, „Kit accesorii”) nu e o dovadă: îl recunoaștem doar după cod sau link. */
function nameUsable(name: string, brand: string | null) {
  const ws = name.split(" ");
  if (ws.length < 2 || name.length < 8 || ws.length > MAX_NAME_WORDS) return false;
  const b = brand ? normalizeText(brand) : "";
  return /\d/.test(name) || (b !== "" && name.includes(b)) || ws.length >= 3;
}

export function buildProductIndex(products: CatalogProduct[]): ProductIndex {
  const names = new Map<string, number[]>();
  const codes = new Map<string, { i: number; label: string }[]>();
  const urls = new Map<string, number[]>();
  const entries = products.map((p, i) => {
    const name = normalizeText(p.title);
    if (nameUsable(name, p.brand)) push(names, name, i);
    const g = normCode(p.gtin);
    if (g.length >= 8 && /^\d+$/.test(g)) push(codes, g, { i, label: `EAN ${p.gtin}` });
    const m = normCode(p.mpn);
    if (m.length >= 6 && /\d/.test(m) && (/[a-z]/.test(m) || m.length >= 8)) push(codes, m, { i, label: `cod ${p.mpn}` });
    if (p.url) push(urls, normUrl(p.url), i);
    return { p, name, words: name.split(" ").length };
  });
  return { entries, names, codes, urls };
}

const PRICE_RE = /(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(lei|ron|ft|huf|€|eur)\b/i;
const CURRENCY: Record<string, string> = { lei: "RON", ron: "RON", ft: "HUF", huf: "HUF", "€": "EUR", eur: "EUR" };
export function parsePrice(text: string): { price: number; currency: string; text: string } | null {
  const m = text.match(PRICE_RE);
  if (!m) return null;
  let n = m[1].replace(/\s/g, "");
  if (/,\d{1,2}$/.test(n)) n = n.replace(/\./g, "").replace(",", ".");
  else n = n.replace(/[.,](?=\d{3}\b)/g, "");
  const price = parseFloat(n);
  return Number.isFinite(price) && price > 0 ? { price, currency: CURRENCY[m[2].toLowerCase()] ?? "RON", text: m[0].trim() } : null;
}

/** Un rând de listă („1.”, „-”, „•”), un titlu („##”) sau un rând care începe îngroșat: o recomandare din răspuns. */
const ITEM_RE = /^(\s*)(?:\d+[.)]\s|[-*•]\s|#{1,4}\s|\*\*)/;
const URL_RE = /https?:\/\/[^\s)\]>"']+/g;
export const cleanLine = (l: string) => l.replace(/\*\*|__|#{1,4}\s|\[(.*?)\]\([^)]*\)/g, "$1").replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").replace(/\s+/g, " ").trim();
/** Text fără diacritice, cu aceeași lungime, ca pozițiile găsite să fie aceleași ca în rândul original. */
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

type LineMatch = { i: number; match: ProductMatch; from: number; to: number; at: number };

/** Produsele de pe un rând, cu dovada: codul, linkul sau numele complet (cuvinte întregi, în ordine). */
function matchLine(line: string, idx: ProductIndex): LineMatch[] {
  const words = normalizeText(line).split(" ").filter(Boolean);
  const low = fold(line);
  const out: LineMatch[] = [];
  const firstAt = (w: string) => { const i = low.indexOf(w); return i < 0 ? 0 : i; };
  // Numele complet: toate secvențele de 2..12 cuvinte ale rândului, căutate direct (fără să parcurgem catalogul).
  for (let a = 0; a < words.length; a++) {
    let s = "";
    for (let b = a; b < Math.min(words.length, a + MAX_NAME_WORDS); b++) {
      s = s ? `${s} ${words[b]}` : words[b];
      for (const i of idx.names.get(s) ?? []) out.push({ i, match: { kind: "nume", value: idx.entries[i].p.title }, from: a, to: b, at: firstAt(words[a]) });
    }
  }
  // Coduri: un cuvânt sau câteva lipite („GSR 12V-15” → „gsr12v15”, EAN scris cu spații).
  for (let a = 0; a < words.length; a++) {
    let c = "";
    for (let b = a; b < Math.min(words.length, a + 4); b++) {
      c += words[b];
      for (const x of idx.codes.get(c) ?? []) out.push({ i: x.i, match: { kind: "cod", value: x.label }, from: a, to: b, at: firstAt(words[a]) });
    }
  }
  // Linkul spre pagina produsului, pe acest rând.
  for (const m of line.matchAll(URL_RE)) {
    for (const i of idx.urls.get(normUrl(m[0])) ?? []) out.push({ i, match: { kind: "link", value: m[0] }, from: -1, to: -1, at: Math.max(0, line.lastIndexOf("[", m.index!)) });
  }
  return out;
}

const RANK: Record<MatchKind, number> = { cod: 3, link: 2, nume: 1 };

/**
 * Produsele din catalog găsite într-un răspuns AI, cu locul în răspuns (al câtelea produs recomandat),
 * prețul spus lângă el, rândul din răspuns și criteriul după care l-am recunoscut. Un produs apare o singură dată (prima mențiune).
 * Titluri identice (același model la prețuri diferite): alegem varianta cu prețul cel mai apropiat de cel spus.
 */
export function findProducts(answer: string, idx: ProductIndex): ProductHit[] {
  const lines = answer.split("\n");
  const hits: ProductHit[] = [];
  const seen = new Set<string>(); // numele normalizate deja numărate (toate variantele lor)
  let item = 0; // al câtelea rând de listă de pe primul nivel
  let hasItems = false;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim()) continue;
    const it = line.match(ITEM_RE);
    if (it && it[1].length < 2) { item++; hasItems = true; }
    const raw = matchLine(line, idx);
    if (!raw.length) continue;
    // Un nume cuprins în altul mai lung de pe același rând nu contează („Bosch GSR 12V-15” în „Bosch GSR 12V-15 FC”).
    const named = raw.filter((m) => m.match.kind !== "nume" || !raw.some((o) => o !== m && o.match.kind === "nume" && o.from <= m.from && o.to >= m.to && o.to - o.from > m.to - m.from));
    // Prețul: pe rândul produsului sau pe rândurile de sub el, până la următoarea recomandare.
    let price = parsePrice(line);
    let priceLine: string | null = null;
    for (let k = li + 1; !price && k < Math.min(lines.length, li + 5); k++) {
      const m = lines[k].match(ITEM_RE);
      if (m && m[1].length < 2) break;
      price = parsePrice(lines[k]);
      if (price) priceLine = cleanLine(lines[k]).slice(0, 200);
    }
    // Pe produs (după nume), cea mai sigură dovadă; variantele cu același nume: prețul cel mai apropiat.
    const byName = new Map<string, LineMatch[]>();
    for (const m of named) push(byName, idx.entries[m.i].name, m);
    const picks: { p: CatalogProduct; at: number; match: ProductMatch }[] = [];
    for (const [name, ms] of byName) {
      if (seen.has(name)) continue;
      seen.add(name);
      const best = Math.max(...ms.map((m) => RANK[m.match.kind]));
      const strong = ms.filter((m) => RANK[m.match.kind] === best);
      // Un cod sau un link arată exact produsul; numele poate fi comun mai multor variante.
      const pick = strong.sort((a, b) => {
        const pa = idx.entries[a.i].p, pb = idx.entries[b.i].p;
        if (price) return Math.abs((pa.price ?? Infinity) - price.price) - Math.abs((pb.price ?? Infinity) - price.price);
        return Number(pb.inStock) - Number(pa.inStock);
      })[0];
      picks.push({ p: idx.entries[pick.i].p, at: Math.min(...ms.map((m) => m.at)), match: pick.match });
    }
    picks.sort((a, b) => a.at - b.at);
    picks.forEach((k, j) => {
      // Mai multe produse pe un rând: prețul dintre produs și următorul; unul singur: prețul găsit mai sus.
      const own = picks.length === 1 ? price : parsePrice(line.slice(k.at, picks[j + 1]?.at ?? line.length));
      hits.push({
        productId: k.p.id, position: hasItems ? Math.max(1, item) : hits.length + 1, statedPrice: own?.price ?? null, statedCurrency: own?.currency ?? null,
        priceText: own?.text ?? null, priceLine: own && picks.length === 1 ? priceLine : null, snippet: cleanLine(line).slice(0, 300), match: k.match,
      });
    });
  }
  return hits;
}

export type AnswerRun = { id: string; provider: string; runDate: string; at: string; query: string; answer: string; promptIds: string[]; storeNamed: boolean; sourceUrls: string[] };
export type ProductExample = {
  runId: string; provider: string; runDate: string; query: string; position: number; statedPrice: number | null; snippet: string; withStore: boolean;
  /** Adăugate odată cu dovezile (exemplele vechi nu le au până la recalculare). */
  at?: string; priceText?: string | null; priceLine?: string | null; match?: ProductMatch;
};
export type ProductStat = {
  productId: string; appearances: number; prompts: number; providers: Record<string, number>; avgPosition: number; bestPosition: number;
  withStore: number; lastSeen: string; statedPrice: number | null; statedProvider: string | null; wrongPrices: { provider: string; price: number; runId: string }[]; examples: ProductExample[];
};

/**
 * Cifrele pe produs din toate răspunsurile unui magazin. Rulările vin în ordine cronologică.
 * „Cu magazinul tău” = răspunsul numește și magazinul sau citează pagina produsului.
 */
export function aggregateProducts(runs: AnswerRun[], products: CatalogProduct[]): Map<string, ProductStat> {
  const idx = buildProductIndex(products);
  const byId = new Map(products.map((p) => [p.id, p]));
  type Acc = { positions: number[]; prompts: Set<string>; providers: Record<string, number>; withStore: number; lastSeen: string; lastPrice: Map<string, ProductExample>; latest: ProductExample | null; examples: ProductExample[] };
  const acc = new Map<string, Acc>();
  for (const r of runs) {
    const sources = new Set(r.sourceUrls.map(normUrl));
    for (const h of findProducts(r.answer, idx)) {
      const p = byId.get(h.productId)!;
      const a: Acc = acc.get(h.productId) ?? { positions: [], prompts: new Set(), providers: {}, withStore: 0, lastSeen: r.runDate, lastPrice: new Map(), latest: null, examples: [] };
      const withStore = r.storeNamed || sources.has(normUrl(p.url));
      a.positions.push(h.position);
      for (const id of r.promptIds) a.prompts.add(id);
      a.providers[r.provider] = (a.providers[r.provider] ?? 0) + 1;
      if (withStore) a.withStore++;
      if (r.runDate > a.lastSeen) a.lastSeen = r.runDate;
      const ex: ProductExample = {
        runId: r.id, provider: r.provider, runDate: r.runDate, at: r.at, query: r.query, position: h.position, statedPrice: h.statedPrice,
        priceText: h.priceText, priceLine: h.priceLine, snippet: h.snippet, withStore, match: h.match,
      };
      // Prețul se compară doar în aceeași monedă; ultimul spus de fiecare AI contează.
      if (h.statedPrice && (!h.statedCurrency || h.statedCurrency === p.currency)) { a.lastPrice.set(r.provider, ex); a.latest = ex; }
      a.examples.push(ex);
      acc.set(h.productId, a);
    }
  }
  const out = new Map<string, ProductStat>();
  for (const [id, a] of acc) {
    const real = byId.get(id)!.price;
    const wrong = real ? [...a.lastPrice.values()].filter((e) => Math.abs(e.statedPrice! - real) / real > PRICE_TOLERANCE).map((e) => ({ provider: e.provider, price: e.statedPrice!, runId: e.runId })) : [];
    // Ultimele 20, plus dovada fiecărui preț folosit în cifre (chiar dacă e mai veche).
    const kept = a.examples.slice(-MAX_EXAMPLES);
    for (const e of a.lastPrice.values()) if (!kept.includes(e)) kept.unshift(e);
    out.set(id, {
      productId: id, appearances: a.positions.length, prompts: a.prompts.size, providers: a.providers,
      avgPosition: +(a.positions.reduce((s, x) => s + x, 0) / a.positions.length).toFixed(1), bestPosition: Math.min(...a.positions),
      withStore: a.withStore, lastSeen: a.lastSeen, statedPrice: a.latest?.statedPrice ?? null, statedProvider: a.latest?.provider ?? null, wrongPrices: wrong,
      examples: kept.sort((x, y) => (y.at ?? y.runDate).localeCompare(x.at ?? x.runDate)),
    });
  }
  return out;
}

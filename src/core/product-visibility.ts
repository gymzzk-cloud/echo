import { normalizeText } from "@/lib/util";

/**
 * Vizibilitatea pe produs: în ce răspunsuri AI (deja salvate) apare fiecare produs din catalogul magazinului,
 * pe ce loc și la ce preț. Doar text, fără apeluri AI. Calculul rulează în worker; pagina citește rezultatul salvat.
 */

export type CatalogProduct = { id: string; title: string; brand: string | null; gtin: string | null; mpn: string | null; price: number | null; currency: string; url: string; inStock: boolean };
export type ProductHit = { productId: string; position: number; statedPrice: number | null; statedCurrency: string | null; snippet: string };

const STOP = new Set("si sau cu de la pe in un o cel mai cea care ce pentru din sub peste pana unde the and for with set kit buc pcs".split(" "));
/** Un cuvânt mai des decât atât în catalog nu e folosit ca să găsim candidați (ar fi prea scump și nu deosebește produsele). */
const MAX_POSTING = 400;
/** Cel mult 20 de exemple de răspunsuri păstrate pe produs. */
export const MAX_EXAMPLES = 20;
/** Peste 5% diferență între prețul spus de AI și cel din catalog = preț greșit (aceeași regulă ca în restul panoului). */
export const PRICE_TOLERANCE = 0.05;

/** Cuvintele unui titlu: fără cuvinte de legătură; numerele rămân (12V-15 și 12V-35 sunt produse diferite). */
export function productTokens(s: string) {
  return normalizeText(s).split(" ").filter((w) => /\d/.test(w) ? w.length >= 1 : w.length > 2 && !STOP.has(w));
}
const hasDigit = (w: string) => /\d/.test(w);
const normCode = (c: string | null) => (c ? c.toLowerCase().replace(/[^a-z0-9]/g, "") : "");

type Entry = { i: number; p: CatalogProduct; toks: string[]; model: string[]; brand: string | null; key: string };
export type ProductIndex = { entries: Entry[]; postings: Map<string, number[]>; codes: Map<string, number[]> };

export function buildProductIndex(products: CatalogProduct[]): ProductIndex {
  const postings = new Map<string, number[]>();
  const codes = new Map<string, number[]>();
  const entries = products.map((p, i) => {
    const toks = [...new Set(productTokens(p.title))];
    const b = p.brand ? normalizeText(p.brand) : "";
    const e: Entry = { i, p, toks, model: toks.filter((t) => hasDigit(t) && t.length >= 2), brand: b && toks.includes(b) ? b : null, key: toks.join(" ") };
    for (const t of toks) { const l = postings.get(t); if (l) l.push(i); else postings.set(t, [i]); }
    for (const c of [normCode(p.gtin), normCode(p.mpn)]) if (c.length >= 6 && /\d/.test(c)) { const l = codes.get(c); if (l) l.push(i); else codes.set(c, [i]); }
    return e;
  });
  return { entries, postings, codes };
}

const PRICE_RE = /(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(lei|ron|ft|huf|€|eur)\b/i;
const CURRENCY: Record<string, string> = { lei: "RON", ron: "RON", ft: "HUF", huf: "HUF", "€": "EUR", eur: "EUR" };
export function parsePrice(text: string): { price: number; currency: string } | null {
  const m = text.match(PRICE_RE);
  if (!m) return null;
  let n = m[1].replace(/\s/g, "");
  if (/,\d{1,2}$/.test(n)) n = n.replace(/\./g, "").replace(",", ".");
  else n = n.replace(/[.,](?=\d{3}\b)/g, "");
  const price = parseFloat(n);
  return Number.isFinite(price) && price > 0 ? { price, currency: CURRENCY[m[2].toLowerCase()] ?? "RON" } : null;
}

/** Un rând de listă („1.”, „-”, „•”), un titlu („##”) sau un rând care începe îngroșat: o recomandare din răspuns. */
const ITEM_RE = /^(\s*)(?:\d+[.)]\s|[-*•]\s|#{1,4}\s|\*\*)/;
const cleanLine = (l: string) => l.replace(/\*\*|__|#{1,4}\s|\[(.*?)\]\([^)]*\)/g, "$1").replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").replace(/\s+/g, " ").trim();

/** Potrivirea unui produs pe un rând: codul (EAN/MPN) sau titlul (marca + toate cifrele modelului, ori 75% din cuvinte). */
function matchLine(line: string, idx: ProductIndex) {
  const norm = normalizeText(line);
  const set = new Set(norm.split(" "));
  const found = new Set<number>(); // candidații: au cel puțin un cuvânt rar comun cu rândul
  for (const w of set) {
    const l = idx.postings.get(w);
    if (!l || l.length > MAX_POSTING) continue;
    for (const i of l) found.add(i);
  }
  const out: { e: Entry; score: number; matched: string[] }[] = [];
  // Coduri (EAN, cod producător) scrise în rând, și despărțite („GSR 12V-15” → „gsr12v15”): căutare directă, nu pe tot catalogul.
  const ws = norm.split(" ");
  const codeHits = new Set<number>();
  for (let a = 0; a < ws.length; a++) {
    let c = "";
    for (let b = a; b < Math.min(ws.length, a + 4); b++) {
      c += ws[b];
      for (const i of idx.codes.get(c) ?? []) codeHits.add(i);
    }
  }
  for (const i of codeHits) out.push({ e: idx.entries[i], score: 100, matched: idx.entries[i].toks });
  for (const i of found) {
    const e = idx.entries[i];
    const matched = e.toks.filter((t) => set.has(t));
    if (matched.length < 2) continue;
    const coverage = matched.length / e.toks.length;
    const allModel = e.model.every((t) => set.has(t));
    const strong = e.model.length > 0 && allModel && e.brand !== null && set.has(e.brand) && e.model.some((t) => /[a-z]/.test(t) || t.length >= 3);
    if (!allModel) continue;
    if (strong || coverage >= 0.75) out.push({ e, score: matched.length + coverage, matched });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Produsele din catalog găsite într-un răspuns AI, cu locul în răspuns (al câtelea produs recomandat),
 * prețul spus lângă el și rândul din răspuns. Un produs apare o singură dată (prima mențiune).
 * Titluri identice (același model la prețuri diferite): alegem varianta cu prețul cel mai apropiat de cel spus.
 */
export function findProducts(answer: string, idx: ProductIndex): ProductHit[] {
  const lines = answer.split("\n");
  const hits: ProductHit[] = [];
  const seenKeys = new Set<string>();
  let item = 0; // al câtelea rând de listă de pe primul nivel
  let hasItems = false;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim()) continue;
    const it = line.match(ITEM_RE);
    if (it && it[1].length < 2) { item++; hasItems = true; }
    const cands = matchLine(line, idx);
    if (!cands.length) continue;
    // Prețul: pe rândul produsului sau pe rândurile de sub el, până la următoarea recomandare.
    let price = parsePrice(line);
    for (let k = li + 1; !price && k < Math.min(lines.length, li + 5); k++) {
      const m = lines[k].match(ITEM_RE);
      if (m && m[1].length < 2) break;
      price = parsePrice(lines[k]);
    }
    const taken: string[][] = [];
    const picks: { p: CatalogProduct; at: number }[] = [];
    // Pozițiile din rând (fără diacritice, aceeași lungime), ca produsele de pe același rând să aibă ordinea din text.
    const low = line.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const c of cands) {
      if (seenKeys.has(c.e.key)) continue;
      if (taken.some((t) => c.matched.every((w) => t.includes(w)))) continue; // „Bosch GSR 12V-15” nu e și „Bosch GSR 12V-15 Set”
      // Aceleași cuvinte, alte variante: cea cu prețul cel mai apropiat de cel spus (sau prima în stoc).
      const same = cands.filter((x) => x.e.key === c.e.key).map((x) => x.e);
      const pick = same.sort((a, b) => {
        if (price) return Math.abs((a.p.price ?? Infinity) - price.price) - Math.abs((b.p.price ?? Infinity) - price.price);
        return Number(b.p.inStock) - Number(a.p.inStock);
      })[0];
      seenKeys.add(c.e.key);
      taken.push(c.matched);
      const at = Math.min(...c.matched.map((w) => { const i = low.indexOf(w); return i < 0 ? Infinity : i; }));
      picks.push({ p: pick.p, at: Number.isFinite(at) ? at : 0 });
    }
    picks.sort((a, b) => a.at - b.at);
    picks.forEach((k, j) => {
      // Mai multe produse pe un rând: prețul dintre produs și următorul; unul singur: prețul găsit mai sus.
      const own = picks.length === 1 ? price : parsePrice(line.slice(k.at, picks[j + 1]?.at ?? line.length));
      hits.push({ productId: k.p.id, position: hasItems ? Math.max(1, item) : hits.length + 1, statedPrice: own?.price ?? null, statedCurrency: own?.currency ?? null, snippet: cleanLine(line).slice(0, 200) });
    });
  }
  return hits;
}

export type AnswerRun = { id: string; provider: string; runDate: string; query: string; answer: string; promptIds: string[]; storeNamed: boolean; sourceUrls: string[] };
export type ProductExample = { runId: string; provider: string; runDate: string; query: string; position: number; statedPrice: number | null; snippet: string; withStore: boolean };
export type ProductStat = {
  productId: string; appearances: number; prompts: number; providers: Record<string, number>; avgPosition: number; bestPosition: number;
  withStore: number; lastSeen: string; statedPrice: number | null; statedProvider: string | null; wrongPrices: { provider: string; price: number }[]; examples: ProductExample[];
};

/**
 * Cifrele pe produs din toate răspunsurile unui magazin. Rulările vin în ordine cronologică.
 * „Cu magazinul tău” = răspunsul numește și magazinul sau citează pagina produsului.
 */
export function aggregateProducts(runs: AnswerRun[], products: CatalogProduct[]): Map<string, ProductStat> {
  const idx = buildProductIndex(products);
  const byId = new Map(products.map((p) => [p.id, p]));
  type Acc = { positions: number[]; prompts: Set<string>; providers: Record<string, number>; withStore: number; lastSeen: string; lastPrice: Map<string, number>; latest: { price: number; provider: string } | null; examples: ProductExample[] };
  const acc = new Map<string, Acc>();
  for (const r of runs) {
    for (const h of findProducts(r.answer, idx)) {
      const p = byId.get(h.productId)!;
      const a: Acc = acc.get(h.productId) ?? { positions: [], prompts: new Set(), providers: {}, withStore: 0, lastSeen: r.runDate, lastPrice: new Map(), latest: null, examples: [] };
      const linked = r.sourceUrls.some((u) => sameUrl(u, p.url));
      const withStore = r.storeNamed || linked;
      a.positions.push(h.position);
      for (const id of r.promptIds) a.prompts.add(id);
      a.providers[r.provider] = (a.providers[r.provider] ?? 0) + 1;
      if (withStore) a.withStore++;
      if (r.runDate > a.lastSeen) a.lastSeen = r.runDate;
      // Prețul se compară doar în aceeași monedă; ultimul spus de fiecare AI contează.
      if (h.statedPrice && (!h.statedCurrency || h.statedCurrency === p.currency)) {
        a.lastPrice.set(r.provider, h.statedPrice);
        a.latest = { price: h.statedPrice, provider: r.provider };
      }
      a.examples.push({ runId: r.id, provider: r.provider, runDate: r.runDate, query: r.query, position: h.position, statedPrice: h.statedPrice, snippet: h.snippet, withStore });
      acc.set(h.productId, a);
    }
  }
  const out = new Map<string, ProductStat>();
  for (const [id, a] of acc) {
    const real = byId.get(id)!.price;
    const wrong = real ? [...a.lastPrice.entries()].filter(([, v]) => Math.abs(v - real) / real > PRICE_TOLERANCE).map(([provider, price]) => ({ provider, price })) : [];
    out.set(id, {
      productId: id, appearances: a.positions.length, prompts: a.prompts.size, providers: a.providers,
      avgPosition: +(a.positions.reduce((s, x) => s + x, 0) / a.positions.length).toFixed(1), bestPosition: Math.min(...a.positions),
      withStore: a.withStore, lastSeen: a.lastSeen, statedPrice: a.latest?.price ?? null, statedProvider: a.latest?.provider ?? null, wrongPrices: wrong,
      examples: a.examples.slice(-MAX_EXAMPLES).reverse(),
    });
  }
  return out;
}

function sameUrl(a: string, b: string) {
  const n = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "");
  return n(a) === n(b);
}

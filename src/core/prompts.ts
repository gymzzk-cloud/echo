/**
 * Căutările urmărite, propuse automat din catalogul real al magazinului.
 * Sunt scrise cum caută un client real: numele produsului (marcă + model), codul producătorului,
 * EAN-ul, tipul de produs (singur sau cu marca). Plus două căutări despre magazin, pentru pagina Reputație.
 *
 * Regula de selecție (deterministă, fără apeluri AI):
 * 1. doar produse în stoc, cu preț și titlu;
 * 2. categoriile cu cele mai multe produse în stoc trec primele; din fiecare luăm pe rând câte un produs,
 *    alternând mărcile, ca lista să acopere catalogul, nu un singur raft;
 * 3. în cadrul unei mărci, produsele cu EAN sau cod au prioritate, apoi ordinea e stabilă (hash pe ID),
 *    ca aceleași produse să rămână urmărite de la o sincronizare la alta și istoricul să nu se piardă.
 */
import { createHash } from "node:crypto";

export type CatalogProduct = {
  id?: string;
  externalId?: string;
  title: string;
  category: string | null;
  brand: string | null;
  price: string | null;
  gtin?: string | null;
  mpn?: string | null;
  /** Locul în topul vânzărilor (1 = cel mai vândut), dacă platforma sau feed-ul îl dă. */
  rank?: number | null;
};
export type PromptIntent = "produs" | "cod" | "categorie" | "brand";
export type SuggestedPrompt = { text: string; category: string; intent: PromptIntent; productId?: string };

/** Câte căutări urmărim pe magazin, după plan (cele adăugate de mână intră în limită). */
export function promptLimit(plan: string) {
  return plan === "pro" || plan === "agentie" ? 100 : 30;
}

const CONNECTORS = new Set(["de", "cu", "pentru", "fara", "fără", "din", "la", "si", "și", "in", "în", "pe", "és"]);
const isStop = (w: string) => /\d/.test(w) || /^[A-Z]{2,}/.test(w) || /^[(\[]/.test(w);

/** Tipul produsului din titlu: „Fier de călcat cu abur 2800W” → „fier de călcat”; HU: „Automata kávéfőző” → „automata kávéfőző”. */
export function productType(title: string, language: "ro" | "hu") {
  const words: string[] = [];
  for (const w of title.split(/[\s,]+/)) { if (!w || isStop(w)) break; words.push(w.replace(/[^\p{L}-]/gu, "")); }
  if (!words.length) return null;
  let pick = language === "hu" ? words.slice(-2) : words.slice(0, 3);
  while (pick.length > 1 && CONNECTORS.has(pick[pick.length - 1].toLowerCase())) pick = pick.slice(0, -1);
  const t = pick.join(" ").toLowerCase().trim();
  return t.length >= 3 ? t : null;
}

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

/**
 * Tipul de produs din calea de categorii: ultimul nivel care nu e marca.
 * „Scule cu Acumulator > Șurubelnițe cu impact > BOSCH” → „șurubelnițe cu impact”.
 */
export function categoryType(p: Pick<CatalogProduct, "title" | "category" | "brand">, language: "ro" | "hu") {
  const parts = (p.category ?? "").split(/\s*(?:>|\/|\|)\s*/).map((s) => s.trim()).filter((s) => s.length >= 3);
  // Nivelurile care arată ca un tip de produs: nu marca, nu fragmente („pentru …”), nu denumiri lungi.
  const good = parts.filter((s) => (!p.brand || !same(s, p.brand)) && !CONNECTORS.has(s.split(" ")[0].toLowerCase()) && s.split(" ").length <= 5);
  const last = good[good.length - 1];
  if (last) return last.toLowerCase();
  return productType(p.title, language);
}

/** Numele produsului cum îl scrie un client: marca + model, fără texte lungi de marketing. */
export function productQuery(p: Pick<CatalogProduct, "title" | "brand">) {
  let t = p.title.replace(/\s+/g, " ").trim();
  const head = t.split(",")[0].trim();
  if (head.split(" ").length >= 2) t = head; // „Colier pentru cablu PRO EPC, colier extern” → partea dinaintea virgulei
  if (p.brand && !t.toLowerCase().includes(p.brand.toLowerCase())) t = `${p.brand} ${t}`;
  let words = t.split(" ");
  if (words.length > 7 || t.length > 70) {
    words = words.slice(0, 7);
    while (words.join(" ").length > 70) words.pop();
    // Nu lăsăm la final cuvinte de legătură sau semne („… cu”, „… -”, „… ,”).
    while (words.length > 2 && (CONNECTORS.has(words[words.length - 1].toLowerCase().replace(/[,.;:]$/, "")) || /^[-–,.;:/]+$/.test(words[words.length - 1]))) words.pop();
    t = words.join(" ").replace(/[\s,;:\-–.]+$/, "");
  }
  return t;
}

const validEan = (s: string | null | undefined) => !!s && /^\d{8,14}$/.test(s.trim());
const validCode = (s: string | null | undefined, title: string) => {
  const c = s?.trim();
  // Un cod util are cifre, nu e doar un ID intern scurt și nu e deja în titlu (căutarea pe nume îl acoperă).
  return !!c && c.length >= 4 && c.length <= 40 && /\d/.test(c) && /[A-Za-z0-9]/.test(c) && !title.toLowerCase().includes(c.toLowerCase());
};
const stableKey = (p: CatalogProduct) => createHash("sha1").update(p.externalId ?? p.id ?? p.title).digest("hex");

/**
 * Ordinea de alegere: întâi cele mai vândute produse (dacă știm topul), apoi categorii mari (sau cele cu produse
 * din top), câte un produs pe rând din fiecare, alternând mărcile.
 */
export function pickProducts(products: CatalogProduct[], language: "ro" | "hu", n: number, popular = Math.ceil(n * 0.8)) {
  const usable = products.filter((p) => p.title.trim().length >= 4 && parseFloat(p.price ?? "") > 0);
  const byCat = new Map<string, Map<string, CatalogProduct[]>>();
  for (const p of usable) {
    const c = categoryType(p, language) ?? "altele";
    const b = (p.brand ?? "").trim().toLowerCase() || "-";
    const brands = byCat.get(c) ?? new Map<string, CatalogProduct[]>();
    brands.set(b, [...(brands.get(b) ?? []), p]);
    byCat.set(c, brands);
  }
  const score = (p: CatalogProduct) => (validEan(p.gtin) ? 2 : 0) + (validCode(p.mpn, p.title) ? 1 : 0);
  const size = (m: Map<string, CatalogProduct[]>) => [...m.values()].reduce((s, l) => s + l.length, 0);
  // Cu top de vânzări: categoriile cu cele mai vândute produse întâi; altfel, cele mai mari.
  const best = (m: Map<string, CatalogProduct[]>) => Math.min(...[...m.values()].flat().map((p) => p.rank ?? Infinity));
  const cats = [...byCat.entries()].sort((a, b) => best(a[1]) - best(b[1]) || size(b[1]) - size(a[1]) || a[0].localeCompare(b[0])).map(([c, brands]) => ({
    category: c,
    // mărcile cu mai multe produse întâi; în fiecare marcă, produsele cu EAN/cod întâi, apoi ordine stabilă
    queues: [...brands.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([, l]) => l).map((l) => [...l].sort((x, y) => score(y) - score(x) || stableKey(x).localeCompare(stableKey(y)))),
    turn: 0,
    topBrand: [...brands.entries()].filter(([b]) => b !== "-").sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0]?.[1][0]?.brand ?? null,
  }));
  const out: { product: CatalogProduct; category: string }[] = [];
  const seen = new Set<string>();
  // Produsele din top, în ordinea vânzărilor, până la `popular` din cele `n` (restul acoperă catalogul).
  const ranked = usable.filter((p) => (p.rank ?? 0) > 0).sort((a, b) => a.rank! - b.rank!);
  const used = new Set<CatalogProduct>();
  for (const p of ranked) {
    if (out.length >= popular) break;
    const key = productQuery(p).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    used.add(p);
    out.push({ product: p, category: categoryType(p, language) ?? "altele" });
  }
  for (const c of cats) c.queues = c.queues.map((q) => q.filter((p) => !used.has(p)));
  let progress = true;
  while (out.length < n && progress) {
    progress = false;
    for (const c of cats) {
      if (out.length >= n) break;
      for (let tries = 0; tries < c.queues.length; tries++) {
        const q = c.queues[c.turn++ % c.queues.length];
        const p = q.shift();
        if (!p) continue;
        const key = productQuery(p).toLowerCase();
        if (seen.has(key)) continue; // același titlu la prețuri diferite (alt cod, altă livrare): o singură căutare
        seen.add(key);
        out.push({ product: p, category: c.category });
        progress = true;
        break;
      }
    }
  }
  return { picked: out, categories: cats.map((c) => ({ category: c.category, topBrand: c.topBrand })) };
}

const STORE_Q = {
  ro: [(s: string) => `${s} păreri clienți`, (s: string) => `${s} livrare și retur`],
  hu: [(s: string) => `${s} vélemények`, (s: string) => `${s} szállítás és visszaküldés`],
};

/** Numele magazinului cum îl caută lumea: „ShopExpert RO” → „ShopExpert”. */
export const storeSearchName = (name: string) => name.replace(/\s+(RO|HU)$/i, "").trim() || name;

/**
 * Lista propusă, cel mult `max` căutări: ~25% tipuri de produs, ~10% coduri sau EAN, restul produse anume
 * (cele mai vândute întâi, dacă știm topul), plus 2 căutări despre magazin.
 */
export function suggestPrompts(products: CatalogProduct[], storeName: string, language: "ro" | "hu" = "ro", max = 30): SuggestedPrompt[] {
  const store = STORE_Q[language].map((f) => ({ text: f(storeSearchName(storeName)), category: "magazin", intent: "brand" as const }));
  const room = Math.max(0, max - store.length);
  if (!room || !products.length) return store.slice(0, max);
  const catCount = Math.max(1, Math.round(room * 0.25));
  const codeCount = Math.round(room * 0.1);
  const nameCount = Math.max(1, room - catCount - codeCount);
  const { picked, categories } = pickProducts(products, language, nameCount);

  const out: SuggestedPrompt[] = [];
  const seen = new Set<string>();
  const push = (x: SuggestedPrompt) => { const k = x.text.toLowerCase(); if (!seen.has(k) && x.text.length >= 3) { seen.add(k); out.push(x); } };

  // Tipuri de produs: întâi categoria singură, apoi categoria + marca dominantă („șurubelnițe cu impact bosch”).
  const catQ: SuggestedPrompt[] = [];
  for (const c of categories) if (c.category !== "altele") catQ.push({ text: c.category, category: c.category, intent: "categorie" });
  for (const c of categories) if (c.category !== "altele" && c.topBrand) catQ.push({ text: `${c.category} ${c.topBrand.toLowerCase()}`, category: c.category, intent: "categorie" });

  const prodQ: SuggestedPrompt[] = picked.map(({ product: p, category }) => ({ text: productQuery(p), category, intent: "produs", productId: p.id }));
  // Coduri: alternăm codul producătorului și EAN-ul, pe produsele alese, în aceeași ordine.
  const codeQ: SuggestedPrompt[] = [];
  picked.forEach(({ product: p, category }, i) => {
    const code = validCode(p.mpn, p.title) ? p.mpn!.trim() : null;
    const ean = validEan(p.gtin) ? p.gtin!.trim() : null;
    const first = i % 2 === 0 ? code ?? ean : ean ?? code;
    if (first) codeQ.push({ text: first, category, intent: "cod", productId: p.id });
  });

  for (const x of catQ.slice(0, catCount)) push(x);
  for (const x of prodQ) push(x);
  for (const x of codeQ) { if (out.length >= catCount + prodQ.length + codeCount || out.length >= room) break; push(x); }
  // Dacă nu sunt destule coduri, completăm cu alte tipuri de produs.
  for (const x of catQ.slice(catCount)) { if (out.length >= room) break; push(x); }
  return [...out.slice(0, room), ...store];
}

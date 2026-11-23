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
export type PromptIntent = "produs" | "cod" | "categorie" | "brand" | "comercial" | "cumparare" | "informativ";
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
/** Titlul are un model (marcă + cod cu cifre, ex. „BOSCH GBH 18V-22”), nu doar o descriere. */
export const modelLike = (p: Pick<CatalogProduct, "title" | "brand">) => {
  const rest = p.brand ? p.title.replace(new RegExp(`^\\s*${p.brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "") : p.title;
  const first = rest.trim().split(/\s+/).slice(0, 2).join(" ");
  return /^[A-Z0-9][A-Z0-9-]*\d|^[A-Z]{2,}[A-Z0-9-]*\s+[A-Z0-9-]*\d/.test(first);
};
const stableKey = (p: CatalogProduct) => createHash("sha1").update(p.externalId ?? p.id ?? p.title).digest("hex");

/**
 * Ordinea de alegere: întâi cele mai vândute produse (dacă știm topul), apoi categorii mari (sau cele cu produse
 * din top), câte un produs pe rând din fiecare, alternând mărcile.
 */
export function pickProducts(products: CatalogProduct[], language: "ro" | "hu", n: number, popular = Math.ceil(n * 0.8)) {
  const usable = products.filter((p) => p.title.trim().length >= 4 && parseFloat(p.price ?? "") > 0);
  // Fără top de vânzări: dacă sunt destule aparate cu model, accesoriile descrise în cuvinte nu mai intră.
  const models = usable.filter(modelLike);
  const pool = models.length >= n * 2 ? models : usable;
  const byCat = new Map<string, Map<string, CatalogProduct[]>>();
  for (const p of pool) {
    const c = categoryType(p, language) ?? "altele";
    const b = (p.brand ?? "").trim().toLowerCase() || "-";
    const brands = byCat.get(c) ?? new Map<string, CatalogProduct[]>();
    brands.set(b, [...(brands.get(b) ?? []), p]);
    byCat.set(c, brands);
  }
  // Un aparat cu model („GBH 18V-22”) e căutat de oameni; un accesoriu descris în cuvinte („Burghiu HSS spiralat”) rar.
  const score = (p: CatalogProduct) => (modelLike(p) ? 4 : 0) + (validEan(p.gtin) ? 2 : 0) + (validCode(p.mpn, p.title) ? 1 : 0);
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

/** Sub atâtea produse focus în stoc, întrebările se aleg din tot catalogul (un set prea mic ar da întrebări repetate). */
export const MIN_FOCUS_POOL = 20;

/** Din ce produse propunem întrebările: produsele focus, dacă sunt destule; altfel tot catalogul în stoc. */
export function promptPool<T extends { focus?: boolean | null }>(products: T[]): T[] {
  const focus = products.filter((p) => p.focus);
  return focus.length >= MIN_FOCUS_POOL ? focus : products;
}

const STORE_Q = {
  ro: [(s: string) => `${s} păreri clienți`, (s: string) => `${s} livrare și retur`],
  hu: [(s: string) => `${s} vélemények`, (s: string) => `${s} szállítás és visszaküldés`],
};

/** Numele magazinului cum îl caută lumea: „ShopExpert RO” → „ShopExpert”. */
export const storeSearchName = (name: string) => name.replace(/\s+(RO|HU)$/i, "").trim() || name;

/** Marca cum o scrie lumea: „MAKITA” → „Makita”, „DeWALT” rămâne. */
const brandName = (b: string) => (b === b.toUpperCase() ? b.charAt(0) + b.slice(1).toLowerCase() : b);

type Tpl = { intent: PromptIntent; f: (t: string, b: string[]) => string | null };
/**
 * Întrebări de cumpărător pe un tip de produs, cum le scrie un om care vrea să cumpere: prețul întâi,
 * apoi pe fiecare marcă importantă, apoi comparația. Fără întrebări vagi („cum aleg”, „recomandă-mi”).
 * Ordinea contează: cu ~16 locuri, fiecare tip primește prețul general și prețul pe primele două mărci.
 */
const INTENT_Q: Record<"ro" | "hu", Tpl[]> = {
  ro: [
    { intent: "cumparare", f: (t) => `${t} cel mai bun preț` },
    { intent: "cumparare", f: (t, b) => (b[0] ? `${t} ${b[0]} cel mai bun preț` : null) },
    { intent: "cumparare", f: (t, b) => (b[1] ? `${t} ${b[1]} cel mai bun preț` : null) },
    { intent: "comercial", f: (t, b) => (b.length >= 2 ? `${t} ${b[0]} sau ${b[1]}, ce să aleg?` : null) },
    { intent: "cumparare", f: (t, b) => `de unde cumpăr ${t}${b[0] ? ` ${b[0]}` : ""}` },
    { intent: "comercial", f: (t) => `care sunt cele mai bune ${t}` },
  ],
  hu: [
    { intent: "cumparare", f: (t) => `${t} legjobb áron` },
    { intent: "cumparare", f: (t, b) => (b[0] ? `${b[0]} ${t} legjobb áron` : null) },
    { intent: "cumparare", f: (t, b) => (b[1] ? `${b[1]} ${t} legjobb áron` : null) },
    { intent: "comercial", f: (t, b) => (b.length >= 2 ? `${b[0]} vagy ${b[1]} ${t}, melyiket válasszam?` : null) },
    { intent: "cumparare", f: (t, b) => `hol vehetek ${b[0] ? `${b[0]} ` : ""}${t}` },
    { intent: "comercial", f: (t) => `melyek a legjobb ${t}` },
  ],
};

/** Domeniul (primul nivel din calea de categorii): „Scule Electrice > Ferăstraie sabie > MAKITA” → „scule electrice”. */
const topicOf = (p: CatalogProduct) => (p.category ?? "").split(/\s*(?:>|\/|\|)\s*/)[0]?.trim().toLowerCase() || "altele";

/**
 * Tipurile de produs importante: cele cu produse în topul vânzărilor întâi, apoi cele mai mari,
 * luate pe rând din fiecare domeniu (scule electrice, grădină, măsură…), ca lista să acopere tot magazinul.
 */
export function productTypes(products: CatalogProduct[], language: "ro" | "hu", n: number) {
  const types = new Map<string, { type: string; topic: string; size: number; best: number; brands: Map<string, number> }>();
  for (const p of products) {
    if (p.title.trim().length < 4 || !(parseFloat(p.price ?? "") > 0)) continue;
    const t = categoryType(p, language);
    if (!t || t.length < 4) continue;
    const e = types.get(t) ?? { type: t, topic: topicOf(p), size: 0, best: Infinity, brands: new Map<string, number>() };
    e.size++;
    if (p.rank) e.best = Math.min(e.best, p.rank);
    const b = p.brand?.trim();
    if (b) e.brands.set(b, (e.brands.get(b) ?? 0) + 1);
    types.set(t, e);
  }
  const order = (a: { best: number; size: number; type: string }, b: { best: number; size: number; type: string }) => a.best - b.best || b.size - a.size || a.type.localeCompare(b.type);
  const byTopic = new Map<string, { best: number; size: number; type: string; list: ReturnType<typeof types.get>[] }>();
  for (const e of [...types.values()].filter((x) => x.size >= 2).sort(order)) {
    const g = byTopic.get(e.topic) ?? { best: e.best, size: 0, type: e.topic, list: [] };
    g.size += e.size; g.list.push(e);
    byTopic.set(e.topic, g);
  }
  const topics = [...byTopic.values()].sort(order);
  const out: { type: string; topic: string; brands: string[] }[] = [];
  for (let round = 0; out.length < n; round++) {
    let any = false;
    for (const g of topics) {
      const e = g.list[round];
      if (!e || out.length >= n) continue;
      any = true;
      out.push({ type: e.type, topic: e.topic, brands: [...e.brands.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([b]) => brandName(b)) });
    }
    if (!any) break;
  }
  return out;
}

/** `n` întrebări de cumpărător pe tipurile importante: ~3 pe tip (recomandare, de unde cumpăr, comparație). */
export function intentPrompts(products: CatalogProduct[], language: "ro" | "hu", n: number): SuggestedPrompt[] {
  if (n <= 0) return [];
  const tpls = INTENT_Q[language];
  const types = productTypes(products, language, Math.max(1, Math.ceil(n / 3)));
  const out: SuggestedPrompt[] = [];
  const seen = new Set<string>();
  for (let round = 0; round < tpls.length && out.length < n; round++) {
    for (const t of types) {
      if (out.length >= n) break;
      // Dacă un șablon nu se potrivește tipului (ex. o singură marcă), trecem la următorul.
      for (let k = round; k < tpls.length; k++) {
        const text = tpls[k].f(t.type, t.brands);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        out.push({ text, category: t.type, intent: tpls[k].intent });
        break;
      }
    }
  }
  return out;
}

/** Numele produsului cum îl tastează un om: „BOSCH GBH 18V-22” → „Bosch GBH 18V-22” (doar marca își schimbă forma). */
export function humanName(p: Pick<CatalogProduct, "title" | "brand">) {
  // „(SOLO)”, „(fără acumulator)”: un om nu le tastează.
  const q = productQuery(p).replace(/\s*\([^)]*\)/g, "").trim();
  const b = p.brand?.trim();
  if (!b || b.length <= 3 || b !== b.toUpperCase()) return q;
  return q.replace(new RegExp(`(^|\\s)${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`), (m, sp: string) => sp + brandName(b));
}

/**
 * Cum caută un cumpărător un produs anume, prin rotație ca lista să aibă de toate. Fiecare formă are intenție de
 * cumpărare (ZoZo, 23.11.2026, KNOWLEDGE B53): numele singur („Makita GA5030R”) primește de la AI specificații sau
 * o întrebare înapoi („Vrei specificații sau prețuri?”), nu magazine, deci nu măsoară dacă ești recomandat.
 * „vreau să cumpăr X”, „X preț”, „<cod> preț”, „X cel mai ieftin”, „de unde cumpăr X”.
 * Fără cod (EAN sau cod producător), locul codului îl ia „cel mai ieftin”.
 */
const PRODUCT_Q: Record<"ro" | "hu", ((n: string) => string)[]> = {
  ro: [(n) => `vreau să cumpăr ${n}`, (n) => `${n} preț`, (n) => `${n} preț`, (n) => `${n} cel mai ieftin`, (n) => `de unde cumpăr ${n}`],
  hu: [(n) => `${n} vásárlás`, (n) => `${n} ár`, (n) => `${n} ár`, (n) => `${n} legolcsóbb`, (n) => `hol vehetek ${n}`],
};

/** Textul e doar numele produsului (fără intenție de cumpărare): forma veche a căutărilor pe produs, înainte de B53. */
export function isPlainName(text: string, p: Pick<CatalogProduct, "title" | "brand">) {
  return text.trim().toLowerCase() === humanName(p).trim().toLowerCase();
}

/** Căutarea unui produs ales de magazin („Urmărește în AI”, Produse urmărite): numele + preț, ca un cumpărător. */
export function buyerQuery(p: Pick<CatalogProduct, "title" | "brand">, language: "ro" | "hu" = "ro") {
  return PRODUCT_Q[language][1](humanName(p));
}

const CODE_SLOT = 2;

export function productPrompts(picked: { product: CatalogProduct; category: string }[], language: "ro" | "hu"): SuggestedPrompt[] {
  const tpls = PRODUCT_Q[language];
  return picked.map(({ product: p, category }, i) => {
    const name = humanName(p);
    const slot = i % tpls.length;
    if (slot === CODE_SLOT) {
      const code = validCode(p.mpn, p.title) ? p.mpn!.trim() : validEan(p.gtin) ? p.gtin!.trim() : null;
      if (code) return { text: tpls[CODE_SLOT](code), category, intent: "cod" as const, productId: p.id };
      return { text: tpls[3](name), category, intent: "produs" as const, productId: p.id };
    }
    return { text: tpls[slot](name), category, intent: "produs" as const, productId: p.id };
  });
}

/**
 * Lista propusă, cel mult `max` căutări, ca un cumpărător real:
 * - ~40% produse anume, cele mai vândute întâi, scrise cum caută un om (vezi PRODUCT_Q);
 * - ~55% fără numele magazinului sau al unui produs: recomandări, „de unde cumpăr”, comparații, „cum aleg”,
 *   pe tipurile de produs importante. Aici AI-ul numește magazine și mărci;
 * - 2 despre magazin (Reputație).
 */
export function suggestPrompts(products: CatalogProduct[], storeName: string, language: "ro" | "hu" = "ro", max = 30): SuggestedPrompt[] {
  const store = STORE_Q[language].map((f) => ({ text: f(storeSearchName(storeName)), category: "magazin", intent: "brand" as const }));
  const room = Math.max(0, max - store.length);
  if (!room || !products.length) return store.slice(0, max);
  const { picked } = pickProducts(products, language, Math.min(room, Math.max(1, Math.round(max * 0.4))));
  const named = productPrompts(picked, language);
  const intent = intentPrompts(products, language, room - named.length);
  const out: SuggestedPrompt[] = [];
  const seen = new Set<string>();
  const push = (x: SuggestedPrompt) => { const k = x.text.toLowerCase(); if (!seen.has(k) && x.text.length >= 3 && out.length < room) { seen.add(k); out.push(x); } };
  for (const x of named) push(x);
  for (const x of intent) push(x);
  // Catalog mic (puține tipuri de produs): restul locurilor merg la alte produse.
  if (out.length < room) {
    const more = pickProducts(products, language, room).picked.filter((x) => !named.some((n) => n.productId && n.productId === x.product.id));
    for (const x of more) push({ text: buyerQuery(x.product, language), category: x.category, intent: "produs", productId: x.product.id });
  }
  return [...out, ...store];
}

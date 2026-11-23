import { normalizeText } from "@/lib/util";
import { cleanGtin as channelGtin } from "../feed-channels/openai";

/**
 * Reparații de produs fără AI (logică pură, testată unitar): GTIN, marcă, categorie, titlu.
 * Fiecare propunere are un scor de încredere calculat de noi, din cât de sigură e sursa ei,
 * și un motiv scurt pentru om. Nu inventăm niciodată un GTIN: îl luăm doar din datele magazinului.
 */

export type FixField = "title" | "description" | "gtin" | "brand" | "category";
export const FIX_FIELDS: FixField[] = ["title", "description", "gtin", "brand", "category"];

export type FixCandidate = { productId: string; field: FixField; value: string; previous: string | null; source: "regula" | "ai"; confidence: number; reason: string };

/** Produsul, cu ce am extras din descriere în baza de date (fără să citim descrierea întreagă). */
export type FixProduct = {
  id: string; title: string; brand: string | null; category: string | null; gtin: string | null; mpn: string | null;
  descLength: number; eanLabeled: string | null; eanBare: string | null;
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** GTIN valid: 8, 12, 13 sau 14 cifre, cu cifra de control corectă (mod 10, ponderi 3 și 1 de la dreapta). */
export function isValidGtin(code: string | null | undefined): boolean {
  if (!code || !/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const d = code.split("").map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** GTIN-ul fără spații, cratime sau puncte (ex. „594 1234 567890”). */
export const cleanGtin = (code: string) => code.replace(/[\s.\-_]/g, "");

/** Contextul catalogului, calculat o dată pe magazin: mărcile folosite și „frații” (același titlu sau cod). */
export type CatalogContext = {
  brands: Map<string, { name: string; n: number }>; // marca normalizată → nume și câte produse o au
  gtinByMpn: Map<string, Set<string>>;
  gtinByTitle: Map<string, Set<string>>;
  categoryByTitle: Map<string, Set<string>>;
  categoryByBrand: Map<string, Map<string, number>>;
  brandCount: Map<string, number>;
};

const add = <K, V>(m: Map<K, Set<V>>, k: K, v: V) => { const s = m.get(k); if (s) s.add(v); else m.set(k, new Set([v])); };

export function catalogContext(products: FixProduct[]): CatalogContext {
  const ctx: CatalogContext = { brands: new Map(), gtinByMpn: new Map(), gtinByTitle: new Map(), categoryByTitle: new Map(), categoryByBrand: new Map(), brandCount: new Map() };
  for (const p of products) {
    const t = normalizeText(p.title);
    if (p.brand) {
      const b = normalizeText(p.brand);
      const cur = ctx.brands.get(b);
      ctx.brands.set(b, { name: cur?.name ?? p.brand.trim(), n: (cur?.n ?? 0) + 1 });
      ctx.brandCount.set(b, (ctx.brandCount.get(b) ?? 0) + 1);
      if (p.category) {
        const m = ctx.categoryByBrand.get(b) ?? new Map<string, number>();
        m.set(p.category, (m.get(p.category) ?? 0) + 1);
        ctx.categoryByBrand.set(b, m);
      }
    }
    const g = p.gtin ? cleanGtin(p.gtin) : null;
    if (g && isValidGtin(g)) {
      if (p.mpn) add(ctx.gtinByMpn, `${normalizeText(p.brand ?? "")}|${normalizeText(p.mpn)}`, g);
      add(ctx.gtinByTitle, t, g);
    }
    if (p.category) add(ctx.categoryByTitle, t, p.category);
  }
  return ctx;
}

const one = <T>(s: Set<T> | undefined) => (s && s.size === 1 ? [...s][0] : null);

/** GTIN: curățat, înlocuit sau completat din datele magazinului, ori scos dacă e greșit (Google îl respinge). */
export function gtinFix(p: FixProduct, ctx: CatalogContext): FixCandidate | null {
  const base = { productId: p.id, field: "gtin" as const, previous: p.gtin, source: "regula" as const };
  const raw = p.gtin?.trim() ?? "";
  let wrong: string | null = null;
  if (raw) {
    const g = cleanGtin(raw);
    // Comparăm cu ce primesc efectiv canalele: feed-ul Echo scoate deja spațiile și lasă gol un cod care nu are 8, 12, 13 sau 14 cifre.
    if (isValidGtin(g)) return g === raw || channelGtin(raw) === g ? null : { ...base, value: g, confidence: 95, reason: "Codul are semne în plus (cratime, puncte). Canalele îl citesc doar ca cifre." };
    wrong = /[a-z]/i.test(g) || (p.mpn && normalizeText(g) === normalizeText(p.mpn))
      ? `În câmpul GTIN e un cod de producător (${raw}), nu un cod EAN.`
      : `GTIN-ul ${raw} nu e valid (cifra de control nu se potrivește).`;
  }
  const lead = wrong ? `${wrong} ` : "";
  if (p.eanLabeled && isValidGtin(p.eanLabeled)) return { ...base, value: p.eanLabeled, confidence: 90, reason: `${lead}Codul EAN apare în descrierea produsului.` };
  const byMpn = p.mpn ? one(ctx.gtinByMpn.get(`${normalizeText(p.brand ?? "")}|${normalizeText(p.mpn)}`)) : null;
  if (byMpn) return { ...base, value: byMpn, confidence: 80, reason: `${lead}Un produs din catalogul tău cu același cod de producător are acest GTIN.` };
  const byTitle = one(ctx.gtinByTitle.get(normalizeText(p.title)));
  if (byTitle) return { ...base, value: byTitle, confidence: 70, reason: `${lead}Un produs din catalogul tău cu același titlu are acest GTIN. Verifică dacă e același model.` };
  if (p.eanBare && isValidGtin(p.eanBare)) return { ...base, value: p.eanBare, confidence: 60, reason: `${lead}În descriere apare un cod de 13 cifre valid ca EAN. Verifică dacă e codul produsului.` };
  // Fără un cod corect de pus în loc: propunem scoaterea doar dacă feed-ul l-ar trimite (cifre, lungime bună, control greșit).
  // Un cod de producător („B-08137”) feed-ul îl lasă deja gol, deci nu e nimic de reparat în feed.
  if (wrong && channelGtin(raw)) return { ...base, value: "", confidence: 85, reason: `${wrong} Google și ChatGPT resping produsele cu GTIN greșit, așa că îl scoatem din feed (produsul rămâne, fără GTIN) până pui codul corect.` };
  return null;
}

/** Marca lipsă: din primul cuvânt (sau primele două) al titlului, dacă e o marcă folosită în catalog. */
export function brandFix(p: FixProduct, ctx: CatalogContext): FixCandidate | null {
  if (p.brand && p.brand.trim()) return null;
  const words = normalizeText(p.title).split(" ");
  for (const k of [2, 1]) {
    const cand = words.slice(0, k).join(" ");
    const b = ctx.brands.get(cand);
    if (b && b.n >= 3) return { productId: p.id, field: "brand", value: b.name, previous: p.brand, source: "regula", confidence: 90, reason: `Titlul începe cu „${b.name}”, marca folosită la ${b.n} produse din catalogul tău.` };
  }
  const t = ` ${words.join(" ")} `;
  let best: { name: string; n: number } | null = null;
  for (const [k, b] of ctx.brands) if (b.n >= 5 && k.length >= 3 && t.includes(` ${k} `) && (!best || b.n > best.n)) best = b;
  return best ? { productId: p.id, field: "brand", value: best.name, previous: p.brand, source: "regula", confidence: 70, reason: `Titlul conține marca „${best.name}”, folosită la ${best.n} produse din catalogul tău.` } : null;
}

/** Categoria lipsă: de la un produs cu același titlu sau, dacă marca are aproape mereu aceeași categorie, de la ea. */
export function categoryFix(p: FixProduct, ctx: CatalogContext, brand: string | null): FixCandidate | null {
  if (p.category && p.category.trim()) return null;
  const base = { productId: p.id, field: "category" as const, previous: p.category, source: "regula" as const };
  const same = one(ctx.categoryByTitle.get(normalizeText(p.title)));
  if (same) return { ...base, value: same, confidence: 85, reason: "Un produs din catalogul tău cu același titlu e în această categorie." };
  if (!brand) return null;
  const m = ctx.categoryByBrand.get(normalizeText(brand));
  if (!m) return null;
  let top: [string, number] | null = null, total = 0;
  for (const e of m) { total += e[1]; if (!top || e[1] > top[1]) top = e; }
  if (top && total >= 5 && top[1] / total >= 0.8) return { ...base, value: top[0], confidence: 60, reason: `${Math.round((top[1] / total) * 100)}% din produsele ${brand} sunt în această categorie.` };
  return null;
}

/** Tipul produsului din categorie: ultimul nivel care nu e marca (ShopExpert pune marca la final: „… > Polizoare > BOSCH”). */
export function productType(category: string | null, brand: string | null): string | null {
  const parts = (category ?? "").split(/[>/|]/).map((x) => x.trim()).filter(Boolean);
  const b = brand ? normalizeText(brand) : null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const n = normalizeText(parts[i]);
    if (n.length > 2 && n !== b && !(b && n.includes(b))) return parts[i];
  }
  return null;
}

const isCaps = (t: string) => t === t.toUpperCase() && /[A-ZĂÂÎȘȚ]{4}/.test(t);
/** Marca scrisă frumos: „MAKITA” → „Makita”; „DeWALT” rămâne cum e. */
export const niceBrand = (b: string) => (isCaps(b) && b.length > 3 ? b.charAt(0) + b.slice(1).toLowerCase() : b.trim());

/** Cuvinte care nu spun ce e produsul („SOLO” = fără acumulator, „SET”, „KIT”). */
const GENERIC = new Set(["solo", "kit", "pcs", "buc", "bucati", "darab", "pack", "plus", "pro", "mini", "maxi", "nou", "new"]);

/** Titlul are măcar un cuvânt obișnuit (nu marcă, nu cod de model), deci spune deja ce fel de produs este. */
export function hasDescriptiveWord(title: string, brand: string | null) {
  const b = brand ? normalizeText(brand).split(" ") : [];
  return title.split(/\s+/).some((w) => {
    if (/\d/.test(w)) return false;
    const n = normalizeText(w);
    return n.length >= 4 && /^[a-z]+$/.test(n) && !b.includes(n) && !GENERIC.has(n);
  });
}

/** Ce e slab la un titlu, ca să știm dacă merită o propunere (și dacă merită întrebat AI-ul). */
export function titleIssues(title: string, brand: string | null, category: string | null) {
  const t = title.trim();
  const n = normalizeText(t);
  const type = productType(category, brand);
  return {
    caps: isCaps(t),
    noBrand: !!brand && !n.includes(normalizeText(brand)),
    // Tipul lipsește doar când titlul e „marcă + cod” (ex. „BOSCH GBH 18V-26 F”), fără niciun cuvânt care să spună ce e.
    noType: !!type && !n.includes(normalizeText(type).split(" ")[0].slice(0, 5)) && !hasDescriptiveWord(t, brand),
    short: t.length < 25,
  };
}
export const titleIsWeak = (t: string, b: string | null, c: string | null) => Object.values(titleIssues(t, b, c)).some(Boolean);

/**
 * Titlul propus după reguli: marca în față, tipul produsului la final, fără majuscule peste tot.
 * Codurile de model (cu cifre, cu cratimă sau de cel mult 3 litere, ex. „GWS 14-125 S”) rămân exact cum sunt.
 */
export function buildTitle(title: string, brand: string | null, category: string | null) {
  let t = title.replace(/\s+/g, " ").replace(/[!*]+/g, "").trim();
  const b = brand ? normalizeText(brand) : null;
  if (isCaps(t)) {
    // Ca într-o propoziție: marca cu inițială mare, primul cuvânt după ea cu inițială mare, restul cu litere mici.
    const brandWords = new Set(b ? b.split(" ") : []);
    let first = true;
    t = t.split(" ").map((w) => {
      if (brandWords.has(normalizeText(w))) return niceBrand(w);
      if (/\d|-|\//.test(w) || w.replace(/[^A-Za-zĂÂÎȘȚăâîșț]/g, "").length <= 3) { first = false; return w; }
      const out = w.toLowerCase().replace(/\p{L}/u, (c) => (first ? c.toUpperCase() : c));
      first = false;
      return out;
    }).join(" ");
  } else if (b) {
    // Doar marca scrisă cu majuscule la început („MAKITA Pompă…”) devine „Makita Pompă…”.
    const first = t.split(" ")[0];
    if (normalizeText(first) === b && isCaps(first)) t = `${niceBrand(first)}${t.slice(first.length)}`;
  }
  if (brand && !normalizeText(t).includes(b!)) t = `${niceBrand(brand)} ${t}`;
  // Tipul nu-l mai lipim din categorie: categoria e la plural („…, ferăstraie staționare”) și iese un titlu stângaci.
  // Pentru titlurile fără tip, AI-ul scrie tipul la singular (doar produsele urmărite sau din top), cu scor separat.
  return t.slice(0, 150);
}

/** Titlul propus după reguli, doar când schimbarea contează (marcă, tip sau majuscule), nu doar pentru o literă. */
export function titleFix(p: FixProduct, brand: string | null, category: string | null): FixCandidate | null {
  const i = titleIssues(p.title, brand, category);
  if (!i.noBrand && !i.caps) return null;
  const value = buildTitle(p.title, brand, category);
  if (value === p.title) return null;
  const reasons: string[] = [];
  let confidence = 90;
  if (i.noBrand) reasons.push("adaugă marca");
  if (i.caps) { reasons.push("scrie fără majuscule peste tot"); confidence = Math.min(confidence, 75); }
  // Doar majusculele mărcii schimbate (ex. „MAKITA HR3001CJ” → „Makita HR3001CJ”): prea puțin ca să merite.
  const brandWords = new Set(brand ? normalizeText(brand).split(" ") : []);
  const changed = value.split(" ").filter((w, k) => w !== p.title.split(" ")[k] && !brandWords.has(normalizeText(w)));
  if (!i.noBrand && normalizeText(value) === normalizeText(p.title) && changed.length < 1) return null;
  const why = reasons.join(", ");
  return { productId: p.id, field: "title", value, previous: p.title, source: "regula", confidence: clamp(confidence),
    reason: `${why.charAt(0).toUpperCase()}${why.slice(1)}. AI-urile recomandă mai des produsele cu titluri „Marcă + model + tip”.` };
}

/** Toate propunerile fără AI pentru un produs. Marca și categoria propuse se folosesc mai departe la titlu. */
export function ruleFixes(p: FixProduct, ctx: CatalogContext): FixCandidate[] {
  const out: FixCandidate[] = [];
  const g = gtinFix(p, ctx); if (g) out.push(g);
  const b = brandFix(p, ctx); if (b) out.push(b);
  const brand = p.brand?.trim() || (b && b.confidence >= 80 ? b.value : null);
  const c = categoryFix(p, ctx, brand); if (c) out.push(c);
  const category = p.category?.trim() || (c && c.confidence >= 80 ? c.value : null);
  const t = titleFix(p, brand, category); if (t) out.push(t);
  return out;
}

// ── Scorul propunerilor AI: calculat de noi, nu declarat de AI ───────────────────────────

const numbersIn = (s: string) => new Set((s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => x.replace(",", ".")));

/** Cifrele din textul nou care nu apar în datele produsului (o specificație inventată e cea mai gravă greșeală). */
export function inventedNumbers(out: string, source: string) {
  const src = numbersIn(source);
  // Un cod de model ca „WAN28263BY” e verificat separat; aici contează cifrele de sine stătătoare.
  const flat = source.replace(/\s/g, "");
  return [...numbersIn(out.replace(/\b[a-z]*\d+[a-z]+\w*\b/gi, " "))].filter((n) => !src.has(n) && !(n.length >= 3 && flat.includes(n)));
}

const BANNED = /cel mai bun|cea mai bun|garant|#1|nr\.? ?1|ieftin|reducere|ofert|promo|legjobb|olcsó|akció|https?:|www\.|@/i;

export type AiSource = { title: string; brand: string | null; category: string | null; description: string | null; mpn: string | null };
const sourceText = (s: AiSource) => [s.title, s.brand, s.category, s.mpn, s.description].filter(Boolean).join(" ");
/** Codurile de model din titlul original (cuvinte cu litere și cifre): titlul nou trebuie să le păstreze. */
const modelCodes = (t: string) => t.split(/\s+/).map((w) => w.replace(/^[("'„]+|[)"',.;:”]+$/g, "").toLowerCase()).filter((w) => w.length >= 2 && /\d/.test(w));

export function scoreAiTitle(out: string, s: AiSource): { confidence: number; reason: string } | null {
  const v = out.replace(/\s+/g, " ").trim();
  if (!v || normalizeText(v) === normalizeText(s.title)) return null;
  let c = 92;
  const notes: string[] = [];
  const n = normalizeText(v);
  if (s.brand && !n.includes(normalizeText(s.brand))) { c -= 40; notes.push("lipsește marca"); }
  const codes = modelCodes(s.title);
  const lost = codes.filter((m) => !v.toLowerCase().includes(m));
  if (codes.length && lost.length === codes.length) { c -= 40; notes.push("lipsește codul modelului"); }
  else if (lost.length) { c -= 15; notes.push(`lipsește ${lost.join(", ")}`); }
  if (inventedNumbers(v, sourceText(s)).length) { c -= 35; notes.push("conține cifre care nu sunt în datele produsului"); }
  if (v.length < 20 || v.length > 150) { c -= 20; notes.push("lungime nepotrivită"); }
  if (BANNED.test(v)) { c -= 30; notes.push("conține text de reclamă"); }
  return { confidence: clamp(c), reason: notes.length ? `Scris de AI din datele produsului; atenție: ${notes.join(", ")}.` : "Scris de AI din datele produsului: marcă, model și tipul produsului, fără cifre inventate." };
}

export function scoreAiDescription(out: string, s: AiSource): { confidence: number; reason: string } | null {
  const v = out.replace(/[ \t]+/g, " ").trim();
  if (v.length < 60) return null;
  let c = 85;
  const notes: string[] = [];
  const invented = inventedNumbers(v, sourceText(s));
  if (invented.length) { c -= Math.min(45, invented.length * 15); notes.push(`cifre care nu sunt în datele produsului (${invented.slice(0, 3).join(", ")})`); }
  if (s.brand && !normalizeText(v).includes(normalizeText(s.brand))) { c -= 10; notes.push("nu numește marca"); }
  if (v.length < 150) { c -= 15; notes.push("prea scurtă"); }
  if (v.length > 1200) { c -= 10; notes.push("prea lungă"); }
  if (BANNED.test(v)) { c -= 30; notes.push("conține text de reclamă sau linkuri"); }
  const had = (s.description ?? "").trim().length;
  return { confidence: clamp(c), reason: notes.length ? `Scrisă de AI din datele produsului; atenție: ${notes.join(", ")}.` : had ? "Descrierea actuală e prea scurtă pentru AI-uri. Am scris-o doar din datele produsului." : "Produsul nu are descriere. Am scris-o doar din datele produsului." };
}

/** Descrierea e prea scurtă ca un AI să înțeleagă produsul (sub ~150 de caractere). */
export const descriptionIsWeak = (len: number) => len < 150;

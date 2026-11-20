import type { Mention } from "@/db/schema";
import { domainOf, keywords } from "@/lib/util";
import { ERROR_MODEL, type KnownProduct, type KnownStore } from "./types";

/**
 * Extrage din răspunsul unui AI ce magazine și produse a menționat, în ce ordine și la ce preț.
 * Combină: domenii scrise explicit, nume de magazine cunoscute și surse citate.
 */
const DOMAIN_RE = /\b((?:[a-z0-9-]+\.)+(?:ro|hu|com|eu|net|shop|store))\b/gi;
const PRICE_RE = /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(lei|ron|ft|huf|€|eur)/i;
const IGNORE = new Set(["youtube.com", "facebook.com", "reddit.com", "google.com", "wikipedia.org", "instagram.com", "tiktok.com"]);

const GENERIC_LABELS = new Set(["shop", "store", "online", "magazin", "webshop", "market", "www", "blog", "forum", "news"]);
/** Numele unui site din domeniu: „leroy-merlin.ro” → „leroy merlin”. Prea scurt sau generic → null. */
export function sourceLabel(domain: string): string | null {
  const parts = domain.split(".");
  if (parts.length < 2) return null;
  const label = parts[parts.length - 2].replace(/-/g, " ");
  return label.length >= 4 && !GENERIC_LABELS.has(label) && !/^\d+$/.test(label) ? label : null;
}

/** Marca din domeniu, fără cratime: „shopexpert.com”, „shopexpert.ro”, „shop-expert.ro” → „shopexpert”; „x.com.ro” → „x”. */
export function brandLabel(domain: string) {
  const parts = domain.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length > 2 && ["com", "co", "org", "net"].includes(parts[parts.length - 2])) parts.pop();
  return (parts.length > 1 ? parts[parts.length - 2] : parts[0]).replace(/-/g, "");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (w: string) => new RegExp(`(^|[^a-z0-9ăâîșț])${escapeRe(w)}([^a-z0-9ăâîșț]|$)`, "i");

/** Prima apariție a cuvântului `w` în text; cu `proper`, doar dacă începe cu majusculă. -1 dacă lipsește. */
function firstWord(text: string, w: string, proper = false) {
  for (const m of text.matchAll(new RegExp(wordRe(w).source, "gi"))) {
    const at = m.index! + m[1].length;
    if (!proper || /\p{Lu}/u.test(text[at])) return at;
  }
  return -1;
}

function parseNum(s: string) {
  let n = s.replace(/\s/g, "");
  if (/,\d{1,2}$/.test(n)) n = n.replace(/\./g, "").replace(",", ".");
  else n = n.replace(/[.,](?=\d{3}\b)/g, "");
  return parseFloat(n);
}

export function extractMentions(
  answer: string,
  sources: { url: string; title?: string }[],
  world: { stores: KnownStore[]; products: KnownProduct[]; ownDomains?: string[] },
  query?: string,
): Mention[] {
  // Marcajele de citare ale ChatGPT („\ue200cite\ue202turn0search1\ue201”) nu sunt text.
  const text = cleanAnswer(answer);
  const hits = new Map<string, { idx: number; name?: string }>();
  // Același magazin pe alt domeniu (shopexpert.ro, shop-expert.ro pentru shopexpert.com) e același magazin.
  // Domeniile magazinelor din Echo au întâietate: un concurent salvat greșit (shopexpert.ro) nu „fură” mențiunea.
  const own = new Set(world.ownDomains ?? []);
  const known = new Set(world.stores.map((s) => s.domain));
  const ownBrand = new Map<string, string>();
  for (const d of own) if (!ownBrand.has(brandLabel(d))) ownBrand.set(brandLabel(d), d);
  const byBrand = new Map<string, string>();
  for (const s of world.stores) if (!byBrand.has(brandLabel(s.domain))) byBrand.set(brandLabel(s.domain), s.domain);
  const alias = (d: string) => (own.has(d) ? d : ownBrand.get(brandLabel(d)) ?? (known.has(d) ? d : byBrand.get(brandLabel(d)) ?? d));

  for (const m of text.matchAll(DOMAIN_RE)) {
    const d = alias(m[1].toLowerCase().replace(/^www\./, ""));
    if (IGNORE.has(d) || d.length < 5) continue;
    if (!hits.has(d) || hits.get(d)!.idx > m.index!) hits.set(d, { idx: m.index! });
  }
  for (const s of world.stores) {
    // Numele magazinului („ShopExpert RO”) și marca din domeniu („ShopExpert” pentru shopexpert.com).
    // Marca din domeniu contează doar ca nume propriu (cu majusculă): „scule.ro” nu e „scule electrice”.
    const label = brandLabel(s.domain);
    const names: [string, boolean][] = [[s.name.toLowerCase(), false], ...(label.length >= 5 && !GENERIC_LABELS.has(label) ? [[label, true] as [string, boolean]] : [])];
    for (const [name, proper] of names) {
      if (name.length < 3) continue;
      const i = firstWord(text, name, proper);
      const d = alias(s.domain);
      if (i >= 0 && (!hits.has(d) || hits.get(d)!.idx > i)) hits.set(d, { idx: i, name: d === s.domain ? s.name : hits.get(d)?.name });
    }
  }

  // Magazine necunoscute încă, citate ca sursă și numite în text („la Dedeman găsești…”): le recunoaștem
  // după numele din domeniu. Sărim peste numele care sunt în căutare (de obicei marca produsului, ex. bosch.ro).
  const q = (query ?? "").toLowerCase();
  for (const s of sources) {
    const raw = domainOf(s.url);
    const d = raw && alias(raw);
    if (!d || IGNORE.has(d) || hits.has(d)) continue;
    const label = sourceLabel(d);
    if (!label || q.includes(label)) continue;
    // Doar ca nume propriu (cu majusculă), ca „scule.ro” să nu se potrivească pe „scule electrice”.
    const at = firstWord(text, label, true);
    if (at >= 0) hits.set(d, { idx: at, name: text.slice(at, at + label.length) });
  }

  const ordered = [...hits.entries()].sort((a, b) => a[1].idx - b[1].idx);
  const mentions: Mention[] = ordered.map(([domain, h], i) => {
    // Fereastra de text din jurul mențiunii: căutăm produs și preț
    const start = Math.max(0, text.lastIndexOf("\n", h.idx));
    const nl = text.indexOf("\n", h.idx);
    const window = text.slice(start, nl > 0 ? nl : h.idx + 300);
    const pm = window.match(PRICE_RE);
    const prods = world.products.filter((p) => p.domain === domain);
    let productTitle: string | undefined;
    let best = 0;
    const wk = new Set(keywords(window));
    for (const p of prods) {
      const pk = keywords(p.title);
      const overlap = pk.filter((k) => wk.has(k)).length / Math.max(1, pk.length);
      if (overlap > best && overlap >= 0.5) { best = overlap; productTitle = p.title; }
    }
    if (!productTitle) productTitle = window.match(/\*\*(.+?)\*\*/)?.[1];
    return { domain, name: h.name ?? world.stores.find((s) => s.domain === domain)?.name, position: i + 1, productTitle, statedPrice: pm ? parseNum(pm[1]) : undefined };
  });

  // Magazine cunoscute care apar doar ca sursă citată (nu în text): poziție după cele din text
  for (const s of sources) {
    const raw = domainOf(s.url);
    const d = raw && alias(raw);
    if (!d || IGNORE.has(d) || mentions.some((m) => m.domain === d)) continue;
    if (known.has(d)) mentions.push({ domain: d, position: mentions.length + 1 });
  }
  return mentions;
}

/**
 * Textul răspunsului fără marcajele interne de citare ale ChatGPT (caractere din zona privată Unicode,
 * ex. „\ue200cite\ue202turn0search1\ue201”). Se aplică la salvare și la afișare.
 */
export function cleanAnswer(answer: string) {
  return answer.replace(/\ue200[^\ue201]*\ue201/g, "").replace(/[\ue000-\uf8ff]/g, "").replace(/[ \t]+([.,;:!?])/g, "$1").replace(/[ \t]+\n/g, "\n");
}

/**
 * Mențiunile unei rulări. O rulare cu eroare (cheie greșită, AI căzut) nu recomandă pe nimeni:
 * linkurile din mesajul de eroare (ex. platform.openai.com) nu sunt magazine.
 */
export function runMentions(
  run: { answer: string; sources: { url: string; title?: string }[]; model: string | null; query?: string },
  world: { stores: KnownStore[]; products: KnownProduct[]; ownDomains?: string[] },
): Mention[] {
  return run.model === ERROR_MODEL ? [] : extractMentions(run.answer, run.sources, world, run.query);
}

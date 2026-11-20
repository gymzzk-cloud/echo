import type { Mention } from "@/db/schema";
import { domainOf, keywords } from "@/lib/util";
import type { KnownProduct, KnownStore } from "./types";

/**
 * Extrage din răspunsul unui AI ce magazine și produse a menționat, în ce ordine și la ce preț.
 * Combină: domenii scrise explicit, nume de magazine cunoscute și surse citate.
 */
const DOMAIN_RE = /\b((?:[a-z0-9-]+\.)+(?:ro|hu|com|eu|net|shop|store))\b/gi;
const PRICE_RE = /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(lei|ron|ft|huf|€|eur)/i;
const IGNORE = new Set(["youtube.com", "facebook.com", "reddit.com", "google.com", "wikipedia.org", "instagram.com", "tiktok.com"]);

function parseNum(s: string) {
  let n = s.replace(/\s/g, "");
  if (/,\d{1,2}$/.test(n)) n = n.replace(/\./g, "").replace(",", ".");
  else n = n.replace(/[.,](?=\d{3}\b)/g, "");
  return parseFloat(n);
}

export function extractMentions(
  answer: string,
  sources: { url: string; title?: string }[],
  world: { stores: KnownStore[]; products: KnownProduct[] },
): Mention[] {
  const text = answer;
  const lower = text.toLowerCase();
  const hits = new Map<string, { idx: number; name?: string }>();

  for (const m of text.matchAll(DOMAIN_RE)) {
    const d = m[1].toLowerCase().replace(/^www\./, "");
    if (IGNORE.has(d) || d.length < 5) continue;
    if (!hits.has(d) || hits.get(d)!.idx > m.index!) hits.set(d, { idx: m.index! });
  }
  for (const s of world.stores) {
    const name = s.name.toLowerCase();
    if (name.length < 3) continue;
    const re = new RegExp(`(^|[^a-z0-9ăâîșț])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9ăâîșț]|$)`, "i");
    const i = lower.search(re);
    if (i >= 0 && (!hits.has(s.domain) || hits.get(s.domain)!.idx > i)) hits.set(s.domain, { idx: i, name: s.name });
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
    const d = domainOf(s.url);
    if (!d || IGNORE.has(d) || mentions.some((m) => m.domain === d)) continue;
    if (world.stores.some((k) => k.domain === d)) mentions.push({ domain: d, position: mentions.length + 1 });
  }
  return mentions;
}

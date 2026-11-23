import type { FeedFileStats, FeedIssueSample, FeedOutputSettings } from "@/db/schema";
import type { FeedProduct } from "../feed";

/**
 * Feed-ul de produse pentru ChatGPT (OpenAI), în formatul lor de feed text: CSV UTF-8, un produs pe rând, cu antet.
 * Numele coloanelor și regulile (limite de lungime, preț „123.45 RON”, availability in_stock/out_of_stock) urmează
 * specificația OpenAI pentru feed-ul de produse. Dacă OpenAI schimbă numele unei coloane, se schimbă doar aici.
 */

export const OPENAI_COLUMNS = [
  "id", "title", "description", "link", "image_link", "price", "availability", "brand", "gtin", "mpn", "condition",
  "product_category", "seller_name", "seller_url", "seller_privacy_policy", "seller_tos", "return_policy", "return_window",
  "store_country", "target_countries", "enable_search", "enable_checkout",
] as const;
export type OpenAiRow = Record<(typeof OPENAI_COLUMNS)[number], string>;

export const OPENAI_DEFAULT_RETURN_DAYS = 14; // dreptul legal de retragere în UE, dacă magazinul nu spune altceva
/** Câte produse cu problemă păstrăm ca exemplu, ca magazinul să le poată corecta. */
const SAMPLE_MAX = 50;

type Store = { name: string; domain: string; pathPrefix: string; country: string };

/** Text simplu: fără HTML, fără spații în plus, tăiat la limită fără să rupă un cuvânt la mijloc. */
export function plainText(s: string | null | undefined, max: number) {
  const t = (s ?? "")
    .replace(/<\s*br\s*\/?>|<\/p>|<\/li>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

const NO_BRAND = /^(n\/?a|none|null|undefined|nil|generic|generico|unbranded|no ?brand|other|others|altele|diverse|div|nespecificat|fara( brand)?|fără( brand)?|nincs|egyéb|egyeb|márka nélkül|marka nelkul|-+|\.+|0+)$/i;

/**
 * Brandul pentru OpenAI: text simplu, fără caractere de control, maxim 70 de caractere tăiate curat (fără „…”).
 * Gol dacă nu e un nume real (doar semne, doar cifre, „N/A”, „Generic”, „Fără brand”…): un brand gol e acceptat,
 * unul invalid face OpenAI să respingă rândul.
 */
export function cleanBrand(s: string | null | undefined) {
  let t = plainText(s, 10_000).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, "").replace(/\s+/g, " ").trim();
  t = t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.)!+&]+$/gu, "");
  if (t.length > 70) {
    const cut = t.slice(0, 70);
    const sp = cut.lastIndexOf(" ");
    t = (sp > 40 ? cut.slice(0, sp) : cut).replace(/[^\p{L}\p{N}.)!+&]+$/u, "");
  }
  if (!/\p{L}/u.test(t) || NO_BRAND.test(t) || /^https?:|www\./i.test(t)) return "";
  return t;
}

/** Categoria cu separatorul cerut de OpenAI („Electrocasnice > Bucătărie > Cuptoare”). */
export const categoryPath = (c: string | null) => (c ?? "").split(/\s*(?:>|\/|\||»)\s*/).map((x) => x.trim()).filter(Boolean).join(" > ");

/** GTIN valid doar dacă are 8, 12, 13 sau 14 cifre; altfel îl lăsăm gol (un GTIN greșit e mai rău decât niciunul). */
export const cleanGtin = (g: string | null) => {
  const d = (g ?? "").replace(/\s/g, "");
  return /^(\d{8}|\d{12,14})$/.test(d) ? d : "";
};

const isHttpUrl = (u: string | null | undefined) => !!u && /^https?:\/\/\S+$/i.test(u);

/**
 * Un rând de feed pentru un produs, sau motivul pentru care produsul nu poate intra (lipsește un câmp obligatoriu).
 * Funcție pură: nu citește baza de date.
 */
export function openAiRow(p: FeedProduct, store: Store, s: FeedOutputSettings | null): { row: OpenAiRow } | { skip: string } {
  if (!p.title.trim()) return { skip: "fără titlu" };
  if (!isHttpUrl(p.url)) return { skip: "fără link" };
  if (!isHttpUrl(p.imageUrl)) return { skip: "fără imagine" };
  if (p.price == null || !(p.price > 0)) return { skip: "fără preț" };
  const title = plainText(p.title, 150);
  return {
    row: {
      id: p.externalId.slice(0, 100),
      title,
      description: plainText(p.description, 5000) || title,
      link: p.url,
      image_link: p.imageUrl!,
      price: `${p.price.toFixed(2)} ${p.currency}`,
      availability: p.inStock ? "in_stock" : "out_of_stock",
      brand: cleanBrand(p.brand),
      gtin: cleanGtin(p.gtin),
      mpn: plainText(p.mpn, 70),
      condition: "new",
      product_category: categoryPath(p.category),
      seller_name: plainText(store.name, 70),
      seller_url: `https://${store.domain}${store.pathPrefix}`,
      seller_privacy_policy: s?.privacyPolicyUrl ?? "",
      seller_tos: s?.termsUrl ?? "",
      return_policy: s?.returnPolicyUrl ?? "",
      return_window: String(s?.returnWindowDays ?? OPENAI_DEFAULT_RETURN_DAYS),
      store_country: store.country,
      target_countries: store.country,
      enable_search: "true",
      enable_checkout: "false", // plata direct în ChatGPT cere integrare separată (Agentic Checkout)
    },
  };
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Scrie feed-ul OpenAI ca CSV, rând cu rând, și ține statistica pentru panou (excluse pe motive, câmpuri recomandate lipsă). */
export function openAiWriter(store: Store, s: FeedOutputSettings | null) {
  const excluded: Record<string, number> = {};
  const samples: Record<string, FeedIssueSample[]> = {};
  const missing: Record<string, number> = {};
  let total = 0, included = 0;
  return {
    head: `${OPENAI_COLUMNS.join(",")}\n`,
    row(p: FeedProduct): string | null {
      total++;
      const r = openAiRow(p, store, s);
      if ("skip" in r) { excluded[r.skip] = (excluded[r.skip] ?? 0) + 1; return null; }
      if (!r.row.brand) missing.brand = (missing.brand ?? 0) + 1;
      if (!r.row.brand && (p.brand ?? "").trim()) {
        missing.brand_invalid = (missing.brand_invalid ?? 0) + 1;
        const list = (samples.brand_invalid ??= []);
        if (list.length < SAMPLE_MAX) list.push({ code: p.externalId, title: r.row.title, value: (p.brand ?? "").slice(0, 120) });
      }
      if (!r.row.gtin && !r.row.mpn) missing.gtin_mpn = (missing.gtin_mpn ?? 0) + 1;
      if (!r.row.product_category) missing.product_category = (missing.product_category ?? 0) + 1;
      included++;
      return `${OPENAI_COLUMNS.map((c) => csvCell(r.row[c])).join(",")}\n`;
    },
    stats: (): FeedFileStats => ({ total, included, excluded, missing, ...(Object.keys(samples).length ? { samples } : {}) }),
  };
}

/** Tot feed-ul OpenAI ca CSV (cataloage mici și teste). */
export function renderOpenAiCsv(items: FeedProduct[], store: Store, s: FeedOutputSettings | null): { body: string; stats: FeedFileStats } {
  const w = openAiWriter(store, s);
  let body = w.head;
  for (const p of items) body += w.row(p) ?? "";
  return { body, stats: w.stats() };
}

/** Setările de magazin cerute de OpenAI care lipsesc (le afișăm în panou, lângă adresa feed-ului). */
export function missingOpenAiSettings(s: FeedOutputSettings | null) {
  const out: string[] = [];
  if (!isHttpUrl(s?.returnPolicyUrl)) out.push("pagina politicii de retur");
  if (!isHttpUrl(s?.privacyPolicyUrl)) out.push("pagina de confidențialitate");
  if (!isHttpUrl(s?.termsUrl)) out.push("termenii și condițiile");
  return out;
}

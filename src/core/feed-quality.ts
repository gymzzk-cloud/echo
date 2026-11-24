import type { FeedProduct } from "./feed";
import { cleanBrand } from "./feed-channels/openai";
import { GOOD_DESCRIPTION_WORDS } from "./audit/signals";

/**
 * Verificarea feed-ului trimis unui canal (ZoZo, 24.11.2026, KNOWLEDGE A54): e 100% corect sau ce probleme are,
 * pe categorii, cu numărul de produse la fiecare și lista lor. Doar din datele feed-ului, fără presupuneri.
 * Funcții pure; calculul rulează în worker (jobul `feed`), pagina citește rezultatul salvat.
 */

export type IssueId =
  | "no_title" | "no_link" | "no_image" | "no_price" | "no_brand"
  | "bad_gtin" | "no_gtin" | "no_description" | "short_description" | "long_title" | "no_category";

/** `blocking`: canalul respinge produsul (nu apare deloc). Altfel: produsul intră, dar cu date slabe pentru AI. */
export const ISSUES: { id: IssueId; group: string; label: string; blocking: boolean; fix: string }[] = [
  { id: "no_title", group: "Text", label: "Fără titlu", blocking: true, fix: "Completează titlul produsului în magazin." },
  { id: "no_link", group: "Link", label: "Fără link valid spre produs", blocking: true, fix: "Verifică adresa paginii produsului în feed (trebuie să înceapă cu https://)." },
  { id: "no_image", group: "Imagine", label: "Fără imagine", blocking: true, fix: "Adaugă cel puțin o imagine produsului în magazin." },
  { id: "no_price", group: "Preț", label: "Fără preț", blocking: true, fix: "Completează prețul produsului în magazin." },
  { id: "no_brand", group: "Identificare", label: "Fără marcă validă", blocking: true, fix: "Completează marca reală (nu „N/A”, „Diverse” sau doar cifre)." },
  { id: "bad_gtin", group: "Identificare", label: "EAN greșit (cifra de control nu se potrivește)", blocking: false, fix: "Corectează EAN-ul de pe ambalaj; un EAN greșit e mai rău decât niciunul." },
  { id: "no_gtin", group: "Identificare", label: "Fără EAN", blocking: false, fix: "Adaugă EAN-ul de pe ambalaj: AI-urile și comparatoarele potrivesc produsele după el." },
  { id: "no_description", group: "Text", label: "Fără descriere", blocking: false, fix: "Scrie o descriere: pentru cine e, ce problemă rezolvă, ce conține pachetul." },
  { id: "short_description", group: "Text", label: `Descriere scurtă (sub ${GOOD_DESCRIPTION_WORDS} de cuvinte)`, blocking: false, fix: "Completează descrierea: pentru cine e, ce problemă rezolvă, ce conține pachetul." },
  { id: "long_title", group: "Text", label: "Titlu prea lung (peste 150 de caractere)", blocking: false, fix: "Scurtează titlul: marcă, model, tip și caracteristica principală." },
  { id: "no_category", group: "Categorie", label: "Fără categorie", blocking: false, fix: "Pune produsul într-o categorie în magazin." },
];

const isHttpUrl = (u: string | null | undefined) => !!u && /^https?:\/\/\S+$/i.test(u);
const words = (html: string | null) => (html ?? "").replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;

/** EAN/GTIN cu 8, 12, 13 sau 14 cifre și cifra de control corectă. */
export function gtinValid(g: string) {
  const d = g.replace(/\s/g, "");
  if (!/^(\d{8}|\d{12,14})$/.test(d)) return false;
  const digits = [...d].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Problemele unui produs din feed, în ordinea din `ISSUES`. Produsele fără stoc nu sunt o problemă de calitate. */
export function productIssues(p: FeedProduct): IssueId[] {
  const out: IssueId[] = [];
  const title = p.title?.trim() ?? "";
  if (!title) out.push("no_title");
  if (!isHttpUrl(p.url)) out.push("no_link");
  if (!isHttpUrl(p.imageUrl)) out.push("no_image");
  if (p.price == null || !(p.price > 0)) out.push("no_price");
  if (!cleanBrand(p.brand)) out.push("no_brand");
  const g = (p.gtin ?? "").trim();
  if (g && !gtinValid(g)) out.push("bad_gtin");
  if (!g) out.push("no_gtin");
  const w = words(p.description);
  const same = !!p.description && p.description.replace(/<[^>]+>/g, " ").trim().toLowerCase() === title.toLowerCase();
  if (!w || same) out.push("no_description");
  else if (w < GOOD_DESCRIPTION_WORDS) out.push("short_description");
  if (title.length > 150) out.push("long_title");
  if (!p.category?.trim()) out.push("no_category");
  return out;
}

/** Câte produse arătăm în lista fiecărei probleme (salvată în rezumat); restul se spune ca număr. */
export const ISSUE_SAMPLE = 200;

export type FeedQuality = {
  /** Produse verificate (cele care pleacă spre canal, după reguli). */
  checked: number;
  /** Fără nicio problemă. */
  perfect: number;
  /** Fără nicio problemă care blochează (canalul le acceptă). */
  accepted: number;
  /** % produse fără nicio problemă: 100 doar când chiar nu e nimic de reparat. */
  score: number;
  issues: { id: IssueId; count: number; focus: number; sample: string[] }[];
};

/**
 * Scorul și problemele, într-o singură trecere. Lista fiecărei probleme pune produsele focus întâi
 * (cele importante pentru magazin, KNOWLEDGE A0c), apoi restul, cel mult `ISSUE_SAMPLE`.
 */
export function feedQuality(items: FeedProduct[], focus: ReadonlySet<string> = new Set()): FeedQuality {
  const by = new Map<IssueId, { count: number; focus: number; first: string[]; rest: string[] }>();
  let perfect = 0, accepted = 0;
  const blocking = new Set(ISSUES.filter((i) => i.blocking).map((i) => i.id));
  for (const p of items) {
    const list = productIssues(p);
    if (!list.length) perfect++;
    if (!list.some((i) => blocking.has(i))) accepted++;
    const isFocus = focus.has(p.id);
    for (const id of list) {
      const e = by.get(id) ?? { count: 0, focus: 0, first: [], rest: [] };
      e.count++;
      if (isFocus) { e.focus++; if (e.first.length < ISSUE_SAMPLE) e.first.push(p.id); }
      else if (e.rest.length < ISSUE_SAMPLE) e.rest.push(p.id);
      by.set(id, e);
    }
  }
  const issues = ISSUES.filter((i) => by.has(i.id)).map((i) => {
    const e = by.get(i.id)!;
    return { id: i.id, count: e.count, focus: e.focus, sample: [...e.first, ...e.rest].slice(0, ISSUE_SAMPLE) };
  });
  // Întâi ce blochează, apoi cele care ating cele mai multe produse.
  issues.sort((a, b) => Number(blocking.has(b.id)) - Number(blocking.has(a.id)) || b.count - a.count);
  const checked = items.length;
  return { checked, perfect, accepted, score: checked ? Math.floor((perfect * 100) / checked) : 0, issues };
}

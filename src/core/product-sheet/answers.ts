import type { Mention } from "@/db/schema";
import { isOwnBrand, MARKETPLACES } from "../rivals";
import { isComparatorDomain } from "../source-kind";
import type { ChannelReport } from "./channels";

/**
 * Pentru un produs: răspunsurile AI deja salvate (la întrebările despre el sau în care apare), cine e numit în locul
 * magazinului, ce comparatoare citează AI-ul și motivele probabile. Doar din date salvate, fără apeluri AI.
 * Funcții pure (testate în tests/product-sheet.test.ts).
 */

export type SheetRun = { id: string; provider: string; runDate: string; at: string; query: string; answer: string; mentions: Mention[]; sources: { url: string; title?: string }[] };
export type RunView = {
  run: SheetRun; storeNamed: boolean; productPageCited: boolean; productNamed: boolean;
  /** AI-ul n-a numit niciun magazin și a răspuns cu o întrebare („Vrei specificații sau prețuri?”): a cerut clarificare. */
  clarified: boolean;
  others: { domain: string; name: string; position: number; marketplace: boolean }[]; comparators: string[];
};
export type CompetitorView = {
  runs: RunView[]; withStore: number; withoutStore: number;
  /** Din `withoutStore`: răspunsuri care doar au cerut clarificare (nu e „nu te numește”, n-a numit pe nimeni). */
  clarified: number;
  others: { domain: string; name: string; count: number; marketplace: boolean }[]; comparators: { domain: string; count: number }[];
};

const COMPARATOR = /(^|\.)(compari|pricy|price|shopmania|pricerunner|idealo|arukereso|olcsobbat|argep|okazii|cumparaturi|preturi)\./;
export const isComparator = (domain: string) => COMPARATOR.test(`.${domain}.`) || isComparatorDomain(domain);
const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
const pathOf = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");

/**
 * Răspunsul e doar o întrebare de clarificare? Un răspuns scurt (sub 1500 de caractere) care întreabă ceva înapoi:
 * primul paragraf conține o întrebare („Vrei informații despre acest model…? Spune-mi ce anume te interesează”)
 * sau ultimul rând se termină cu „?”. Sub 600 de caractere ajunge orice „?”. Un răspuns lung e un răspuns, nu o clarificare.
 * Se folosește doar pe răspunsuri care n-au numit niciun magazin.
 */
export function asksClarification(answer: string) {
  const text = answer.trim();
  if (!text.includes("?")) return false;
  if (text.length < 600) return true;
  if (text.length >= 1500) return false;
  const paras = text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const last = text.split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? "";
  return (paras[0] ?? "").includes("?") || /\?[\s*_)»”"]*$/.test(last);
}

export function competitorView(runs: SheetRun[], opts: { ownDomain: string; ownDomains: string[]; productUrl: string; namedRunIds: Set<string> }): CompetitorView {
  // Magazinul acesta (și același brand pe alt domeniu) vs. celelalte magazine ale clientului: nici unele nu sunt concurenți.
  const self = (d: string) => isOwnBrand(d, opts.ownDomain);
  const own = (d: string) => self(d) || opts.ownDomains.includes(d);
  const productPath = pathOf(opts.productUrl);
  const others = new Map<string, { domain: string; name: string; count: number; marketplace: boolean }>();
  const comps = new Map<string, number>();
  let withStore = 0, clarified = 0;
  const views = runs.map((run) => {
    const hosts = run.sources.map((s) => hostOf(s.url)).filter(Boolean);
    const storeNamed = run.mentions.some((m) => self(m.domain)) || hosts.some(self);
    const productPageCited = !!productPath && (run.sources.some((s) => pathOf(s.url) === productPath) || run.answer.toLowerCase().includes(productPath));
    const rivals = run.mentions.filter((m) => !own(m.domain) && !isComparator(m.domain))
      .map((m) => ({ domain: m.domain, name: m.name ?? m.domain, position: m.position, marketplace: MARKETPLACES.has(m.domain) }))
      .sort((a, b) => a.position - b.position);
    const comparators = [...new Set([...hosts, ...run.mentions.map((m) => m.domain)].filter(isComparator))];
    if (storeNamed || productPageCited) withStore++;
    const askedBack = !storeNamed && !productPageCited && !rivals.length && asksClarification(run.answer);
    if (askedBack) clarified++;
    for (const r of rivals) {
      const e = others.get(r.domain) ?? { domain: r.domain, name: r.name, count: 0, marketplace: r.marketplace };
      e.count++;
      others.set(r.domain, e);
    }
    for (const c of comparators) comps.set(c, (comps.get(c) ?? 0) + 1);
    return { run, storeNamed, productPageCited, productNamed: opts.namedRunIds.has(run.id), clarified: askedBack, others: rivals, comparators };
  });
  return {
    runs: views, withStore, withoutStore: runs.length - withStore, clarified,
    others: [...others.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    comparators: [...comps.entries()].map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count),
  };
}

export type Reason = { title: string; detail: string };

/**
 * Problemele din datele produsului (feed, pagină, stoc, preț spus greșit) care pot face AI-urile să aleagă pe altcineva.
 * Ce se vede în răspunsuri (comparatoare, pagini citite, prețuri) e în why.ts. Motive probabile, nu certitudini.
 */
export function likelyReasons(input: {
  inStock: boolean; openai: ChannelReport | null; openaiActive: boolean; google: ChannelReport | null; page: ChannelReport | null;
  wrongPrices: { provider: string; price: number }[];
}): Reason[] {
  const out: Reason[] = [];
  const bad = (r: ChannelReport | null, field: string) => r?.checks.find((c) => c.field === field && c.status !== "ok" && c.status !== "info");
  if (!input.inStock) out.push({ title: "Produsul e fără stoc", detail: "AI-urile recomandă de obicei ce se poate cumpăra acum, deci trimit la magazinele care îl au în stoc." });
  if (!input.openaiActive) out.push({ title: "ChatGPT nu primește feed-ul tău", detail: "Feed-ul ChatGPT nu e pornit în Echo. Fără el, ChatGPT află de produs doar din ce găsește pe internet." });
  else if (input.openai && !input.openai.included) out.push({ title: "Produsul nu e în feed-ul ChatGPT", detail: input.openai.reason ?? "" });
  const gtin = bad(input.openai, "gtin") ?? bad(input.google, "g:gtin");
  if (gtin) out.push({ title: "Lipsește EAN-ul (sau e greșit)", detail: "Fără EAN, ChatGPT, Google și comparatoarele nu pot lega oferta ta de același produs vândut de alții, așa că arată ofertele pe care le pot recunoaște." });
  const brand = bad(input.openai, "brand") ?? bad(input.google, "g:brand");
  if (brand) out.push({ title: "Lipsește marca", detail: "Cumpărătorii întreabă după marcă și model; fără marcă, produsul tău se potrivește mai greu cu întrebarea." });
  const title = bad(input.openai, "title");
  if (title) out.push({ title: "Titlul e mai slab decât al altora", detail: title.fix ?? "" });
  const desc = bad(input.openai, "description");
  if (desc) out.push({ title: "Descrierea e scurtă", detail: "AI-urile citează produsele despre care au ce spune: utilizare, specificații, ce e în cutie." });
  if (input.page && !input.page.included) out.push({ title: "Pagina produsului nu e citită bine", detail: input.page.reason ?? "" });
  for (const f of ["offers.price", "offers.availability", "gtin"]) {
    const c = bad(input.page, f);
    if (c && c.points > 0) out.push({ title: `Pagina și feed-ul nu se potrivesc (${c.label.toLowerCase()})`, detail: c.fix ?? "" });
  }
  const blocked = input.page?.checks.find((c) => c.field === "robots");
  if (blocked) out.push({ title: "Pagina refuză roboții", detail: blocked.fix ?? "" });
  if (input.wrongPrices.length) out.push({ title: "AI-ul are un preț greșit pentru tine", detail: "Cel puțin un AI spune alt preț decât cel din catalog. Un preț mai mare spus greșit te scoate din comparație." });
  return out;
}

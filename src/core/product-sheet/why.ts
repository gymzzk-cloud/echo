import type { ProductExample } from "../product-visibility";
import { pricesIn } from "../product-visibility";
import { isOwnBrand } from "../rivals";
import type { CompetitorView } from "./answers";
import { isComparator } from "./answers";

/**
 * „De ce nu ești recomandat și ce faci”: pentru un produs, doar din date deja salvate (răspunsurile AI, sursele
 * citate de ele, pagina citită, catalogul), fără întrebări noi către AI. Fiecare punct spune ce am văzut, de unde
 * (link spre dovadă) și ce poate face magazinul. Ce nu putem verifica e spus ca atare, nu ca problemă.
 * Funcție pură (testată în tests/product-why.test.ts).
 */

export type WhyLink = { href: string; label: string; external?: boolean };
export type WhyItem = { key: string; title: string; evidence: string; action: string; links: WhyLink[] };

export type WhyInput = {
  product: { price: number | null; currency: string; mpn: string | null; gtin: string | null; inStock: boolean };
  ownDomain: string;
  country: string | null;
  tracked: boolean;
  openaiActive: boolean;
  /** Ratingul din pagina produsului: `null` = pagina citită, fără rating; `undefined` = pagina necitită (nu știm). */
  pageRating: string | null | undefined;
  view: CompetitorView;
  examples: ProductExample[];
  providerLabel: (id: string) => string;
};

/** Sub atâta din prețul tău, un preț de pe rândul produsului e altceva (livrare, accesoriu), nu prețul produsului. */
const PRICE_MIN_RATIO = 0.5;
const PRICE_MAX_RATIO = 2;

const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
const fmt = (n: number, cur: string) => `${n.toLocaleString("ro-RO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${cur === "RON" ? "lei" : cur}`;

/** Prețurile scrise de AI pe rândurile care numesc produsul, la alte magazine (nu la tine). */
export function quotedPrices(examples: ProductExample[], ownPrice: number | null) {
  const out: { price: number; provider: string; runId: string }[] = [];
  const seen = new Set<string>();
  for (const e of examples) {
    if (e.withStore) continue;
    for (const { p } of pricesIn(e.snippet)) {
      if (ownPrice && (p.price < ownPrice * PRICE_MIN_RATIO || p.price > ownPrice * PRICE_MAX_RATIO)) continue;
      const k = `${e.runId}:${p.price}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ price: p.price, provider: e.provider, runId: e.runId });
    }
  }
  return out.sort((a, b) => a.price - b.price);
}

/** Căutarea pe comparator după cod, pe piața magazinului (compari.ro / arukereso.hu au aceeași căutare). */
export function comparatorSearch(domain: string, code: string) {
  const q = encodeURIComponent(code);
  if (/(^|\.)compari\.ro$/.test(domain)) return `https://www.compari.ro/CategorySearch.php?st=${q}`;
  if (/(^|\.)arukereso\.hu$/.test(domain)) return `https://www.arukereso.hu/CategorySearch.php?st=${q}`;
  const base = domain.split(".").slice(-2).join(".");
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${base} ${code}`)}`;
}
const baseDomain = (d: string) => d.split(".").slice(-2).join(".");

export function whyNotRecommended(input: WhyInput): WhyItem[] {
  const { view, product: p } = input;
  const out: WhyItem[] = [];
  const runs = view.runs;
  if (!runs.length) return out;
  const without = runs.filter((r) => !r.storeNamed && !r.productPageCited);
  if (!without.length) return out;
  const code = p.mpn || p.gtin || "";
  const self = (d: string) => isOwnBrand(d, input.ownDomain);

  // 1. Prețul: ce prețuri au scris AI-urile pentru produs, la alții, față de al tău.
  const quoted = quotedPrices(input.examples, p.price);
  if (quoted.length && p.price) {
    const min = quoted[0], max = quoted[quoted.length - 1];
    const list = quoted.slice(0, 4).map((q) => `${fmt(q.price, p.currency)} (${input.providerLabel(q.provider)})`).join(", ");
    const cheaper = p.price < min.price;
    out.push({
      key: "price",
      title: cheaper ? "Ai prețul mai mic decât cel spus de AI, dar AI-ul nu-ți știe oferta" : "AI-ul a găsit prețuri mai mici decât al tău",
      evidence: `Pentru acest produs, AI-urile au scris: ${list}. Prețul tău: ${fmt(p.price, p.currency)}.${cheaper ? "" : ` Cel mai mic spus de AI: ${fmt(min.price, p.currency)}.`}`,
      action: cheaper
        ? "AI-ul scrie prețurile din paginile pe care le citește în acel moment (lista de mai jos). Oferta ta ajunge în răspuns când apare într-una dintre ele, cu același cod și același preț ca pe site."
        : `Verifică oferta de ${fmt(min.price, p.currency)} în dovadă: dacă e același produs (același cod), AI-ul îl va recomanda pe cel mai ieftin.`,
      links: [...new Set([min.runId, max.runId])].map((id, i) => ({ href: `#dovada-${id}`, label: i ? "Încă o dovadă" : "Vezi unde a scris AI-ul prețul" })),
    });
  }

  // 2. Comparatoarele citate de AI: acolo AI-ul vede ofertele magazinelor listate.
  const comps = new Map<string, number>();
  for (const r of without) for (const c of r.comparators) comps.set(baseDomain(c), (comps.get(baseDomain(c)) ?? 0) + 1);
  for (const [domain, n] of [...comps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)) {
    out.push({
      key: `comparator:${domain}`,
      title: `AI-ul a citit comparatorul ${domain}`,
      evidence: `${domain} e printre sursele ${n === 1 ? "unui răspuns" : `a ${n} răspunsuri`} fără tine. E una dintre sursele AI-ului, nu singura. Nu verificăm automat ofertele de acolo (ar însemna cereri la site-ul lor): le vezi cu linkul de mai jos.`,
      action: `Dacă vrei să apari și în răspunsurile care citesc ${domain}, o cale e o ofertă listată acolo, cu același cod${code ? ` (${code})` : ""} și același preț ca pe site. Decizia e a ta: are cost și nu garantează recomandarea.`,
      links: code ? [{ href: comparatorSearch(domain, code), label: `Caută ${code} pe ${domain}`, external: true }] : [],
    });
  }

  // 3. Paginile citite de AI în răspunsurile fără tine (articole, top-uri, alte magazine): acolo trebuie să apari.
  const pages = new Map<string, { url: string; title: string; n: number }>();
  for (const r of without) for (const s of r.run.sources) {
    const h = hostOf(s.url);
    if (!h || self(h) || isComparator(h)) continue;
    const e = pages.get(h) ?? { url: s.url, title: s.title || h, n: 0 };
    e.n++;
    pages.set(h, e);
  }
  if (pages.size) {
    const top = [...pages.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5);
    out.push({
      key: "sources",
      title: `AI-ul s-a informat din ${pages.size} ${pages.size === 1 ? "site" : "site-uri"}, iar pagina ta nu e printre ele`,
      evidence: `În răspunsurile fără tine, sursele citate au fost: ${top.map(([h]) => h).join(", ")}${pages.size > top.length ? ` și încă ${pages.size - top.length}` : ""}. Asta arată de unde a citit AI-ul atunci, nu cât ești de prezent pe piață.`,
      action: "Deschide sursele și vezi ce au ele și pagina ta nu are (prețuri comparate, recenzii, „top 10”). Poți cere includerea în articolele relevante sau poți pune pe site un ghid scurt de alegere în care produsul apare cu prețul tău.",
      links: top.map(([h, e]) => ({ href: e.url, label: e.title.length > 70 ? `${e.title.slice(0, 70)}…` : e.title || h, external: true })),
    });
  }

  // 4. Răspunsuri fără nicio sursă citită: AI-ul numește magazinele pe care le știe deja.
  const noSources = without.filter((r) => !r.run.sources.length && r.others.length);
  if (noSources.length) {
    const who = [...new Set(noSources.map((r) => input.providerLabel(r.run.provider)))].join(", ");
    const names = [...new Set(noSources.flatMap((r) => r.others.slice(0, 4).map((o) => o.domain)))].slice(0, 6).join(", ");
    out.push({
      key: "authority",
      title: `${who} a recomandat magazine fără să citeze vreo pagină`,
      evidence: `A numit ${names} fără nicio sursă în răspuns, deci probabil din ce știa deja despre ele.`,
      action: "Aici contează cât de cunoscut e magazinul: recenzii pe Google și pe comparatoare, mențiuni în articole și pe forumuri. Vezi ce surse lipsesc în pagina Surse.",
      links: [{ href: "/panou/surse", label: "Deschide Surse" }],
    });
  }

  // 5. Fiecare AI care a răspuns și n-a numit deloc produsul. „Numit” = recunoscut la calculul pe produs, sau
  // magazinul numit, sau codul produsului scris în răspuns (calculul pe produs poate fi mai vechi decât răspunsul).
  const codes = [p.mpn, p.gtin].filter((c): c is string => !!c && c.length >= 4).map((c) => c.toLowerCase());
  const namesProduct = (r: (typeof runs)[number]) => r.productNamed || r.storeNamed || r.productPageCited || codes.some((c) => r.run.answer.toLowerCase().includes(c));
  const byProvider = new Map<string, { runs: number; named: number; queries: Set<string> }>();
  for (const r of runs) {
    const e = byProvider.get(r.run.provider) ?? { runs: 0, named: 0, queries: new Set<string>() };
    e.runs++;
    e.queries.add(r.run.query);
    if (namesProduct(r)) e.named++;
    byProvider.set(r.run.provider, e);
  }
  // 5b. AI-ul a vorbit despre produs, dar n-a recomandat niciun magazin (de obicei întreabă ce vrei: specificații, preț).
  const noShop = without.filter((r) => namesProduct(r) && !r.others.length);
  for (const provider of new Set(noShop.map((r) => r.run.provider))) {
    const r = noShop.find((x) => x.run.provider === provider)!;
    out.push({
      key: `noshop:${provider}`,
      title: `${input.providerLabel(provider)} a descris produsul, dar n-a recomandat niciun magazin`,
      evidence: `La „${r.run.query}” a răspuns despre produs fără să numească vreun magazin, nici pe tine, nici pe alții. Echo pune o singură întrebare; în aplicație, după un al doilea mesaj (de ex. „cumpărare”), ${input.providerLabel(provider)} poate arăta oferte.`,
      action: "Aici nu pierzi în fața altui magazin. Ca să măsurăm și intenția de cumpărare, adaugă în Setări o căutare cu prețul, de ex. „" + (code ? `${code} preț` : "numele produsului + preț") + "”.",
      links: [{ href: "/panou/setari", label: "Adaugă căutarea în Setări" }],
    });
  }
  for (const [provider, s] of byProvider) {
    if (s.named) continue;
    const isGpt = provider === "chatgpt";
    out.push({
      key: `silent:${provider}`,
      title: `${input.providerLabel(provider)} nu numește produsul`,
      evidence: `A răspuns de ${s.runs} ${s.runs === 1 ? "dată" : "ori"} la ${[...s.queries].slice(0, 3).map((q) => `„${q}”`).join(", ")} și n-a numit produsul. E răspunsul la aceste întrebări, nu la orice căutare: un cumpărător care scrie exact codul produsului poate vedea altceva.${isGpt ? ` Întrebăm ChatGPT prin API, cu căutare pe web din România; aplicația ChatGPT poate arăta altceva (carduri de produs, oferte din comparatoare${input.openaiActive ? ", feed-ul de produse" : ""}).` : ""}`,
      action: isGpt
        ? "ChatGPT recomandă din paginile pe care le găsește căutând pe web: aceleași surse de mai sus (comparatoare, articole). Pentru feed, verifică în ChatGPT Merchants (Business Hub) că ai ales România și RON la țări și monede."
        : "Acest AI caută pe web: apari dacă apari în paginile pe care le citește (vezi punctele de mai sus).",
      links: isGpt ? [{ href: "https://developers.openai.com/commerce/guides/submit-product-feeds", label: "Ghidul OpenAI pentru feed", external: true }] : [],
    });
  }

  // 6. Recenzii: doar când am citit pagina și nu are rating (altfel nu știm).
  if (input.pageRating === null) {
    out.push({
      key: "reviews",
      title: "Pagina produsului nu are recenzii",
      evidence: "Am citit pagina: nu are rating (schema.org AggregateRating). AI-urile citează des surse cu păreri de la cumpărători.",
      action: "Cere o recenzie după fiecare livrare și arată ratingul pe pagină, cu date structurate. Același rating se poate trimite și în feed-ul ChatGPT (câmpurile review_count și star_rating).",
      links: [],
    });
  }

  // 7. Nu întrebăm direct despre produs: apare doar întâmplător, la întrebări generale.
  if (!input.tracked && p.inStock) {
    out.push({
      key: "track",
      title: "AI-urile nu sunt întrebate direct despre acest produs",
      evidence: "L-am găsit doar în răspunsuri la întrebări generale. Nu știm ce spun AI-urile când un cumpărător caută exact produsul.",
      action: "Apasă „Urmărește în AI” sus: îl întrebăm direct la următoarea analiză, cu bugetul obișnuit.",
      links: [],
    });
  }
  return out;
}

import { storeSearchName, type PromptIntent } from "../prompts";
import { TRIAL_QUESTIONS, type Focus, type Market } from "./types";

/**
 * Întrebările testului gratuit, din profilul confirmat de magazin (fără catalog): categorii, mărci, produse puse în față.
 * Scrise cum caută un cumpărător; accentul (caută / compară / cumpără) schimbă proporțiile, nu tonul.
 * Pure și deterministe: aceleași date dau aceleași întrebări (le poate vedea și corecta înainte de rulare).
 */
export type TrialPrompt = { text: string; category: string; intent: PromptIntent; language: "ro" | "hu"; source: "categorie" | "produs" | "comparatie" | "magazin" | "local" };
export type TrialInput = { storeName: string; categories: string[]; brands: string[]; products: string[]; focus: Focus; markets: Market[]; city?: string; total?: number };

type Kind = "research" | "compare" | "buy" | "product";
const MIX: Record<Focus, Record<Kind, number>> = {
  research: { research: 0.45, compare: 0.2, buy: 0.2, product: 0.15 },
  compare: { research: 0.15, compare: 0.45, buy: 0.2, product: 0.2 },
  buy: { research: 0.15, compare: 0.15, buy: 0.4, product: 0.3 },
};

const lc = (t: string) => t.toLocaleLowerCase("ro-RO");

function roCandidates(i: TrialInput): Record<Kind, TrialPrompt[]> {
  const cats = i.categories.map((c) => ({ c, t: lc(c) }));
  const b = i.brands;
  const research = cats.flatMap(({ c, t }) => [
    { text: `cum aleg ${t}`, category: c, intent: "informativ" as const },
    { text: `care sunt cele mai bune ${t}`, category: c, intent: "comercial" as const },
  ]);
  const compare = [
    ...cats.flatMap(({ c, t }, k) => (b.length >= 2 ? [{ text: `${t} ${b[k % b.length]} sau ${b[(k + 1) % b.length]}, ce să aleg?`, category: c, intent: "comercial" as const }] : [])),
    ...i.products.slice(0, 6).flatMap((p, k, arr) => (k % 2 === 0 && arr[k + 1] ? [{ text: `${p} sau ${arr[k + 1]}?`, category: "produse", intent: "comercial" as const }] : [])),
  ];
  const buy = cats.flatMap(({ c, t }) => [
    { text: `de unde pot cumpăra online ${t}`, category: c, intent: "cumparare" as const },
    { text: `${t} la cel mai bun preț`, category: c, intent: "cumparare" as const },
  ]);
  const product = i.products.flatMap((p) => [
    { text: p, category: "produse", intent: "produs" as const },
    { text: `${p} preț`, category: "produse", intent: "cumparare" as const },
  ]);
  const tag = (xs: Omit<TrialPrompt, "language" | "source">[], source: TrialPrompt["source"]) => xs.map((x) => ({ ...x, language: "ro" as const, source }));
  return { research: tag(research, "categorie"), compare: tag(compare, "comparatie"), buy: tag(buy, "categorie"), product: tag(product, "produs") };
}

/** În maghiară doar ce nu cere traducere: numele produselor și mărcilor, plus întrebările despre magazin. */
function huCandidates(i: TrialInput): TrialPrompt[] {
  const out: TrialPrompt[] = [];
  for (const p of i.products) out.push({ text: `${p} ár`, category: "produse", intent: "cumparare", language: "hu", source: "produs" });
  if (i.brands.length >= 2) out.push({ text: `${i.brands[0]} vagy ${i.brands[1]}, melyiket válasszam?`, category: "mărci", intent: "comercial", language: "hu", source: "comparatie" });
  for (const p of i.products) out.push({ text: p, category: "produse", intent: "produs", language: "hu", source: "produs" });
  return out;
}

function storeQuestions(name: string, lang: "ro" | "hu"): TrialPrompt[] {
  const s = storeSearchName(name);
  return lang === "hu"
    ? [{ text: `${s} vélemények`, category: "magazin", intent: "brand", language: "hu", source: "magazin" }]
    : [
      { text: `${s} păreri clienți`, category: "magazin", intent: "brand", language: "ro", source: "magazin" },
      { text: `${s} livrare și retur`, category: "magazin", intent: "brand", language: "ro", source: "magazin" },
    ];
}

export function buildTrialPrompts(i: TrialInput): TrialPrompt[] {
  const total = i.total ?? TRIAL_QUESTIONS;
  const seen = new Set<string>();
  const out: TrialPrompt[] = [];
  const push = (x: TrialPrompt) => {
    const k = `${x.language}|${lc(x.text)}`;
    if (out.length >= total || seen.has(k) || x.text.length < 3) return false;
    seen.add(k); out.push(x); return true;
  };
  const ro = i.markets.includes("RO") || !i.markets.length;
  const hu = i.markets.includes("HU");
  // 1. Despre magazin (fixe), apoi întrebările locale, dacă are magazin fizic.
  if (ro) storeQuestions(i.storeName, "ro").forEach(push);
  if (hu) storeQuestions(i.storeName, "hu").forEach(push);
  if (i.city && ro) {
    const first = i.categories[0] ? lc(i.categories[0]) : "magazin";
    push({ text: `${first} ${i.city}`, category: "local", intent: "cumparare", language: "ro", source: "local" });
    push({ text: `magazin ${first} ${i.city} ridicare personală`, category: "local", intent: "cumparare", language: "ro", source: "local" });
  }
  // 2. Piața a doua primește cel mult o treime din rest.
  if (hu) {
    const room = ro ? Math.floor((total - out.length) / 3) : total - out.length;
    let n = 0;
    for (const x of huCandidates(i)) { if (n >= room) break; if (push(x)) n++; }
  }
  // 3. Româna: cote pe tip, după accentul ales; ce rămâne neacoperit se umple din celelalte tipuri.
  if (ro) {
    const room = total - out.length;
    const c = roCandidates(i);
    const kinds = Object.keys(MIX[i.focus]) as Kind[];
    const quota = Object.fromEntries(kinds.map((k) => [k, Math.round(room * MIX[i.focus][k])])) as Record<Kind, number>;
    const pos: Record<Kind, number> = { research: 0, compare: 0, buy: 0, product: 0 };
    const take = (k: Kind) => { while (pos[k] < c[k].length) { if (push(c[k][pos[k]++])) return true; } return false; };
    // Pe rând, câte una din fiecare tip, cât timp tipul mai are cotă: lista amestecă domeniile, nu le pune în bloc.
    let progress = true;
    while (out.length < total && progress) {
      progress = false;
      for (const k of kinds) if (quota[k] > 0 && out.length < total && take(k)) { quota[k]--; progress = true; }
    }
    for (const k of kinds) while (out.length < total && take(k)) { /* completare */ }
  }
  return out;
}

import { storeSearchName, type PromptIntent } from "../prompts";
import { TRIAL_QUESTIONS, type Focus, type Market } from "./types";

/**
 * Întrebările testului gratuit, din produsele confirmate de magazin (fără catalog încă): doar întrebări punctuale despre
 * produse reale (numele exact, „preț”, comparații între două produse), plus întrebările despre magazin.
 * Fără întrebări generale pe categorii („cum aleg …”, „… la cel mai bun preț”): KNOWLEDGE A16, ZoZo 24.11.2026.
 * Pure și deterministe: aceleași date dau aceleași întrebări (le poate vedea și corecta înainte de rulare).
 * `focus`, `categories` și `city` rămân în profil, dar nu mai creează întrebări.
 */
export type TrialPrompt = { text: string; category: string; intent: PromptIntent; language: "ro" | "hu"; source: "categorie" | "produs" | "comparatie" | "magazin" | "local" };
export type TrialInput = { storeName: string; categories: string[]; brands: string[]; products: string[]; focus: Focus; markets: Market[]; city?: string; total?: number };

const lc = (t: string) => t.toLocaleLowerCase("ro-RO");

/** Întâi „<produs> preț” pentru fiecare produs (intenția de cumpărare), apoi numele simplu, apoi comparațiile. */
function productCandidates(products: string[], lang: "ro" | "hu"): TrialPrompt[] {
  const price = lang === "hu" ? "ár" : "preț";
  const tag = (text: string, intent: PromptIntent, source: TrialPrompt["source"]): TrialPrompt => ({ text, category: "produse", intent, language: lang, source });
  return [
    ...products.map((p) => tag(`${p} ${price}`, "cumparare", "produs")),
    ...products.map((p) => tag(p, "produs", "produs")),
    ...products.flatMap((p, k, arr) => (k % 2 === 0 && arr[k + 1] ? [tag(lang === "hu" ? `${p} vagy ${arr[k + 1]}?` : `${p} sau ${arr[k + 1]}?`, "comercial", "comparatie")] : [])),
  ];
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
  // 1. Despre magazin (fixe).
  if (ro) storeQuestions(i.storeName, "ro").forEach(push);
  if (hu) storeQuestions(i.storeName, "hu").forEach(push);
  // 2. Piața a doua primește cel mult o treime din rest.
  if (hu) {
    const room = ro ? Math.floor((total - out.length) / 3) : total - out.length;
    let n = 0;
    for (const x of productCandidates(i.products, "hu")) { if (n >= room) break; if (push(x)) n++; }
  }
  // 3. Româna: restul, doar despre produse.
  if (ro) for (const x of productCandidates(i.products, "ro")) push(x);
  return out;
}

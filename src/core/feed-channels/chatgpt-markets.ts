/**
 * Unde poate un magazin să-și pună produsele în ChatGPT (KNOWLEDGE B57).
 * - ChatGPT Merchants (listări gratuite în aplicație): la 24.11.2026, OpenAI îl are deschis doar în SUA (formatul
 *   feed-ului mai cunoaște Canada și Mexic). România și Ungaria nu sunt acceptate, deci nu-l recomandăm acolo.
 * - ChatGPT Ads Manager (reclame din feed): același feed, disponibil și în UE. Asta rămâne de făcut cu feed-ul.
 * Când OpenAI deschide Merchants într-o țară nouă, se adaugă aici și panoul se schimbă singur pentru toți clienții.
 */
export const MERCHANTS_COUNTRIES = new Set(["US"]);

export const merchantsOpen = (country: string | null | undefined) => MERCHANTS_COUNTRIES.has((country ?? "").toUpperCase());

export const countryName = (country: string | null | undefined) => ({ RO: "România", HU: "Ungaria" } as Record<string, string>)[(country ?? "").toUpperCase()] ?? (country ?? "țara ta");

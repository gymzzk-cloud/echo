import * as cheerio from "cheerio";
import { politeFetch } from "../connectors/polite";
import type { FeedOutputSettings } from "@/db/schema";

/**
 * Paginile de retur, confidențialitate și termeni, găsite automat în linkurile de pe prima pagină a magazinului
 * (de obicei în subsol). O singură cerere, cel mult o dată pe săptămână; magazinul poate scrie altă adresă în panou.
 */
type Kind = "returnPolicyUrl" | "privacyPolicyUrl" | "termsUrl";
const PATTERNS: Record<Kind, RegExp> = {
  returnPolicyUrl: /retur|return|visszak[uü]ld|elall[aá]s|el[aá]ll[aá]s|garancia/i,
  privacyPolicyUrl: /confiden[tț]ialitate|gdpr|privacy|adatv[eé]delem|date[- ]personale|protectia[- ]datelor/i,
  termsUrl: /termeni|conditii|condi[tț]ii|terms|[aá]szf|felhaszn[aá]l[aá]si/i,
};

export function detectPolicyLinks(html: string, baseUrl: string): Partial<Record<Kind, string>> {
  const $ = cheerio.load(html);
  const found: Partial<Record<Kind, string>> = {};
  const host = new URL(baseUrl).host;
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    let abs: URL;
    try { abs = new URL(href, baseUrl); } catch { return; }
    if (!/^https?:$/.test(abs.protocol) || abs.host !== host) return;
    const hay = `${$(a).text()} ${abs.pathname}`;
    for (const k of Object.keys(PATTERNS) as Kind[]) {
      // Termenii se potrivesc des și cu „Condiții de retur”: îi luăm doar dacă linkul nu e despre retur.
      if (k === "termsUrl" && PATTERNS.returnPolicyUrl.test(hay)) continue;
      if (!found[k] && PATTERNS[k].test(hay)) found[k] = abs.href.split("#")[0];
    }
  });
  return found;
}

const WEEK = 7 * 864e5;

/** Completează adresele lipsă din prima pagină a magazinului, dacă n-am mai căutat în ultima săptămână. */
export async function withDetectedPolicyLinks(s: FeedOutputSettings | null, storeUrl: string): Promise<FeedOutputSettings | null> {
  const cur = s ?? {};
  const complete = cur.returnPolicyUrl && cur.privacyPolicyUrl && cur.termsUrl;
  if (complete || (cur.detectedAt && Date.now() - Date.parse(cur.detectedAt) < WEEK)) return s;
  try {
    const r = await politeFetch(storeUrl, { timeoutMs: 20000 });
    const found = r.ok ? detectPolicyLinks(await r.text(), r.url || storeUrl) : {};
    return { ...cur, detected: found, detectedAt: new Date().toISOString() };
  } catch {
    return { ...cur, detectedAt: new Date().toISOString() };
  }
}

/** Ce intră în feed: adresa scrisă de magazin are prioritate, altfel cea găsită automat. */
export const effectivePolicy = (s: FeedOutputSettings | null): FeedOutputSettings => ({
  returnWindowDays: s?.returnWindowDays,
  returnPolicyUrl: s?.returnPolicyUrl || s?.detected?.returnPolicyUrl,
  privacyPolicyUrl: s?.privacyPolicyUrl || s?.detected?.privacyPolicyUrl,
  termsUrl: s?.termsUrl || s?.detected?.termsUrl,
});

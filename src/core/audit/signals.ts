import type * as cheerio from "cheerio";
import type { SitemapProbe } from "./sitemap";

/**
 * Semnale din pagini pe care le citim „cu grijă”: când nu le găsim sigur, spunem „nu am putut verifica”,
 * nu „lipsește” (KNOWLEDGE A0, B29, B32).
 */

/** Probe de sitemap care nu spun nimic despre existența lui: n-a răspuns, eroare de rețea, firewall. */
export const UNSURE_PROBES = new Set<SitemapProbe["kind"]>(["timeout", "error", "blocked"]);

/** Niciun sitemap găsit, dar măcar un loc nu a putut fi citit: nu știm sigur că lipsește. */
export function sitemapUnsure(probes: SitemapProbe[]) {
  return probes.some((p) => UNSURE_PROBES.has(p.kind));
}

/** CUI (RO12345678, CUI: 12345678, CIF …) și trimiterea la ANPC / SOL (soluționarea online a litigiilor). */
export function legalSignals(html: string): { cui?: string; anpc: boolean } {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const labeled = text.match(/\b(?:CUI|C\.U\.I\.?|CIF|C\.I\.F\.?|Cod fiscal|Cod unic de înregistrare|Adószám)\s*:?\s*(RO)?\s?(\d{2,10}(?:-\d-\d{2})?)/i);
  // Lângă numărul de la Registrul Comerțului (J05/1646/2004), CUI-ul apare des fără etichetă: „RO16766463”.
  const nearReg = /\bJ\d{2}\/\d+\/\d{4}\b/.test(text) ? text.match(/\bRO\s?(\d{6,10})\b/) : null;
  const cui = labeled ? `${labeled[1] ?? ""}${labeled[2]}` : nearReg ? `RO${nearReg[1]}` : undefined;
  const anpc = /anpc\.ro|anpc\.gov\.ro|ec\.europa\.eu\/consumers\/odr|consumer-redress\.ec\.europa\.eu/i.test(html);
  return { cui, anpc };
}

/** Paginile unde stau de obicei datele firmei: Termeni și Contact (cel mult 2, din linkurile primei pagini). */
export function trustPages($: cheerio.CheerioAPI, origin: string, pathPrefix: string, max = 2): string[] {
  const found: string[] = [];
  const want = [/termeni|conditii|condiții|aszf|felhasznalasi/i, /contact|kapcsolat|impresszum|despre/i];
  for (const re of want) {
    $("a[href]").each((_, a) => {
      if (found.length >= max) return false;
      const href = $(a).attr("href") ?? "";
      if (!re.test(href) && !re.test($(a).text())) return;
      try {
        const u = new URL(href, origin + (pathPrefix || "") + "/");
        if (u.origin !== origin || found.includes(u.toString())) return;
        found.push(u.toString());
        return false;
      } catch { return; }
    });
  }
  return found.slice(0, max);
}

/**
 * Cuvintele descrierii unui produs: câmpul standard de descriere, plus tab-urile obișnuite
 * („Descriere”, „Detalii tehnice”, „Avantaje”, „Conținut pachet”). 0 = nu am recunoscut unde stă descrierea.
 */
export function productDescriptionWords($: cheerio.CheerioAPI): number {
  const sel = [
    '[itemprop="description"]', ".product-description", "#description", ".woocommerce-Tabs-panel--description", ".product__description",
    "#tab-description", ".tab-description", "#descriere", ".descriere", "#product-description", "[id*=specs]", "[class*=specs]", "[id*=avantaje]", "[class*=avantaje]",
  ].join(", ");
  const parts = new Set<string>();
  $(sel).each((_, e) => { parts.add($(e).text().replace(/\s+/g, " ").trim()); });
  // Titlurile de secțiune obișnuite: luăm textul blocului de după titlu.
  $("h2, h3, h4, .tab-title, [role=tab]").each((_, h) => {
    if (!/^(descriere|detalii tehnice|specificații|avantaje|conținut pachet|leírás|termékleírás|műszaki adatok)$/i.test($(h).text().trim())) return;
    const next = $(h).next();
    if (next.length) parts.add(next.text().replace(/\s+/g, " ").trim());
  });
  return [...parts].join(" ").split(/\s+/).filter(Boolean).length;
}

import * as cheerio from "cheerio";

/**
 * Citirea automată a condițiilor magazinului (retur, plată, livrare, întrebări frecvente) din paginile lui.
 * Fără AI: găsim pagina după link (subsol, meniu, sitemap) și păstrăm doar frazele relevante.
 * Funcțiile de aici sunt pure (primesc HTML, întorc date), ca să poată fi testate fără rețea.
 */
export type PolicyKind = "returns" | "payment" | "delivery" | "faq";
export type FaqItem = { q: string; a: string };
export type StorePolicies = {
  checkedAt: string;
  error?: string;
  returns?: { url: string; days?: number; text: string };
  payment?: { url?: string; methods: string[]; text?: string };
  delivery?: { url: string; text: string; freeOver?: string };
  faq?: { url: string; items: FaqItem[] };
  catalogDelivery?: string; // rezumatul termenelor din catalog, recalculat după fiecare sincronizare
};

// Textul linkului sau adresa lui (RO și HU). Ordinea contează: prima potrivire câștigă pentru fiecare tip.
const LINK_PATTERNS: Record<PolicyKind, RegExp> = {
  returns: /politic[aă][- ]de[- ]retur|retur(n(are|ari))?\b|drept(ul)?[- ]de[- ]retragere|el[aá]ll[aá]s|visszak[uü]ld|visszav[aá]lt|elallas/i,
  payment: /metode[- ]de[- ]plat|modalit[aă](ț|t)i[- ]de[- ]plat|\bplat[aă]\b|fizet[eé]s|fizetesi/i,
  delivery: /livrare|livrarea|transport|expediere|sz[aá]ll[ií]t[aá]s|szallitas/i,
  faq: /[iî]ntreb[aă]ri[- ]frecvente|intrebari-frecvente|\bfaq\b|gyakori[- ]k[eé]rd[eé]s|\bgyik\b/i,
};
const NOT_POLICY = /categor|produs|product|cart|\bcos\b|cos-|checkout|account|cont\/|login|blog|platform|kosar/i;

/** Linkurile către paginile de condiții, din HTML-ul paginii principale. Preferăm subsolul și linkurile sub subfolderul magazinului. */
export function findPolicyLinks(html: string, base: string): Partial<Record<PolicyKind, string>> {
  const $ = cheerio.load(html);
  const baseUrl = new URL(base);
  const prefix = baseUrl.pathname.replace(/\/+$/, "");
  const found: Partial<Record<PolicyKind, { url: string; score: number }>> = {};
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    let abs: URL;
    try { abs = new URL(href, base.endsWith("/") ? base : base + "/"); } catch { return; }
    if (abs.host !== baseUrl.host || !/^https?:$/.test(abs.protocol)) return;
    const text = $(a).text().replace(/\s+/g, " ").trim();
    if (text.length > 60) return; // un link de condiții are un text scurt
    const path = decodeURIComponent(abs.pathname);
    if (NOT_POLICY.test(path)) return;
    const inFooter = $(a).closest("footer, [class*=footer], [id*=footer]").length > 0;
    const inPrefix = !prefix || path.startsWith(prefix);
    for (const kind of Object.keys(LINK_PATTERNS) as PolicyKind[]) {
      const byText = LINK_PATTERNS[kind].test(text);
      const byPath = LINK_PATTERNS[kind].test(path);
      if (!byText && !byPath) continue;
      const score = (byText ? 2 : 0) + (byPath ? 1 : 0) + (inFooter ? 2 : 0) + (inPrefix ? 3 : 0);
      abs.hash = "";
      if (!found[kind] || score > found[kind]!.score) found[kind] = { url: abs.toString(), score };
    }
  });
  return Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v!.url])) as Partial<Record<PolicyKind, string>>;
}

/** Același lucru, din lista de adrese a unui sitemap (când pagina principală nu are linkurile). */
export function findPolicyLinksInSitemap(urls: string[], base: string): Partial<Record<PolicyKind, string>> {
  const baseUrl = new URL(base);
  const prefix = baseUrl.pathname.replace(/\/+$/, "");
  const out: Partial<Record<PolicyKind, string>> = {};
  for (const u of urls) {
    let abs: URL;
    try { abs = new URL(u); } catch { continue; }
    if (abs.host !== baseUrl.host) continue;
    const path = decodeURIComponent(abs.pathname);
    if (NOT_POLICY.test(path) || (prefix && !path.startsWith(prefix))) continue;
    for (const kind of Object.keys(LINK_PATTERNS) as PolicyKind[]) {
      if (!out[kind] && LINK_PATTERNS[kind].test(path)) out[kind] = abs.toString();
    }
  }
  return out;
}

/** Adresele dintr-un sitemap XML (fișier simplu sau index de sitemap-uri). */
export function sitemapLocs(xml: string) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&")).slice(0, 50_000);
}

/** Paragrafele de conținut ale unei pagini (fără meniu, antet, subsol, scripturi). */
export function contentBlocks(html: string): string[] {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, header, footer, form, iframe, [class*=cookie], [id*=cookie], [class*=menu], [class*=newsletter]").remove();
  const root = $("main, article, [role=main], #content, .content, .page-content, .cms-content").first();
  const scope = root.length ? root : $("body");
  const blocks: string[] = [];
  scope.find("p, li, h1, h2, h3, h4, td, dd, dt, summary").each((_, el) => {
    if ($(el).find("p, li").length) return; // doar elementele „frunză”, ca să nu dublăm textul
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length >= 3 && t.length <= 1200) blocks.push(t);
  });
  return [...new Set(blocks)];
}

const pick = (blocks: string[], re: RegExp, max: number, maxChars: number) => {
  const out: string[] = [];
  let len = 0;
  for (const b of blocks) {
    if (!re.test(b) || b.length < 25) continue;
    if (len + b.length > maxChars) { if (!out.length) out.push(b.slice(0, maxChars - 1) + "…"); break; }
    out.push(b); len += b.length;
    if (out.length >= max) break;
  }
  return out.join(" ");
};

const RETURN_WORDS = /retur|retrage|returna|rambursa|restitui|el[aá]ll|visszak[uü]ld|visszat[eé]r[ií]t|visszaad/i;

/** Termenul de retur în zile: primul număr de zile dintr-o frază despre retur (ex. „30 de zile”, „14 napon belül”). */
export function returnDays(blocks: string[]): number | undefined {
  for (const b of blocks) {
    if (!RETURN_WORDS.test(b)) continue;
    const m = b.match(/(\d{1,3})\s*(?:\(\w+\)\s*)?(?:de\s+)?(?:zile|zi\b|napon|nap\b|napig|days)/i);
    if (m) { const n = Number(m[1]); if (n >= 1 && n <= 365) return n; }
  }
  return undefined;
}

export function extractReturns(html: string, url: string): StorePolicies["returns"] {
  const blocks = contentBlocks(html);
  const text = pick(blocks, RETURN_WORDS, 4, 700);
  if (!text) return undefined;
  return { url, days: returnDays(blocks), text };
}

const PAYMENT_METHODS: [string, RegExp][] = [
  ["card", /\bcard(ul)?\b|visa|mastercard|maestro|bankk[aá]rty|k[aá]rty[aá]s/i],
  ["ramburs", /ramburs|plat[aă] la livrare|la primirea coletului|ut[aá]nv[eé]t|[aá]tv[eé]telkor/i],
  ["transfer bancar", /transfer bancar|ordin de plat|banki [aá]tutal|[aá]tutal[aá]s/i],
  ["rate", /\b(în|in) rate\b|rate f[aă]r[aă] dobând|\btbi\b|mokka|cetelem|brd finance|star bt|card avantaj|r[eé]szlet/i],
  ["PayPal", /paypal/i],
  ["Apple Pay", /apple\s?pay/i],
  ["Google Pay", /google\s?pay/i],
  ["numerar", /numerar|cash\b|k[eé]szp[eé]nz/i],
];

/** Metodele de plată menționate într-un text (pagina de plată sau, dacă lipsește, pagina principală). */
export function paymentMethods(text: string) {
  return PAYMENT_METHODS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

/** Textul vizibil al întregii pagini, cu subsolul și textul alternativ al logo-urilor (ex. „Visa”, „PayPal”). */
function wholeText(html: string) {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();
  const alts = $("img[alt], img[title]").map((_, i) => `${$(i).attr("alt") ?? ""} ${$(i).attr("title") ?? ""}`).get().join(" ");
  return `${$("body").text()} ${alts}`.replace(/\s+/g, " ");
}

/** Cu pagina de plată: metodele și frazele din ea. Fără ea: doar metodele, din toată pagina principală (logo-urile din subsol). */
export function extractPayment(html: string, url?: string): StorePolicies["payment"] {
  const blocks = contentBlocks(html);
  const methods = paymentMethods(url ? blocks.join(" ") : wholeText(html));
  if (!methods.length) return undefined;
  const text = url ? pick(blocks, /plat|card|ramburs|transfer|rate|fizet|k[aá]rty|ut[aá]nv[eé]t/i, 4, 500) : undefined;
  return { url, methods, text: text || undefined };
}

/** Pragul de transport gratuit, dacă e scris pe pagină (ex. „gratuit peste 300 lei”, „20 000 Ft felett ingyenes”). */
export function freeShippingThreshold(text: string): string | undefined {
  const ro = text.match(/(?:transport|livrare)[^.]{0,40}gratuit[aă]?[^.]{0,30}?(?:peste|de la|pentru comenzi (?:de )?peste)\s*([\d.,\s]{1,9}\d)\s*(lei|ron)/i)
    ?? text.match(/gratuit[aă]?[^.]{0,30}?(?:peste|de la)\s*([\d.,\s]{1,9}\d)\s*(lei|ron)/i);
  if (ro) return `${ro[1].trim()} lei`;
  const hu = text.match(/([\d .]{1,9}\d)\s*(?:Ft|HUF)[^.]{0,30}(?:felett|f[eö]l[eö]tt|t[oő]l)[^.]{0,30}ingyenes/i)
    ?? text.match(/ingyenes[^.]{0,40}?([\d .]{1,9}\d)\s*(?:Ft|HUF)/i);
  if (hu) return `${hu[1].trim()} Ft`;
  return undefined;
}

export function extractDelivery(html: string, url: string): StorePolicies["delivery"] {
  const blocks = contentBlocks(html);
  const text = pick(blocks, /livr|transport|curier|expedi|ridicare|easybox|sz[aá]ll[ií]t|fut[aá]r|csomag/i, 4, 600);
  if (!text) return undefined;
  return { url, text, freeOver: freeShippingThreshold(blocks.join(" ")) };
}

/** Întrebările frecvente: întâi din datele structurate (FAQPage), apoi din elemente <details>, apoi din titluri care se termină cu „?”. */
export function extractFaq(html: string, url: string, max = 40): StorePolicies["faq"] {
  const $ = cheerio.load(html);
  const items: FaqItem[] = [];
  const add = (q: string, a: string) => {
    q = q.replace(/\s+/g, " ").trim().slice(0, 200);
    a = cheerio.load(`<div>${a}</div>`).text().replace(/\s+/g, " ").trim().slice(0, 800);
    if (q.length > 5 && a.length > 2 && !items.some((x) => x.q === q)) items.push({ q, a });
  };
  $('script[type="application/ld+json"]').each((_, s) => {
    try {
      const data = JSON.parse($(s).text());
      const nodes: Record<string, unknown>[] = (Array.isArray(data) ? data : [data]).flatMap((d) => (d?.["@graph"] as Record<string, unknown>[]) ?? [d]);
      for (const n of nodes) {
        const t = n?.["@type"];
        if (t !== "FAQPage" && !(Array.isArray(t) && t.includes("FAQPage"))) continue;
        for (const e of (n.mainEntity as { name?: string; acceptedAnswer?: { text?: string } }[]) ?? []) add(String(e.name ?? ""), String(e.acceptedAnswer?.text ?? ""));
      }
    } catch { /* JSON-LD invalid: îl ignorăm */ }
  });
  if (!items.length) $("details").each((_, d) => { const q = $(d).find("summary").first().text(); $(d).find("summary").remove(); add(q, $(d).html() ?? ""); });
  if (!items.length) {
    $("script, style, nav, header, footer").remove();
    $("h2, h3, h4, h5, dt, strong, b").each((_, h) => {
      const q = $(h).text().trim();
      if (!q.endsWith("?") || q.length > 200) return;
      const next = $(h).is("strong, b") ? $(h).parent().nextAll().first() : $(h).nextAll().first();
      add(q, next.html() ?? next.text());
    });
  }
  return items.length ? { url, items: items.slice(0, max) } : undefined;
}

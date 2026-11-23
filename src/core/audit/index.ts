import * as cheerio from "cheerio";
import { parseStoreUrl } from "@/lib/util";
import { extractHomeCatalog, type HomeCatalog } from "../onboarding/home";
import { describeProductFields, isType, jsonLdNodes, missingProductFields, ORG_TYPES, productFields, sdSummary, structuredData, type SdEntity } from "./structured";
import { findSitemap, productLikeUrls } from "./sitemap";
import { legalSignals, productDescriptionWords, sitemapUnsure, trustPages, UNSURE_PROBES } from "./signals";

/**
 * Auditul tehnic: verifică dacă AI-urile pot citi și înțelege magazinul.
 * Totul din date publice, fără acces la contul magazinului.
 */

export const AI_BOTS = [
  { ua: "GPTBot", vendor: "OpenAI", purpose: "antrenare", important: false },
  { ua: "OAI-SearchBot", vendor: "OpenAI", purpose: "căutare în ChatGPT", important: true },
  { ua: "ChatGPT-User", vendor: "OpenAI", purpose: "vizite la cererea utilizatorului", important: true },
  { ua: "Googlebot", vendor: "Google", purpose: "Google Search, AI Overviews, AI Mode", important: true },
  { ua: "Google-Extended", vendor: "Google", purpose: "Gemini (antrenare și grounding)", important: true },
  { ua: "PerplexityBot", vendor: "Perplexity", purpose: "căutare Perplexity", important: true },
  { ua: "Perplexity-User", vendor: "Perplexity", purpose: "vizite la cererea utilizatorului", important: true },
  { ua: "ClaudeBot", vendor: "Anthropic", purpose: "antrenare", important: false },
  { ua: "Claude-SearchBot", vendor: "Anthropic", purpose: "căutare în Claude", important: true },
  { ua: "Claude-User", vendor: "Anthropic", purpose: "vizite la cererea utilizatorului", important: true },
  { ua: "Bingbot", vendor: "Microsoft", purpose: "Bing și Copilot", important: true },
  { ua: "Applebot-Extended", vendor: "Apple", purpose: "Apple Intelligence", important: false },
  { ua: "meta-externalagent", vendor: "Meta", purpose: "Meta AI", important: false },
  { ua: "Amazonbot", vendor: "Amazon", purpose: "Alexa / Rufus", important: false },
  { ua: "CCBot", vendor: "Common Crawl", purpose: "date pentru multe modele", important: false },
] as const;

/**
 * „unknown” = nu am putut verifica (timeout, firewall, eroare de rețea, pagină pe care nu o recunoaștem).
 * Regula (KNOWLEDGE A0): o verificare nesigură nu spune niciodată „lipsește”; nu intră în scor și nu creează acțiuni.
 */
export type CheckStatus = "pass" | "warn" | "fail" | "info" | "unknown";
export type Check = {
  id: string;
  group: "acces" | "date" | "continut" | "incredere" | "viteza";
  title: string;
  status: CheckStatus;
  detail: string;
  fixKind?: "robots" | "llms" | "jsonld" | "content" | "cloudflare" | "sitemap";
  weight: number;
  /** Ce am găsit și unde, ca magazinul să poată verifica singur (adresa, ce era acolo). */
  evidence?: Evidence[];
  /** Câmpurile care lipsesc, pentru „Rezolvă” (ex. pentru jsonld: ["Organization"] sau câmpurile Product). */
  missing?: string[];
};
export type Evidence = { label: string; value: string; url?: string; ok?: boolean };
export type AuditResult = {
  url: string;
  domain: string;
  fetchedAt: string;
  score: number;
  checks: Check[];
  bots: { ua: string; vendor: string; purpose: string; important: boolean; robots: "allowed" | "blocked" | "partial"; http?: number }[];
  facts: StoreFacts;
  productUrl?: string;
  sitemapUrl?: string; // sitemap-ul găsit (din robots.txt sau din locurile obișnuite)
  platform?: string;
  error?: string;
  reusedFacts?: string[]; // date stabile luate din verificarea anterioară (site-ul nu le-a mai arătat acum)
  home?: HomeCatalog; // categoriile, mărcile și produsele de pe prima pagină (propunere pentru profilul din onboarding)
};
export type StoreFacts = {
  title?: string;
  description?: string;
  lang?: string;
  cui?: string;
  hasReturnPolicy: boolean;
  hasTerms: boolean;
  hasContact: boolean;
  hasAnpc: boolean;
  trustmarks: string[];
  socials: string[];
  organization?: { name?: string; telephone?: string; email?: string };
};

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const OUR_UA = "EchoAuditBot/1.0 (+https://echo.ai/bot; audit vizibilitate AI)";

async function get(url: string, ua = OUR_UA, timeoutMs = 12000) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "user-agent": ua, accept: "text/html,application/xhtml+xml,application/xml,text/plain,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, headers: res.headers, body: body.slice(0, 3_000_000), ms: Date.now() - t0, finalUrl: res.url };
  } catch (e) {
    return { ok: false, status: 0, headers: new Headers(), body: "", ms: Date.now() - t0, finalUrl: url, error: String(e) };
  }
}

const isChallenge = (r: { status: number; headers: Headers; body: string }) =>
  r.status === 403 || r.status === 503 || r.headers.get("cf-mitigated") === "challenge" || /cf-chl|just a moment|challenge-platform/i.test(r.body.slice(0, 20000))
  // „captcha” apare și în formularele de contact (reCAPTCHA): contează doar pe o pagină mică, fără conținut, adică o pagină de verificare.
  || (r.body.length < 15000 && /captcha/i.test(r.body));

/**
 * Fișierele tehnice (robots.txt, sitemap) le cerem întâi ca EchoAuditBot. Dacă firewall-ul ne refuză,
 * mai încercăm o dată ca browser, ca să nu raportăm „lipsește” un fișier care există (îl raportăm la firewall).
 */
async function getFile(url: string, timeoutMs = 12000) {
  const r = await get(url, OUR_UA, timeoutMs);
  if (!isChallenge(r)) return { ...r, botBlocked: false };
  const b = await get(url, BROWSER_UA, timeoutMs);
  return { ...b, botBlocked: true };
}

// Multe magazine generează sitemap-ul la cerere: ShopExpert RO răspunde abia după ~11 s (1,5 MB). Îl așteptăm până la 45 s (rulează în worker).
async function getBytes(url: string, timeoutMs = 45000): Promise<{ status: number; body: Uint8Array }> {
  const once = async (ua: string) => {
    const res = await fetch(url, { headers: { "user-agent": ua, accept: "application/xml,text/xml,*/*" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    const buf = new Uint8Array(await res.arrayBuffer());
    return { status: res.status, body: buf.slice(0, 20_000_000) };
  };
  const r = await once(OUR_UA);
  if (r.status !== 403 && r.status !== 503) return r;
  return once(BROWSER_UA);
}

// ── robots.txt ─────────────────────────────────────────────────────────────
type Group = { agents: string[]; rules: { allow: boolean; path: string }[] };
export function parseRobots(txt: string): { groups: Group[]; sitemaps: string[] } {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const k = m[1].toLowerCase();
    const v = m[2].trim();
    if (k === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (k === "sitemap") sitemaps.push(v);
      else if (cur && (k === "allow" || k === "disallow")) cur.rules.push({ allow: k === "allow", path: v });
    }
  }
  return { groups, sitemaps };
}

/** Răspunde dacă un robot are voie pe o cale, după regulile standard (RFC 9309: cea mai lungă potrivire). */
export function robotsAllows(parsed: { groups: Group[] }, ua: string, path: string) {
  const u = ua.toLowerCase();
  let group = parsed.groups.find((g) => g.agents.includes(u));
  if (!group) group = parsed.groups.find((g) => g.agents.includes("*"));
  if (!group) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of group.rules) {
    if (r.path === "" && !r.allow) continue; // "Disallow:" gol = permite tot
    const re = new RegExp("^" + r.path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(path)) {
      const len = r.path.length;
      if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
    }
  }
  return best ? best.allow : true;
}

const hasType = (n: Record<string, unknown>, t: string) => {
  const ty = n["@type"];
  return Array.isArray(ty) ? ty.includes(t) : ty === t;
};

function detectPlatform(html: string, headers: Headers) {
  if (/cdn\.shopify\.com|Shopify\.theme/i.test(html)) return "shopify";
  if (/wp-content\/plugins\/woocommerce|woocommerce/i.test(html)) return "woocommerce";
  if (/gomag/i.test(html)) return "gomag";
  if (/merchantpro/i.test(html)) return "merchantpro";
  if (/shoprenter/i.test(html)) return "shoprenter";
  if (/unas\.(hu|eu)|unas_/i.test(html)) return "unas";
  if (/prestashop/i.test(html) || headers.get("powered-by")?.toLowerCase().includes("prestashop")) return "prestashop";
  if (/catalog\/view\/theme|route=product/i.test(html)) return "opencart";
  return "necunoscută";
}

function findProductUrl($: cheerio.CheerioAPI, origin: string, prefix: string) {
  const patterns = [/\/products?\//, /\/produs\//, /\/p\/[^/]+/, /-p\d+/, /\.html$/, /\/termek\//, /\/spd\//];
  const seen = new Set<string>();
  let found: string | undefined;
  $("a[href]").each((_, a) => {
    if (found) return;
    const href = $(a).attr("href");
    if (!href) return;
    let abs: URL;
    try { abs = new URL(href, origin + prefix + "/"); } catch { return; }
    if (abs.origin !== new URL(origin).origin || seen.has(abs.pathname)) return;
    seen.add(abs.pathname);
    if (prefix && !abs.pathname.startsWith(prefix)) return;
    if (/categor|cart|cos|account|cont|blog|login|info\//i.test(abs.pathname)) return;
    // Și adresele fără „/produs/”, de forma /marca/categorie/subcategorie/cod-nume-produs (ex. ShopExpert)
    const segs = abs.pathname.slice(prefix.length).split("/").filter(Boolean);
    const slugLike = segs.length >= 3 && /\d/.test(segs[segs.length - 1]) && segs[segs.length - 1].includes("-");
    if (patterns.some((p) => p.test(abs.pathname)) || slugLike) found = abs.toString();
  });
  return found;
}

function extractFacts($: cheerio.CheerioAPI, html: string, nodes: Record<string, unknown>[]): StoreFacts {
  const links = $("a").map((_, a) => `${$(a).text()} ${$(a).attr("href") ?? ""}`.toLowerCase()).get().join(" | ");
  const legal = legalSignals(html);
  const trustmarks: string[] = [];
  if (/trusted\.ro/i.test(html)) trustmarks.push("Trusted.ro");
  if (/arukereso.*megbizhato|megbízható bolt/i.test(html)) trustmarks.push("Árukereső Megbízható Bolt");
  if (/ecommerce-europe|ecommerce europe trustmark/i.test(html)) trustmarks.push("Ecommerce Europe");
  if (/gpeC|gpec\.ro/i.test(html)) trustmarks.push("GPeC");
  const socials = ["facebook.com", "instagram.com", "tiktok.com", "youtube.com", "linkedin.com"].filter((s) => html.includes(s)).map((s) => s.split(".")[0]);
  const org = nodes.find((n) => hasType(n, "Organization") || hasType(n, "OnlineStore") || hasType(n, "Store"));
  return {
    title: $("title").first().text().trim() || undefined,
    description: $('meta[name="description"]').attr("content")?.trim() || undefined,
    lang: $("html").attr("lang") || undefined,
    cui: legal.cui,
    hasReturnPolicy: /retur|returnare|elall[aá]s|visszak[uü]ld/.test(links),
    hasTerms: /termeni|conditii|condiții|[aá]szf|felt[eé]tel/.test(links),
    hasContact: /contact|kapcsolat/.test(links),
    hasAnpc: legal.anpc,
    trustmarks,
    socials,
    organization: org ? { name: org.name as string, telephone: org.telephone as string, email: org.email as string } : undefined,
  };
}

// ── Auditul complet ────────────────────────────────────────────────────────
export type AuditOptions = { /** Pagini de produs din catalogul conectat, verificate înaintea celor ghicite din site. */ productUrls?: string[] };

export async function runAudit(inputUrl: string, opts: AuditOptions = {}): Promise<AuditResult> {
  const { domain, origin, pathPrefix } = parseStoreUrl(inputUrl);
  const home = origin + (pathPrefix || "/");
  const checks: Check[] = [];
  const result: AuditResult = {
    url: home, domain, fetchedAt: new Date().toISOString(), score: 0, checks, bots: [],
    facts: { hasReturnPolicy: false, hasTerms: false, hasContact: false, hasAnpc: false, trustmarks: [], socials: [] },
  };

  const [page, robots, llms, asGpt] = await Promise.all([
    get(home, BROWSER_UA),
    getFile(origin + "/robots.txt"),
    getFile(origin + "/llms.txt"),
    get(home, "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)"),
  ]);

  if (!page.ok && page.status === 0) {
    result.error = `Site-ul nu a răspuns (${page.error ?? "fără răspuns"}).`;
    checks.push({ id: "reachable", group: "acces", title: "Site-ul răspunde", status: "fail", detail: result.error, weight: 10 });
    return finalize(result);
  }

  // 1. Acces: robots.txt
  const parsedRobots = robots.ok ? parseRobots(robots.body) : { groups: [], sitemaps: [] };
  const testPath = pathPrefix || "/";
  for (const b of AI_BOTS) {
    const allowedHome = robotsAllows(parsedRobots, b.ua, testPath);
    const allowedProducts = robotsAllows(parsedRobots, b.ua, (pathPrefix || "") + "/products/x");
    result.bots.push({ ...b, robots: allowedHome && allowedProducts ? "allowed" : allowedHome || allowedProducts ? "partial" : "blocked" });
  }
  const blockedImportant = result.bots.filter((b) => b.important && b.robots !== "allowed");
  checks.push({
    id: "robots", group: "acces", title: "Roboții AI au voie să citească site-ul",
    status: blockedImportant.length === 0 ? "pass" : blockedImportant.length > 2 ? "fail" : "warn",
    detail: blockedImportant.length === 0
      ? (robots.ok ? "robots.txt permite toți roboții AI importanți." : "Nu există robots.txt, deci implicit totul e permis. Recomandăm unul explicit.")
      : `Blocați în robots.txt: ${blockedImportant.map((b) => `${b.ua} (${b.vendor})`).join(", ")}.`,
    fixKind: blockedImportant.length ? "robots" : undefined, weight: 20,
  });

  // 2. Acces: Cloudflare / firewall față de roboții AI
  const challenge = isChallenge;
  const browserOk = page.ok && !challenge(page);
  const botBlocked = challenge(asGpt) || (!asGpt.ok && asGpt.status !== 0);
  const cf = !!page.headers.get("cf-ray") || !!asGpt.headers.get("cf-ray");
  checks.push({
    id: "firewall", group: "acces", title: "Firewall-ul nu blochează asistenții AI",
    status: !browserOk ? "warn" : botBlocked ? "fail" : "pass",
    detail: !browserOk
      ? `Pagina principală a răspuns cu ${page.status}${challenge(page) ? " și o provocare anti-bot" : ""}. Nici un vizitator automat nu o poate citi.`
      : botBlocked
        ? `Un vizitator identificat ca OAI-SearchBot primește ${asGpt.status}${cf ? " (Cloudflare)" : ""}. ChatGPT nu îți poate citi paginile.`
        : `Asistenții AI primesc pagina normal${cf ? " (Cloudflare activ, configurat corect)" : ""}.`,
    fixKind: botBlocked || !browserOk ? "cloudflare" : undefined, weight: 20,
  });

  const $ = cheerio.load(page.body);
  const nodes = jsonLdNodes($);
  const homeSd = structuredData($);
  result.platform = detectPlatform(page.body, page.headers);
  result.facts = extractFacts($, page.body, homeSd.map((e) => ({ ...e.props, "@type": e.types })));
  result.home = extractHomeCatalog($, nodes, home);
  // Un rând scurt pentru diagnoză (doar numărători, fără conținut de pe site).
  console.log(`Scanare ${domain}: ${result.home.categories.length} categorii, ${result.home.brands.length} mărci, ${result.home.products.length} produse, ${result.home.logos?.length ?? 0} sigle, nume ${result.home.siteName ? "declarat" : "din titlu/adresă"}, schema.org ${sdSummary(homeSd)}`);

  // Sitemap întâi: ne dă și adrese de produs, dacă pagina principală nu are linkuri clare spre produse.
  const sm = await findSitemap(origin, pathPrefix, parsedRobots.sitemaps, (u) => getBytes(u));
  result.sitemapUrl = sm.found?.url;

  // 4. Date: pagina de produs (din catalog, din pagina principală sau din sitemap), în oricare formă schema.org
  const candidates = [...new Set([...(opts.productUrls ?? []).slice(0, 2), findProductUrl($, origin, pathPrefix), ...productLikeUrls(sm.sampleUrls, pathPrefix, 2)].filter(Boolean) as string[])].slice(0, 2);
  let productPage: { url: string; sd: SdEntity[]; body: string } | undefined;
  for (const u of candidates) {
    const pp = await get(u, BROWSER_UA);
    if (!pp.ok || challenge(pp)) continue;
    const sd = structuredData(cheerio.load(pp.body));
    productPage = { url: pp.finalUrl || u, sd, body: pp.body };
    if (sd.some((e) => isType(e, ["Product", "ProductGroup"]))) break;
  }
  result.productUrl = productPage?.url;

  // 3. Date: Organization / OnlineStore (pe pagina principală sau, măcar, pe pagina de produs)
  const orgHome = homeSd.find((e) => isType(e, ORG_TYPES));
  const orgAny = orgHome ?? productPage?.sd.find((e) => isType(e, ORG_TYPES));
  const productSd = productPage?.sd.find((e) => isType(e, ["Product", "ProductGroup"]));
  const orgEvidence: Evidence[] = [
    { label: "Pagina principală", url: home, value: `schema.org găsit: ${sdSummary(homeSd)}`, ok: !!orgHome },
    ...(productPage && !orgHome ? [{ label: "Pagina de produs", url: productPage.url, value: `schema.org găsit: ${sdSummary(productPage.sd)}`, ok: !!orgAny }] : []),
  ];
  checks.push({
    id: "jsonld-org", group: "date", title: "Datele firmei sunt marcate pentru AI (Organization)",
    status: orgAny ? "pass" : "warn",
    detail: orgAny
      ? `Datele firmei sunt marcate (${orgAny.types.join(", ")}, ${orgAny.source}).`
      : productSd
        ? `Produsele au schema.org Product (${productSd.source}), dar niciun bloc Organization / OnlineStore cu numele firmei, logo, contact și rețele sociale. Lipsește doar acest bloc.`
        : "Nu am găsit niciun bloc Organization / OnlineStore (nume, logo, contact, rețele sociale), în nicio formă (JSON-LD, Microdata, RDFa). AI-urile te recunosc mai greu ca brand.",
    fixKind: orgAny ? undefined : "jsonld", weight: 8, evidence: orgEvidence, missing: orgAny ? undefined : ["Organization"],
  });

  if (productPage) {
    const f = productSd ? productFields(productSd) : null;
    const missing = f ? missingProductFields(f) : [];
    checks.push({
      id: "jsonld-product", group: "date", title: "Produsele au date structurate complete (Product)",
      status: !productSd ? "fail" : missing.length === 0 ? "pass" : missing.length <= 2 ? "warn" : "fail",
      detail: !productSd
        ? "Pagina de produs verificată nu are date structurate de tip Product în nicio formă (JSON-LD, Microdata, RDFa). AI-urile nu pot citi sigur prețul, stocul și brandul."
        : missing.length
          ? `Produsele au schema.org Product (${productSd.source}), dar lipsesc: ${missing.join(", ")}.`
          : `Produsele au schema.org Product complet (${productSd.source}): ${describeProductFields(f!)}.${f!.rating ? "" : " Rating-ul (aggregateRating) se adaugă doar dacă ai recenzii reale pe site."}`,
      fixKind: !productSd || missing.length ? "jsonld" : undefined, weight: 18,
      evidence: [{ label: "Pagina de produs verificată", url: productPage.url, value: productSd ? `${sdSummary(productPage.sd)}. Câmpuri: ${describeProductFields(f!) || "niciunul"}` : `schema.org găsit: ${sdSummary(productPage.sd)}`, ok: !!productSd && missing.length === 0 }],
      missing: !productSd ? ["Product"] : missing.length ? missing : undefined,
    });
    const $p = cheerio.load(productPage.body);
    const words = productDescriptionWords(cheerio.load(productPage.body));
    checks.push({
      id: "content-product", group: "continut", title: "Descrierile de produs răspund la întrebări",
      // Zero cuvinte găsite = nu am recunoscut unde stă descrierea pe această platformă, nu „nu ai descriere”.
      status: words === 0 ? "unknown" : words >= 120 ? "pass" : words >= 40 ? "warn" : "fail",
      detail: words === 0
        ? "Nu am putut verifica: nu am recunoscut automat unde e descrierea pe pagina de produs (nu e într-un câmp de descriere standard). Nu spunem că lipsește."
        : `Descrierea are ~${words} cuvinte. AI-urile recomandă produse cu descrieri care spun pentru cine e, ce problemă rezolvă și cum se compară.`,
      fixKind: words === 0 || words >= 120 ? undefined : "content", weight: 8,
      evidence: [{ label: "Pagina de produs verificată", url: productPage.url, value: words ? `~${words} cuvinte în descriere și specificații` : "descrierea nu e într-un câmp standard (itemprop=description, #description etc.)" }],
    });
  } else {
    checks.push({ id: "jsonld-product", group: "date", title: "Produsele au date structurate complete (Product)", status: "info", detail: "Nu am putut deschide automat o pagină de produs (din catalog, din pagina principală sau din sitemap). Conectează catalogul pentru o verificare completă.", weight: 0 });
  }

  // 5. llms.txt
  const hasLlms = llms.ok && llms.body.length > 20 && !/<html/i.test(llms.body.slice(0, 200));
  checks.push({
    id: "llms", group: "date", title: "Există llms.txt (rezumat pentru AI)",
    status: hasLlms ? "pass" : "warn",
    detail: hasLlms ? "Fișierul llms.txt există." : "Lipsește /llms.txt, un rezumat al magazinului scris pentru asistenții AI. E nou, dar ieftin de adăugat.",
    fixKind: hasLlms ? undefined : "llms", weight: 4,
    evidence: [{ label: "/llms.txt", url: origin + "/llms.txt", value: hasLlms ? "există" : `răspuns ${llms.status}${/<html/i.test(llms.body.slice(0, 200)) ? ", o pagină HTML, nu fișierul" : ""}`, ok: hasLlms }],
  });

  // 6. Sitemap: există? E declarat în robots.txt?
  const probeText = (k: string, st: number, locs: number) =>
    k === "urlset" ? `sitemap valid cu ${locs} adrese` : k === "sitemapindex" ? `index de sitemap-uri (${locs} fișiere)` : k === "html" ? `răspuns ${st}, dar e o pagină HTML, nu un sitemap` : k === "blocked" ? `răspuns ${st}, blocat de firewall` : k === "timeout" ? "nu a răspuns în 45 s" : k === "error" ? "fără răspuns (eroare de rețea)" : `răspuns ${st}`;
  const smEvidence: Evidence[] = [
    { label: "robots.txt", url: origin + "/robots.txt", value: robots.ok ? (parsedRobots.sitemaps.length ? `declară: ${parsedRobots.sitemaps.join(", ")}` : "nu are nicio linie „Sitemap:”") : `răspuns ${robots.status}`, ok: parsedRobots.sitemaps.length > 0 },
    ...sm.probes.map((p) => ({ label: new URL(p.url).pathname, url: p.url, value: probeText(p.kind, p.status, p.locs), ok: p.kind === "urlset" || p.kind === "sitemapindex" })),
  ];
  const smUnsure = !sm.found && sitemapUnsure(sm.probes);
  checks.push({
    id: "sitemap", group: "acces", title: "Sitemap disponibil",
    status: sm.found ? "pass" : smUnsure ? "unknown" : "warn",
    detail: sm.found
      ? `Sitemap găsit la ${sm.found.url} (${sm.found.kind === "urlset" ? `${sm.found.locs} adrese` : `index cu ${sm.found.locs} fișiere`}).`
      : smUnsure
        ? `Nu am putut verifica: ${sm.probes.filter((p) => UNSURE_PROBES.has(p.kind)).map((p) => `${new URL(p.url).pathname} ${probeText(p.kind, p.status, p.locs)}`).join(", ")}. Nu spunem că lipsește; reîncercăm la următorul audit.`
        : `Nu am găsit un sitemap valid în ${sm.probes.length} locuri verificate (${sm.probes.map((p) => new URL(p.url).pathname).join(", ")}). Roboții descoperă produsele mai greu.`,
    fixKind: sm.found || smUnsure ? undefined : "sitemap", weight: 5, evidence: smEvidence,
  });
  if (sm.found && !sm.found.declared && robots.ok) {
    checks.push({
      id: "sitemap-robots", group: "acces", title: "Sitemap-ul e declarat în robots.txt",
      status: "warn",
      detail: `Sitemap-ul există (${sm.found.url}), dar robots.txt nu are linia „Sitemap: ${sm.found.url}”. Google îl știe dacă l-ai trimis în Search Console, dar Bing (Copilot, ChatGPT), Perplexity și ceilalți roboți îl caută în robots.txt.`,
      fixKind: "sitemap", weight: 2, evidence: smEvidence, missing: [sm.found.url],
    });
  }

  // 7. Conținut de bază
  const f = result.facts;
  checks.push({
    id: "meta", group: "continut", title: "Titlu, descriere și limbă setate",
    status: f.title && f.description && f.lang ? "pass" : "warn",
    detail: [!f.title && "lipsește titlul", !f.description && "lipsește meta description", !f.lang && "lipsește atributul de limbă (lang)"].filter(Boolean).join(", ") || "Toate prezente.",
    fixKind: f.title && f.description && f.lang ? undefined : "content", weight: 4,
  });

  // 8. Încredere: semnale pe care AI-urile și cumpărătorii le caută
  // CUI-ul și ANPC/SOL stau des doar în Termeni sau pe pagina de contact, nu pe prima pagină: le căutăm și acolo (cel mult 2 cereri).
  const trustEvidence: Evidence[] = [{ label: "Pagina principală", url: home, value: "verificată" }];
  if (!f.cui || !f.hasAnpc) {
    for (const u of trustPages($, origin, pathPrefix)) {
      const tp = await get(u, BROWSER_UA);
      if (!tp.ok || isChallenge(tp)) { trustEvidence.push({ label: new URL(u).pathname, url: u, value: tp.ok ? "nu am putut citi pagina (pagină de verificare anti-robot)" : `nu am putut deschide (răspuns ${tp.status || "fără răspuns"})` }); continue; }
      const more = legalSignals(tp.body);
      if (!f.cui && more.cui) f.cui = more.cui;
      if (!f.hasAnpc && more.anpc) f.hasAnpc = true;
      trustEvidence.push({ label: new URL(u).pathname, url: u, value: [more.cui && `CUI ${more.cui}`, more.anpc && "ANPC/SOL"].filter(Boolean).join(", ") || "fără CUI sau ANPC/SOL" });
    }
  }
  const trustItems: [boolean, string][] = [[f.hasReturnPolicy, "politică de retur"], [f.hasTerms, "termeni"], [f.hasContact, "contact"], [!!f.cui, f.cui ? `CUI ${f.cui}` : "CUI"], [f.hasAnpc, "ANPC/SOL"]];
  const trust = trustItems.filter(([ok]) => ok).length;
  const trustMissing = trustItems.filter(([ok]) => !ok).map(([, l]) => l);
  checks.push({
    id: "trust", group: "incredere", title: "Semnale de încredere vizibile",
    status: trust >= 4 ? "pass" : trust >= 2 ? "warn" : "fail",
    detail: `Găsite: ${[...trustItems.filter(([ok]) => ok).map(([, l]) => l), ...f.trustmarks].join(", ") || "niciunul"}.${trustMissing.length ? ` Negăsite: ${trustMissing.join(", ")}.` : ""}`,
    fixKind: trust >= 4 ? undefined : "content", weight: 6, evidence: trustEvidence, missing: trustMissing.length ? trustMissing : undefined,
  });

  // 9. Viteză
  checks.push({
    id: "speed", group: "viteza", title: "Pagina principală răspunde rapid",
    status: page.ms < 1500 ? "pass" : page.ms < 3500 ? "warn" : "fail",
    detail: `Răspuns complet în ${(page.ms / 1000).toFixed(1)} s. Roboții AI abandonează paginile lente.`,
    weight: 7,
  });

  return finalize(result);
}

function finalize(r: AuditResult) {
  // „Nu am putut verifica” nu intră în scor: nici ca reușită, nici ca problemă.
  const scored = r.checks.filter((c) => c.weight > 0 && c.status !== "unknown" && c.status !== "info");
  const total = scored.reduce((s, c) => s + c.weight, 0) || 1;
  const got = scored.reduce((s, c) => s + c.weight * (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0);
  r.score = Math.round((got / total) * 100);
  return r;
}

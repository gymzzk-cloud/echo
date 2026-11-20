import * as cheerio from "cheerio";
import { parseStoreUrl } from "@/lib/util";
import { extractHomeCatalog, type HomeCatalog } from "../onboarding/home";

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

export type CheckStatus = "pass" | "warn" | "fail" | "info";
export type Check = {
  id: string;
  group: "acces" | "date" | "continut" | "incredere" | "viteza";
  title: string;
  status: CheckStatus;
  detail: string;
  fixKind?: "robots" | "llms" | "jsonld" | "content" | "cloudflare" | "sitemap";
  weight: number;
};
export type AuditResult = {
  url: string;
  domain: string;
  fetchedAt: string;
  score: number;
  checks: Check[];
  bots: { ua: string; vendor: string; purpose: string; important: boolean; robots: "allowed" | "blocked" | "partial"; http?: number }[];
  facts: StoreFacts;
  productUrl?: string;
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

// ── JSON-LD ────────────────────────────────────────────────────────────────
function jsonLdNodes($: cheerio.CheerioAPI): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text().trim());
      const push = (n: unknown) => {
        if (Array.isArray(n)) n.forEach(push);
        else if (n && typeof n === "object") {
          const o = n as Record<string, unknown>;
          if (Array.isArray(o["@graph"])) (o["@graph"] as unknown[]).forEach(push);
          out.push(o);
        }
      };
      push(data);
    } catch { /* JSON invalid: îl raportăm separat */ }
  });
  return out;
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
    if (patterns.some((p) => p.test(abs.pathname)) && !/categor|cart|cos|account|cont|blog|login/i.test(abs.pathname)) found = abs.toString();
  });
  return found;
}

function extractFacts($: cheerio.CheerioAPI, html: string, nodes: Record<string, unknown>[]): StoreFacts {
  const links = $("a").map((_, a) => `${$(a).text()} ${$(a).attr("href") ?? ""}`.toLowerCase()).get().join(" | ");
  const text = $("body").text().replace(/\s+/g, " ");
  const cui = text.match(/\b(?:CUI|C\.U\.I\.|CIF|Cod fiscal|Adószám)\s*:?\s*(RO)?\s?(\d{2,10}(?:-\d-\d{2})?)/i);
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
    cui: cui ? `${cui[1] ?? ""}${cui[2]}` : undefined,
    hasReturnPolicy: /retur|returnare|elall[aá]s|visszak[uü]ld/.test(links),
    hasTerms: /termeni|conditii|condiții|[aá]szf|felt[eé]tel/.test(links),
    hasContact: /contact|kapcsolat/.test(links),
    hasAnpc: /anpc\.ro|ec\.europa\.eu\/consumers\/odr|solutionare|sal|sol/i.test(links) && /anpc|odr/i.test(html),
    trustmarks,
    socials,
    organization: org ? { name: org.name as string, telephone: org.telephone as string, email: org.email as string } : undefined,
  };
}

// ── Auditul complet ────────────────────────────────────────────────────────
export async function runAudit(inputUrl: string): Promise<AuditResult> {
  const { domain, origin, pathPrefix } = parseStoreUrl(inputUrl);
  const home = origin + (pathPrefix || "/");
  const checks: Check[] = [];
  const result: AuditResult = {
    url: home, domain, fetchedAt: new Date().toISOString(), score: 0, checks, bots: [],
    facts: { hasReturnPolicy: false, hasTerms: false, hasContact: false, hasAnpc: false, trustmarks: [], socials: [] },
  };

  const [page, robots, llms, asGpt] = await Promise.all([
    get(home, BROWSER_UA),
    get(origin + "/robots.txt"),
    get(origin + "/llms.txt"),
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
  const challenge = (r: typeof page) =>
    r.status === 403 || r.status === 503 || r.headers.get("cf-mitigated") === "challenge" || /cf-chl|just a moment|challenge-platform|captcha/i.test(r.body.slice(0, 20000));
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
  result.platform = detectPlatform(page.body, page.headers);
  result.facts = extractFacts($, page.body, nodes);
  result.home = extractHomeCatalog($, nodes, home);

  // 3. Date: Organization / WebSite
  const hasOrg = nodes.some((n) => hasType(n, "Organization") || hasType(n, "OnlineStore") || hasType(n, "Store") || hasType(n, "LocalBusiness"));
  checks.push({
    id: "jsonld-org", group: "date", title: "Datele firmei sunt marcate pentru AI (Organization)",
    status: hasOrg ? "pass" : "warn",
    detail: hasOrg ? "Pagina principală are date structurate despre firmă." : "Lipsesc datele structurate despre firmă (nume, logo, contact, rețele sociale). AI-urile te recunosc mai greu ca brand.",
    fixKind: hasOrg ? undefined : "jsonld", weight: 8,
  });

  // 4. Date: pagina de produs
  const productUrl = findProductUrl($, origin, pathPrefix);
  result.productUrl = productUrl;
  if (productUrl) {
    const pp = await get(productUrl, BROWSER_UA);
    const $p = cheerio.load(pp.body);
    const pn = jsonLdNodes($p).find((n) => hasType(n, "Product") || hasType(n, "ProductGroup"));
    const offers = pn ? (Array.isArray(pn.offers) ? pn.offers[0] : pn.offers) as Record<string, unknown> | undefined : undefined;
    const missing: string[] = [];
    if (pn) {
      if (!offers?.price && !(offers as Record<string, unknown> | undefined)?.lowPrice) missing.push("preț");
      if (!offers?.availability) missing.push("stoc");
      if (!offers?.priceCurrency) missing.push("monedă");
      if (!pn.brand) missing.push("brand");
      if (!pn.gtin && !pn.gtin13 && !pn.gtin8 && !pn.mpn && !pn.sku) missing.push("cod (GTIN/SKU)");
      if (!pn.image) missing.push("imagine");
      if (!pn.aggregateRating) missing.push("recenzii (rating)");
    }
    checks.push({
      id: "jsonld-product", group: "date", title: "Produsele au date structurate complete (Product)",
      status: !pn ? "fail" : missing.length === 0 ? "pass" : missing.length <= 2 ? "warn" : "fail",
      detail: !pn
        ? "Pagina de produs nu are date structurate de tip Product. AI-urile nu pot citi sigur prețul, stocul și brandul."
        : missing.length ? `Date structurate prezente, dar lipsesc: ${missing.join(", ")}.` : "Preț, stoc, brand, cod, imagine și rating sunt toate marcate.",
      fixKind: !pn || missing.length ? "jsonld" : undefined, weight: 18,
    });
    const desc = $p('[itemprop="description"], .product-description, #description, .woocommerce-Tabs-panel--description, .product__description').text().trim();
    const words = desc.split(/\s+/).filter(Boolean).length;
    checks.push({
      id: "content-product", group: "continut", title: "Descrierile de produs răspund la întrebări",
      status: words >= 120 ? "pass" : words >= 40 ? "warn" : "fail",
      detail: words ? `Descrierea are ~${words} cuvinte. AI-urile recomandă produse cu descrieri care spun pentru cine e, ce problemă rezolvă și cum se compară.` : "Nu am găsit o descriere de produs vizibilă în pagină.",
      fixKind: words >= 120 ? undefined : "content", weight: 8,
    });
  } else {
    checks.push({ id: "jsonld-product", group: "date", title: "Produsele au date structurate complete (Product)", status: "info", detail: "Nu am găsit automat o pagină de produs din pagina principală. Conectează catalogul pentru o verificare completă.", weight: 0 });
  }

  // 5. llms.txt
  const hasLlms = llms.ok && llms.body.length > 20 && !/<html/i.test(llms.body.slice(0, 200));
  checks.push({
    id: "llms", group: "date", title: "Există llms.txt (rezumat pentru AI)",
    status: hasLlms ? "pass" : "warn",
    detail: hasLlms ? "Fișierul llms.txt există." : "Lipsește /llms.txt, un rezumat al magazinului scris pentru asistenții AI. E nou, dar ieftin de adăugat.",
    fixKind: hasLlms ? undefined : "llms", weight: 4,
  });

  // 6. Sitemap
  let sitemapOk = false;
  for (const s of parsedRobots.sitemaps.length ? parsedRobots.sitemaps.slice(0, 2) : [origin + "/sitemap.xml"]) {
    const r = await get(s, OUR_UA, 8000);
    if (r.ok && /<(urlset|sitemapindex)/i.test(r.body)) { sitemapOk = true; break; }
  }
  checks.push({
    id: "sitemap", group: "acces", title: "Sitemap disponibil",
    status: sitemapOk ? "pass" : "warn",
    detail: sitemapOk ? "Sitemap-ul e accesibil și declarat." : "Nu am găsit un sitemap valid. Roboții descoperă produsele mai greu.",
    fixKind: sitemapOk ? undefined : "sitemap", weight: 5,
  });

  // 7. Conținut de bază
  const f = result.facts;
  checks.push({
    id: "meta", group: "continut", title: "Titlu, descriere și limbă setate",
    status: f.title && f.description && f.lang ? "pass" : "warn",
    detail: [!f.title && "lipsește titlul", !f.description && "lipsește meta description", !f.lang && "lipsește atributul de limbă (lang)"].filter(Boolean).join(", ") || "Toate prezente.",
    fixKind: f.title && f.description && f.lang ? undefined : "content", weight: 4,
  });

  // 8. Încredere: semnale pe care AI-urile și cumpărătorii le caută
  const trust = [f.hasReturnPolicy, f.hasTerms, f.hasContact, !!f.cui, f.hasAnpc].filter(Boolean).length;
  checks.push({
    id: "trust", group: "incredere", title: "Semnale de încredere vizibile",
    status: trust >= 4 ? "pass" : trust >= 2 ? "warn" : "fail",
    detail: `Găsite: ${[f.hasReturnPolicy && "politică de retur", f.hasTerms && "termeni", f.hasContact && "contact", f.cui && `CUI ${f.cui}`, f.hasAnpc && "ANPC/SOL", ...f.trustmarks].filter(Boolean).join(", ") || "niciunul"}.`,
    fixKind: trust >= 4 ? undefined : "content", weight: 6,
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
  const scored = r.checks.filter((c) => c.weight > 0);
  const total = scored.reduce((s, c) => s + c.weight, 0) || 1;
  const got = scored.reduce((s, c) => s + c.weight * (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0);
  r.score = Math.round((got / total) * 100);
  return r;
}

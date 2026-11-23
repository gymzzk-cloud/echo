import type { ProductFields } from "../audit/structured";
import { cleanBrand, cleanGtin, OPENAI_SKIP_NO_BRAND, type OpenAiRow } from "../feed-channels/openai";
import type { FeedProduct } from "../feed";
import { normalizeText } from "@/lib/util";

/**
 * Fișa unui produs pe canale: fiecare câmp pe care îl primește ChatGPT (feed OpenAI), Google (feed Merchant)
 * și ce citesc Google și Gemini din pagina produsului, cu un scor de calitate pe canal și reparația concretă.
 * Funcții pure (testate în tests/product-sheet.test.ts); datele vin din src/core/product-sheet/read.ts.
 */

export type CheckStatus = "ok" | "warn" | "bad" | "info";
export type FieldCheck = { field: string; label: string; value: string; status: CheckStatus; points: number; max: number; fix?: string };
export type ChannelReport = { included: boolean; reason?: string; score: number; checks: FieldCheck[] };

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const status = (points: number, max: number): CheckStatus => (max === 0 ? "info" : points >= max ? "ok" : points >= max / 2 ? "warn" : "bad");
const check = (field: string, label: string, value: string, points: number, max: number, fix?: string): FieldCheck =>
  ({ field, label, value, points, max, status: status(points, max), ...(points < max && fix ? { fix } : {}) });
const info = (field: string, label: string, value: string): FieldCheck => ({ field, label, value, points: 0, max: 0, status: "info" });
const score = (cs: FieldCheck[]) => {
  const max = cs.reduce((s, c) => s + c.max, 0);
  return max ? Math.round((cs.reduce((s, c) => s + Math.min(c.points, c.max), 0) / max) * 100) : 0;
};

/** Titlul: marcă + tip + model, între 25 și 150 de caractere. */
function titleCheck(field: string, title: string, brand: string) {
  let pts = 15;
  const notes: string[] = [];
  if (title.length < 25) { pts -= 8; notes.push("e prea scurt"); }
  if (brand && !normalizeText(title).includes(normalizeText(brand))) { pts -= 4; notes.push(`nu conține marca ${brand}`); }
  if (!/\d/.test(title)) { pts -= 3; notes.push("nu are modelul sau o caracteristică cu cifre"); }
  return check(field, "Titlu", title, pts, 15, notes.length ? `Titlul ${notes.join(", ")}. Scrie-l ca „marcă + tip de produs + model + caracteristica principală”, cum caută un om.` : undefined);
}

function descriptionCheck(field: string, desc: string, title: string) {
  const n = words(desc);
  if (!desc || desc === title) return check(field, "Descriere", desc || "(goală)", 0, 15, "Produsul nu are descriere: trimitem titlul în locul ei. Adaugă în catalog o descriere de cel puțin 80 de cuvinte: pentru cine e, ce face, specificațiile.");
  const pts = n >= 80 ? 15 : n >= 30 ? 10 : 5;
  return check(field, "Descriere", `${n} cuvinte: ${desc.slice(0, 160)}${desc.length > 160 ? "…" : ""}`, pts, 15, `Descrierea are doar ${n} cuvinte. AI-urile aleg produsul care răspunde la întrebare: scrie cel puțin 80 de cuvinte (utilizare, specificații, ce e în cutie).`);
}

function brandCheck(field: string, sent: string, original: string | null) {
  if (sent) return check(field, "Marcă", sent, 15, 15);
  const raw = (original ?? "").trim();
  return check(field, "Marcă", raw ? `„${raw.slice(0, 60)}” (nevalidă, nu o trimitem)` : "(lipsește)", 0, 15,
    raw ? `Marca din catalog („${raw.slice(0, 60)}”) nu e un nume de marcă valid. Pune în catalog numele producătorului.` : "Produsul nu are marcă în catalog. Adaug-o: AI-urile caută și compară după marcă.");
}

function idCheck(field: string, gtinSent: string, gtinRaw: string | null, mpn: string, max: number) {
  const raw = (gtinRaw ?? "").trim();
  const value = [gtinSent && `EAN ${gtinSent}`, raw && !gtinSent && `EAN „${raw}” invalid, nu îl trimitem`, mpn && `cod producător ${mpn}`].filter(Boolean).join(" · ") || "(lipsește)";
  if (gtinSent) return check(field, "EAN / GTIN", value, max, max);
  const fix = raw
    ? `EAN-ul din catalog („${raw}”) nu are 8, 12, 13 sau 14 cifre. Corectează-l: fără EAN, AI-urile și comparatoarele nu pot lega oferta ta de același produs vândut de alții.`
    : "Produsul nu are EAN în catalog. Adaugă-l (e pe cutie sau în fișa producătorului): e cel mai sigur mod prin care un AI recunoaște exact produsul și îți arată oferta lângă a altora.";
  return check(field, "EAN / GTIN", value, mpn ? Math.round(max / 2) : 0, max, fix);
}

/** Ce primește ChatGPT pentru produs: rândul exact din feed-ul OpenAI, cu scor și reparații. */
export function openAiReport(p: FeedProduct, r: { row: OpenAiRow } | { skip: string } | null): ChannelReport {
  if (!r) return { included: false, reason: "O regulă de feed exclude produsul din canalul ChatGPT.", score: 0, checks: [] };
  if ("skip" in r) return { included: false, reason: r.skip === "fără imagine"
    ? "Produsul nu intră în feed-ul ChatGPT pentru că nu are imagine: catalogul magazinului trimite câmpul de imagine gol. OpenAI cere titlu, link, imagine și preț. Adaugă imaginea în platforma magazinului; Echo o preia la următoarea sincronizare și produsul intră singur în feed."
    : r.skip === OPENAI_SKIP_NO_BRAND
      ? `Produsul nu intră în feed-ul ChatGPT pentru că nu are o marcă validă${p.brand?.trim() ? ` (în catalog scrie „${p.brand.trim()}”)` : " în catalog"}. OpenAI cere marca și respinge rândul fără ea. Completează marca în platforma magazinului; Echo o preia la următoarea sincronizare și produsul intră singur în feed.`
      : `Produsul nu intră în feed-ul ChatGPT: ${r.skip}. OpenAI cere titlu, link, imagine, preț și marcă.`, score: 0, checks: [] };
  const row = r.row;
  const policies = [row.return_policy, row.seller_privacy_policy, row.seller_tos].filter(Boolean).length;
  const checks: FieldCheck[] = [
    info("id", "Cod intern (id)", row.id),
    titleCheck("title", row.title, row.brand),
    descriptionCheck("description", row.description, row.title),
    info("link", "Link", row.link),
    check("image_link", "Imagine", row.image_link, 5, 5),
    info("price", "Preț", row.price),
    check("availability", "Stoc", row.availability === "in_stock" ? "în stoc (in_stock)" : "fără stoc (out_of_stock)", row.availability === "in_stock" ? 10 : 0, 10,
      "Produsul e trimis fără stoc. ChatGPT recomandă rar produse care nu se pot cumpăra acum."),
    brandCheck("brand", row.brand, p.brand),
    idCheck("gtin", row.gtin, p.gtin, row.mpn, 20),
    check("product_category", "Categorie", row.product_category || "(lipsește)", row.product_category ? 10 : 0, 10, "Produsul nu are categorie în catalog. Pune-l într-o categorie (ex. „Scule electrice > Bormașini”)."),
    check("policies", "Retur, confidențialitate, termeni", [row.return_policy && "retur", row.seller_privacy_policy && "confidențialitate", row.seller_tos && "termeni"].filter(Boolean).join(", ") || "(lipsesc)",
      Math.round((policies / 3) * 10), 10, "Lipsesc adresele paginilor de retur, confidențialitate sau termeni. Le completezi o dată în Feed și canale, cardul ChatGPT."),
    info("return_window", "Zile pentru retur", row.return_window),
    info("seller_name", "Vânzător", `${row.seller_name} · ${row.seller_url}`),
  ];
  return { included: true, score: score(checks), checks };
}

/** Ce primește Google (Merchant Center) din feed-ul Google generat de Echo. `item` vine din googleItem(). */
export function googleFeedReport(p: FeedProduct, item: [string, string][] | null): ChannelReport {
  if (!item) return { included: false, reason: "O regulă de feed exclude produsul din canalul Google.", score: 0, checks: [] };
  const f = new Map(item);
  const get = (k: string) => f.get(k) ?? "";
  if (!get("g:price").trim() || !(p.price && p.price > 0)) return { included: false, reason: "Produsul nu are preț: Google respinge produsele fără preț.", score: 0, checks: [] };
  const checks: FieldCheck[] = [
    info("g:id", "Cod intern (id)", get("g:id")),
    titleCheck("title", get("title"), cleanBrand(p.brand)),
    descriptionCheck("description", get("description"), get("title")),
    info("link", "Link", get("link")),
    check("g:image_link", "Imagine", get("g:image_link") || "(lipsește)", get("g:image_link") ? 10 : 0, 10, "Catalogul magazinului nu trimite nicio imagine pentru acest produs (câmpul de imagine e gol). Google respinge produsele fără imagine: adaug-o în platforma magazinului, iar Echo o preia la următoarea sincronizare."),
    info("g:price", "Preț", get("g:price")),
    check("g:availability", "Stoc", get("g:availability"), get("g:availability") === "in_stock" ? 10 : 0, 10, "Produsul e trimis fără stoc: Google Shopping și Gemini nu îl arată ca ofertă disponibilă."),
    brandCheck("g:brand", get("g:brand"), p.brand),
    idCheck("g:gtin", get("g:gtin"), p.gtin, get("g:mpn"), 25),
    check("g:product_type", "Categorie", get("g:product_type") || "(lipsește)", get("g:product_type") ? 10 : 0, 10, "Produsul nu are categorie în catalog."),
    ...(get("g:identifier_exists") ? [info("g:identifier_exists", "Fără coduri", "identifier_exists = no (nu are nici EAN, nici cod producător cu marcă)")] : []),
    ...item.filter(([k]) => k.startsWith("g:custom_label_")).map(([k, v]) => info(k, "Etichetă Echo", v)),
  ];
  return { included: true, score: score(checks), checks };
}

/** Prețul scris în pagină („3.949,00”, „3949.00”) ca număr. */
export function pagePrice(s: string | undefined) {
  if (!s) return null;
  let t = s.replace(/[^\d.,]/g, "");
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type PageCheckInput = { httpStatus: number; botBlocked: boolean; found: string; source: string | null; fields: ProductFields | null; descriptionWords: number | null; error: string | null };

/**
 * Ce citesc Google, Gemini și roboții AI din pagina produsului (schema.org Product), comparat cu catalogul.
 * Un preț, un stoc sau un EAN diferit între pagină și feed e motivul cel mai des pentru care Google respinge produsul.
 */
export function pageReport(p: FeedProduct, c: PageCheckInput | null): ChannelReport | null {
  if (!c) return null;
  if (c.httpStatus === 0 || c.httpStatus >= 400 || c.error) return { included: false, reason: c.error ?? `Pagina a răspuns cu codul ${c.httpStatus}.`, score: 0, checks: [] };
  const f = c.fields;
  if (!f) return { included: false, reason: `Pagina nu are date structurate de tip Product (am găsit: ${c.found || "nimic"}). Google și AI-urile ghicesc prețul și stocul din text.`, score: 0, checks: [] };
  const priceOnPage = pagePrice(f.price);
  const priceDiff = priceOnPage && p.price ? Math.abs(priceOnPage - p.price) / p.price : null;
  const inStockPage = f.availability ? /InStock|LimitedAvailability|OnlineOnly|PreOrder|BackOrder/i.test(f.availability) : null;
  const gtinPage = cleanGtin(f.gtin ?? null);
  const gtinFeed = cleanGtin(p.gtin);
  const checks: FieldCheck[] = [
    check("Product", "Date de produs (schema.org)", `${c.source ?? ""}: ${c.found}`, 20, 20),
    check("name", "Nume", f.name ?? "(lipsește)", f.name ? 5 : 0, 5, "Adaugă name în blocul Product."),
    check("offers.price", "Preț în pagină", f.price ? `${f.price}${f.currency ? ` ${f.currency}` : ""}${priceDiff !== null && priceDiff > 0.01 ? ` (în feed ${p.price!.toFixed(2)} ${p.currency})` : ""}` : "(lipsește)",
      !f.price || !f.currency ? 0 : priceDiff !== null && priceDiff > 0.01 ? 5 : 20, 20,
      !f.price || !f.currency ? "Adaugă offers.price și offers.priceCurrency în blocul Product." : "Prețul din pagină diferă de cel din feed. Google respinge produsele cu preț diferit; verifică dacă pagina arată prețul cu TVA și același preț ca feed-ul."),
    check("offers.availability", "Stoc în pagină", f.availability ?? "(lipsește)",
      inStockPage === null ? 0 : inStockPage !== p.inStock ? 5 : 15, 15,
      inStockPage === null ? "Adaugă offers.availability (https://schema.org/InStock sau OutOfStock)." : "Stocul din pagină diferă de cel din feed. Google și AI-urile pot spune greșit că nu ai produsul."),
    check("brand", "Marcă în pagină", f.brand ?? "(lipsește)", f.brand ? 15 : 0, 15, "Adaugă brand în blocul Product."),
    check("gtin", "EAN în pagină", [f.gtin && `GTIN ${f.gtin}`, f.mpn && `MPN ${f.mpn}`].filter(Boolean).join(" · ") || "(lipsește)",
      gtinPage ? (gtinFeed && gtinPage !== gtinFeed ? 5 : 20) : f.mpn ? 10 : 0, 20,
      gtinPage && gtinFeed && gtinPage !== gtinFeed ? `EAN-ul din pagină (${gtinPage}) diferă de cel din feed (${gtinFeed}). Unul e greșit: corectează-l în catalog sau în pagină.` : "Adaugă gtin13 (EAN) în blocul Product. Google îl folosește ca să lege pagina de produsul din Merchant Center."),
    check("image", "Imagine în pagină", f.image ? "da" : "(lipsește)", f.image ? 5 : 0, 5, "Adaugă image în blocul Product."),
    info("rating", "Rating", f.rating ? `${f.rating} (aggregateRating)` : "fără rating (se pune doar dacă ai recenzii reale pe site)"),
    ...(c.descriptionWords !== null ? [info("description", "Descriere în pagină", `${c.descriptionWords} cuvinte`)] : []),
  ];
  if (c.botBlocked) checks.unshift({ field: "robots", label: "Acces pentru roboți", value: "Firewall-ul ne-a refuzat ca robot; am citit pagina doar ca browser", points: 0, max: 0, status: "warn",
    fix: "Pagina refuză roboții necunoscuți. Googlebot și roboții AI verificați trec doar dacă regula firewall-ului (ex. Cloudflare) îi lasă: verifică în pagina Roboți AI." });
  return { included: true, score: score(checks), checks };
}

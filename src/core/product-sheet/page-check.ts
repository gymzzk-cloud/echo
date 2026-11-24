import * as cheerio from "cheerio";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { politeFetch } from "../connectors/polite";
import { productDescriptionWords } from "../audit/signals";
import { isType, productFields, sdSummary, structuredData, type ProductFields } from "../audit/structured";

/**
 * Verificarea paginii unui produs: ce date structurate (schema.org Product) găsesc Google, Gemini și celelalte AI-uri
 * când citesc pagina. O singură cerere la magazin, prin politeFetch, pornită de magazin din fișa produsului.
 * Idempotentă: rescrie rândul produsului cu ce găsește acum.
 */

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const isChallenge = (status: number, headers: Headers, body: string) =>
  status === 403 || status === 503 || headers.get("cf-mitigated") === "challenge" || /cf-chl|just a moment|challenge-platform/i.test(body.slice(0, 20000));

export type PageRead = { url: string; httpStatus: number; botBlocked: boolean; found: string; source: string | null; fields: ProductFields | null; descriptionWords: number | null; error: string | null };

/** Ce găsim în HTML-ul unei pagini de produs. Funcție pură (testată în tests/product-sheet.test.ts). */
export function readProductPage(html: string): Pick<PageRead, "found" | "source" | "fields" | "descriptionWords"> {
  const $ = cheerio.load(html);
  const sd = structuredData($);
  const product = sd.find((e) => isType(e, ["Product", "ProductGroup"]));
  const sdDesc = product ? String((Array.isArray(product.props.description) ? product.props.description[0] : product.props.description) ?? "") : "";
  // Textul din pagină: aceleași locuri ca auditul (câmpul standard plus tab-urile „Descriere”, „Detalii tehnice”…).
  // Înainte citeam doar câmpul standard, iar la ShopExpert ieșeau 5 cuvinte (descrierea din JSON-LD), deși pagina
  // are descrierea în tab-uri (KNOWLEDGE B56). Luăm cea mai lungă dintre cele două.
  const sdWords = sdDesc.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
  const words = Math.max(sdWords, productDescriptionWords($));
  return { found: sdSummary(sd), source: product?.source ?? null, fields: product ? productFields(product) : null, descriptionWords: words || null };
}

async function fetchPage(url: string) {
  const once = async (ua?: string) => {
    const r = await politeFetch(url, { headers: { accept: "text/html,application/xhtml+xml", ...(ua ? { "user-agent": ua } : {}) }, timeoutMs: 20000, redirect: "follow" });
    const body = (await r.text()).slice(0, 3_000_000);
    return { status: r.status, headers: r.headers, body, finalUrl: r.url || url };
  };
  const bot = await once();
  if (!isChallenge(bot.status, bot.headers, bot.body)) return { ...bot, botBlocked: false };
  // Firewall-ul ne-a refuzat ca robot: încercăm o dată ca browser, ca să vedem măcar ce e în pagină (și raportăm refuzul).
  const browser = await once(BROWSER_UA);
  return { ...browser, botBlocked: true };
}

export async function checkProductPage(projectId: string, productId: string) {
  const [p] = await db.select({ url: schema.products.url }).from(schema.products)
    .where(and(eq(schema.products.id, productId), eq(schema.products.projectId, projectId)));
  if (!p) return null;
  let read: PageRead;
  try {
    const r = await fetchPage(p.url);
    const blocked = isChallenge(r.status, r.headers, r.body);
    read = {
      url: r.finalUrl, httpStatus: r.status, botBlocked: r.botBlocked,
      ...(blocked || r.status >= 400 ? { found: "", source: null, fields: null, descriptionWords: null } : readProductPage(r.body)),
      error: blocked ? "Firewall-ul site-ului (ex. Cloudflare) ne-a refuzat și ca robot, și ca browser, deci nu am putut citi pagina. Nu înseamnă că Google nu o vede: Googlebot e de obicei lăsat să treacă. Verifică pagina cu „Testează pagina în Google” de mai jos sau lasă robotul Echo în regulile firewall-ului." : r.status >= 400 ? `Pagina a răspuns cu codul ${r.status}.` : null,
    };
  } catch (e) {
    read = { url: p.url, httpStatus: 0, botBlocked: false, found: "", source: null, fields: null, descriptionWords: null, error: `Nu am putut deschide pagina: ${(e as Error).message.slice(0, 200)}` };
  }
  const row = { projectId, productId, ...read, checkedAt: new Date() };
  await db.insert(schema.productPageChecks).values(row)
    .onConflictDoUpdate({ target: [schema.productPageChecks.projectId, schema.productPageChecks.productId], set: row });
  return { status: read.httpStatus, product: !!read.fields };
}

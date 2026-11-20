import { and, eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { politeFetch } from "@/core/connectors/polite";
import { extractDelivery, extractFaq, extractPayment, extractReturns, findPolicyLinks, findPolicyLinksInSitemap, sitemapLocs, type PolicyKind, type StorePolicies } from "./extract";

export type { StorePolicies } from "./extract";

/**
 * Condițiile magazinului citite de pe site, în worker: pagina principală, apoi cel mult 4 pagini de condiții
 * (retur, plată, livrare, întrebări frecvente) și, doar dacă lipsesc linkuri, un singur sitemap.
 * Se recitesc rar (POLICY_REFRESH_DAYS, implicit 30 de zile + decalaj stabil per magazin), ca să nu încărcăm site-ul.
 * Livrarea pe produs (termen, stoc) vine din catalog, nu de aici.
 */
const REFRESH_DAYS = () => Number(process.env.POLICY_REFRESH_DAYS ?? 30);
const RETRY_AFTER_ERROR_DAYS = 3;

type Project = typeof schema.projects.$inferSelect;

async function getHtml(url: string) {
  const r = await politeFetch(url, { headers: { accept: "text/html,application/xhtml+xml" }, timeoutMs: 20000 })
    .catch(() => { throw new Error("site-ul nu a răspuns"); });
  if (!r.ok) throw new Error(r.status === 403 || r.status === 401 ? `site-ul a refuzat citirea (${r.status})` : `răspuns ${r.status}`);
  const type = r.headers.get("content-type") ?? "";
  if (!/html|xml|text/.test(type)) throw new Error("pagina nu e HTML");
  return (await r.text()).slice(0, 2_000_000);
}

type FetchHtml = (url: string) => Promise<string>;

async function sitemapUrls(origin: string, fetchHtml: FetchHtml) {
  try {
    const xml = await fetchHtml(origin + "/sitemap.xml");
    let locs = sitemapLocs(xml);
    if (/<sitemapindex/i.test(xml)) {
      // Index: luăm doar sitemap-ul paginilor de conținut (CMS), nu pe cel de produse.
      const pages = locs.find((u) => /page|pagin|cms|info|static|oldal/i.test(u) && !/product|produs|categor|termek/i.test(u));
      if (!pages) return [];
      locs = sitemapLocs(await fetchHtml(pages));
    }
    return locs;
  } catch {
    return [];
  }
}

/**
 * Citește condițiile pornind de la pagina principală. Cel mult: pagina principală, un sitemap (doar dacă lipsesc linkuri)
 * și câte o pagină pentru retur, plată, livrare și întrebări (aceeași adresă se cere o singură dată).
 * Dacă pagina principală nu se poate citi, aruncă eroarea (o tratează apelantul).
 */
export async function readPolicies(home: string, fetchHtml: FetchHtml): Promise<StorePolicies> {
  const out: StorePolicies = { checkedAt: new Date().toISOString() };
  const html = await fetchHtml(home);
  const links = findPolicyLinks(html, home);
  const missing = (["returns", "payment", "delivery", "faq"] as PolicyKind[]).filter((k) => !links[k]);
  if (missing.length) Object.assign(links, { ...findPolicyLinksInSitemap(await sitemapUrls(new URL(home).origin, fetchHtml), home), ...links });

  const pages = new Map<string, string>();
  const page = async (url?: string) => {
    if (!url) return null;
    if (!pages.has(url)) pages.set(url, await fetchHtml(url).catch(() => ""));
    return pages.get(url) || null;
  };
  const r = await page(links.returns);
  if (r) out.returns = extractReturns(r, links.returns!);
  const pay = await page(links.payment);
  out.payment = (pay && extractPayment(pay, links.payment)) || extractPayment(html); // fără pagină de plată: metodele din pagina principală
  const d = await page(links.delivery);
  if (d) out.delivery = extractDelivery(d, links.delivery!);
  const f = await page(links.faq);
  if (f) out.faq = extractFaq(f, links.faq!);
  for (const k of ["returns", "payment", "delivery", "faq"] as const) if (!out[k]) delete out[k];
  return out;
}

/** Citește condițiile de pe site și le salvează în proiect. Idempotentă: o a doua rulare dă același rezultat. */
export async function refreshPolicies(projectId: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!p) return null;
  const home = `https://${p.domain}${p.pathPrefix || ""}/`;
  const prev = p.storeInfo?.policies;
  let out: StorePolicies;
  try {
    out = await readPolicies(home, getHtml);
  } catch (e) {
    // Site inaccesibil: păstrăm ce citisem data trecută și notăm eroarea (reîncercăm peste câteva zile).
    out = { ...(prev ?? {}), checkedAt: new Date().toISOString(), error: (e as Error).message.slice(0, 200) };
    console.error(`condiții ${p.domain}${p.pathPrefix}: ${out.error}`);
  }
  out.catalogDelivery = (await deliveryFromCatalog(p.id)) ?? undefined;
  await db.update(schema.projects).set({ storeInfo: { ...(p.storeInfo ?? {}), policies: out } }).where(eq(schema.projects.id, p.id));
  return out;
}

/** Decalaj stabil per magazin (0–72 ore), ca recitirile să nu cadă toate în aceeași zi. */
function jitterMs(id: string) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 72) * 3600e3;
}

export function policiesDue(p: Pick<Project, "id" | "storeInfo">, now = Date.now()) {
  const pol = p.storeInfo?.policies;
  if (!pol?.checkedAt) return true;
  const age = now - new Date(pol.checkedAt).getTime();
  if (pol.error) return age > RETRY_AFTER_ERROR_DAYS * 864e5;
  return age > REFRESH_DAYS() * 864e5 + jitterMs(p.id);
}

export async function projectsDueForPolicies() {
  const rows = await db.select({ id: schema.projects.id, storeInfo: schema.projects.storeInfo }).from(schema.projects);
  return rows.filter((r) => policiesDue(r)).map((r) => r.id);
}

/** Rezumatul termenelor de livrare din catalog (cele mai dese 3), calculat în SQL. Termenul exact e la fiecare produs. */
export async function deliveryFromCatalog(projectId: string) {
  const rows = await db.select({ d: schema.products.delivery, n: dsql<number>`count(*)::int`, total: dsql<number>`(sum(count(*)) over ())::int` }).from(schema.products)
    .where(and(eq(schema.products.projectId, projectId), dsql`${schema.products.delivery} is not null`))
    .groupBy(schema.products.delivery).orderBy(dsql`count(*) desc`).limit(3);
  if (!rows.length) return null;
  return rows.map((r) => `${r.d} (${Math.round((r.n / r.total) * 100)}% din produse)`).join("; ");
}

/** După o sincronizare de catalog: actualizăm doar rezumatul livrării salvat (pagina îl citește gata calculat). */
export async function saveCatalogDelivery(projectId: string) {
  const summary = await deliveryFromCatalog(projectId);
  await db.execute(dsql`update projects set store_info = jsonb_set(coalesce(store_info, '{}'::jsonb), '{policies,catalogDelivery}', ${JSON.stringify(summary)}::jsonb, true)
    where id = ${projectId} and store_info->'policies' is not null`);
}

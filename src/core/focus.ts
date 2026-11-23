import { and, desc, eq, inArray, isNotNull, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FocusConfig } from "@/db/schema";
import { categoryHead } from "./audit/fixes";

/**
 * „Produse focus” (ZoZo, 23.11.2026): scorul nu trebuie să depindă de produsele irelevante dintr-un catalog mare.
 * Setul focus, din date reale, pentru orice magazin:
 *  1. produsele alese de magazin („Produse urmărite”);
 *  2. cele mai vândute (popularity_rank, când platforma ne dă topul);
 *  3. produsele pe care AI-urile le numesc deja (product_ai_stats);
 *  4. produsele în stoc din categoriile de focus (alese de magazin sau, automat, categoriile produselor de mai sus),
 *     filtrate pe mărcile de focus, dacă magazinul a ales mărci.
 * Calculat în worker și salvat (products.focus + projects.focus_config); paginile doar citesc.
 */

export type FocusProduct = { id: string; category: string | null; brand: string | null; inStock: boolean; rank: number | null };
export type FocusSignals = { chosen: ReadonlySet<string>; aiNamed: ReadonlySet<string> };

/** Câte categorii punem automat în focus când nu avem niciun semnal (magazin nou): cele mai mari. */
const FALLBACK_CATEGORIES = 5;
/** Câte categorii și mărci arătăm de ales în Setări. */
const AVAILABLE_CATEGORIES = 60;
const AVAILABLE_BRANDS = 40;

const norm = (s: string) => s.trim().toLowerCase();

/** Funcție pură: setul focus și numărătorile lui (testată în tests/focus.test.ts). */
export function pickFocus(products: FocusProduct[], sig: FocusSignals, cfg: Pick<FocusConfig, "categories" | "brands"> = {}) {
  const head = new Map<string, string | null>();
  const catCount = new Map<string, number>();
  const brandCount = new Map<string, number>();
  let inStock = 0;
  for (const p of products) {
    const h = categoryHead(p.category, p.brand);
    head.set(p.id, h);
    if (!p.inStock) continue;
    inStock++;
    if (h) catCount.set(h, (catCount.get(h) ?? 0) + 1);
    if (p.brand?.trim()) brandCount.set(p.brand.trim(), (brandCount.get(p.brand.trim()) ?? 0) + 1);
  }
  const isBest = (p: FocusProduct) => p.rank !== null && p.rank > 0;
  const signal = (p: FocusProduct) => sig.chosen.has(p.id) || sig.aiNamed.has(p.id) || isBest(p);

  // Categoriile automate: acolo unde sunt produsele alese, vândute sau numite de AI; altfel cele mai mari.
  const autoCats = new Map<string, number>();
  for (const p of products) { const h = head.get(p.id); if (h && signal(p)) autoCats.set(h, (autoCats.get(h) ?? 0) + 1); }
  const bySize = [...catCount.entries()].sort((a, b) => b[1] - a[1]);
  const auto = autoCats.size
    ? [...autoCats.keys()].sort((a, b) => (catCount.get(b) ?? 0) - (catCount.get(a) ?? 0))
    : bySize.slice(0, FALLBACK_CATEGORIES).map(([c]) => c);

  const cats = new Set((cfg.categories ?? auto).map(norm));
  const brands = cfg.brands?.length ? new Set(cfg.brands.map(norm)) : null;

  const focus = new Set<string>();
  const counts = { inStock, focus: 0, chosen: 0, bestsellers: 0, aiNamed: 0, fromCategories: 0 };
  for (const p of products) {
    const chosen = sig.chosen.has(p.id);
    if (!p.inStock && !chosen) continue;
    const h = head.get(p.id);
    const inCat = !!h && cats.has(norm(h)) && (!brands || (!!p.brand && brands.has(norm(p.brand))));
    if (chosen) counts.chosen++;
    else if (isBest(p)) counts.bestsellers++;
    else if (sig.aiNamed.has(p.id)) counts.aiNamed++;
    else if (inCat) counts.fromCategories++;
    else continue;
    focus.add(p.id);
  }
  counts.focus = focus.size;
  return {
    focus, counts, auto,
    available: {
      categories: bySize.slice(0, AVAILABLE_CATEGORIES).map(([name, n]) => ({ name, n })),
      brands: [...brandCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, AVAILABLE_BRANDS).map(([name, n]) => ({ name, n })),
    },
  };
}

/** Jobul „focus”: recalculează setul și îl salvează. Idempotent. */
export async function computeFocus(projectId: string) {
  const [p] = await db.select({ cfg: schema.projects.focusConfig }).from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!p) return { focus: 0, changed: false };
  const P = schema.products, Q = schema.prompts, S = schema.productAiStats;
  const [products, chosenRows, namedRows] = await Promise.all([
    db.select({ id: P.id, category: P.category, brand: P.brand, inStock: P.inStock, rank: P.popularityRank }).from(P).where(eq(P.projectId, projectId)).limit(200_000),
    db.select({ id: Q.productId }).from(Q).where(and(eq(Q.projectId, projectId), eq(Q.intent, "produs"), eq(Q.active, true), eq(Q.suggested, false), isNotNull(Q.productId))),
    db.select({ id: S.productId }).from(S).where(and(eq(S.projectId, projectId), dsql`${S.appearances} > 0`)),
  ]);
  const cfg = p.cfg ?? {};
  const r = pickFocus(products, { chosen: new Set(chosenRows.map((x) => x.id!)), aiNamed: new Set(namedRows.map((x) => x.id)) }, cfg);
  const ids = [...r.focus];
  // Setul s-a schimbat? Atunci și întrebările propuse se refac (se aleg din produsele focus).
  const before = await db.select({ id: P.id }).from(P).where(and(eq(P.projectId, projectId), eq(P.focus, true)));
  const changed = before.length !== ids.length || before.some((b) => !r.focus.has(b.id));
  await db.transaction(async (tx) => {
    await tx.update(P).set({ focus: false }).where(and(eq(P.projectId, projectId), eq(P.focus, true)));
    for (let i = 0; i < ids.length; i += 1000) await tx.update(P).set({ focus: true }).where(and(eq(P.projectId, projectId), inArray(P.id, ids.slice(i, i + 1000))));
    const next: FocusConfig = { ...cfg, auto: { categories: r.auto }, available: r.available, counts: r.counts, computedAt: new Date().toISOString() };
    await tx.update(schema.projects).set({ focusConfig: next }).where(eq(schema.projects.id, projectId));
  });
  console.log(`focus ${projectId}: ${r.counts.focus} din ${r.counts.inStock} produse în stoc (alese ${r.counts.chosen}, vândute ${r.counts.bestsellers}, numite de AI ${r.counts.aiNamed}, din categorii ${r.counts.fromCategories})`);
  return { ...r.counts, changed };
}

/** Ce a ales magazinul (null = automat). Salvează doar alegerea; setul îl recalculează workerul. */
export async function saveFocusChoice(projectId: string, categories: string[] | null, brands: string[] | null) {
  const [p] = await db.select({ cfg: schema.projects.focusConfig }).from(schema.projects).where(eq(schema.projects.id, projectId));
  const next: FocusConfig = { ...(p?.cfg ?? {}), categories, brands };
  await db.update(schema.projects).set({ focusConfig: next }).where(eq(schema.projects.id, projectId));
}

/** Câte întrebări active sunt despre produsele focus (pentru textul „pe ce măsurăm” din Vizibilitate). Un singur count în SQL. */
export async function focusPromptCounts(projectId: string) {
  const Q = schema.prompts, P = schema.products;
  const [r] = await db.select({
    active: dsql<number>`count(*)::int`,
    focus: dsql<number>`count(*) filter (where ${P.focus})::int`,
  }).from(Q).leftJoin(P, eq(P.id, Q.productId)).where(and(eq(Q.projectId, projectId), eq(Q.active, true)));
  return { active: r?.active ?? 0, focus: r?.focus ?? 0 };
}

/**
 * Înainte de feed: categoriile din meniul site-ului și câte pagini are fiecare în sitemap, din ultimul audit.
 * Citim doar cele două câmpuri din JSON, nu tot rezultatul auditului.
 */
export async function siteCategoryEstimate(projectId: string) {
  const A = schema.audits;
  const [r] = await db.select({
    categories: dsql<{ name: string; pages: number | null }[] | null>`${A.result}->'siteCategories'`,
    sitemapUrl: dsql<string | null>`${A.result}->>'sitemapUrl'`,
  }).from(A).where(and(eq(A.projectId, projectId), eq(A.status, "done"))).orderBy(desc(A.createdAt)).limit(1);
  return r ? { categories: r.categories ?? [], sitemapUrl: r.sitemapUrl } : null;
}

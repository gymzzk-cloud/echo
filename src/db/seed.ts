/**
 * Date de test: un cont demo cu cele 3 magazine de test și 14 zile de istoric.
 *
 * Catalogul: încearcă întâi conectarea reală (Shopify / WooCommerce). Dacă nu merge
 * (fără internet sau platformă nedetectată), folosește produsele INVENTATE din fixtures/,
 * marcate „fixture:”. La prima sincronizare reală (Setări → feed) se înlocuiesc.
 *
 * Rulează: npm run db:seed   (se poate rula de mai multe ori; contul demo se recreează)
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, sql, schema } from "./index";
import bcrypt from "bcryptjs";
import { clock, daysAgo, parseStoreUrl, seededRandom } from "@/lib/util";
import { checkAgentOrder } from "@/core/agent-gate";
import { claimStore } from "@/core/stores";
import { generateFixes } from "@/core/fixes";
import { randomToken, sha256 } from "@/lib/util";
import { parseFeed } from "@/core/connectors";
import { connectStore, ensurePrompts, runProject, syncCatalog, auditProject } from "@/core/projects";
import { invalidateWorld } from "@/core/ai/engine";

const EMAIL = "demo@echo.local"; // = DEMO_EMAIL din src/lib/demo.ts
const PASSWORD = "echo-demo-2026";
const DAYS = 14;

const STORES = [
  { name: "ShopExpert RO", url: "shopexpert.com/ro", country: "RO" as const, fixture: "shopexpert-ro.csv" },
  { name: "ShopExpert HU", url: "shopexpert.com/hu", country: "HU" as const, fixture: "shopexpert-hu.csv" },
  { name: "Hardline Construct", url: "hardlineconstruct.ro", country: "RO" as const, fixture: "hardlineconstruct.csv" },
];

async function main() {
  const [old] = await db.select().from(schema.users).where(eq(schema.users.email, EMAIL));
  if (old) {
    const ms = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, old.id));
    for (const m of ms) await db.delete(schema.orgs).where(eq(schema.orgs.id, m.orgId));
    await db.delete(schema.users).where(eq(schema.users.id, old.id));
    console.log("Cont demo vechi șters.");
  }
  const [user] = await db.insert(schema.users).values({ email: EMAIL, name: "Demo", passwordHash: await bcrypt.hash(PASSWORD, 12) }).returning();
  const [org] = await db.insert(schema.orgs).values({ name: "Magazinele noastre", kind: "agency", trialEndsAt: new Date(Date.now() + 14 * 864e5) }).returning();
  await db.insert(schema.memberships).values({ orgId: org.id, userId: user.id, role: "owner" });

  const ids: string[] = [];
  for (const s of STORES) {
    const info = parseStoreUrl(s.url);
    const [p] = await db.insert(schema.projects).values({
      orgId: org.id, name: s.name, domain: info.domain, pathPrefix: info.pathPrefix, country: s.country,
      language: s.country === "HU" ? "hu" : "ro", currency: s.country === "HU" ? "HUF" : "RON",
    }).returning();
    ids.push(p.id);
    await claimStore(p);
    let live = false;
    try {
      const c = await connectStore(p.id, { kind: "auto" });
      const n = await syncCatalog(c.id);
      live = true;
      console.log(`${s.name}: catalog real, ${n} produse.`);
    } catch (e) {
      const items = parseFeed(readFileSync(`fixtures/${s.fixture}`, "utf8"), p.currency);
      await db.insert(schema.products).values(items.map((it) => ({
        projectId: p.id, externalId: it.externalId, title: it.title, url: it.url, price: it.price?.toFixed(2) ?? null, currency: it.currency,
        inStock: it.inStock, brand: it.brand ?? null, category: it.category ?? null, imageUrl: it.imageUrl ?? null, gtin: it.gtin ?? null, description: it.description ?? null,
      })));
      await db.delete(schema.connections).where(eq(schema.connections.projectId, p.id));
      await db.insert(schema.connections).values({ projectId: p.id, kind: "feed", url: `fixture:${s.fixture}`, status: "ok", productCount: items.length, lastSyncAt: new Date(), lastError: null });
      await ensurePrompts(p.id);
      console.log(`${s.name}: conectarea reală n-a mers (${String((e as Error).message).slice(0, 80)}). Folosesc ${items.length} produse de test.`);
    }
    try { await auditProject(p.id); console.log(`${s.name}: audit gata.`); }
    catch { console.log(`${s.name}: auditul nu a putut accesa site-ul (rețea). Rulează „Verifică din nou” din panou.`); }
    void live;
  }
  invalidateWorld();

  // Istoric: rulăm zilnic ultimele DAYS zile (în modul demo, fără cost).
  for (let d = DAYS - 1; d >= 0; d--) {
    clock.offsetMs = -d * 864e5;
    invalidateWorld();
    for (const id of ids) await runProject(id);
    process.stdout.write(`\rIstoric: ziua ${DAYS - d}/${DAYS}`);
  }
  clock.offsetMs = 0;
  await demoExtras(ids);
  console.log(`\n\nGata. Intră pe http://localhost:3000/login cu ${EMAIL} / ${PASSWORD}`);
  await sql.end();
}

/** Date de test pentru funcțiile din fazele 2 și 3 (vânzări, recenzii, Agent Gate, roboți, cont de cumpărător). Toate INVENTATE. */
async function demoExtras(ids: string[]) {
  const SOURCES = ["chatgpt", "perplexity", "gemini", "copilot", "echo"];
  for (const [i, projectId] of ids.entries()) {
    const rnd = seededRandom(`extras-${projectId}`);
    const rows: (typeof schema.events.$inferInsert)[] = [];
    for (let d = DAYS - 1; d >= 0; d--) {
      const at = new Date(Date.now() - d * 864e5 - 3600e3 * 3);
      for (const src of SOURCES) {
        const visits = Math.floor(rnd() * (src === "chatgpt" ? 9 : 4));
        for (let v = 0; v < visits; v++) rows.push({ projectId, kind: "visit", source: src, sessionId: `s-${d}-${src}-${v}`, createdAt: at });
        if (rnd() < (src === "chatgpt" ? 0.45 : 0.18)) rows.push({ projectId, kind: "order", source: src, orderId: `T${1000 + i * 100 + d}${src.slice(0, 2)}`, value: (150 + rnd() * 900).toFixed(2), createdAt: at });
      }
    }
    await db.insert(schema.events).values(rows).onConflictDoNothing();
    const orders = rows.filter((r) => r.kind === "order").slice(0, 7);
    const texts = ["Livrare în 2 zile, produsul exact ca în descriere.", "Am primit factura și garanția, totul în regulă.", "Ambalaj bun, curierul a sunat înainte.", "Preț mai bun decât în alte părți.", "A durat puțin mai mult livrarea, dar m-au anunțat.", "Recomand, a doua comandă de aici."];
    for (const [k, o] of orders.entries()) {
      if (k === orders.length - 1) { await db.insert(schema.reviews).values({ projectId, orderId: o.orderId!, tokenHash: sha256(randomToken()) }).onConflictDoNothing(); continue; }
      await db.insert(schema.reviews).values({ projectId, orderId: o.orderId!, tokenHash: sha256(randomToken()), rating: k === 4 ? 3 : 5 - (k % 2), text: texts[k % texts.length], authorName: ["Andrei", "Ioana", "Mihai", "Elena", "Radu", "Ana"][k % 6], status: "publicat", submittedAt: new Date(Date.now() - k * 864e5) }).onConflictDoNothing();
    }
    for (const o of [
      { agent: "ChatGPT", verified: true, paymentMethod: "card" as const, value: 420 },
      { agent: "ChatGPT", verified: true, paymentMethod: "ramburs" as const, value: 310 },
      { agent: "Perplexity", verified: false, paymentMethod: "card" as const, value: 2400 },
      { agent: "ShopBot", verified: false, paymentMethod: "ramburs" as const, value: 1800 },
    ]) await checkAgentOrder(projectId, { ...o, orderRef: "demo" });
    const bots = [["GPTBot", "/"], ["OAI-SearchBot", "/produse"], ["ChatGPT-User", "/produs-1"], ["PerplexityBot", "/"], ["ClaudeBot", "/"], ["Google-Extended", "/"], ["Bytespider", "/"]];
    for (let d = 0; d < 7; d++) for (const [bot, path] of bots) await db.insert(schema.botVisits).values({ projectId, day: daysAgo(d), bot, path, status: bot === "ClaudeBot" ? 403 : 200, hits: 1 + Math.floor(rnd() * 20) }).onConflictDoNothing();
    await db.insert(schema.feedOutputs).values([{ projectId, channel: "google", token: randomToken(24) }, { projectId, channel: "openai", token: randomToken(24) }]).onConflictDoNothing();
    await generateFixes(projectId);
  }
  // Cont de cumpărător de test, cu produse urmărite și o alertă
  const BUYER = "cumparator@echo.local";
  await db.delete(schema.users).where(eq(schema.users.email, BUYER));
  const [buyer] = await db.insert(schema.users).values({ email: BUYER, passwordHash: await bcrypt.hash(PASSWORD, 12) }).returning();
  const prods = await db.select().from(schema.products).where(eq(schema.products.projectId, ids[ids.length - 1])).limit(3);
  for (const [k, p] of prods.entries()) await db.insert(schema.watches).values({ userId: buyer.id, productId: p.id, list: k < 2 ? "Renovare baie" : "Favorite", lastPrice: p.price, lastInStock: p.inStock, targetPrice: k === 0 && p.price ? (parseFloat(p.price) * 0.9).toFixed(2) : null });
  if (prods[0]) await db.insert(schema.notifications).values({ userId: buyer.id, message: `${prods[0].title} s-a ieftinit (exemplu de alertă, date de test).`, url: `/go/${prods[0].id}` });
  console.log(`\nCont de cumpărător: ${BUYER} / ${PASSWORD}`);
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });

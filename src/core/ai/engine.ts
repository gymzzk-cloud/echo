import { and, eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeText, sha256, today } from "@/lib/util";
import { demoRun } from "./demo";
import { extractMentions } from "./extract";
import { LIVE } from "./live";
import { PROVIDERS, type KnownProduct, type KnownStore, type Provider, type RunInput } from "./types";

/**
 * Motorul comun pentru panou și căutare.
 * O întrebare identică (normalizată) e rulată o singură dată pe zi pe fiecare AI și partajată
 * între toți clienții și cumpărătorii. Asta ține costul mic.
 */

export type World = { stores: KnownStore[]; products: KnownProduct[]; ownDomains: string[] };

let worldCache: { at: number; w: World } | null = null;
export async function loadWorld(): Promise<World> {
  if (worldCache && Date.now() - worldCache.at < 60_000) return worldCache.w;
  const projects = await db.select().from(schema.projects);
  const comps = await db.select().from(schema.competitors);
  const prods = await db
    .select({ title: schema.products.title, price: schema.products.price, url: schema.products.url, category: schema.products.category, gtin: schema.products.gtin, mpn: schema.products.mpn, domain: schema.projects.domain })
    .from(schema.products)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.products.projectId))
    .where(eq(schema.products.inStock, true))
    .limit(50000);
  const stores = new Map<string, KnownStore>();
  for (const p of projects) stores.set(p.domain, { domain: p.domain, name: p.name });
  for (const c of comps) if (!stores.has(c.domain)) stores.set(c.domain, { domain: c.domain, name: c.name });
  for (const r of ["emag.ro|eMAG", "altex.ro|Altex", "flanco.ro|Flanco", "dedeman.ro|Dedeman", "leroymerlin.ro|Leroy Merlin", "hornbach.ro|Hornbach", "pcgarage.ro|PC Garage", "notino.ro|Notino", "elefant.ro|Elefant", "decathlon.ro|Decathlon", "sculemarket.ro|Scule Market", "pethome.ro|PetHome", "arukereso.hu|Árukereső", "emag.hu|eMAG HU"]) {
    const [d, n] = r.split("|");
    if (!stores.has(d)) stores.set(d, { domain: d, name: n });
  }
  const w: World = {
    stores: [...stores.values()],
    products: prods.map(({ gtin, mpn, ...p }) => ({ ...p, price: p.price ? parseFloat(p.price) : null, codes: [gtin, mpn].filter((c): c is string => !!c).map((c) => normalizeText(c)) })),
    ownDomains: projects.map((p) => p.domain),
  };
  worldCache = { at: Date.now(), w };
  return w;
}
export const invalidateWorld = () => { worldCache = null; };

export function activeProviders(): { id: Provider; live: boolean }[] {
  return PROVIDERS.map((p) => ({ id: p.id, live: LIVE[p.id].isLive() }));
}
export const isDemo = () => activeProviders().every((p) => !p.live);
/**
 * AI-urile pe care le întrebăm efectiv: doar cele cu cheie. Răspunsurile simulate (modul DEMO)
 * apar numai cu ALLOW_DEMO_AI=1, ca să nu amestecăm date inventate cu cele reale.
 */
export const usableProviders = () => PROVIDERS.filter((p) => LIVE[p.id].isLive() || process.env.ALLOW_DEMO_AI === "1");

/** Rulează (sau ia din cache-ul zilei) o întrebare pe un AI. */
export async function runQuery(provider: Provider, input: RunInput, world?: World) {
  const qh = sha256(`${input.language}|${input.country}|${normalizeText(input.query)}`);
  const day = today();
  const existing = await db.select().from(schema.runs)
    .where(and(eq(schema.runs.queryHash, qh), eq(schema.runs.provider, provider), eq(schema.runs.runDate, day)))
    .limit(1);
  if (existing[0]) return existing[0];

  const w = world ?? (await loadWorld());
  const runner = LIVE[provider];
  let out;
  try {
    out = runner.isLive() ? await runner.run(input) : demoRun(provider, input, w);
  } catch (e) {
    // Un AI căzut nu oprește restul: înregistrăm eroarea ca răspuns gol, fără cost.
    out = { answer: `(Eroare ${provider}: ${String(e).slice(0, 200)})`, sources: [], model: "eroare", mode: "live" as const, costUsd: 0, latencyMs: 0 };
  }
  const mentions = extractMentions(out.answer, out.sources, w);
  const [row] = await db.insert(schema.runs).values({
    queryHash: qh, query: input.query, language: input.language, provider, model: out.model, mode: out.mode,
    answer: out.answer, sources: out.sources, mentions, costUsd: out.costUsd.toFixed(5), inputTokens: out.inputTokens ?? 0, outputTokens: out.outputTokens ?? 0, latencyMs: out.latencyMs, runDate: day,
  }).onConflictDoNothing().returning();
  if (row) return row;
  const again = await db.select().from(schema.runs)
    .where(and(eq(schema.runs.queryHash, qh), eq(schema.runs.provider, provider), eq(schema.runs.runDate, day))).limit(1);
  return again[0];
}

/** Rulează o întrebare pe toate AI-urile în paralel. */
export async function runAll(input: RunInput) {
  const w = await loadWorld();
  return Promise.all(usableProviders().map((p) => runQuery(p.id, input, w)));
}

/**
 * Consumul unui magazin luna aceasta: rulările legate de întrebările lui.
 * O rulare partajată cu alte magazine se socotește întreagă la fiecare (estimare prudentă pentru plafon).
 */
export async function projectUsageThisMonth(projectId: string) {
  const r = await db.execute(dsql`
    select count(*)::int as n, coalesce(sum(r.cost_usd),0)::float as usd,
           coalesce(sum(r.input_tokens),0)::int as "inputTokens", coalesce(sum(r.output_tokens),0)::int as "outputTokens"
    from runs r
    where r.run_date >= date_trunc('month', now()) and r.mode = 'live'
      and r.id in (select pr.run_id from prompt_runs pr join prompts p on p.id = pr.prompt_id where p.project_id = ${projectId})`);
  return r[0] as unknown as { n: number; usd: number; inputTokens: number; outputTokens: number };
}

export async function costThisMonth() {
  const r = await db.execute(dsql`select coalesce(sum(cost_usd),0)::float as usd, count(*)::int as n from runs where run_date >= date_trunc('month', now())`);
  return r[0] as unknown as { usd: number; n: number };
}

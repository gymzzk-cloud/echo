import { and, eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeText, sha256, today } from "@/lib/util";
import { demoRun } from "./demo";
import { cleanAnswer, runMentions } from "./extract";
import { limitReason, limitUsage, recentRun, waitForSlot } from "./limits";
import { LIVE } from "./live";
import { ERROR_MODEL, PROVIDERS, type KnownProduct, type KnownStore, type Provider, type RunInput } from "./types";

/**
 * Motorul comun pentru panou și căutare.
 * O întrebare identică (normalizată) e rulată o singură dată pe zi pe fiecare AI și partajată
 * între toți clienții și cumpărătorii. Asta ține costul mic.
 */

export { ERROR_MODEL };

const KNOWN_RETAILERS = [
  "emag.ro|eMAG", "altex.ro|Altex", "flanco.ro|Flanco", "dedeman.ro|Dedeman", "leroymerlin.ro|Leroy Merlin", "hornbach.ro|Hornbach",
  "bricodepot.ro|Brico Depot", "praktiker.ro|Praktiker", "mathaus.ro|Mathaus", "ebernardo.ro|eBernardo", "danibrum.ro|Danibrum",
  "atelierultau.ro|Atelierul Tău", "sculemarket.ro|Scule Market", "unealta.ro|Unealta", "toolszone.ro|ToolsZone", "evomag.ro|evoMAG",
  "cel.ro|CEL.ro", "pcgarage.ro|PC Garage", "mediagalaxy.ro|Media Galaxy", "ikea.ro|IKEA", "kaufland.ro|Kaufland", "lidl.ro|Lidl",
  "notino.ro|Notino", "elefant.ro|Elefant", "decathlon.ro|Decathlon", "pethome.ro|PetHome", "vexio.ro|Vexio", "okazii.ro|Okazii",
  "emag.hu|eMAG HU", "praktiker.hu|Praktiker HU", "obi.hu|OBI", "bauhaus.hu|Bauhaus", "mediamarkt.hu|MediaMarkt", "alza.hu|Alza",
  "arukereso.hu|Árukereső",
];

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
  // Magazine mari din RO/HU, recunoscute și după nume când AI-ul nu dă linkul („la Dedeman găsești…”).
  for (const r of KNOWN_RETAILERS) {
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
export async function runQuery(provider: Provider, input: RunInput, world?: World, opts: { skipReason?: string } = {}) {
  const qh = sha256(`${input.language}|${input.country}|${normalizeText(input.query)}`);
  const day = today();
  const existing = await db.select().from(schema.runs)
    .where(and(eq(schema.runs.queryHash, qh), eq(schema.runs.provider, provider), eq(schema.runs.runDate, day)))
    .limit(1);
  // O rulare reușită azi se refolosește. Una cu eroare (AI căzut, parametru respins) se reîncearcă.
  if (existing[0] && existing[0].model !== ERROR_MODEL) return existing[0];

  const w = world ?? (await loadWorld());
  const runner = LIVE[provider];
  const live = runner.isLive();
  const limits = live ? runner.limits?.() ?? {} : {};
  // Planurile cu credite puține (SerpApi): o rulare reușită de curând se refolosește, nu se plătește din nou.
  if (limits.reuseDays && limits.reuseDays > 1) {
    const recent = await recentRun(qh, provider, day, limits.reuseDays);
    // Copiat pe ziua de azi, fără cost, ca rapoartele zilei să-l vadă; nu consumă credite (cost 0).
    if (recent) {
      const { id: _id, createdAt: _c, ...copy } = recent;
      const [row] = await db.insert(schema.runs).values({ ...copy, runDate: day, costUsd: "0", inputTokens: 0, outputTokens: 0, latencyMs: 0 })
        .onConflictDoUpdate({ target: [schema.runs.queryHash, schema.runs.provider, schema.runs.runDate], set: { model: copy.model, answer: copy.answer, sources: copy.sources, mentions: copy.mentions, costUsd: "0" }, setWhere: dsql`${schema.runs.model} = ${ERROR_MODEL}` })
        .returning();
      if (row) return row;
    }
  }
  // Plafonul planului gratuit (pe zi / pe lună): nu mai întrebăm, rularea apare ca „nu am putut întreba”, cu motivul.
  const skipReason = opts.skipReason ?? (live && (limits.perDay || limits.perMonthCredits) ? limitReason(limits, await limitUsage(provider, day)) : null);
  let out;
  try {
    // AI-ul a eșuat de mai multe ori la rând în această rulare sau i-am atins limita: nu-l mai întrebăm, păstrăm motivul.
    if (skipReason) throw new Error(skipReason);
    if (live) await waitForSlot(provider, limits.rpm);
    out = live ? await runner.run(input) : demoRun(provider, input, w);
  } catch (e) {
    // Un AI căzut nu oprește restul: înregistrăm eroarea ca răspuns gol, fără cost.
    const msg = String(e).slice(0, 400);
    // Doar mesajul de eroare al API-ului (fără chei sau date personale), ca să se vadă în loguri.
    if (!skipReason) console.error(`AI ${provider} eroare: ${msg}`);
    out = { answer: `(Eroare ${provider}: ${msg})`, sources: [], model: ERROR_MODEL, mode: "live" as const, costUsd: 0, latencyMs: 0 };
  }
  const mentions = runMentions({ ...out, query: input.query, language: input.language }, w);
  const [row] = await db.insert(schema.runs).values({
    queryHash: qh, query: input.query, language: input.language, provider, model: out.model, mode: out.mode,
    answer: cleanAnswer(out.answer), sources: out.sources, mentions, costUsd: out.costUsd.toFixed(5), inputTokens: out.inputTokens ?? 0, outputTokens: out.outputTokens ?? 0, latencyMs: out.latencyMs, runDate: day,
  }).onConflictDoUpdate({
    target: [schema.runs.queryHash, schema.runs.provider, schema.runs.runDate],
    // Suprascriem doar o rulare cu eroare; una reușită (scrisă între timp de alt job) rămâne.
    set: { model: out.model, mode: out.mode, answer: cleanAnswer(out.answer), sources: out.sources, mentions, costUsd: out.costUsd.toFixed(5), inputTokens: out.inputTokens ?? 0, outputTokens: out.outputTokens ?? 0, latencyMs: out.latencyMs },
    setWhere: dsql`${schema.runs.model} = ${ERROR_MODEL}`,
  }).returning();
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

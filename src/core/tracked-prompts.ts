import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { humanName, promptLimit, suggestPrompts, type SuggestedPrompt } from "./prompts";

type Existing = { id: string; text: string; active: boolean; suggested: boolean };

/**
 * Ce schimbăm în lista unui magazin ca să ajungă la lista propusă:
 * - cele adăugate de mână rămân mereu și intră în limită;
 * - cele propuse care nu mai sunt în listă (produs ieșit din stoc, produse de test, întrebări vechi) se șterg;
 * - cele propuse care rămân nu se ating (istoricul lor rămâne), nici dacă magazinul le-a oprit;
 * - cele noi se adaugă până la limită.
 * Funcție pură, ca regula să poată fi testată fără bază de date.
 */
export function planPromptChanges(existing: Existing[], desired: SuggestedPrompt[], limit: number) {
  const key = (t: string) => t.trim().toLowerCase();
  const manual = existing.filter((p) => !p.suggested);
  const manualKeys = new Set(manual.map((p) => key(p.text)));
  const room = Math.max(0, limit - manual.filter((p) => p.active).length);
  // Căutările despre magazin (pentru Reputație) au prioritate, chiar dacă limita e mică.
  const ordered = [...desired.filter((d) => d.intent === "brand"), ...desired.filter((d) => d.intent !== "brand")];
  const wanted = ordered.filter((d) => !manualKeys.has(key(d.text))).slice(0, room);
  const wantedKeys = new Set(wanted.map((d) => key(d.text)));
  const suggested = existing.filter((p) => p.suggested);
  const remove = suggested.filter((p) => !wantedKeys.has(key(p.text))).map((p) => p.id);
  const have = new Set(suggested.map((p) => key(p.text)));
  const add = wanted.filter((d) => !have.has(key(d.text)));
  return { remove, add };
}

/** Catalogul are doar produsele de test (din fixtures), nu pe cele reale ale magazinului. */
async function onlyTestCatalog(projectId: string) {
  const conns = await db.select({ url: schema.connections.url }).from(schema.connections).where(eq(schema.connections.projectId, projectId));
  return !conns.length || conns.every((c) => c.url.startsWith("fixture:"));
}

/**
 * Reface căutările propuse din catalogul real. Fără apeluri AI, doar baza de date, deci ieftin:
 * rulează după fiecare sincronizare cu schimbări și înaintea rulării zilnice. Idempotentă.
 */
export async function refreshPrompts(projectId: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  if (!p) return { added: 0, removed: 0 };
  const [org] = await db.select({ plan: schema.orgs.plan }).from(schema.orgs).where(eq(schema.orgs.id, p.orgId));
  const limit = promptLimit(org?.plan ?? "trial");
  const products = (await onlyTestCatalog(projectId)) ? [] : await db
    .select({ id: schema.products.id, externalId: schema.products.externalId, title: schema.products.title, category: schema.products.category, brand: schema.products.brand, price: schema.products.price, gtin: schema.products.gtin, mpn: schema.products.mpn, rank: schema.products.popularityRank })
    .from(schema.products).where(and(eq(schema.products.projectId, projectId), eq(schema.products.inStock, true)));
  const lang = p.language as "ro" | "hu";
  const desired = suggestPrompts(products, p.name, lang, limit);
  const existing = await db.select({ id: schema.prompts.id, text: schema.prompts.text, active: schema.prompts.active, suggested: schema.prompts.suggested })
    .from(schema.prompts).where(eq(schema.prompts.projectId, projectId));
  const { remove, add } = planPromptChanges(existing, desired, limit);
  for (let i = 0; i < remove.length; i += 500) {
    await db.delete(schema.prompts).where(and(eq(schema.prompts.projectId, projectId), inArray(schema.prompts.id, remove.slice(i, i + 500))));
  }
  if (add.length) {
    await db.insert(schema.prompts).values(add.map((x) => ({
      projectId, text: x.text, category: x.category, intent: x.intent, productId: x.productId ?? null, language: p.language, suggested: true,
    })));
  }
  if (add.length || remove.length) console.log(`căutări ${p.domain}${p.pathPrefix}: +${add.length} / -${remove.length} (limită ${limit})`);
  return { added: add.length, removed: remove.length };
}

/**
 * „Urmărește în AI” pe un produs: căutarea lui (marcă + model) devine aleasă de client, deci nu mai e
 * înlocuită automat. Dacă era deja propusă automat, o păstrăm (cu istoricul) și doar o marcăm ca aleasă.
 * „Nu mai urmări”: o dăm înapoi listei automate, care o păstrează sau o scoate după regulile obișnuite.
 */
export async function setProductTracked(projectId: string, productId: string, on: boolean, plan: string) {
  const [prod] = await db.select({ id: schema.products.id, title: schema.products.title, brand: schema.products.brand })
    .from(schema.products).where(and(eq(schema.products.id, productId), eq(schema.products.projectId, projectId)));
  if (!prod) throw new Error("Produs inexistent.");
  const [p] = await db.select({ language: schema.projects.language }).from(schema.projects).where(eq(schema.projects.id, projectId));
  const mine = await db.select({ id: schema.prompts.id, suggested: schema.prompts.suggested, intent: schema.prompts.intent })
    .from(schema.prompts).where(and(eq(schema.prompts.projectId, projectId), eq(schema.prompts.productId, productId)));
  if (!on) {
    const manual = mine.filter((x) => !x.suggested).map((x) => x.id);
    if (manual.length) await db.update(schema.prompts).set({ suggested: true }).where(inArray(schema.prompts.id, manual));
  } else {
    const manualActive = await db.select({ id: schema.prompts.id }).from(schema.prompts)
      .where(and(eq(schema.prompts.projectId, projectId), eq(schema.prompts.suggested, false), eq(schema.prompts.active, true)));
    const limit = promptLimit(plan);
    if (manualActive.length >= limit) throw new Error(`Planul tău urmărește cel mult ${limit} căutări alese de tine. Scoate una ca să adaugi alta.`);
    const byName = mine.find((x) => x.intent === "produs");
    if (byName) await db.update(schema.prompts).set({ suggested: false, active: true }).where(eq(schema.prompts.id, byName.id));
    else await db.insert(schema.prompts).values({ projectId, text: humanName(prod), category: null, intent: "produs", productId, language: p?.language ?? "ro", suggested: false });
  }
  await refreshPrompts(projectId);
}

/** Produsele urmărite în AI (căutare activă pe numele lor) și dacă le-a ales clientul. */
export async function trackedProducts(projectId: string) {
  const rows = await db.select({ productId: schema.prompts.productId, suggested: schema.prompts.suggested }).from(schema.prompts)
    .where(and(eq(schema.prompts.projectId, projectId), eq(schema.prompts.active, true), eq(schema.prompts.intent, "produs")));
  const m = new Map<string, "ales" | "automat">();
  for (const r of rows) if (r.productId) m.set(r.productId, !r.suggested ? "ales" : m.get(r.productId) ?? "automat");
  return m;
}

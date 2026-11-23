// Măsoară viteza paginilor din panou (regula „Viteză” din CLAUDE.md).
// Rulare: pornește aplicația (`pnpm build && pnpm start`), apoi `pnpm perf`.
// Variabile: PERF_URL (implicit http://localhost:3000), PERF_EMAIL (implicit demo@echo.local),
// PERF_LIMIT_MS (prag pe pagină: implicit 100 ms pe un procesor întreg ≈ 1 s pe Render gratuit, care are 0,1 procesor),
// PERF_SEED (ex. 15000: adaugă temporar atâtea produse de test magazinului măsurat, apoi le șterge).
import { and, eq, like } from "drizzle-orm";
import { db, schema, sql } from "../src/db";
import { randomToken, sha256 } from "../src/lib/util";
import { PANEL_PAGES } from "./panel-pages";

const BASE = process.env.PERF_URL ?? "http://localhost:3000";
const EMAIL = process.env.PERF_EMAIL ?? "demo@echo.local";
const LIMIT = Number(process.env.PERF_LIMIT_MS ?? 100);
const SEED = Number(process.env.PERF_SEED ?? 0);
const PAGES: string[] = [...PANEL_PAGES];

const [user] = await db.select().from(schema.users).where(eq(schema.users.email, EMAIL));
if (!user) throw new Error(`Nu există utilizatorul ${EMAIL}.`);
const [member] = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, user.id)).limit(1);
const [project] = await db.select().from(schema.projects).where(eq(schema.projects.orgId, member.orgId)).limit(1);
const token = randomToken();
await db.insert(schema.sessions).values({ id: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + 3600e3) });
const cookie = `echo_session=${token}; echo_project=${project.id}`;

if (SEED > 0) {
  const rows = Array.from({ length: SEED }, (_, i) => ({
    projectId: project.id, externalId: `perf-${i}`, title: `Produs de test ${i}`, url: `https://${project.domain}/perf-${i}`,
    price: String((i % 500) + 10), gtin: `PERF${i}`, description: "descriere de test ".repeat(30), inStock: i % 7 !== 0,
  }));
  for (let i = 0; i < rows.length; i += 1000) await db.insert(schema.products).values(rows.slice(i, i + 1000));
  console.log(`Am adăugat ${SEED} produse de test la ${project.domain}${project.pathPrefix ?? ""}.`);
}

// Paginile pe un produs: fișa produsului (feed ChatGPT, Google, pagina, răspunsuri) și căutarea în tot catalogul.
const [one] = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.projectId, project.id)).limit(1);
if (one) PAGES.push(`/panou/produse-ai/${one.id}`, "/panou/produse-ai?cauta=bormasina%20percutie");

const time = async (path: string) => {
  const t = performance.now();
  const r = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
  const first = Math.round(performance.now() - t); // primul răspuns: ce vede omul imediat (antet, schelet)
  await r.text();
  return { status: r.status, first, ms: Math.round(performance.now() - t) };
};

let slow = 0;
try {
  for (const p of PAGES) {
    await time(p); // prima cerere încălzește pagina
    const runs = [await time(p), await time(p)];
    const ms = Math.min(...runs.map((r) => r.ms));
    const first = Math.min(...runs.map((r) => r.first));
    // Pragul se aplică primului răspuns; o parte grea poate veni după, în Suspense, dar tot cel mult de 3 ori pragul.
    const bad = first > LIMIT || ms > LIMIT * 3 || runs[0].status >= 400;
    if (bad) slow++;
    console.log(`${bad ? "✗" : "✓"} ${p.padEnd(24)} primul răspuns ${String(first).padStart(5)} ms · complet ${String(ms).padStart(5)} ms  (${runs[0].status})`);
  }
} finally {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  if (SEED > 0) await db.delete(schema.products).where(and(eq(schema.products.projectId, project.id), like(schema.products.externalId, "perf-%")));
  await sql.end();
}
console.log(slow ? `${slow} pagini peste ${LIMIT} ms.` : `Toate paginile sub ${LIMIT} ms.`);
process.exit(slow ? 1 : 0);

import { eq } from "drizzle-orm";
import { db, schema, sql } from "../../src/db";
import { sha256 } from "../../src/lib/util";
import { computeProductVisibility } from "../../src/core/product-visibility-job";
const [p] = await db.select().from(schema.projects).where(eq(schema.projects.domain, "hardlineconstruct.ro")).limit(1);
const prods = await db.select().from(schema.products).where(eq(schema.products.projectId, p.id));
const prompts = await db.select().from(schema.prompts).where(eq(schema.prompts.projectId, p.id)).limit(4);
const provs = ["chatgpt", "gemini", "claude"];
let k = 0;
for (const [pi, q] of prompts.entries()) for (const prov of provs) {
  const a = prods[(pi + k) % prods.length], b = prods[(pi + k + 1) % prods.length], c = prods[(pi + k + 3) % prods.length];
  k++;
  const pr = (x: typeof a, f = 1) => Math.round(parseFloat(x.price ?? "100") * f);
  const ans = `Iată câteva opțiuni bune:\n1. **${a.title}** – ${pr(a)} lei, la Hardline Construct (hardlineconstruct.ro)\n2. [${b.title}](${b.url}) – bună pentru acasă\n   - Preț: aproximativ ${pr(b, k % 3 === 0 ? 1.2 : 1)} lei\n3. **${c.title}** la eMAG, ${pr(c, k % 4 === 0 ? 0.85 : 1)} lei\n\nConcluzie: alege după buget.`;
  const [r] = await db.insert(schema.runs).values({ queryHash: sha256(`fake2${p.id}${pi}${prov}`), query: q.text, language: "ro", provider: prov, model: "test", mode: "demo", answer: ans, sources: [], mentions: k % 2 ? [{ domain: p.domain, position: 1 }] : [], runDate: "2026-11-22" }).onConflictDoNothing().returning();
  if (r) await db.insert(schema.promptRuns).values({ promptId: q.id, runId: r.id }).onConflictDoNothing();
}
console.log(await computeProductVisibility(p.id));
await sql.end();

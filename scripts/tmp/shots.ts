import { createRequire } from "node:module";
import { eq, and, desc } from "drizzle-orm";
import { db, schema, sql } from "../../src/db";
import { randomToken, sha256 } from "../../src/lib/util";
const { chromium } = createRequire(import.meta.url)("playwright");
const [u] = await db.select().from(schema.users).where(eq(schema.users.email, "demo@echo.local"));
const [p] = await db.select().from(schema.projects).where(eq(schema.projects.domain, "hardlineconstruct.ro"));
const [st] = await db.select().from(schema.productAiStats).where(and(eq(schema.productAiStats.projectId, p.id), eq(schema.productAiStats.priceWrong, true))).orderBy(desc(schema.productAiStats.appearances)).limit(1);
const token = randomToken();
await db.insert(schema.sessions).values({ id: sha256(token), userId: u.id, expiresAt: new Date(Date.now() + 3600e3) });
const b = await chromium.launch();
const out = "/mnt/project-files/agentready/capturi/produse-ai/";
for (const [name, w, theme, path] of [["lista-luminos", 1366, "light", "/panou/produse-ai"], ["dovezi-luminos", 1366, "light", `/panou/produse-ai/${st.productId}`], ["dovezi-intunecat", 1366, "dark", `/panou/produse-ai/${st.productId}`], ["dovezi-telefon", 390, "light", `/panou/produse-ai/${st.productId}`], ["lista-telefon", 390, "light", "/panou/produse-ai"]] as const) {
  const c = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
  await c.addCookies([{ name: "echo_session", value: token, url: "http://localhost:3000" }, { name: "echo_project", value: p.id, url: "http://localhost:3000" }]);
  await c.addInitScript(`try{localStorage.setItem("theme","${theme}")}catch{}`);
  const pg = await c.newPage(); await pg.goto("http://localhost:3000" + path, { waitUntil: "networkidle" });
  if (name.startsWith("dovezi")) await pg.evaluate(`document.querySelector("details")?.setAttribute("open","")`);
  const sw = await pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1");
  console.log(name, "scroll orizontal:", sw);
  await pg.screenshot({ path: `${out}${name}.png`, fullPage: true }); await c.close();
}
await b.close(); await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token))); await sql.end();

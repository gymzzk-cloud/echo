// Verificarea vizuală automată a panoului (DESIGN.md §8 și §12).
// Rulare: pornește aplicația (`pnpm build && pnpm start`), apoi `pnpm ui:check`.
// Pentru fiecare pagină din panou, la 360, 768 și 1366 px, în modul luminos și în cel întunecat:
//  - pagina nu derulează orizontal;
//  - nicio insignă (Badge) nu se rupe pe două rânduri;
//  - niciun buton nu se rupe pe două rânduri;
// și salvează o captură în UI_SHOTS (implicit ./ui-shots), ca să poată fi văzută în PR.
// Folosește Playwright (`playwright`), instalat global în mediile de lucru; altfel `npm i -g playwright && npx playwright install chromium`.
// Variabile: UI_URL (implicit http://localhost:3000), UI_EMAIL (implicit demo@echo.local), UI_PAGES (listă separată prin virgulă).
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema, sql } from "../src/db";
import { randomToken, sha256 } from "../src/lib/util";
import { PANEL_PAGES } from "./panel-pages";

type Browser = { newContext(o: object): Promise<Ctx>; close(): Promise<void> };
type Ctx = { addCookies(c: object[]): Promise<void>; newPage(): Promise<Page>; close(): Promise<void> };
type Page = { goto(u: string, o?: object): Promise<unknown>; evaluate<T>(f: string): Promise<T>; screenshot(o: object): Promise<unknown>; waitForLoadState(s: string): Promise<void> };
const { chromium } = createRequire(import.meta.url)("playwright") as { chromium: { launch(): Promise<Browser> } };

const BASE = process.env.UI_URL ?? "http://localhost:3000";
const EMAIL = process.env.UI_EMAIL ?? "demo@echo.local";
const OUT = process.env.UI_SHOTS ?? "ui-shots";
const PAGES = process.env.UI_PAGES ? process.env.UI_PAGES.split(",") : PANEL_PAGES;
const WIDTHS = [360, 768, 1366];
const SCHEMES = ["light", "dark"] as const;

// Rulează în pagină. E un șir, nu o funcție, ca transpilarea să nu adauge ajutoare care nu există în browser.
const CHECK = `(() => {
  const out = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) out.push("derulează orizontal (" + doc.scrollWidth + " > " + doc.clientWidth + " px)");
  for (const el of document.querySelectorAll("[data-ui=badge]")) {
    const r = el.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
    if (r.height > lh * 1.5 + 8) out.push("insignă pe două rânduri: „" + el.textContent.trim() + "”");
  }
  for (const el of document.querySelectorAll("main button, main a[data-ui=button]")) {
    const r = el.getBoundingClientRect();
    if (r.height > 56) out.push("buton pe două rânduri: „" + el.textContent.trim() + "” (" + Math.round(r.height) + " px)");
  }
  return out;
})()`;

const [user] = await db.select().from(schema.users).where(eq(schema.users.email, EMAIL));
if (!user) throw new Error(`Nu există utilizatorul ${EMAIL}.`);
const [member] = await db.select().from(schema.memberships).where(eq(schema.memberships.userId, user.id)).limit(1);
const [project] = await db.select().from(schema.projects).where(eq(schema.projects.orgId, member.orgId)).limit(1);
const token = randomToken();
await db.insert(schema.sessions).values({ id: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + 3600e3) });
const host = new URL(BASE).hostname;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const problems: string[] = [];
try {
  for (const scheme of SCHEMES) {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1 });
      await ctx.addCookies([
        { name: "echo_session", value: token, domain: host, path: "/" },
        { name: "echo_project", value: project.id, domain: host, path: "/" },
      ]);
      const page = await ctx.newPage();
      for (const path of PAGES) {
        await page.goto(BASE + path, { waitUntil: "networkidle" });
        const found = await page.evaluate<string[]>(CHECK);
        const name = `${path.replace(/^\/panou\/?/, "") || "acasa"}-${width}-${scheme}`.replace(/\//g, "_");
        await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
        for (const f of found) problems.push(`${path} @ ${width}px ${scheme}: ${f}`);
        console.log(`${found.length ? "✗" : "✓"} ${path.padEnd(24)} ${String(width).padStart(4)} px ${scheme}${found.length ? `  ${found.length} probleme` : ""}`);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  await sql.end();
}
if (problems.length) {
  console.log(`\n${problems.length} abateri de la DESIGN.md:`);
  for (const p of [...new Set(problems)]) console.log(" - " + p);
}
console.log(`Capturi în ${OUT}/.`);
process.exit(problems.length ? 1 : 0);

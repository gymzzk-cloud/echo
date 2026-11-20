import { and, eq, gte, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { AI_BOTS } from "./audit";

/**
 * Roboții AI pe site: din jurnalele serverului (încărcate) sau trimise automat de un Cloudflare Worker / plugin.
 * Roboții nu rulează JavaScript, deci vizitele lor se văd doar pe server.
 */

const EXTRA = [{ ua: "Bytespider", vendor: "ByteDance" }, { ua: "DuckAssistBot", vendor: "DuckDuckGo" }, { ua: "MistralAI-User", vendor: "Mistral" }, { ua: "YouBot", vendor: "You.com" }];
const ALL = [...AI_BOTS.map((b) => ({ ua: b.ua, vendor: b.vendor })), ...EXTRA];

export function botFromUserAgent(ua: string): string | null {
  const l = ua.toLowerCase();
  // Cele mai specifice întâi (ex. „OAI-SearchBot” înaintea „GPTBot”, „Google-Extended” nu apare în UA, deci Googlebot e general)
  for (const b of [...ALL].sort((a, b) => b.ua.length - a.ua.length)) if (l.includes(b.ua.toLowerCase())) return b.ua;
  return null;
}
export const botVendor = (bot: string) => ALL.find((b) => b.ua === bot)?.vendor ?? "";

// Format „combined” (nginx/Apache): IP - - [10/Oct/2026:13:55:36 +0300] "GET /p HTTP/1.1" 200 2326 "ref" "UA"
const LINE = /^\S+ \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):[^\]]+\] "(?:GET|HEAD|POST) (\S+)[^"]*" (\d{3}) \S+ "[^"]*" "([^"]*)"/;
const MON: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

export type BotHit = { day: string; bot: string; path: string; status: number };

export function parseAccessLog(text: string): BotHit[] {
  const out: BotHit[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    const bot = botFromUserAgent(m[6]);
    if (!bot) continue;
    out.push({ day: `${m[3]}-${MON[m[2]] ?? "01"}-${m[1]}`, bot, path: m[4].split("?")[0].slice(0, 300), status: parseInt(m[5], 10) });
  }
  return out;
}

export async function saveBotHits(projectId: string, hits: BotHit[]) {
  const agg = new Map<string, BotHit & { hits: number }>();
  for (const h of hits) { const k = `${h.day}|${h.bot}|${h.path}|${h.status}`; const e = agg.get(k) ?? { ...h, hits: 0 }; e.hits++; agg.set(k, e); }
  const rows = [...agg.values()].map((h) => ({ projectId, day: h.day, bot: h.bot, path: h.path, status: h.status, hits: h.hits }));
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(schema.botVisits).values(rows.slice(i, i + 500)).onConflictDoUpdate({
      target: [schema.botVisits.projectId, schema.botVisits.day, schema.botVisits.bot, schema.botVisits.path, schema.botVisits.status],
      set: { hits: dsql`${schema.botVisits.hits} + excluded.hits` },
    });
  }
  return rows.length;
}

export async function botSummary(projectId: string, fromDay: string) {
  const where = and(eq(schema.botVisits.projectId, projectId), gte(schema.botVisits.day, fromDay));
  const byBot = await db.select({ bot: schema.botVisits.bot, hits: dsql<number>`sum(${schema.botVisits.hits})::int`, blocked: dsql<number>`sum(case when ${schema.botVisits.status} in (401,403,429,503) then ${schema.botVisits.hits} else 0 end)::int`, missing: dsql<number>`sum(case when ${schema.botVisits.status} = 404 then ${schema.botVisits.hits} else 0 end)::int`, pages: dsql<number>`count(distinct ${schema.botVisits.path})::int` })
    .from(schema.botVisits).where(where).groupBy(schema.botVisits.bot).orderBy(dsql`2 desc`);
  const topPages = await db.select({ path: schema.botVisits.path, hits: dsql<number>`sum(${schema.botVisits.hits})::int`, bots: dsql<string[]>`array_agg(distinct ${schema.botVisits.bot})` })
    .from(schema.botVisits).where(where).groupBy(schema.botVisits.path).orderBy(dsql`2 desc`).limit(20);
  const daily = await db.select({ day: schema.botVisits.day, hits: dsql<number>`sum(${schema.botVisits.hits})::int` }).from(schema.botVisits).where(where).groupBy(schema.botVisits.day).orderBy(schema.botVisits.day);
  return { byBot, topPages, daily };
}

/** Cloudflare Worker pe care magazinul îl pune în fața site-ului: raportează doar vizitele roboților AI. */
export function cloudflareWorker(appUrl: string, key: string) {
  return `// Echo: raportează vizitele roboților AI (fără date despre oameni)
const BOTS = /${ALL.map((b) => b.ua.replace(/[-.]/g, "\\\\$&")).join("|")}/i;
export default {
  async fetch(request, env, ctx) {
    const response = await fetch(request);
    const ua = request.headers.get("user-agent") || "";
    const m = ua.match(BOTS);
    if (m) {
      const url = new URL(request.url);
      ctx.waitUntil(fetch("${appUrl}/api/bots", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: "${key}", hits: [{ bot: m[0], path: url.pathname, status: response.status }] }) }));
    }
    return response;
  },
};`;
}

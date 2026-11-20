import { and, eq, gte, sql as dsql } from "drizzle-orm";
import { emitEvent } from "./platform";
import { db, schema } from "@/db";

/**
 * Urmărirea proprie a vânzărilor (fără rețea de afiliere).
 * Codul /t.js de pe site-ul magazinului vede de unde vine vizitatorul (ChatGPT, Perplexity, Gemini, Claude, Copilot, căutarea Echo)
 * și raportează comenzile de pe pagina de mulțumire. Fără cookie-uri de terți și fără date personale: doar sursa, suma și id-ul comenzii.
 */

export const AI_SOURCES: { id: string; label: string; hosts: RegExp; utm: RegExp }[] = [
  { id: "chatgpt", label: "ChatGPT", hosts: /(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com)$/, utm: /chatgpt|openai/ },
  { id: "perplexity", label: "Perplexity", hosts: /(^|\.)perplexity\.ai$/, utm: /perplexity/ },
  { id: "gemini", label: "Gemini", hosts: /(^|\.)(gemini\.google\.com|bard\.google\.com)$/, utm: /gemini|bard/ },
  { id: "claude", label: "Claude", hosts: /(^|\.)claude\.ai$/, utm: /claude|anthropic/ },
  { id: "copilot", label: "Copilot", hosts: /(^|\.)(copilot\.microsoft\.com|copilot\.cloud\.microsoft)$/, utm: /copilot/ },
  { id: "echo", label: "Căutarea Echo", hosts: /(^|\.)echo\.ai$/, utm: /^echo$/ },
  { id: "alt_ai", label: "Alt AI", hosts: /(^|\.)(you\.com|phind\.com|meta\.ai|deepseek\.com|chat\.mistral\.ai|grok\.com)$/, utm: /you\.com|phind|meta\.ai|deepseek|mistral|grok/ },
];
export const sourceLabel = (id: string) => AI_SOURCES.find((s) => s.id === id)?.label ?? id;

/** Sursa AI dintr-un referrer și utm_source. Întoarce null pentru trafic care nu vine din AI. */
export function detectAiSource(referrer: string | null | undefined, utmSource: string | null | undefined): string | null {
  const utm = (utmSource ?? "").toLowerCase();
  if (utm) for (const s of AI_SOURCES) if (s.utm.test(utm)) return s.id;
  if (!referrer) return null;
  let host = "";
  try { host = new URL(referrer).hostname.toLowerCase(); } catch { return null; }
  for (const s of AI_SOURCES) if (s.hosts.test(host)) return s.id;
  return null;
}

type Incoming = { key: string; kind: string; source?: string; ref?: string; utm?: string; url?: string; session?: string; click?: string; order?: string; value?: number; currency?: string; origin?: string | null };

/** Înregistrează un eveniment venit de la /t.js. Verifică cheia și că pagina e chiar pe domeniul magazinului. */
export async function recordEvent(e: Incoming) {
  if (!/^[a-f0-9]{20}$/.test(e.key) || !["visit", "order"].includes(e.kind)) return { ok: false, reason: "date invalide" };
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.trackingKey, e.key)).limit(1);
  if (!p) return { ok: false, reason: "cheie necunoscută" };
  const pageHost = (() => { try { return new URL(e.url ?? e.origin ?? "").hostname.replace(/^www\./, ""); } catch { return ""; } })();
  if (pageHost && pageHost !== p.domain && !pageHost.endsWith("." + p.domain) && pageHost !== "localhost") return { ok: false, reason: "domeniu greșit" };
  const source = e.source && AI_SOURCES.some((s) => s.id === e.source) ? e.source : detectAiSource(e.ref, e.utm);
  if (!source) return { ok: true, ignored: true }; // nu urmărim trafic care nu vine din AI
  const click = e.click && /^[0-9a-f-]{36}$/.test(e.click) ? e.click : null;
  const value = e.kind === "order" && Number.isFinite(e.value) && e.value! > 0 && e.value! < 1e8 ? e.value!.toFixed(2) : null;
  const inserted = await db.insert(schema.events).values({
    projectId: p.id, kind: e.kind, source, sessionId: e.session?.slice(0, 64) ?? null, clickId: click,
    url: e.url?.slice(0, 500) ?? null, orderId: e.kind === "order" ? String(e.order ?? "").slice(0, 100) || null : null,
    value, currency: (e.currency ?? p.currency).slice(0, 3).toUpperCase(),
  }).onConflictDoNothing().returning({ id: schema.events.id, orderId: schema.events.orderId });
  if (e.kind === "order" && inserted.length) await emitEvent(p.id, "order.tracked", { orderId: inserted[0].orderId, source, value: value ? Number(value) : null });
  return { ok: true, source };
}

/** Vânzări venite din AI pentru panou: pe surse, plus comisionul Echo pentru comenzile aduse de căutarea noastră. */
export async function salesSummary(projectId: string, fromDay: string) {
  const rows = (await db.select({
    source: schema.events.source, kind: schema.events.kind,
    n: dsql<number>`count(*)::int`, sessions: dsql<number>`count(distinct ${schema.events.sessionId})::int`,
    value: dsql<number>`coalesce(sum(${schema.events.value}),0)::float`,
  }).from(schema.events).where(and(eq(schema.events.projectId, projectId), gte(schema.events.createdAt, new Date(fromDay))))
    .groupBy(schema.events.source, schema.events.kind));
  const bySource = new Map<string, { source: string; visits: number; orders: number; value: number }>();
  let profileViews = 0;
  for (const r of rows) {
    if (r.kind === "profile_view") { profileViews += r.n; continue; }
    const e = bySource.get(r.source) ?? { source: r.source, visits: 0, orders: 0, value: 0 };
    if (r.kind === "visit") e.visits += r.sessions || r.n; else if (r.kind === "order") { e.orders += r.n; e.value += r.value; }
    bySource.set(r.source, e);
  }
  const list = [...bySource.values()].sort((a, b) => b.value - a.value || b.visits - a.visits);
  const total = list.reduce((a, x) => ({ visits: a.visits + x.visits, orders: a.orders + x.orders, value: a.value + x.value }), { visits: 0, orders: 0, value: 0 });
  const daily = (await db.execute(dsql`
    select to_char(created_at, 'DD.MM') as day, source, coalesce(sum(value),0)::float as value
    from events where project_id = ${projectId} and kind = 'order' and created_at >= ${fromDay}::date
    group by 1, 2, date_trunc('day', created_at) order by date_trunc('day', created_at)`)) as unknown as { day: string; source: string; value: number }[];
  const [c] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.clicks).where(and(eq(schema.clicks.projectId, projectId), gte(schema.clicks.createdAt, new Date(fromDay))));
  return { list, total, daily, profileViews, searchClicks: c.n };
}

/** Comisionul datorat de magazin pentru vânzările aduse de căutarea Echo, pe lună. Intră pe factura lunară. */
export async function commissionForMonth(projectId: string, month: string /* YYYY-MM */) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const r = (await db.execute(dsql`
    select count(*)::int as orders, coalesce(sum(value),0)::float as value from events
    where project_id = ${projectId} and kind = 'order' and source = 'echo' and to_char(created_at, 'YYYY-MM') = ${month}`)) as unknown as { orders: number; value: number }[];
  const pct = parseFloat(p.commissionPct);
  return { orders: r[0].orders, value: r[0].value, pct, commission: +(r[0].value * pct / 100).toFixed(2) };
}

/** Codul pe care magazinul îl pune pe site. */
export function trackingSnippet(appUrl: string, key: string) {
  return {
    head: `<script async src="${appUrl}/t.js" data-key="${key}"></script>`,
    order: `<script>
  window.echoq = window.echoq || [];
  echoq.push(["order", { id: "{{ID_COMANDA}}", value: {{TOTAL}}, currency: "RON" }]);
</script>`,
  };
}

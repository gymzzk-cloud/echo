import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/db";
import { BRAND } from "@/lib/brand";
import { daysAgo } from "@/lib/util";
import { providerLabel } from "./ai/types";

/** Raportul săptămânal: scor, variație, situația pe fiecare AI și 3 acțiuni. HTML compatibil cu clienții de email. */
export async function buildWeeklyReport(projectId: string) {
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const stats = await db.select().from(schema.dailyStats).where(and(eq(schema.dailyStats.projectId, projectId), gte(schema.dailyStats.day, daysAgo(14)))).orderBy(desc(schema.dailyStats.day));
  const all = stats.filter((s) => s.provider === "all");
  const now = all[0];
  const weekAgo = all.find((s) => s.day <= daysAgo(7)) ?? all[all.length - 1];
  const latestDay = now?.day;
  const per = stats.filter((s) => s.day === latestDay && s.provider !== "all");
  const acts = await db.select().from(schema.actions).where(and(eq(schema.actions.projectId, projectId), eq(schema.actions.status, "noua"))).limit(20);
  const rank = { mare: 0, mediu: 1, mic: 2 } as Record<string, number>;
  const top = acts.sort((a, b) => rank[a.impact] - rank[b.impact] || rank[a.effort] - rank[b.effort]).slice(0, 3);
  const diff = now && weekAgo ? now.score - weekAgo.score : 0;
  const recommended = per.filter((x) => x.visibility > 0).length;
  const subject = recommended
    ? `${p.name}: te recomandă ${recommended} din ${per.length} AI-uri (scor ${now?.score ?? "–"}${diff ? `, ${diff > 0 ? "+" : ""}${diff}` : ""})`
    : `${p.name}: AI-urile încă nu te recomandă. Iată ce poți face`;
  const app = process.env.APP_URL ?? "http://localhost:3000";
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const html = `<!doctype html><html lang="ro"><body style="margin:0;background:#f7f8fa;font-family:Inter,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e4e7ec;border-radius:12px">
<tr><td style="padding:24px 24px 8px;font-weight:600;color:#4f46e5">${BRAND.name}</td></tr>
<tr><td style="padding:0 24px"><h1 style="font-size:20px;margin:8px 0">${esc(p.name)}: raportul săptămânii</h1></td></tr>
<tr><td style="padding:8px 24px 16px"><div style="font-size:48px;font-weight:600;line-height:1">${now?.score ?? "–"}<span style="font-size:16px;color:#5b6475">/100</span></div>
<div style="color:${diff > 0 ? "#16a34a" : diff < 0 ? "#dc2626" : "#5b6475"};font-size:14px;margin-top:4px">${diff > 0 ? "▲ +" : diff < 0 ? "▼ " : "= "}${diff} față de săptămâna trecută</div></td></tr>
<tr><td style="padding:0 24px 16px"><table width="100%" style="border-collapse:collapse;font-size:14px">${per.map((x) => `<tr><td style="padding:6px 0;border-top:1px solid #e4e7ec">${providerLabel(x.provider)}</td><td align="right" style="padding:6px 0;border-top:1px solid #e4e7ec;color:${x.visibility ? "#16a34a" : "#dc2626"}">${x.visibility ? `Apari în ${x.visibility}% din răspunsuri` : "Lipsești"}</td></tr>`).join("")}</table></td></tr>
<tr><td style="padding:0 24px"><h2 style="font-size:16px;margin:8px 0">3 lucruri de făcut săptămâna asta</h2>
${top.map((a, i) => `<p style="margin:0 0 12px;font-size:14px"><b>${i + 1}. ${esc(a.title)}</b><br><span style="color:#5b6475">${esc(a.why)}</span></p>`).join("") || `<p style="font-size:14px;color:#5b6475">Nimic urgent. Bravo!</p>`}</td></tr>
<tr><td style="padding:8px 24px 24px"><a href="${app}/panou" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Deschide panoul</a></td></tr>
</table><p style="font-size:12px;color:#5b6475">Primești acest email pentru că ai un cont ${BRAND.name}.</p></td></tr></table></body></html>`;
  const [r] = await db.insert(schema.reports).values({ projectId, subject, html }).returning();
  return r;
}

export async function sendReport(reportId: string, to: string) {
  const [r] = await db.select().from(schema.reports).where(eq(schema.reports.id, reportId));
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "RESEND_API_KEY lipsește: raportul e doar în panou." };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject: r.subject, html: r.html }),
  });
  if (!res.ok) return { sent: false, reason: `Resend ${res.status}` };
  await db.update(schema.reports).set({ sentTo: to }).where(eq(schema.reports.id, reportId));
  return { sent: true };
}

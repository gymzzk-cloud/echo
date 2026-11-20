import Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { overview, leaderboard } from "./insights";
import { salesSummary, sourceLabel } from "./tracking";
import { providerLabel } from "./ai/types";
import { daysAgo, normalizeText } from "@/lib/util";

type Project = typeof schema.projects.$inferSelect;

/**
 * Asistentul din panou: răspunde la întrebări despre datele magazinului („de ce a scăzut scorul?”,
 * „ce fac săptămâna asta?”). Cu cheie Anthropic răspunde Claude, doar pe baza datelor de mai jos;
 * fără cheie, răspunsul e compus din aceleași date, după reguli.
 */
export async function assistantContext(project: Project) {
  const o = await overview(project);
  const lb = leaderboard(o.rows, project.domain, o.competitors).slice(0, 6);
  const acts = await db.select().from(schema.actions).where(and(eq(schema.actions.projectId, project.id), inArray(schema.actions.status, ["noua", "in_lucru"]))).limit(8);
  const sales = await salesSummary(project.id, daysAgo(30));
  return {
    score: o.latest?.score ?? null, scoreWeekAgo: o.weekAgo?.score ?? null,
    perProvider: o.perProvider.map((p) => ({ ai: providerLabel(p.provider), vizibilitate: p.visibility, schimbare7zile: p.delta })),
    clasament: lb.map((l) => ({ magazin: l.name ?? l.domain, domeniu: l.domain, vizibilitate: l.visibility })),
    actiuni: acts.map((a) => ({ titlu: a.title, de_ce: a.why, impact: a.impact })),
    vanzari30zile: { vizite: sales.total.visits, comenzi: sales.total.orders, valoare: sales.total.value, surse: sales.list.slice(0, 5).map((s) => ({ sursa: sourceLabel(s.source), valoare: s.value })) },
    audit: o.audit ? { scor: o.audit.score } : null,
  };
}

export function ruleAnswer(q: string, c: Awaited<ReturnType<typeof assistantContext>>, name: string) {
  const n = normalizeText(q);
  const lines: string[] = [];
  const top = c.actiuni.slice(0, 3);
  if (/scazut|scade|de ce|why|csokken/.test(n)) {
    const down = c.perProvider.filter((p) => (p.schimbare7zile ?? 0) < 0).sort((a, b) => (a.schimbare7zile ?? 0) - (b.schimbare7zile ?? 0));
    lines.push(c.score != null && c.scoreWeekAgo != null ? `Scorul este ${c.score}, față de ${c.scoreWeekAgo} acum o săptămână.` : "Nu avem încă destule zile de date pentru o comparație.");
    if (down.length) lines.push(`Scăderea vine mai ales din ${down.map((d) => `${d.ai} (${d.schimbare7zile} puncte)`).join(", ")}.`);
    if (top.length) lines.push(`Cel mai probabil motiv, după audit: ${top[0].de_ce}`);
  } else if (/concur|cine|competit|versen/.test(n)) {
    const me = c.clasament.find((l) => l.domeniu === name) ?? null;
    lines.push(`Clasamentul pe ultimele 30 de zile: ${c.clasament.map((l, i) => `${i + 1}. ${l.magazin} (${l.vizibilitate}%)`).join(", ")}.`);
    if (me) lines.push(`Tu ești la ${me.vizibilitate}%.`);
  } else if (/vanz|comenz|bani|elad|rendel/.test(n)) {
    const v = c.vanzari30zile;
    lines.push(v.comenzi ? `În 30 de zile: ${v.vizite} vizite și ${v.comenzi} comenzi din AI, în valoare de ${Math.round(v.valoare)}. Cele mai multe din ${v.surse.map((s) => s.sursa).join(", ")}.` : "Nu avem încă comenzi măsurate. Verifică dacă codul de urmărire este pe site (pagina Vânzări din AI).");
  } else {
    lines.push(c.score != null ? `Scorul tău de vizibilitate este ${c.score}.` : "Încă strângem date.");
    if (top.length) lines.push(`Ce aș face săptămâna asta: ${top.map((a, i) => `${i + 1}) ${a.titlu}`).join("; ")}.`);
  }
  return lines.join(" ");
}

let client: Anthropic | null = null;
export async function askAssistant(project: Project, question: string) {
  const ctx = await assistantContext(project);
  if (!process.env.ANTHROPIC_API_KEY) return { answer: ruleAnswer(question, ctx, project.domain), live: false };
  client ??= new Anthropic();
  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: `Ești asistentul din panoul Echo pentru magazinul ${project.name} (${project.domain}). Răspunzi în ${project.language === "hu" ? "maghiară" : "română"}, scurt, în propoziții simple, pentru un proprietar de magazin care nu e tehnic. Folosești DOAR datele din <date>. Dacă datele nu răspund la întrebare, spui asta și ce pagină din panou să deschidă. Nu inventa cifre.`,
    messages: [{ role: "user", content: `<date>${JSON.stringify(ctx)}</date>\n\nÎntrebare: ${question.slice(0, 1000)}` }],
  });
  const answer = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  return { answer: answer || ruleAnswer(question, ctx, project.domain), live: true };
}

import { normalizeText } from "@/lib/util";

/**
 * Asistentul conversațional din căutare: transformă o întrebare de continuare
 * („mai ieftin”, „sub 300 lei”, „doar în stoc”, „pentru beton”) într-o întrebare nouă, completă,
 * pe care o trimitem din nou tuturor AI-urilor. Funcție pură, fără apeluri externe.
 */
const BUDGET_RE = /(?:sub|până la|pana la|maxim|max\.?|cel mult|alatt|under)\s*[\d.\s]+\s*(?:lei|ron|ft|€)?/gi;

export function refineQuery(previous: string, followUp: string, cheapestShown?: number | null): string {
  let q = previous.trim();
  const f = followUp.trim();
  const n = normalizeText(f);
  if (!f) return q;

  const newBudget = f.match(/(?:sub|până la|pana la|maxim|max\.?|cel mult|alatt|under)\s*([\d.\s]+)\s*(lei|ron|ft|€)?/i);
  if (newBudget) {
    q = q.replace(BUDGET_RE, "").trim() + " " + newBudget[0].trim();
  } else if (/\b(mai ieftin|ieftin|olcsobb|cheaper)/.test(n)) {
    const cur = q.match(/(?:sub|până la|pana la|maxim|max\.?|cel mult|alatt|under)\s*([\d.\s]+)/i);
    const base = cur ? parseInt(cur[1].replace(/[.\s]/g, ""), 10) : cheapestShown ?? null;
    if (base) {
      const target = Math.max(1, Math.round((base * 0.8) / 10) * 10);
      const hu = /\b(ft|forint|alatt)\b/i.test(q);
      q = q.replace(BUDGET_RE, "").trim() + (hu ? ` ${target} Ft alatt` : ` sub ${target} lei`);
    }
  }
  if (/\b(doar|numai)?\s*(in stoc|pe stoc|raktaron|keszleten)/.test(n) && !/in stoc|raktaron/.test(normalizeText(q))) {
    q += /\b(ft|alatt|legjobb)\b/i.test(q) ? " raktáron" : " doar în stoc";
  }
  // Restul textului (fără comenzile de mai sus) completează întrebarea
  const rest = f.replace(BUDGET_RE, "").replace(/(?<!\p{L})(mai ieftin\p{L}*|ieftin\p{L}*|olcsóbb\p{L}*|cheaper|doar|numai|în stoc|in stoc|pe stoc|raktáron|készleten)(?!\p{L})/giu, "").replace(/\s+/g, " ").trim();
  if (rest.length >= 3 && !normalizeText(q).includes(normalizeText(rest))) q += `, ${rest}`;
  return q.replace(/\s+/g, " ").slice(0, 300);
}

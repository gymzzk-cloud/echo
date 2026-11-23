import { z } from "zod";
import { scoreAiDescription, scoreAiTitle, type AiSource, type FixCandidate } from "./rules";

/**
 * Cererea către AI pentru titluri și descrieri (logică pură: textul cererii și citirea răspunsului).
 * Mai multe produse într-o singură cerere, ca instrucțiunile să se plătească o dată. Trimitem doar datele produsului
 * (titlu, marcă, categorie, cod, descrierea scurtată), niciodată date despre clienți.
 */

export type AiItem = AiSource & { id: string; fields: ("title" | "description")[] };

export const AI_BATCH = 8;
const DESC_IN = 1200; // câte caractere din descrierea actuală trimitem (destul pentru atribute, puțini tokeni)

export function fixPrompt(items: AiItem[], lang: "ro" | "hu", store: string) {
  const L = lang === "hu" ? "maghiară" : "română";
  const system = `Ești editor de catalog pentru magazinul online ${store}. Scrii în limba ${L}, cu diacritice corecte.
Pentru fiecare produs primit, completezi doar câmpurile cerute în "fields":
- title: cel mult 150 de caractere, în forma „Marcă + tipul produsului + model + 1-2 atribute importante”. Păstrează exact marca și codul modelului. Fără majuscule peste tot, fără semne de exclamare.
- description: 2-4 propoziții (300-600 de caractere) care spun ce este produsul, pentru cine e și atributele lui importante.
Folosește DOAR faptele din datele primite. Nu scrie dimensiunile sau greutatea ambalajului. Nu inventa cifre, dimensiuni, puteri, garanții, prețuri sau livrare. Fără text de reclamă („cel mai bun”, „ofertă”) și fără linkuri.
Dacă datele nu ajung pentru un câmp, lasă-l gol ("").`;
  const user = JSON.stringify(items.map((it) => ({
    id: it.id, fields: it.fields, title: it.title, brand: it.brand ?? "", category: it.category ?? "", model_code: it.mpn ?? "",
    description: (it.description ?? "").replace(/\s+/g, " ").slice(0, DESC_IN),
  })));
  return { system, user };
}

/** Schema răspunsului (structurat: AI-ul nu poate răspunde în alt format). */
export const FIX_SCHEMA = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: {
    items: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["id", "title", "description"], properties: { id: { type: "string" }, title: { type: "string" }, description: { type: "string" } } },
    },
  },
} as const;

const Answer = z.object({ items: z.array(z.object({ id: z.string(), title: z.string().max(400), description: z.string().max(4000) })) });

/** Transformă răspunsul în propuneri, cu scorul calculat de noi. Ce nu trece validarea se ignoră. */
export function parseFixAnswer(json: unknown, items: AiItem[]): FixCandidate[] {
  const parsed = Answer.safeParse(json);
  if (!parsed.success) return [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: FixCandidate[] = [];
  for (const a of parsed.data.items) {
    const it = byId.get(a.id);
    if (!it) continue;
    if (it.fields.includes("title")) {
      const s = scoreAiTitle(a.title, it);
      if (s) out.push({ productId: it.id, field: "title", value: a.title.replace(/\s+/g, " ").trim(), previous: it.title, source: "ai", ...s });
    }
    if (it.fields.includes("description")) {
      const s = scoreAiDescription(a.description, it);
      if (s) out.push({ productId: it.id, field: "description", value: a.description.trim(), previous: it.description, source: "ai", ...s });
    }
  }
  return out;
}

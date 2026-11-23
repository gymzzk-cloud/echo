import type { FeedAction, FeedCondition } from "@/db/schema";
import { applyRules, type FeedProduct } from "./feed";

/**
 * Reguli de feed gata făcute. Pagina Feed le propune singură doar când ajută pe produsele reale ale magazinului
 * (cu exemple „înainte / după”) și le folosește ca exemple care completează formularul. Logică pură, testată.
 */
export type RulePreset = {
  id: string;
  name: string;
  /** De ce ajută, pe înțelesul oricui. */
  why: string;
  condition: FeedCondition;
  action: FeedAction;
  /** false = doar exemplu în formular (nu se poate detecta singură nevoia). */
  suggest: boolean;
};

export const RULE_PRESETS: RulePreset[] = [
  {
    id: "fara-stoc", suggest: true, name: "Scoate din feed produsele fără stoc",
    why: "AI-urile și Google nu ar trebui să trimită cumpărători spre un produs pe care nu îl poți livra. Produsul revine singur în feed când are din nou stoc.",
    condition: { field: "inStock", op: "eq", value: "nu" }, action: { type: "exclude" },
  },
  {
    id: "marca-in-titlu", suggest: true, name: "Pune marca la începutul titlului",
    why: "Oamenii și AI-urile caută după marcă („Bosch GSR 12V”). Un titlu fără marcă apare mai rar. Titlurile care au deja marca rămân la fel.",
    condition: { field: "brand", op: "not_empty", value: "" }, action: { type: "prefix", field: "title", value: "{brand} " },
  },
  {
    id: "descriere-lipsa", suggest: true, name: "Completează descrierile lipsă cu titlul",
    why: "Google și ChatGPT resping produsele fără descriere. Până scrii una (sau aprobi una din Reparații), trimitem măcar titlul.",
    condition: { field: "description", op: "empty", value: "" }, action: { type: "set", field: "description", value: "{title}" },
  },
  {
    id: "fara-pret", suggest: true, name: "Scoate din feed produsele fără preț",
    why: "Toate canalele resping un produs fără preț, iar prea multe respingeri scad încrederea în tot feed-ul.",
    condition: { field: "price", op: "empty", value: "" }, action: { type: "exclude" },
  },
  {
    id: "eticheta-scumpe", suggest: false, name: "Etichetă pentru produsele peste 1000",
    why: "Pui produsele scumpe într-o campanie separată, cu buget propriu (eticheta ajunge în feed ca custom_label).",
    condition: { field: "price", op: "gt", value: "1000" }, action: { type: "label", value: "premium" },
  },
];

export const presetById = (id: string | undefined) => RULE_PRESETS.find((p) => p.id === id);

type Rule = { conditions: FeedCondition[]; actions: FeedAction[]; active: boolean };
export const same = (r: Rule, p: RulePreset) =>
  r.conditions.length === 1 && r.actions.length === 1 &&
  r.conditions[0].field === p.condition.field && r.conditions[0].op === p.condition.op && (r.conditions[0].value ?? "") === (p.condition.value ?? "") &&
  r.actions[0].type === p.action.type && (r.actions[0].field ?? "") === (p.action.field ?? "") && (r.actions[0].value ?? "") === (p.action.value ?? "");

export type RuleSuggestion = {
  preset: RulePreset;
  /** Câte produse din feed-ul canalului s-ar schimba. */
  affected: number;
  examples: { id: string; before: FeedProduct; after: FeedProduct | null }[];
};

/**
 * Ce reguli ar ajuta acum: aplicăm fiecare regulă propusă pe produsele care pleacă deja în feed (după regulile existente)
 * și păstrăm doar pe cele care schimbă ceva. O regulă propusă care există deja la magazin nu se mai propune.
 * O singură trecere prin produse pentru fiecare regulă (fără bucle pătratice).
 */
export function suggestRules(items: FeedProduct[], existing: Rule[], channel: string, maxExamples = 3): RuleSuggestion[] {
  const out: RuleSuggestion[] = [];
  for (const preset of RULE_PRESETS) {
    if (!preset.suggest || existing.some((r) => same(r, preset))) continue;
    const rule = [{ conditions: [preset.condition], actions: [preset.action], channels: [], active: true }];
    let affected = 0;
    const examples: RuleSuggestion["examples"] = [];
    for (const p of items) {
      const after = applyRules(p, rule, channel);
      if (after && after.title === p.title && after.description === p.description && after.labels.length === p.labels.length) continue;
      affected++;
      if (examples.length < maxExamples) examples.push({ id: p.id, before: p, after });
    }
    if (affected) out.push({ preset, affected, examples });
  }
  return out.sort((a, b) => b.affected - a.affected);
}

// Regulile din docs/DESIGN.md care se pot verifica în cod (§0, §2, §4, §5).
// Partea vizuală (scroll orizontal, insigne pe două rânduri) o verifică `pnpm ui:check` în browser.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["src/app/panou", "src/app/start", "src/components"];
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });

// Componentele de bază au voie să folosească elementele native (ele sunt „componenta”).
const PRIMITIVES = new Set(["src/components/ui.tsx", "src/components/client.tsx", "src/components/forms.tsx"]);

const RULES: { name: string; re: RegExp; skipPrimitives?: boolean }[] = [
  { name: "<button> scris de mână (folosește Button / SubmitButton din ui.tsx)", re: /<button[\s>]/, skipPrimitives: true },
  { name: "<select> scris de mână (folosește Select)", re: /<select[\s>]/, skipPrimitives: true },
  { name: "<textarea> scris de mână (folosește Textarea)", re: /<textarea[\s>]/, skipPrimitives: true },
  { name: "<input> vizibil scris de mână (folosește Input / Checkbox)", re: /<input(?![^>]*type="hidden")[\s>]/, skipPrimitives: true },
  { name: "culoare scrisă direct (folosește tokenurile)", re: /#[0-9a-fA-F]{3,8}\b(?![\w-])|rgba?\(|\b(?:text|bg|border)-(?:white|black|slate|gray|zinc|red|green|amber|yellow|blue|emerald)\b/ },
  { name: "mărime de text în afara scării (12/14/16/20/24/30/48)", re: /\btext-\[\d+px\]/ },
  { name: "spațiu în afara scării de 4 px (doar 1, 2, 3, 4, 6, 8, 12, 16)", re: /\b-?(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-y|space-x)-(?:0\.5|1\.5|2\.5|3\.5|5|7|9|10|11)\b/ },
  { name: "colțuri în afara regulilor (§5: rounded-xl card, rounded-lg câmp/buton, rounded-full insignă)", re: /\brounded-(?:md|sm|2xl|3xl|\[)/ },
  { name: "umbră (§5: fără umbre; doar notificarea plutitoare are shadow-lg)", re: /\bshadow(?!-lg\b)(?:-\w+)?\b/ },
];

describe("DESIGN.md: reguli verificabile în cod", () => {
  const all = ROOTS.flatMap(files);
  for (const rule of RULES) {
    it(rule.name, () => {
      const hits: string[] = [];
      for (const f of all) {
        if (rule.skipPrimitives && PRIMITIVES.has(f)) continue;
        readFileSync(f, "utf8").split("\n").forEach((line, i) => {
          if (line.trim().startsWith("//") || line.trim().startsWith("*")) return;
          // Textele de exemplu pentru utilizator (placeholder, hint) pot conține „#0d7a6a”: nu sunt culori folosite în interfață.
          const code = line.replace(/(placeholder|hint)="[^"]*"/g, "");
          if (rule.re.test(code)) hits.push(`${f}:${i + 1}`);
        });
      }
      expect(hits, hits.join("\n")).toEqual([]);
    });
  }
});

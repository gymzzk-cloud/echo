// Fiecare buton și formular din panou arată imediat că lucrează (ZoZo, 23.11.2026: „nici măcar nu am feedback că rulează ceva”).
// - formularele cu acțiune de server folosesc SubmitButton (se blochează și arată „Se lucrează…” cât așteaptă);
// - căutările (formulare GET) folosesc Form din next/form, fără reîncărcarea paginii, iar NavProgress arată „Se încarcă…”;
// - layout-ul panoului are NavProgress (orice clic pe link sau filtru) și JobWatcher (lucrările din fundal).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isInternalNav } from "@/components/nav-progress";

const ROOTS = ["src/app/panou", "src/components"];
const PRIMITIVES = new Set(["src/components/ui.tsx", "src/components/client.tsx", "src/components/forms.tsx"]);
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
const all = ROOTS.flatMap(files).filter((f) => !PRIMITIVES.has(f));

describe("butoane și formulare cu stare vizibilă", () => {
  it("niciun <form> fără acțiune (căutările folosesc Form din next/form)", () => {
    const hits: string[] = [];
    for (const f of all) readFileSync(f, "utf8").split("\n").forEach((l, i) => { if (/<form[\s>]/.test(l) && !/action=\{/.test(l)) hits.push(`${f}:${i + 1}`); });
    expect(hits).toEqual([]);
  });

  it("formularele cu acțiune de server trimit doar cu SubmitButton, nu cu Button", () => {
    const hits: string[] = [];
    for (const f of all) {
      const src = readFileSync(f, "utf8");
      // Fiecare bloc <form action={…}> … </form>: un <Button> care trimite n-ar arăta nicio stare.
      for (const m of src.matchAll(/<form action=\{[\s\S]*?<\/form>/g)) {
        if (/<Button(?![^>]*type="button")[\s>]/.test(m[0])) hits.push(`${f}: ${m[0].slice(0, 60)}…`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("<Button> are mereu type explicit (submit doar în Form, button pentru clic în pagină)", () => {
    const hits: string[] = [];
    for (const f of all) readFileSync(f, "utf8").split("\n").forEach((l, i) => { if (/<Button[\s>]/.test(l) && !/type="(button|submit)"/.test(l)) hits.push(`${f}:${i + 1}`); });
    expect(hits).toEqual([]);
  });

  it("Form din next/form nu preîncarcă pagina (regula „Viteză”)", () => {
    const hits: string[] = [];
    for (const f of all) readFileSync(f, "utf8").split("\n").forEach((l, i) => { if (/<Form[\s>]/.test(l) && !/prefetch=\{false\}/.test(l)) hits.push(`${f}:${i + 1}`); });
    expect(hits).toEqual([]);
  });

  it("layout-ul panoului arată starea navigării și a lucrărilor", () => {
    const layout = readFileSync("src/app/panou/layout.tsx", "utf8");
    expect(layout).toContain("<NavProgress />");
    expect(layout).toContain("<JobWatcher />");
  });

  it("isInternalNav: doar schimbări de pagină în aplicație", () => {
    const o = "https://echo.test";
    expect(isInternalNav("/panou/feed", "/panou", o)).toBe(true);
    expect(isInternalNav("?f=pret", "/panou/produse", o)).toBe(true);
    expect(isInternalNav("/panou", "/panou", o)).toBe(false);
    expect(isInternalNav("#rezolva", "/panou/audit", o)).toBe(false);
    expect(isInternalNav("https://shopexpert.com/ro", "/panou", o)).toBe(false);
  });
});

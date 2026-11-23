import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
vi.mock("@/db", () => ({ db: {}, schema: {} }));
vi.mock("@/core/onboarding", () => ({ afterPlanChosen: async () => {} }));

const { STORE_PAGE } = await import("@/lib/i18n-stores");
const { PLANS } = await import("@/core/billing");

describe("pagina pentru magazine: texte RO și HU", () => {
  it("are text pentru fiecare plan din billing.ts, în ambele limbi", () => {
    for (const lang of ["ro", "hu"] as const) {
      for (const p of PLANS) expect(STORE_PAGE[lang].plans[p.id]?.features.length, `${lang}/${p.id}`).toBeGreaterThan(0);
    }
  });

  it("maghiara are aceleași secțiuni ca româna", () => {
    const { ro, hu } = STORE_PAGE;
    expect(Object.keys(hu).sort()).toEqual(Object.keys(ro).sort());
    for (const k of ["steps", "features", "trust", "faq"] as const) expect(hu[k].length, k).toBe(ro[k].length);
    for (const p of PLANS) expect(hu.plans[p.id].features.length).toBe(ro.plans[p.id].features.length);
  });

  it("prețul afișat e același cu cel din textul planului (o singură sursă)", () => {
    for (const p of PLANS) expect(p.price.startsWith(`${p.lei} lei`)).toBe(true);
  });

  it("nu promite rulare zilnică (rularea automată e la AI_RUN_EVERY_DAYS, implicit 7 zile)", () => {
    const all = JSON.stringify(STORE_PAGE) + JSON.stringify(PLANS);
    expect(all).not.toMatch(/zilnic|naponta/i);
  });
});

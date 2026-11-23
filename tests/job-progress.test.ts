import { describe, expect, it } from "vitest";
import { jobDetail } from "@/components/job-watcher";
import { nextQuotaReset } from "@/core/ai/gemini";

const run = (p: { done: number; total: number } | null, elapsedSec: number | null = null) => ({ kind: "run_project" as const, status: "running" as const, progress: p, elapsedSec, ahead: null });

describe("bara de stare: progresul real al lucrărilor", () => {
  it("la coadă: câte lucrări sunt înainte", () => {
    expect(jobDetail({ kind: "run_project", status: "queued", progress: null, elapsedSec: null, ahead: 2 })).toBe("la coadă, după 2 lucrări");
    expect(jobDetail({ kind: "run_project", status: "queued", progress: null, elapsedSec: null, ahead: 1 })).toBe("la coadă, după 1 lucrare");
    expect(jobDetail({ kind: "run_project", status: "queued", progress: null, elapsedSec: null, ahead: 0 })).toBe("pornește acum");
  });
  it("fără progres raportat: nimic inventat", () => {
    expect(jobDetail(run(null))).toBeNull();
    expect(jobDetail({ kind: "audit", status: "running", progress: null, elapsedSec: 40, ahead: null })).toBeNull();
  });
  it("întrebarea curentă și estimarea din ritmul de până acum", () => {
    expect(jobDetail(run({ done: 0, total: 30 }, 5))).toBe("întrebarea 1 din 30");
    expect(jobDetail(run({ done: 10, total: 30 }, 300))).toBe("întrebarea 11 din 30, ~10 min rămase");
    expect(jobDetail(run({ done: 29, total: 30 }, 290))).toBe("întrebarea 30 din 30, sub un minut rămase");
    expect(jobDetail(run({ done: 30, total: 30 }, 300))).toBe("întrebarea 30 din 30");
  });
  it("alte lucrări: „X din Y”", () => {
    expect(jobDetail({ kind: "feed", status: "running", progress: { done: 3, total: 9 }, elapsedSec: 30, ahead: null })).toBe("3 din 9, ~1 min rămase");
  });
});

describe("Gemini fără cotă: pauză până la resetarea zilnică (08:00 UTC)", () => {
  it("înainte de 08:00 UTC: azi la 08:00", () => {
    expect(new Date(nextQuotaReset(new Date("2026-11-23T05:00:00Z"))).toISOString()).toBe("2026-11-23T08:00:00.000Z");
  });
  it("după 08:00 UTC: mâine la 08:00", () => {
    expect(new Date(nextQuotaReset(new Date("2026-11-23T19:15:00Z"))).toISOString()).toBe("2026-11-24T08:00:00.000Z");
  });
});

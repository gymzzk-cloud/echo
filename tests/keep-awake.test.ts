import { describe, expect, it, vi } from "vitest";
import { healthUrl, inKeepAwakeWindow, keepAwakeTick } from "@/core/keep-awake";

describe("serverul treaz noaptea pentru feed (B63)", () => {
  it("fereastra e 15:00–02:30 ora României, iarna și vara", () => {
    expect(inKeepAwakeWindow(new Date("2026-11-26T23:10:00Z"))).toBe(true); // 01:10 RO, ora OpenAI
    expect(inKeepAwakeWindow(new Date("2026-11-26T13:00:00Z"))).toBe(true); // 15:00 RO
    expect(inKeepAwakeWindow(new Date("2026-11-26T12:59:00Z"))).toBe(false); // 14:59 RO
    expect(inKeepAwakeWindow(new Date("2026-11-27T00:29:00Z"))).toBe(true); // 02:29 RO
    expect(inKeepAwakeWindow(new Date("2026-11-27T00:30:00Z"))).toBe(false); // 02:30 RO
    expect(inKeepAwakeWindow(new Date("2026-11-27T02:00:00Z"))).toBe(false); // 04:00 RO
    expect(inKeepAwakeWindow(new Date("2026-11-27T08:00:00Z"))).toBe(false); // 10:00 RO
    expect(inKeepAwakeWindow(new Date("2027-07-01T22:10:00Z"))).toBe(true); // vara: 01:10 RO = 22:10 UTC
    expect(inKeepAwakeWindow(new Date("2027-07-01T02:30:00Z"))).toBe(false); // vara: 05:30 RO
  });

  it("adresa publică: doar https, din RENDER_EXTERNAL_URL sau APP_URL", () => {
    expect(healthUrl({ RENDER_EXTERNAL_URL: "https://echo-ai-9fnz.onrender.com" })).toBe("https://echo-ai-9fnz.onrender.com/api/health");
    expect(healthUrl({ APP_URL: "https://x.ro/" })).toBe("https://x.ro/api/health");
    expect(healthUrl({ APP_URL: "http://localhost:3000" })).toBeNull();
    expect(healthUrl({})).toBeNull();
  });

  it("pinguie doar în fereastră și nu aruncă la erori", async () => {
    const ok = vi.fn(async () => new Response("ok"));
    expect(await keepAwakeTick(new Date("2026-11-26T23:10:00Z"), "https://a/api/health", ok)).toBe("ping");
    expect(await keepAwakeTick(new Date("2026-11-27T02:00:00Z"), "https://a/api/health", ok)).toBe("skip");
    expect(ok).toHaveBeenCalledTimes(1);
    const bad = vi.fn(async () => { throw new Error("down"); });
    expect(await keepAwakeTick(new Date("2026-11-26T23:10:00Z"), "https://a/api/health", bad)).toBe("error");
    expect(await keepAwakeTick(new Date("2026-11-26T23:10:00Z"), null, ok)).toBe("skip");
  });
});

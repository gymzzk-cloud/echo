import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {}, schema: {} }));
const { buyerTools, storeTools, listTools, READ_ONLY_ANNOTATIONS } = await import("../src/core/mcp");
const { inCidr, limited } = await import("../src/lib/mcp-http");

const project = { id: "p1", name: "Magazin", domain: "shop.ro", pathPrefix: "/ro", storeInfo: null } as unknown as Parameters<typeof storeTools>[0];

describe("uneltele MCP pentru directoarele Claude și ChatGPT", () => {
  for (const [label, tools] of [["cumpărători", buyerTools()], ["magazin", storeTools(project)]] as const) {
    it(`${label}: fiecare unealtă are titlu, descriere și adnotări doar-citire`, () => {
      for (const t of listTools(tools)) {
        expect(t.title.length).toBeGreaterThan(3);
        expect(t.description.length).toBeGreaterThan(10);
        expect(t.name.length).toBeLessThanOrEqual(64);
        expect(t.annotations).toMatchObject({ title: t.title, readOnlyHint: true, destructiveHint: false, openWorldHint: false });
        expect(t).not.toHaveProperty("run");
      }
    });
  }
  it("adnotările sunt valori booleene explicite (cerință ChatGPT)", () => {
    for (const v of Object.values(READ_ONLY_ANNOTATIONS)) expect(typeof v).toBe("boolean");
  });
});

describe("limita de cereri MCP", () => {
  it("recunoaște blocul Anthropic", () => {
    expect(inCidr("160.79.106.150", "160.79.104.0/21")).toBe(true);
    expect(inCidr("160.79.112.1", "160.79.104.0/21")).toBe(false);
    expect(inCidr("::ffff:160.79.104.9", "160.79.104.0/21")).toBe(true);
    expect(inCidr("2001:db8::1", "160.79.104.0/21")).toBe(false);
    expect(inCidr("1.2.3.4", "bad")).toBe(false);
  });
  const req = (ip: string) => new Request("http://x/mcp", { method: "POST", headers: { "x-forwarded-for": ip } });
  it("un IP obișnuit: 60 pe minut", () => {
    const now = 1_000_000;
    const r = Array.from({ length: 61 }, () => limited(req("9.9.9.9"), now));
    expect(r.slice(0, 60).every((x) => !x)).toBe(true);
    expect(r[60]).toBe(true);
  });
  it("IP-ul unei platforme AI: limită mai mare (600)", () => {
    const now = 2_000_000;
    const r = Array.from({ length: 601 }, () => limited(req("160.79.105.1"), now));
    expect(r[99]).toBe(false);
    expect(r[599]).toBe(false);
    expect(r[600]).toBe(true);
  });
});

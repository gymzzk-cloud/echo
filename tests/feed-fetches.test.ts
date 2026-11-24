import { describe, expect, it, vi } from "vitest";
vi.mock("@/db", () => ({ db: {}, schema: {} }));
import { botName, measured } from "@/core/feed-fetches";

describe("jurnalul descărcărilor de feed (B58)", () => {
  it("recunoaște roboții după User-Agent, fără să păstreze textul întreg", () => {
    expect(botName("Mozilla/5.0 (Macintosh) Chrome/131 Safari/537.36; compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot")).toBe("OpenAI (OAI-SearchBot)");
    expect(botName("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe("Google (Googlebot)");
    expect(botName("Storebot-Google/1.0")).toBe("Google (Storebot)");
    expect(botName("curl/8.4.0")).toBe("Program (curl, script)");
    expect(botName(null)).toBe("Alt program");
  });

  it("numără octeții și spune dacă fișierul a plecat complet", async () => {
    const done = vi.fn();
    const src = new Blob([new Uint8Array(10), new Uint8Array(5)]).stream();
    const text = await new Response(measured(src, done)).arrayBuffer();
    expect(text.byteLength).toBe(15);
    expect(done).toHaveBeenCalledWith(15, true);
  });

  it("descărcare oprită de client: întreruptă, o singură înregistrare", async () => {
    const done = vi.fn();
    const r = measured(new Blob([new Uint8Array(1000)]).stream(), done).getReader();
    await r.read();
    await r.cancel();
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][1]).toBe(false);
  });
});

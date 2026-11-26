import { describe, expect, it, vi } from "vitest";
vi.mock("@/db", () => ({ db: {}, schema: {} }));
import { createServer, get, type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { botName, FEED_CACHE_CONTROL, measured } from "@/core/feed-fetches";

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

  it("Next nu recomprimă feed-ul: compresia lui sare peste răspunsurile cu no-transform (B62)", async () => {
    type Mw = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
    const compression = createRequire(import.meta.url)("next/dist/compiled/compression") as () => Mw;
    const mw = compression();
    const encodingFor = async (cacheControl: string) => {
      const server = createServer((req, res) => mw(req, res, () => {
        res.setHeader("content-type", "text/csv");
        res.setHeader("cache-control", cacheControl);
        res.end("a,b\n".repeat(2000));
      }));
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      const { port } = server.address() as AddressInfo;
      const enc = await new Promise<string | undefined>((resolve, reject) => {
        get({ host: "127.0.0.1", port, headers: { "accept-encoding": "gzip" } }, (res) => { res.resume(); resolve(res.headers["content-encoding"]); }).on("error", reject);
      });
      server.close();
      return enc;
    };
    expect(await encodingFor("public, max-age=900")).toBe("gzip");
    expect(await encodingFor(FEED_CACHE_CONTROL)).toBeUndefined();
  });
});

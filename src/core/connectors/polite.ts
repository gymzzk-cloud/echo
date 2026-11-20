/**
 * Preluare „ușoară” de la magazine (regulă permanentă: nu încărcăm site-ul magazinului).
 * - o singură cerere o dată pe același host și o pauză între pagini;
 * - respectăm 429/503 și antetul Retry-After, cu cel mult 2 reîncercări;
 * - ne prezentăm cinstit (EchoCatalogBot) ca magazinul să ne poată identifica și limita.
 */
export const UA = "EchoCatalogBot/1.0 (+https://echo.ai/bot)";
const PAUSE_MS = Number(process.env.CATALOG_PAGE_PAUSE_MS ?? 400);
const lastHit = new Map<string, number>();
const chains = new Map<string, Promise<unknown>>();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function politeFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const host = new URL(url).host;
  const prev = chains.get(host) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(async () => {
    for (let attempt = 0; ; attempt++) {
      const since = Date.now() - (lastHit.get(host) ?? 0);
      if (since < PAUSE_MS) await wait(PAUSE_MS - since);
      lastHit.set(host, Date.now());
      const r = await fetch(url, { ...init, headers: { "user-agent": UA, ...(init.headers as Record<string, string>) }, signal: AbortSignal.timeout(init.timeoutMs ?? 30000) });
      if ((r.status === 429 || r.status === 503) && attempt < 2) {
        const ra = Number(r.headers.get("retry-after"));
        await wait(Math.min(60_000, (Number.isFinite(ra) && ra > 0 ? ra * 1000 : 5000 * (attempt + 1))));
        continue;
      }
      return r;
    }
  });
  chains.set(host, run);
  return run as Promise<Response>;
}

/** Momentul următoarei sincronizări: intervalul configurat, cu o deplasare stabilă pe magazin ca să nu lovim toate magazinele deodată. */
export function nextSyncAt(connectionId: string, from: Date, failures = 0) {
  const hours = Number(process.env.CATALOG_SYNC_HOURS ?? 12);
  let h = 0; for (const c of connectionId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const jitter = (h % 120) * 60e3;                          // 0–2 ore, aceeași pentru același magazin
  const backoff = Math.min(4, 2 ** failures);               // după erori: x2, x4 (maxim 2 zile la 12h)
  return new Date(from.getTime() + hours * 3600e3 * backoff + jitter);
}

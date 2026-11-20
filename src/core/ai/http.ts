/** Ajutoare comune pentru adaptoarele AI: variabile de mediu curate și cereri JSON cu limită de timp. */

/** Valoarea unei variabile de mediu fără spații, rânduri noi sau ghilimele lipite la copiere (cauză frecventă de 401). */
export const cleanEnvValue = (v: string) => v.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
export const envValue = (k: string, d = "") => cleanEnvValue(process.env[k] ?? d);
export const envPrice = (k: string, d: number) => {
  const n = parseFloat(envValue(k, String(d)));
  return Number.isFinite(n) ? n : d;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Câte milisecunde cere API-ul să așteptăm după un 429 („retryDelay": "23s” sau antetul Retry-After). Plafonat la 60 s. */
export function retryAfterMs(body: string, header?: string | null): number | null {
  const s = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body)?.[1] ?? (header && /^\d+$/.test(header) ? header : null);
  return s === null ? null : Math.min(60_000, Math.ceil(parseFloat(s) * 1000));
}

/** POST JSON. La un 429 cu timp de așteptare scurt mai încearcă o dată, ca limita pe minut să nu devină eroare. */
export async function postJson(url: string, body: unknown, headers: Record<string, string>, timeoutMs = 60000): Promise<ReturnType<typeof JSON.parse>> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text();
    if (r.ok) return JSON.parse(text);
    const wait = r.status === 429 && attempt === 0 ? retryAfterMs(text, r.headers.get("retry-after")) : null;
    if (wait === null) throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
    await sleep(wait);
  }
}

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

/**
 * Mesajul de eroare al unui API, scurt și pe un rând: textul erorii plus identificatorii de cotă (Google îi pune în „details”),
 * ca să vedem în loguri ce limită s-a atins. Fără chei: API-urile nu le întorc în erori.
 */
export function errorSummary(text: string, max = 400): string {
  try {
    const j = JSON.parse(text) as { error?: { message?: string; status?: string; details?: { violations?: { quotaId?: string; quotaValue?: string }[] }[] } };
    if (j.error?.message) {
      const quotas = (j.error.details ?? []).flatMap((d) => d.violations ?? []).map((v) => `${v.quotaId ?? "?"}${v.quotaValue !== undefined ? ` limit: ${v.quotaValue}` : ""}`);
      const message = j.error.message.split("\n")[0].replace(/\s*(For more information|To monitor).*$/i, "");
      return [j.error.status, quotas.length ? `[${[...new Set(quotas)].join(", ")}]` : "", message].filter(Boolean).join(" ").slice(0, max);
    }
  } catch { /* nu e JSON */ }
  return text.replace(/\s+/g, " ").slice(0, max);
}

/** Pauzele dintre reîncercări când API-ul e supraîncărcat (500, 502, 503, 504): 2 s, apoi 6 s. */
export const OVERLOAD_BACKOFF_MS = [2000, 6000];
export const isOverloaded = (status: number) => [500, 502, 503, 504].includes(status);

/**
 * POST JSON. Reîncearcă singur ce trece cu puțină răbdare:
 * - 429 cu limită pe minut: o dată, după timpul cerut de API;
 * - supraîncărcare (500/502/503/504): de două ori, cu pauze tot mai lungi.
 * O cotă pe zi sau inexistentă nu se reîncearcă: nu trece așteptând.
 */
export async function postJson(url: string, body: unknown, headers: Record<string, string>, timeoutMs = 60000, backoff = OVERLOAD_BACKOFF_MS): Promise<ReturnType<typeof JSON.parse>> {
  let rateRetried = false;
  for (let overloadTry = 0; ; ) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text();
    if (r.ok) return JSON.parse(text);
    let wait: number | null = null;
    if (r.status === 429 && !rateRetried && !/PerDay|"quotaValue"\s*:\s*"0"/.test(text)) {
      wait = retryAfterMs(text, r.headers.get("retry-after"));
      rateRetried = true;
    } else if (isOverloaded(r.status) && overloadTry < backoff.length) {
      wait = backoff[overloadTry++];
    }
    if (wait === null) throw new Error(`HTTP ${r.status}: ${errorSummary(text)}`);
    await sleep(wait);
  }
}

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
    // O cotă pe zi sau inexistentă („quotaValue": "0”) nu trece așteptând: nu mai pierdem timp cu reîncercarea.
    const dailyOrZero = /PerDay|"quotaValue"\s*:\s*"0"/.test(text);
    const wait = r.status === 429 && attempt === 0 && !dailyOrZero ? retryAfterMs(text, r.headers.get("retry-after")) : null;
    if (wait === null) throw new Error(`HTTP ${r.status}: ${errorSummary(text)}`);
    await sleep(wait);
  }
}

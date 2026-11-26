/**
 * Ține serverul treaz noaptea, cât canalele își iau feed-ul (OpenAI vine pe la 01:10 ora României).
 * Planul gratuit Render adoarme după 15 minute fără cereri; workerul se cheamă singur pe adresa publică (/api/health),
 * ceea ce contează ca trafic. Doar în fereastra de noapte, ca să nu consumăm orele gratuite toată ziua (decizia ZoZo, 26.11.2026).
 * Ora e a României (Europe/Bucharest), deci trecerea la ora de vară nu mută fereastra.
 */
export const KEEP_AWAKE_TZ = "Europe/Bucharest";
/** Minute de la miezul nopții, ora României: 20:00 → 02:30 (peste miezul nopții). */
export const KEEP_AWAKE_FROM = 20 * 60;
export const KEEP_AWAKE_TO = 2 * 60 + 30;

export function minutesInRomania(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: KEEP_AWAKE_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return n("hour") * 60 + n("minute");
}

export function inKeepAwakeWindow(d: Date): boolean {
  const m = minutesInRomania(d);
  return m >= KEEP_AWAKE_FROM || m < KEEP_AWAKE_TO;
}

/** Adresa publică a serverului web: Render o dă în RENDER_EXTERNAL_URL; altfel APP_URL. Fără adresă, nu facem nimic. */
export function healthUrl(env: Record<string, string | undefined> = process.env): string | null {
  const base = (env.RENDER_EXTERNAL_URL || env.APP_URL || "").replace(/\/$/, "");
  return /^https:\/\//.test(base) ? `${base}/api/health` : null;
}

/** Un ping, doar în fereastră. Nu aruncă niciodată: o eroare aici nu are voie să oprească workerul. */
export async function keepAwakeTick(now = new Date(), url = healthUrl(), doFetch: typeof fetch = fetch): Promise<"ping" | "skip" | "error"> {
  if (!url || !inKeepAwakeWindow(now)) return "skip";
  try {
    const r = await doFetch(url, { signal: AbortSignal.timeout(30_000), headers: { "user-agent": "echo-keep-awake" } });
    return r.ok ? "ping" : "error";
  } catch { return "error"; }
}

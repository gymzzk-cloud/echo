export type Locale = "ro" | "hu";
const L = { ro: "ro-RO", hu: "hu-HU" } as const;

export function money(v: number | string | null | undefined, currency = "RON", locale: Locale = "ro") {
  if (v === null || v === undefined || v === "") return "–";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (currency === "RON") return `${new Intl.NumberFormat(L[locale], { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n)} lei`;
  if (currency === "HUF") return `${new Intl.NumberFormat(L[locale], { maximumFractionDigits: 0 }).format(n)} Ft`;
  return new Intl.NumberFormat(L[locale], { style: "currency", currency }).format(n);
}
export const num = (n: number, locale: Locale = "ro") => new Intl.NumberFormat(L[locale]).format(n);
export const pct = (n: number) => `${Math.round(n)}%`;
export function dateShort(d: Date | string, locale: Locale = "ro") {
  return new Intl.DateTimeFormat(L[locale], { day: "2-digit", month: "2-digit", year: "numeric", timeZone: locale === "hu" ? "Europe/Budapest" : "Europe/Bucharest" }).format(new Date(d));
}
export function delta(n: number) {
  if (n > 0) return { text: `▲ +${n}`, tone: "good" as const };
  if (n < 0) return { text: `▼ ${n}`, tone: "bad" as const };
  return { text: "= 0", tone: "muted" as const };
}
export function dateTime(d: Date | string, locale: Locale = "ro") {
  return new Intl.DateTimeFormat(L[locale], { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: locale === "hu" ? "Europe/Budapest" : "Europe/Bucharest" }).format(new Date(d));
}

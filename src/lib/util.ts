import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** Normalizează o adresă: "https://www.Shop.ro/ro/" → { domain: "shop.ro", pathPrefix: "/ro", origin: "https://www.shop.ro" } */
export function parseStoreUrl(input: string) {
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  const u = new URL(raw);
  const host = u.hostname.toLowerCase();
  const domain = host.replace(/^www\./, "");
  const pathPrefix = u.pathname.replace(/\/+$/, "");
  return { domain, host, pathPrefix: pathPrefix === "/" ? "" : pathPrefix, origin: `${u.protocol}//${host}` };
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Ceasul aplicației. `clock.offsetMs` e folosit doar de seed ca să simuleze istoric pe zile trecute. */
export const clock = { offsetMs: 0 };
const nowMs = () => Date.now() + clock.offsetMs;
export const today = () => new Date(nowMs()).toISOString().slice(0, 10);
export const daysAgo = (n: number) => new Date(nowMs() - n * 864e5).toISOString().slice(0, 10);

/** Generator pseudo-aleator determinist (pentru modul demo: aceeași întrebare, aceeași zi = același răspuns). */
export function seededRandom(seed: string) {
  let h = parseInt(sha256(seed).slice(0, 8), 16);
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

export function normalizeText(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

const STOP = new Set("si sau cu de la pe in un o cel mai cea care ce pentru din sub peste pana unde pot as vreau imi recomanda recomandati cumpar cumpara online romania bun buna buni bune best lei ron the a an for and or vs alatt felett legjobb ft forint olcso raktaron".split(" "));
export function keywords(s: string) {
  return normalizeText(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
}

// ── Criptare pentru secrete (chei API ale magazinelor) ─────────────────────
function key() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error("ENCRYPTION_KEY lipsește sau nu are 32 de octeți (64 caractere hex).");
  return Buffer.from(hex, "hex");
}
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}
export function decrypt(blob: string) {
  const [iv, tag, data] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

import { and, desc, eq, lt, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Jurnalul descărcărilor de feed (KNOWLEDGE B58): cine a cerut fișierul, când, cu ce rezultat și cât a durat.
 * Ca magazinul să vadă singur dacă OpenAI sau Google chiar au cerut feed-ul, fără loguri de server.
 * Nu păstrăm IP-ul sau alte date despre vizitator, doar numele robotului. Rândurile mai vechi de 30 de zile se șterg.
 */

/** Robotul, din User-Agent. Necunoscut = „alt program” (nu păstrăm textul întreg). */
export function botName(ua: string | null): string {
  const u = ua ?? "";
  const known: [RegExp, string][] = [
    [/OAI-SearchBot/i, "OpenAI (OAI-SearchBot)"], [/ChatGPT-User/i, "OpenAI (ChatGPT-User)"], [/GPTBot/i, "OpenAI (GPTBot)"], [/openai/i, "OpenAI"],
    [/Storebot-Google/i, "Google (Storebot)"], [/Googlebot/i, "Google (Googlebot)"], [/Google/i, "Google"],
    [/facebookexternalhit|meta-externalagent|facebookcatalog/i, "Meta"], [/TikTok|Bytespider/i, "TikTok"],
    [/compari|arukereso|shopmania|glami|emag/i, "Comparator / marketplace"],
    [/curl|wget|python|axios|node-fetch|undici|Go-http-client|okhttp/i, "Program (curl, script)"],
    [/Mozilla/i, "Browser"],
  ];
  return known.find(([re]) => re.test(u))?.[1] ?? "Alt program";
}

export type FetchOutcome = "trimis" | "intrerupt" | "nemodificat" | "in-generare" | "verificat";
/**
 * Cache-Control pentru feed-urile publice. „no-transform” oprește recomprimarea făcută de Next (pachetul compression
 * o sare când vede no-transform): pe 0,1 procesor, recomprimarea feed-ului ChatGPT dura 70–90 s (KNOWLEDGE B62).
 */
export const FEED_CACHE_CONTROL = "public, max-age=900, no-transform";

export type FetchRecord = { feedOutputId: string; bot: string; status: number; outcome: FetchOutcome; bytes: number | null; durationMs: number | null; compressed: boolean };

/** Salvează o descărcare. Nu aruncă niciodată: jurnalul nu are voie să strice livrarea feed-ului. */
export async function recordFetch(r: FetchRecord) {
  try {
    await db.insert(schema.feedFetches).values(r);
    // Curățenie ieftină (index pe feed + oră): doar rândurile acestui feed, mai vechi de 30 de zile.
    await db.delete(schema.feedFetches).where(and(eq(schema.feedFetches.feedOutputId, r.feedOutputId), lt(schema.feedFetches.at, dsql`now() - interval '30 days'`)));
  } catch (e) {
    console.error("jurnal feed: nu am putut salva descărcarea", (e as Error).message);
  }
}

/**
 * Învelește corpul răspunsului ca să știm la final câți octeți au plecat și dacă clientul a citit tot.
 * `done` se cheamă o singură dată: la sfârșit (trimis) sau la anulare (întrerupt).
 */
export function measured(body: ReadableStream<Uint8Array>, done: (bytes: number, complete: boolean) => void): ReadableStream<Uint8Array> {
  let bytes = 0, fired = false;
  const fire = (complete: boolean) => { if (!fired) { fired = true; done(bytes, complete); } };
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        const { value, done: end } = await reader.read();
        if (end) { ctrl.close(); fire(true); return; }
        bytes += value.byteLength;
        ctrl.enqueue(value);
      } catch (e) { fire(false); ctrl.error(e); }
    },
    cancel(reason) { fire(false); return reader.cancel(reason); },
  });
}

/** Ultimele descărcări ale unui feed, cele mai noi întâi. */
export async function recentFetches(feedOutputId: string, limit = 10) {
  return db.select({ bot: schema.feedFetches.bot, status: schema.feedFetches.status, outcome: schema.feedFetches.outcome, bytes: schema.feedFetches.bytes, durationMs: schema.feedFetches.durationMs, compressed: schema.feedFetches.compressed, at: schema.feedFetches.at })
    .from(schema.feedFetches).where(eq(schema.feedFetches.feedOutputId, feedOutputId)).orderBy(desc(schema.feedFetches.at)).limit(limit);
}

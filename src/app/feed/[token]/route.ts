import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { feedFileByToken } from "@/core/feed-files";
import { botName, measured, recordFetch, type FetchOutcome } from "@/core/feed-fetches";

/**
 * Feed public pe canal, la un URL secret. Canalele (ChatGPT, Google, Meta…) îl descarcă periodic.
 * Se servește fișierul generat de worker, fără niciun calcul pe catalog la cerere. Adresa poate avea extensie (ex. /feed/<token>.csv).
 * Cu „.gz” la final se trimite fișierul comprimat așa cum e. Altfel îl decomprimăm în flux (fără să blocăm serverul), iar Next îl comprimă din nou pentru cine cere gzip
 * (Next ignoră un Content-Encoding pus de noi, deci nu putem trimite direct fișierul comprimat).
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const raw = (await params).token;
  // „/feed/<token>.csv.gz”: fișierul comprimat exact cum e salvat (fără decomprimare, fără lucru pe procesor),
  // pentru canalele care acceptă csv.gz (OpenAI) și pentru descărcarea de mână din panou.
  const gz = /\.gz$/i.test(raw);
  const token = raw.replace(/\.gz$/i, "").replace(/\.(csv|xml|json|tsv)$/i, "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response("Not found", { status: 404 });
  const o = await feedFileByToken(token);
  if (!o) return new Response("Not found", { status: 404 });
  const started = Date.now();
  const log = (status: number, outcome: FetchOutcome, bytes: number | null) =>
    void recordFetch({ feedOutputId: o.id, bot: botName(req.headers.get("user-agent")), status, outcome, bytes, durationMs: Date.now() - started, compressed: gz });
  if (!o.file) {
    log(503, "in-generare", null);
    return new Response("Feed-ul se generează. Încearcă din nou în câteva minute.", { status: 503, headers: { "retry-after": "300", "content-type": "text/plain; charset=utf-8" } });
  }
  const etag = `"${(o.stamp ?? "").slice(0, 32)}"`;
  const headers: Record<string, string> = {
    "content-type": o.fileType ?? "application/octet-stream", "cache-control": "public, max-age=900", "x-robots-tag": "noindex", etag,
    ...(o.generatedAt ? { "last-modified": o.generatedAt.toUTCString() } : {}),
  };
  if (req.headers.get("if-none-match") === etag) { log(304, "nemodificat", null); return new Response(null, { status: 304, headers }); }
  // HEAD (verificarea adresei): doar antetele, fără fișier.
  if (req.method === "HEAD") { log(200, "verificat", null); return new Response(null, { headers: gz ? { ...headers, "content-type": "application/gzip", "content-length": String(o.file.length) } : headers }); }
  const track = (body: ReadableStream<Uint8Array>) => measured(body, (bytes, complete) => log(200, complete ? "trimis" : "intrerupt", bytes));
  if (gz) {
    // application/gzip nu e recomprimat de Next; dimensiunea e cunoscută, deci trimitem Content-Length.
    const file = new Uint8Array(o.file);
    return new Response(track(new Blob([file]).stream()), { headers: { ...headers, "content-type": "application/gzip", "content-length": String(o.file.length), "content-disposition": `attachment; filename="feed-${o.channel}.${(o.fileType ?? "").includes("xml") ? "xml" : "csv"}.gz"` } });
  }
  const body = Readable.toWeb(Readable.from([o.file]).pipe(createGunzip())) as ReadableStream<Uint8Array>;
  return new Response(track(body), { headers });
}

/** HEAD explicit, ca verificarea unei adrese (ex. „Validate” la OpenAI) să apară în jurnal ca verificare, nu ca descărcare întreruptă. */
export const HEAD = GET;

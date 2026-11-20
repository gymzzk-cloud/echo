import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { feedFileByToken } from "@/core/feed-files";

/**
 * Feed public pe canal, la un URL secret. Canalele (ChatGPT, Google, Meta…) îl descarcă periodic.
 * Se servește fișierul generat de worker, fără niciun calcul pe catalog la cerere. Adresa poate avea extensie (ex. /feed/<token>.csv).
 * Fișierul e salvat comprimat; îl decomprimăm în flux (fără să blocăm serverul), iar Next îl comprimă din nou pentru cine cere gzip
 * (Next ignoră un Content-Encoding pus de noi, deci nu putem trimite direct fișierul comprimat).
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.(csv|xml|json|tsv)$/i, "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response("Not found", { status: 404 });
  const o = await feedFileByToken(token);
  if (!o) return new Response("Not found", { status: 404 });
  if (!o.file) {
    return new Response("Feed-ul se generează. Încearcă din nou în câteva minute.", { status: 503, headers: { "retry-after": "300", "content-type": "text/plain; charset=utf-8" } });
  }
  const etag = `"${(o.stamp ?? "").slice(0, 32)}"`;
  const headers: Record<string, string> = {
    "content-type": o.fileType ?? "application/octet-stream", "cache-control": "public, max-age=900", "x-robots-tag": "noindex", etag,
    ...(o.generatedAt ? { "last-modified": o.generatedAt.toUTCString() } : {}),
  };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  const body = Readable.toWeb(Readable.from([o.file]).pipe(createGunzip())) as ReadableStream<Uint8Array>;
  return new Response(body, { headers });
}

import { gunzipSync } from "node:zlib";

/**
 * Găsirea sitemap-ului, cum îl caută roboții: întâi liniile „Sitemap:” din robots.txt, apoi locurile obișnuite,
 * inclusiv sub prefixul de limbă al magazinului (ex. shopexpert.com/ro/sitemap.xml) și variantele .gz.
 * Ne oprim la primul găsit, ca să nu încărcăm site-ul: cel mult 6 cereri.
 */

export type SitemapProbe = { url: string; status: number; kind: "urlset" | "sitemapindex" | "html" | "blocked" | "other" | "error"; locs: number };
export type SitemapResult = {
  found?: { url: string; kind: "urlset" | "sitemapindex"; locs: number; declared: boolean };
  probes: SitemapProbe[];
  sampleUrls: string[]; // câteva adrese din sitemap (pentru găsirea unei pagini de produs)
};

export function sitemapCandidates(origin: string, pathPrefix: string, robotsSitemaps: string[]): string[] {
  const list = [
    ...robotsSitemaps.slice(0, 3),
    ...(pathPrefix ? [`${origin}${pathPrefix}/sitemap.xml`] : []),
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    ...(pathPrefix ? [`${origin}${pathPrefix}/sitemap_index.xml`] : []),
    `${origin}/sitemap.xml.gz`,
  ];
  return [...new Set(list)].slice(0, 6);
}

/** Citește corpul unui sitemap: decomprimă .gz (după semnătura 1f 8b), altfel text. */
export function decodeSitemapBody(buf: Uint8Array): string {
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    try { return gunzipSync(buf).toString("utf8"); } catch { return ""; }
  }
  return new TextDecoder().decode(buf);
}

export function classifySitemap(status: number, body: string): { kind: SitemapProbe["kind"]; locs: number } {
  const head = body.slice(0, 4000);
  if (status === 403 || status === 503 || /cf-chl|just a moment|challenge-platform|attention required/i.test(head)) return { kind: "blocked", locs: 0 };
  if (status < 200 || status >= 300) return { kind: "other", locs: 0 };
  const locs = (body.match(/<loc>/gi) ?? []).length;
  if (/<sitemapindex[\s>]/i.test(head)) return { kind: "sitemapindex", locs };
  if (/<urlset[\s>]/i.test(head)) return { kind: "urlset", locs };
  if (/<html[\s>]/i.test(head)) return { kind: "html", locs: 0 };
  return { kind: "other", locs: 0 };
}

export function sitemapLocs(body: string, max = 3000): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    out.push(m[1].replace(/&amp;/g, "&"));
    if (out.length >= max) break;
  }
  return out;
}

type Fetcher = (url: string) => Promise<{ status: number; body: Uint8Array }>;

export async function findSitemap(origin: string, pathPrefix: string, robotsSitemaps: string[], fetcher: Fetcher): Promise<SitemapResult> {
  const probes: SitemapProbe[] = [];
  const declared = new Set(robotsSitemaps.map((s) => s.trim()));
  for (const url of sitemapCandidates(origin, pathPrefix, robotsSitemaps)) {
    let status = 0, text = "";
    try {
      const r = await fetcher(url);
      status = r.status;
      text = decodeSitemapBody(r.body);
    } catch {
      probes.push({ url, status: 0, kind: "error", locs: 0 });
      continue;
    }
    const c = classifySitemap(status, text);
    probes.push({ url, status, ...c });
    if (c.kind === "urlset" || c.kind === "sitemapindex") {
      return { found: { url, kind: c.kind, locs: c.locs, declared: declared.has(url) }, probes, sampleUrls: c.kind === "urlset" ? sitemapLocs(text) : [] };
    }
  }
  return { probes, sampleUrls: [] };
}

/** Din adresele sitemap-ului, cele care arată a pagini de produs (cele mai adânci, cu cod în nume). */
export function productLikeUrls(urls: string[], pathPrefix: string, max = 3): string[] {
  const scored = urls
    .map((u) => { try { return new URL(u); } catch { return null; } })
    .filter((u): u is URL => !!u && (!pathPrefix || u.pathname.startsWith(pathPrefix + "/")))
    .map((u) => {
      const segs = u.pathname.slice(pathPrefix.length).split("/").filter(Boolean);
      const last = segs[segs.length - 1] ?? "";
      const score = segs.length * 2 + (/\d/.test(last) ? 2 : 0) + (/\/(produs|product|p|termek)\//i.test(u.pathname) ? 4 : 0) - (/categor|blog|info|cont|cart|cos/i.test(u.pathname) ? 10 : 0);
      return { url: u.toString(), score, depth: segs.length };
    })
    .filter((x) => x.depth >= 2 && x.score > 4)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((x) => x.url);
}

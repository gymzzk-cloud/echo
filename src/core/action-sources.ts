import type { Mention } from "@/db/schema";
import { domainOf } from "@/lib/util";
import { canAct, localMarketplace, sourceGroup, sourceKind, type SourceCtx, type SourceKind } from "./source-kind";

export type SourceGap = { domain: string; kind: SourceKind; answers: number; providers: string[]; examples: string[] };

/**
 * Sursele citate de AI în răspunsurile unde apar concurenții și magazinul nu (KNOWLEDGE B55):
 * - doar locuri unde magazinul poate face ceva (comparatoare, recenzii, directoare, presă, forumuri, marketplace-uri locale);
 * - subdomeniile unui comparator se adună sub același nume (roaba.compari.ro + multi-cutter.compari.ro = compari.ro);
 * - un marketplace din altă țară (ebay.com, amazon.co.uk) nu e recomandat unui magazin din România;
 * - fiecare sursă spune ce AI-uri au citit-o și la ce întrebări, ca dovadă.
 * Funcție pură (tests/action-sources.test.ts).
 */
export function sourceGaps(
  rows: { run: { provider: string; query?: string; mentions: unknown; sources: unknown } }[],
  opts: { domain: string; competitorDomains: string[]; ctx: SourceCtx; country: string; minAnswers?: number },
): SourceGap[] {
  const gap = new Map<string, { kind: SourceKind; answers: number; providers: Set<string>; examples: Set<string> }>();
  for (const { run } of rows) {
    const ms = (run.mentions ?? []) as Mention[];
    const meIn = ms.some((m) => m.domain === opts.domain);
    const compIn = ms.some((m) => opts.competitorDomains.includes(m.domain));
    if (meIn || !compIn) continue;
    const seen = new Set<string>();
    for (const s of (run.sources ?? []) as { url: string }[]) {
      const d = domainOf(s.url);
      if (!d) continue;
      const kind = sourceKind(d, opts.ctx);
      if (!canAct(kind)) continue;
      if (kind === "marketplace" && !localMarketplace(d, opts.country)) continue;
      const key = sourceGroup(d, kind);
      if (seen.has(key)) continue;
      seen.add(key);
      const e = gap.get(key) ?? { kind, answers: 0, providers: new Set<string>(), examples: new Set<string>() };
      e.answers++;
      e.providers.add(run.provider);
      if (run.query) e.examples.add(run.query);
      gap.set(key, e);
    }
  }
  return [...gap.entries()]
    .filter(([, e]) => e.answers >= (opts.minAnswers ?? 2))
    .map(([domain, e]) => ({ domain, kind: e.kind, answers: e.answers, providers: [...e.providers], examples: [...e.examples].slice(0, 3) }))
    .sort((a, b) => b.answers - a.answers);
}

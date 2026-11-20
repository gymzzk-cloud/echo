import { watchProduct } from "@/app/actions-cont";
import Link from "next/link";
import { inArray, eq, and, gte, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { AiDots, Badge, Card, Notice } from "@/components/ui";
import { PROVIDERS, providerLabel } from "@/core/ai/types";
import { money } from "@/lib/format";
import { daysAgo } from "@/lib/util";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compară produse", robots: { index: false } };

export default async function Compare({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const sp = await searchParams;
  const ids = [...new Set((Array.isArray(sp.id) ? sp.id : sp.id ? [sp.id] : []).filter((x) => /^[0-9a-f-]{36}$/.test(x)))].slice(0, 4);
  const rows = ids.length ? await db.select({ p: schema.products, store: schema.projects }).from(schema.products)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.products.projectId)).where(inArray(schema.products.id, ids)) : [];

  // De câte AI-uri a fost recomandat fiecare produs în ultimele 30 de zile
  const recs = new Map<string, Set<string>>();
  for (const r of rows) {
    const found = (await db.select({ provider: schema.runs.provider }).from(schema.runs)
      .where(and(gte(schema.runs.runDate, daysAgo(30)), dsql`${schema.runs.mentions} @> ${JSON.stringify([{ domain: r.store.domain, productTitle: r.p.title }])}::jsonb`)).groupBy(schema.runs.provider));
    recs.set(r.p.id, new Set(found.map((f) => f.provider)));
  }
  const prices = rows.map((r) => (r.p.price ? parseFloat(r.p.price) : Infinity));
  const cheapest = Math.min(...prices);
  const backUrl = "/compara?" + ids.map((i) => `id=${i}`).join("&");
  const line = (label: string, cell: (r: (typeof rows)[number]) => React.ReactNode) => (
    <tr className="border-b border-border"><th className="label w-40 py-3 pr-4 text-left align-top">{label}</th>{rows.map((r) => <td key={r.p.id} className="px-3 py-3 align-top">{cell(r)}</td>)}</tr>
  );

  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-3xl font-semibold">Compară produse</h1>
        {rows.length < 2 ? <Notice>Bifează cel puțin două produse în rezultatele căutării, apoi apasă „Compară”.</Notice> : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <tbody>
                  {line("Produs", (r) => <div className="font-display text-base font-semibold">{r.p.title}</div>)}
                  {line("Preț", (r) => <div><span className="num font-display text-xl font-semibold">{money(r.p.price, r.p.currency)}</span>{r.p.price && parseFloat(r.p.price) === cheapest && <span className="ml-2"><Badge tone="good">cel mai mic</Badge></span>}</div>)}
                  {line("Stoc", (r) => r.p.inStock ? <span className="text-good">✓ în stoc</span> : <span className="text-bad">✕ epuizat</span>)}
                  {line("Recomandat de", (r) => <div className="space-y-1"><AiDots n={recs.get(r.p.id)?.size ?? 0} total={PROVIDERS.length} /><div className="text-xs text-muted">{[...(recs.get(r.p.id) ?? [])].map(providerLabel).join(" · ")}</div></div>)}
                  {line("Magazin", (r) => <Link href={`/magazin/${r.store.domain}`} className="font-medium hover:underline">{r.store.name}</Link>)}
                  {line("Brand", (r) => r.p.brand ?? "–")}
                  {line("Categorie", (r) => r.p.category ?? "–")}
                  {line("Descriere", (r) => <p className="line-clamp-6 text-muted">{r.p.description ?? "–"}</p>)}
                  {line("", (r) => <a href={`/go/${r.p.id}${r.p.cartUrl ? "?cos=1" : ""}`} rel="nofollow sponsored" className="inline-block rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-fg">{r.p.cartUrl ? "Pune în coș" : "Cumpără"} de la {r.store.name}</a>)}
                  {line("", (r) => <form action={watchProduct}><input type="hidden" name="productId" value={r.p.id} /><input type="hidden" name="back" value={backUrl} /><button className="text-xs text-primary hover:underline">Urmărește prețul</button></form>)}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>
      <PublicFooter />
    </>
  );
}

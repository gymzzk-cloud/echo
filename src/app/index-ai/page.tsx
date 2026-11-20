import { sql as dsql } from "drizzle-orm";
import { db } from "@/db";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { Card, Notice, Table, Td } from "@/components/ui";
import { PROVIDERS, providerLabel } from "@/core/ai/types";
import { isDemo } from "@/core/ai/engine";
import { daysAgo } from "@/lib/util";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const metadata = { title: "Indexul AI al comerțului online RO/HU", description: "Ce magazine recomandă ChatGPT, Gemini, Perplexity, Claude, Google AI Mode și Copilot în România și Ungaria." };

/** Indexul public: ce magazine recomandă AI-urile, agregat din toate întrebările urmărite. Doar cifre agregate. */
export default async function AiIndex() {
  const rows = (await db.execute(dsql`
    with m as (
      select r.provider, r.language, e->>'domain' as domain
      from runs r, jsonb_array_elements(r.mentions) e
      where r.run_date >= ${daysAgo(30)}
    )
    select domain, language, count(*)::int as n, count(distinct provider)::int as ais,
           ${dsql.raw(PROVIDERS.map((p) => `count(*) filter (where provider = '${p.id}')::int as "${p.id}"`).join(", "))}
    from m group by domain, language order by n desc limit 60`)) as unknown as ({ domain: string; language: string; n: number; ais: number } & Record<string, number>)[];
  const [{ runs }] = (await db.execute(dsql`select count(*)::int as runs from runs where run_date >= ${daysAgo(30)}`)) as unknown as { runs: number }[];
  const total = (lang: string) => rows.filter((r) => r.language === lang).reduce((s, r) => s + r.n, 0) || 1;
  const block = (lang: "ro" | "hu", title: string) => {
    const list = rows.filter((r) => r.language === lang).slice(0, 20);
    return (
      <Card title={title}>
        {list.length === 0 ? <p className="text-sm text-muted">Încă nu avem date.</p> : (
          <Table head={["#", "Magazin", "Cota din recomandări", "AI-uri", ...PROVIDERS.map((p) => providerLabel(p.id))]}>
            {list.map((r, i) => (
              <tr key={r.domain}>
                <Td className="num text-muted">{i + 1}</Td>
                <Td><a href={`/magazin/${r.domain}`} className="font-medium hover:underline">{r.domain}</a></Td>
                <Td className="num">{((r.n / total(lang)) * 100).toFixed(1)}%</Td>
                <Td className="num">{r.ais}/{PROVIDERS.length}</Td>
                {PROVIDERS.map((p) => <Td key={p.id} className="num text-muted">{r[p.id] || "–"}</Td>)}
              </tr>
            ))}
          </Table>
        )}
      </Card>
    );
  };
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <div className="label">Ultimele 30 de zile · {runs} răspunsuri AI analizate</div>
          <h1 className="mt-1 text-3xl font-semibold">Indexul AI al comerțului online</h1>
          <p className="mt-2 max-w-3xl text-muted">Ce magazine recomandă asistenții AI când oamenii îi întreabă ce să cumpere. Numărăm recomandările din răspunsurile reale la întrebările urmărite de {BRAND.name}. Nimeni nu poate plăti pentru poziție.</p>
        </div>
        {isDemo() && <Notice tone="warn">Mod demonstrativ: indexul este calculat din răspunsuri simulate.</Notice>}
        {block("ro", "România")}
        {block("hu", "Ungaria")}
        <p className="text-xs text-muted">Metodologie: o recomandare = un magazin menționat într-un răspuns. Cota = recomandările magazinului / toate recomandările din țara respectivă. Marketplace-urile apar separat de magazinele proprii.</p>
      </main>
      <PublicFooter />
    </>
  );
}

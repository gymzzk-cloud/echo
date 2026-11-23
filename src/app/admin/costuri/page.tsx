import { sql as dsql } from "drizzle-orm";
import { db } from "@/db";
import { requireAdmin } from "@/lib/admin";
import { activeProviders } from "@/core/ai/engine";
import { budgetLeft, costConfig } from "@/core/ai/budget";
import { monthlyCostEstimate } from "@/core/tracked-products";
import { PublicHeader } from "@/components/public-header";
import { Card, Stat, Table, Td } from "@/components/ui";
import { num } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Costuri AI pe magazin", robots: { index: false } };

type Row = { id: string; name: string; domain: string; plan: string; prompts: number; n: number; tasks: number; usd: number; i: number; o: number };
const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * Intern: cât ne costă AI-urile pentru fiecare magazin luna aceasta (întrebări + scrieri, ex. reparații) și cât
 * ar costa pe lună lista activă. Magazinul nu vede aceste cifre (ZoZo, 23.11.2026). O singură interogare grupată în SQL.
 */
export default async function AiCosts() {
  await requireAdmin();
  const rows = (await db.execute(dsql`
    with q as (
      select project_id, count(*)::int as n, coalesce(sum(cost_usd),0)::float as usd,
             coalesce(sum(input_tokens),0)::float as i, coalesce(sum(output_tokens),0)::float as o
      from (select distinct p.project_id, r.id, r.cost_usd, r.input_tokens, r.output_tokens
            from runs r join prompt_runs pr on pr.run_id = r.id join prompts p on p.id = pr.prompt_id
            where r.run_date >= date_trunc('month', now()) and r.mode = 'live') x
      group by project_id
    ), t as (
      select project_id, count(*)::int as n, coalesce(sum(cost_usd),0)::float as usd,
             coalesce(sum(input_tokens),0)::float as i, coalesce(sum(output_tokens),0)::float as o
      from ai_tasks where created_at >= date_trunc('month', now()) and error is null group by project_id
    ), a as (select project_id, count(*)::int as n from prompts where active group by project_id)
    select pj.id, pj.name, pj.domain, o.plan, coalesce(a.n,0)::int as prompts,
           coalesce(q.n,0)::int as n, coalesce(t.n,0)::int as tasks,
           (coalesce(q.usd,0) + coalesce(t.usd,0))::float as usd,
           (coalesce(q.i,0) + coalesce(t.i,0))::float as i, (coalesce(q.o,0) + coalesce(t.o,0))::float as o
    from projects pj join orgs o on o.id = pj.org_id
    left join q on q.project_id = pj.id left join t on t.project_id = pj.id left join a on a.project_id = pj.id
    order by usd desc, pj.name limit 300`)) as unknown as Row[];
  const cfg = costConfig();
  const providers = activeProviders().filter((p) => !p.off).length;
  const total = rows.reduce((s, r) => s + r.usd, 0);
  const atCap = rows.filter((r) => budgetLeft(r.usd, cfg.monthlyBudgetUsd) === 0).length;
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div><div className="label">Intern</div><h1 className="mt-1 text-3xl font-semibold">Costuri AI pe magazin</h1>
          <p className="mt-1 text-sm text-muted">Doar pentru noi: magazinele nu văd costurile. Luna aceasta, de la cel mai scump. Plafon {cfg.monthlyBudgetUsd ? usd(cfg.monthlyBudgetUsd) : "fără"} pe magazin, o rulare la {cfg.runEveryDays} zile, {providers} AI-uri active.</p></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Cost total luna asta" value={usd(total)} /><Stat label="Magazine" value={num(rows.length)} /><Stat label="La plafon" value={num(atCap)} />
        </div>
        <Card title={`Magazine: ${num(rows.length)}`} description="Întrebări și scrieri AI (ex. reparații de produs) din luna aceasta; o întrebare comună mai multor magazine apare la fiecare. Estimarea pe lună: întrebări active × AI-uri × rulări pe lună × costul mediu al unei întrebări.">
          <Table head={["Magazin", "Plan", "Întrebări active", "Întrebări / scrieri luna asta", "Tokeni (intrare / ieșire)", "Cost luna asta", "Rămas din plafon", "Estimat pe lună"]}>
            {rows.map((r) => {
              const left = budgetLeft(r.usd, cfg.monthlyBudgetUsd);
              const est = monthlyCostEstimate(r.prompts, providers, cfg.runEveryDays, { n: r.n, usd: r.usd });
              return (
                <tr key={r.id}>
                  <Td><span className="font-medium">{r.name}</span><div className="text-xs text-muted">{r.domain}</div></Td>
                  <Td className="text-xs">{r.plan}</Td>
                  <Td className="num text-right">{num(r.prompts)}</Td>
                  <Td className="num text-right">{num(r.n)} / {num(r.tasks)}</Td>
                  <Td className="num whitespace-nowrap text-right">{num(r.i)} / {num(r.o)}</Td>
                  <Td className="num text-right">{usd(r.usd)}</Td>
                  <Td className="num text-right">{left === null ? "fără plafon" : usd(left)}</Td>
                  <Td className="num text-right">{est ? usd(est.usd) : "–"}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </main>
    </>
  );
}

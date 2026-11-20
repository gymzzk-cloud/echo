import { currentProject } from "@/lib/project";
import { loadBase, sourceInsights } from "@/core/insights";
import { providerLabel } from "@/core/ai/types";
import { Badge, Card, Empty, PageHeader, Table, Td } from "@/components/ui";

const ADVICE: Record<string, string> = {
  comparator: "Listează-ți produsele pe acest comparator, cu prețuri și stoc corecte.",
  forum: "Răspunde util la discuțiile despre categoria ta (fără reclamă agresivă).",
  video: "Un video scurt de prezentare sau comparație, cu link spre produs.",
  "marketplace / retailer": "Dacă vinzi și aici, completează fișele de produs; recenziile contează.",
  "editorial / blog": "Propune un articol, un test de produs sau intră în topurile lor („cele mai bune …”).",
};

export default async function Sources() {
  const { project } = await currentProject();
  const { rows, competitors } = await loadBase(project, 30);
  if (!rows.length) return <><PageHeader title="Surse" /><Empty title="Încă nu avem răspunsuri de la AI-uri" /></>;
  const s = sourceInsights(rows, project.domain, competitors.map((c) => c.domain));

  return (
    <div className="space-y-6">
      <PageHeader title="Surse" subtitle="Site-urile pe care le citesc AI-urile când răspund la întrebările din categoria ta." />
      <Card title="Unde apar concurenții, dar tu nu" action={<Badge tone={s.gaps.length ? "warn" : "good"}>{s.gaps.length} oportunități</Badge>}>
        {s.gaps.length === 0 ? <p className="text-sm text-muted">Nicio sursă importantă în care concurenții să fie mai prezenți decât tine.</p> : (
          <ul className="space-y-3">
            {s.gaps.slice(0, 10).map((g) => (
              <li key={g.domain} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{g.domain}</span><span className="flex gap-2"><Badge>{g.kind}</Badge><Badge tone="warn">+{g.gap} răspunsuri cu concurenți</Badge></span></div>
                <p className="mt-1 text-sm text-muted">{ADVICE[g.kind] ?? ADVICE["editorial / blog"]}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Toate sursele citate">
        <Table head={["Sursă", "Tip", "Citată de", "În răspunsuri", "Cu tine"]}>
          {s.list.slice(0, 100).map((x) => (
            <tr key={x.domain}>
              <Td className="font-medium">{x.domain}</Td>
              <Td><Badge tone={x.kind === "site propriu" ? "good" : x.kind === "concurent" ? "bad" : "muted"}>{x.kind}</Badge></Td>
              <Td className="text-xs text-muted">{x.providers.map(providerLabel).join(", ")}</Td>
              <Td className="num">{x.citations}</Td>
              <Td className="num">{x.withMe}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

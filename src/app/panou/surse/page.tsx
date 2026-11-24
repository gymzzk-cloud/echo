import { currentProject } from "@/lib/project";
import { readSnapshot } from "@/core/panel-snapshot";
import { SnapshotNote } from "@/components/snapshot-note";
import { providerLabel } from "@/core/ai/types";
import { SOURCE_ADVICE } from "@/core/source-kind";
import { Badge, Card, Empty, PageHeader, SubCard, Table, Td } from "@/components/ui";
import { CardHelp } from "@/components/card-help";


export default async function Sources() {
  const { project } = await currentProject();
  // Calculat în worker din toate răspunsurile pe 30 de zile; pagina citește un rând (KNOWLEDGE B48).
  const snap = await readSnapshot(project, "sources");
  const s = snap.data;
  if (!s.rowCount) return <><PageHeader eyebrow="Cum te recomandă AI-urile" title="Surse" /><Empty title="Încă nu avem răspunsuri de la AI-uri" /></>;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Cum te recomandă AI-urile" title="Surse" subtitle="Site-urile pe care le citesc AI-urile când răspund la întrebările din categoria ta." />
      <SnapshotNote computedAt={snap.computedAt} stale={snap.stale} />
      <Card title="Unde apar concurenții, dar tu nu" description={<CardHelp id="sources.gaps" />} action={<Badge tone={s.gapCount ? "warn" : "good"}>{s.gapCount} {s.gapCount === 1 ? "oportunitate" : "oportunități"}</Badge>}>
        {s.gaps.length === 0 ? <p className="text-sm text-muted">Nicio sursă importantă în care concurenții să fie mai prezenți decât tine.</p> : (
          <ul className="space-y-3">
            {s.gaps.slice(0, 10).map((g) => (
              <li key={g.domain}>
                <SubCard>
                  <div className="flex flex-wrap gap-2"><Badge tone="warn">+{g.gap} răspunsuri cu concurenți</Badge><Badge>{g.kind}</Badge></div>
                  <div className="mt-2 break-all font-semibold">{g.domain}</div>
                  <p className="mt-1 text-sm text-muted">{SOURCE_ADVICE[g.kind]}</p>
                </SubCard>
              </li>
            ))}
          </ul>
        )}
        {s.gapCount > s.gaps.length && <p className="mt-4 text-xs text-muted">Afișăm primele {s.gaps.length} din {s.gapCount}, cele cu cea mai mare diferență.</p>}
      </Card>
      <Card title="Toate sursele citate" description={<CardHelp id="sources.all" />}>
        <Table head={["Sursă", "Tip", "Citată de", "În răspunsuri", "Cu tine"]}>
          {s.list.slice(0, 100).map((x) => (
            <tr key={x.domain}>
              <Td className="font-medium">{x.domain}</Td>
              <Td><Badge tone={x.kind === "site propriu" ? "good" : x.kind === "concurent" ? "bad" : x.kind === "magazin sau alt site" || x.kind === "producător" ? "muted" : "primary"}>{x.kind}</Badge></Td>
              <Td className="text-xs text-muted">{x.providers.map(providerLabel).join(", ")}</Td>
              <Td className="num text-right">{x.citations}</Td>
              <Td className="num text-right">{x.withMe}</Td>
            </tr>
          ))}
        </Table>
        {s.listTotal > s.list.length && <p className="mt-4 text-xs text-muted">Afișăm primele {s.list.length} din {s.listTotal} surse, cele mai citate.</p>}
      </Card>
    </div>
  );
}

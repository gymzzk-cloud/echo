import { currentProject } from "@/lib/project";
import { readSnapshot } from "@/core/panel-snapshot";
import { SnapshotNote } from "@/components/snapshot-note";
import { providerLabel } from "@/core/ai/types";
import { Badge, Card, Empty, Notice, PageHeader, Table, Td, TextLink } from "@/components/ui";
import { TrendChart } from "@/components/client";
import { CardHelp } from "@/components/card-help";

export default async function Reputation() {
  const { project } = await currentProject();
  // Calculat în worker din răspunsurile pe 30 de zile; pagina citește un rând (KNOWLEDGE B48).
  const snap = await readSnapshot(project, "reputation");
  const r = snap.data;
  if (!r.hasData) return <><PageHeader eyebrow="Cum te recomandă AI-urile" title="Ce spune AI-ul despre tine" /><Empty title="Încă nu avem răspunsuri la întrebările despre magazin">Le punem zilnic: „{project.name} este un magazin de încredere?”, „Ce părere au clienții…”, „Livrează rapid?”.</Empty></>;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Cum te recomandă AI-urile" title="Ce spune AI-ul despre tine" subtitle="Tonul fiecărui AI, ce afirmă despre tine și ce afirmații contrazic faptele de pe site. Pe acestea le poți corecta." />
      <SnapshotNote computedAt={snap.computedAt} stale={snap.stale} />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <Card>
          <Table head={["AI", "Te cunoaște", "Ton", "Plusuri", "Minusuri"]}>
            {r.perProvider.map((p) => (
              <tr key={p.provider}>
                <Td className="whitespace-nowrap">{providerLabel(p.provider)}</Td>
                <Td>{p.questions ? (p.knows ? <Badge tone="good">Da, {p.knows} din {p.questions}</Badge> : <Badge tone="bad">Nu</Badge>) : "–"}</Td>
                <Td>{p.score === null ? "–" : <Badge tone={p.score >= 66 ? "good" : p.score >= 40 ? "warn" : "bad"}>{p.score >= 66 ? "Pozitiv" : p.score >= 40 ? "Mixt" : "Negativ"} · {p.score}%</Badge>}</Td>
                <Td className="num text-right text-good">▲ {p.pos}</Td>
                <Td className="num text-right text-bad">▼ {p.neg}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Tonul în timp (% afirmații pozitive)" description={<CardHelp id="reputation.trend" />}>
          {r.trend.length > 1 ? <TrendChart data={r.trend} series={[{ key: "ton", label: "Ton pozitiv", color: "var(--primary)" }]} height={200} /> : <p className="text-sm text-muted">Apare după a doua zi.</p>}
        </Card>
      </div>
      <Card title="Ce afirmă AI-urile despre tine" description={<CardHelp id="reputation.claims" />}>
        <ul className="divide-y divide-border">
          {r.claims.map((c) => (
            <li key={c.text} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <span className="min-w-0 flex-1 text-sm">„{c.text}”</span>
                <span className="flex flex-wrap gap-1"><Badge tone={c.tone === "pozitiv" ? "good" : c.tone === "negativ" ? "bad" : c.tone === "mixt" ? "warn" : "muted"}>{c.tone === "pozitiv" ? "Pozitiv" : c.tone === "negativ" ? "Negativ" : c.tone === "mixt" ? "Mixt" : "Neutru"}</Badge>{c.providers.map((p) => <Badge key={p}>{providerLabel(p)}</Badge>)}</span>
              </div>
              {/* Dovada: întrebarea, ziua și linkul spre răspunsul întreg al AI-ului. */}
              <p className="mt-1 text-xs text-muted">{c.prompt ? <>La întrebarea „{c.prompt}”</> : "Din răspuns"}{c.runDate ? `, ${c.runDate.split("-").reverse().join(".")}` : ""} · <TextLink href={`/panou/vizibilitate?v=raspunsuri&ai=${c.providers[0]}`}>Vezi răspunsul întreg</TextLink></p>
              {c.contradicts && <div className="mt-2"><Notice tone="warn"><b className="font-semibold">Greșit, se poate corecta:</b> {c.contradicts}</Notice></div>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

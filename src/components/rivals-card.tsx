import { trackRival } from "@/app/actions";
import { RIVAL_MAX_AUTO, RIVAL_MIN_BEATS, type RivalReport } from "@/core/rivals";
import { Badge, Card, Table, Td, TextLink } from "./ui";
import { SubmitButton } from "./client";

/** Vizibilitate: magazinele care apar mai bine ca tine la aceleași căutări, cu cota din recomandări. */
export function RivalsCard({ report, projectId, projectName, competitors }: {
  report: RivalReport;
  projectId: string;
  projectName: string;
  competitors: { domain: string; suggested: boolean }[];
}) {
  const top = report.rivals.filter((r) => r.beats > 0).slice(0, 10);
  const lead = top[0];
  const tracked = new Map(competitors.map((c) => [c.domain, c.suggested]));
  const bar = (pct: number, me = false) => (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 shrink-0 rounded-full bg-surface"><div className={`h-2 rounded-full ${me ? "bg-primary" : "bg-muted"}`} style={{ width: `${pct}%` }} /></div>
      <span className="num">{pct}%</span>
    </div>
  );

  return (
    <Card title="Cine apare mai bine ca tine la aceleași produse">
      {lead ? (
        <p className="mb-4 text-sm">
          <strong>{lead.name}</strong> te întrece de <strong className="num">{lead.beats}</strong> ori în {report.answers} răspunsuri AI la căutările tale.
          Cota ta din recomandările de magazine: <strong className="num">{report.me.share}%</strong>.
        </p>
      ) : (
        <p className="mb-4 text-sm text-muted">Niciun alt magazin nu apare mai bine ca tine în cele {report.answers} răspunsuri AI analizate.</p>
      )}
      {top.length > 0 && (
        <Table head={["#", "Magazin", "Te întrece", "Căutări unde apare", "Cota din recomandări", ""]}>
          <tr className="bg-primary-bg/40 font-medium">
            <Td className="num text-muted">–</Td>
            <Td>{projectName} (tu)</Td>
            <Td className="text-muted">–</Td>
            <Td className="num text-right">{report.me.prompts}</Td>
            <Td>{bar(report.me.share, true)}</Td>
            <Td>{null}</Td>
          </tr>
          {top.map((r, i) => {
            const t = tracked.get(r.domain);
            return (
              <tr key={r.domain}>
                <Td className="num text-muted">{i + 1}</Td>
                <Td>
                  <span className="flex flex-wrap items-center gap-2">{r.name}{r.marketplace && <Badge>Marketplace</Badge>}</span>
                  <span className="block text-xs text-muted">{r.domain}</span>
                </Td>
                <Td>
                  <span className="num font-medium">{r.beats}×</span>
                  <span className="block text-xs text-muted">{r.instead} în locul tău · {r.ahead} înaintea ta</span>
                </Td>
                <Td className="num text-right">{r.prompts}</Td>
                <Td>{bar(r.share)}</Td>
                <Td className="text-right">
                  {t === undefined ? (
                    <form action={trackRival}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="domain" value={r.domain} />
                      <input type="hidden" name="name" value={r.name} />
                      <SubmitButton variant="secondary" size="sm" pendingText="Adaug…">Urmărește</SubmitButton>
                    </form>
                  ) : <Badge tone={t ? "primary" : "good"}>{t ? "Adăugat automat" : "Urmărit"}</Badge>}
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
      <p className="mt-4 text-xs text-muted">
        „Te întrece” = AI-ul îl recomandă în locul tău sau înaintea ta, pentru aceleași căutări. Îi găsim în răspunsurile deja primite, fără întrebări în plus.
        Adăugăm automat la concurenți magazinele care te întrec de cel puțin {RIVAL_MIN_BEATS} ori (maximum {RIVAL_MAX_AUTO}); dacă scoți unul din <TextLink href="/panou/setari" className="text-xs">Setări</TextLink>, nu-l mai adăugăm.
      </p>
    </Card>
  );
}

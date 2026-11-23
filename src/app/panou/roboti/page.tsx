import { currentProject } from "@/lib/project";
import { botSummary, botVendor, cloudflareWorker } from "@/core/bots";
import { uploadBotLog } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Card, Field, FileInput, FormActions, PageHeader, Table, Td } from "@/components/ui";
import { CodeBlock, SubmitButton, TrendChart } from "@/components/client";
import { daysAgo } from "@/lib/util";
import { CardHelp } from "@/components/card-help";

export default async function Bots() {
  const { project } = await currentProject();
  const s = await botSummary(project.id, daysAgo(30));
  const worker = cloudflareWorker(process.env.APP_URL ?? "http://localhost:3000", project.trackingKey);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Reparații" title="Roboții AI pe site" subtitle="În ultimele 30 de zile: ce roboți AI îți citesc site-ul, ce pagini, și unde sunt blocați. Un robot blocat înseamnă că acel AI nu-ți vede produsele." />
      {s.byBot.length > 0 ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
            <Card>
              <Table head={["Robot", "Al cui", "Vizite", "Pagini", "Blocat", "Negăsit (404)"]}>
                {s.byBot.map((b) => (
                  <tr key={b.bot}>
                    <Td className="font-medium">{b.bot}</Td>
                    <Td className="text-muted">{botVendor(b.bot)}</Td>
                    <Td className="num text-right">{b.hits}</Td>
                    <Td className="num text-right">{b.pages}</Td>
                    <Td>{b.blocked ? <Badge tone="bad">{b.blocked}</Badge> : <span className="text-muted">0</span>}</Td>
                    <Td>{b.missing ? <Badge tone="warn">{b.missing}</Badge> : <span className="text-muted">0</span>}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title="Vizite pe zi" description={<CardHelp id="bots.daily" />}>
              {s.daily.length > 1 ? <TrendChart data={s.daily.map((d) => ({ day: d.day.slice(5).split("-").reverse().join("."), hits: d.hits }))} series={[{ key: "hits", label: "Vizite", color: "var(--primary)" }]} height={200} unit="" /> : <p className="text-sm text-muted">Apare după a doua zi.</p>}
            </Card>
          </div>
          <Card title="Paginile citite cel mai des" description={<CardHelp id="bots.pages" />}>
            <Table head={["Pagină", "Vizite", "Roboți"]}>
              {s.topPages.map((p) => <tr key={p.path}><Td className="break-all font-mono text-xs">{p.path}</Td><Td className="num text-right">{p.hits}</Td><Td className="text-xs text-muted">{p.bots.join(", ")}</Td></tr>)}
            </Table>
          </Card>
        </>
      ) : <Card><p className="text-sm text-muted">Încă nu avem date. Alege una din variantele de mai jos.</p></Card>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Varianta 1: încarcă jurnalul serverului" description={<CardHelp id="bots.log" />}>
          <p className="mb-4 text-sm text-muted">Fișierul access.log (nginx sau Apache), de la găzduire. Citim doar liniile roboților AI.</p>
          <ActionForm action={uploadBotLog} className="grid items-start gap-4 md:grid-cols-[1fr_auto]">
            <input type="hidden" name="projectId" value={project.id} />
            <Field label="Fișier jurnal"><FileInput name="file" required /></Field>
            <FormActions><SubmitButton variant="secondary" pendingText="Analizez…">Analizează jurnalul</SubmitButton></FormActions>
          </ActionForm>
        </Card>
        <Card title="Varianta 2: automat, prin Cloudflare" description={<CardHelp id="bots.cloudflare" />}>
          <p className="mb-4 text-sm text-muted">Workers → Create → lipește codul → adaugă ruta magazinului. Raportează doar vizitele roboților AI.</p>
          <CodeBlock code={worker} label="JavaScript (Cloudflare Worker)" />
        </Card>
      </div>
    </div>
  );
}

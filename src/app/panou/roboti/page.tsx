import { currentProject } from "@/lib/project";
import { botSummary, botVendor, cloudflareWorker } from "@/core/bots";
import { uploadBotLog } from "@/app/actions";
import { ActionForm } from "@/components/forms";
import { Badge, Button, Card, Field, PageHeader, Table, Td } from "@/components/ui";
import { CopyButton, TrendChart } from "@/components/client";
import { daysAgo } from "@/lib/util";

export default async function Bots() {
  const { project } = await currentProject();
  const s = await botSummary(project.id, daysAgo(30));
  const worker = cloudflareWorker(process.env.APP_URL ?? "http://localhost:3000", project.trackingKey);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Ultimele 30 de zile" title="Roboții AI pe site" subtitle="Ce roboți AI îți citesc site-ul, ce pagini, și unde sunt blocați. Un robot blocat înseamnă că acel AI nu-ți vede produsele." />
      {s.byBot.length > 0 ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
            <Card>
              <Table head={["Robot", "Al cui", "Vizite", "Pagini", "Blocat", "Negăsit (404)"]}>
                {s.byBot.map((b) => (
                  <tr key={b.bot}>
                    <Td className="font-medium">{b.bot}</Td>
                    <Td className="text-muted">{botVendor(b.bot)}</Td>
                    <Td className="num">{b.hits}</Td>
                    <Td className="num">{b.pages}</Td>
                    <Td>{b.blocked ? <Badge tone="bad">{b.blocked}</Badge> : <span className="text-muted">0</span>}</Td>
                    <Td>{b.missing ? <Badge tone="warn">{b.missing}</Badge> : <span className="text-muted">0</span>}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title="Vizite pe zi">
              {s.daily.length > 1 ? <TrendChart data={s.daily.map((d) => ({ day: d.day.slice(5).split("-").reverse().join("."), hits: d.hits }))} series={[{ key: "hits", label: "Vizite", color: "var(--primary)" }]} height={200} unit="" /> : <p className="text-sm text-muted">Apare după a doua zi.</p>}
            </Card>
          </div>
          <Card title="Paginile citite cel mai des">
            <Table head={["Pagină", "Vizite", "Roboți"]}>
              {s.topPages.map((p) => <tr key={p.path}><Td className="break-all font-mono text-xs">{p.path}</Td><Td className="num">{p.hits}</Td><Td className="text-xs text-muted">{p.bots.join(", ")}</Td></tr>)}
            </Table>
          </Card>
        </>
      ) : <Card><p className="text-sm text-muted">Încă nu avem date. Alege una din variantele de mai jos.</p></Card>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Varianta 1: încarcă jurnalul serverului">
          <p className="mb-3 text-sm text-muted">Fișierul access.log (nginx sau Apache), de la găzduire. Citim doar liniile roboților AI.</p>
          <ActionForm action={uploadBotLog} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="projectId" value={project.id} />
            <Field label="Fișier jurnal"><input type="file" name="file" required className="block text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-bg file:px-3 file:py-2" /></Field>
            <Button variant="secondary">Analizează</Button>
          </ActionForm>
        </Card>
        <Card title="Varianta 2: automat, prin Cloudflare">
          <p className="mb-3 text-sm text-muted">Workers → Create → lipește codul → adaugă ruta magazinului. Raportează doar vizitele roboților AI.</p>
          <div className="relative rounded-lg border border-border bg-surface p-3"><div className="absolute right-2 top-2"><CopyButton text={worker} /></div><pre className="max-h-56 overflow-auto font-mono text-[11px]">{worker}</pre></div>
        </Card>
      </div>
    </div>
  );
}

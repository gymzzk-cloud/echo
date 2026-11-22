import { Suspense } from "react";
import { eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Badge, ButtonLink, Card, Empty, Field, Input, PageHeader, RowActions, Select, Table, Td } from "@/components/ui";
import { CHANNELS, buildFeed } from "@/core/feed";
import { ChannelsCard, ChatGptCard } from "./channels";
import { addRule, deleteRule, toggleChannel, toggleRule } from "@/app/actions-feed";
import { fixCounts } from "@/core/fixes";
import { money } from "@/lib/format";

const OPS: Record<string, string> = { eq: "este", neq: "nu este", contains: "conține", lt: "mai mic decât", gt: "mai mare decât", empty: "lipsește", not_empty: "există" };
const FIELD_LABEL: Record<string, string> = { title: "Titlu", description: "Descriere", brand: "Marcă", category: "Categorie", gtin: "GTIN/EAN", price: "Preț", inStock: "În stoc (da/nu)", label: "Etichetă" };
const ACT: Record<string, string> = { set: "setează", prefix: "adaugă în față", suffix: "adaugă la final", exclude: "exclude produsul", label: "adaugă eticheta" };
const LABELS: Record<string, string> = { recomandat_ai: "Recomandat de AI", popular: "Popular", zombie: "Fără vânzări / fără AI", in_stoc: "În stoc", fara_stoc: "Fără stoc", pret_cel_mai_bun: "Cel mai bun preț", pret_in_piata: "Preț în piață", pret_peste_piata: "Peste piață", date_lipsa: "Date lipsă" };

export default async function FeedPage() {
  const { project } = await currentProject();
  const rules = await db.select().from(schema.feedRules).where(eq(schema.feedRules.projectId, project.id)).orderBy(schema.feedRules.priority);
  const fixes = await fixCounts(project.id);
  // Doar numărul de produse aici; etichetele și previzualizarea (calcul pe tot catalogul) vin separat, în Suspense.
  const [{ total }] = await db.select({ total: dsql<number>`count(*)::int` }).from(schema.products).where(eq(schema.products.projectId, project.id));
  const pid = <input type="hidden" name="projectId" value={project.id} />;

  return (
    <>
      <PageHeader eyebrow="Reparații" title="Feed și canale" subtitle="Un singur catalog, optimizat automat pentru fiecare canal. Catalogul tău nu se modifică: regulile și titlurile aprobate se aplică doar în feed și se pot anula oricând." />
      {total === 0 ? <Empty title="Nu există încă produse">Conectează catalogul din Setări magazin.</Empty> : (
      <div className="space-y-6">
        <Suspense fallback={<Card title="Etichete automate"><Loading /></Card>}>
          <AutoLabels projectId={project.id} />
        </Suspense>

        <ChatGptCard projectId={project.id} />
        <ChannelsCard projectId={project.id} />

        <Card title={fixes.pending ? `${fixes.pending} reparații de produs așteaptă aprobarea ta` : "Reparații de produs"} action={<ButtonLink href="/panou/reparatii" variant="secondary" size="sm">Vezi reparațiile</ButtonLink>}>
          <p className="text-sm text-muted">Titluri, descrieri, GTIN, marcă și categorie, propuse pentru fiecare produs cu un scor de încredere. {fixes.approved ? `${fixes.approved} sunt deja aplicate în feed.` : "Ce aprobi se aplică doar aici, în feed."}</p>
        </Card>

        <Card title="Reguli">
          {rules.length > 0 && (
            <Table head={["Regulă", "Dacă", "Atunci", "Canal", ""]}>
              {rules.map((r) => (
                <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                  <Td className="font-medium">{r.name}</Td>
                  <Td className="text-sm">{r.conditions.map((c, i) => <div key={i}>{FIELD_LABEL[c.field] ?? c.field} {OPS[c.op]} {c.value && <b>{LABELS[c.value] ?? c.value}</b>}</div>)}</Td>
                  <Td className="text-sm">{r.actions.map((a, i) => <div key={i}>{ACT[a.type]} {a.field && a.type !== "label" ? FIELD_LABEL[a.field]?.toLowerCase() : ""} {a.value && <b>„{a.value}”</b>}</div>)}</Td>
                  <Td className="text-xs text-muted">{r.channels.length ? r.channels.join(", ") : "toate"}</Td>
                  <Td>
                    <RowActions>
                      <form action={toggleRule}>{pid}<input type="hidden" name="id" value={r.id} /><SubmitButton variant="ghost" size="sm" pendingText="…">{r.active ? "Oprește" : "Pornește"}</SubmitButton></form>
                      <form action={deleteRule}>{pid}<input type="hidden" name="id" value={r.id} /><SubmitButton variant="danger" size="sm" pendingText="Șterg…">Șterge</SubmitButton></form>
                    </RowActions>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <ActionForm action={addRule} className="mt-6 grid items-start gap-4 md:grid-cols-2 lg:grid-cols-4">
            {pid}
            <div className="md:col-span-2 lg:col-span-4"><Field label="Numele regulii"><Input name="name" placeholder="ex. Exclude produsele fără stoc din Meta" required /></Field></div>
            <Field label="Dacă"><Select name="field">{Object.entries(FIELD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Condiție"><Select name="op">{Object.entries(OPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Valoare" hint="Pentru etichete: recomandat_ai, zombie, fara_stoc…"><Input name="value" /></Field>
            <Field label="Canal"><Select name="channel"><option value="">Toate</option>{CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Atunci"><Select name="type">{Object.entries(ACT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Câmpul"><Select name="actionField"><option value="">–</option>{["title", "description", "brand", "category", "price"].map((k) => <option key={k} value={k}>{FIELD_LABEL[k]}</option>)}</Select></Field>
            <Field label="Text / valoare"><Input name="actionValue" placeholder="ex. | Livrare gratuită" /></Field>
            <Field label="Ordine" hint="Mai mic = se aplică primul"><Input name="priority" type="number" defaultValue={100} /></Field>
            <div className="md:col-span-2 lg:col-span-4"><SubmitButton>Adaugă regula</SubmitButton></div>
          </ActionForm>
        </Card>

        <Suspense fallback={<Card title="Previzualizare feed Google"><Loading /></Card>}>
          <FeedPreview projectId={project.id} total={total} />
        </Suspense>
      </div>
      )}
    </>
  );
}

const Loading = () => <p className="animate-pulse text-sm text-muted">Calculăm pentru tot catalogul…</p>;

async function AutoLabels({ projectId }: { projectId: string }) {
  const feed = await buildFeed(projectId, "google");
  const counts = new Map<string, number>();
  for (const l of feed.labels.values()) for (const x of l) counts.set(x, (counts.get(x) ?? 0) + 1);
  return (
    <Card title="Etichete automate">
      <p className="mb-4 text-sm text-muted">Calculate din ce văd AI-urile, din clicuri și din prețurile altor magazine pentru același GTIN. Le primești în feed ca custom_label, pentru campanii separate.</p>
      <div className="flex flex-wrap gap-2">{[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => <Badge key={k} tone={k === "recomandat_ai" || k === "pret_cel_mai_bun" ? "good" : k === "zombie" || k === "pret_peste_piata" || k === "date_lipsa" ? "warn" : "muted"}>{LABELS[k] ?? k}: {n}</Badge>)}</div>
    </Card>
  );
}

async function FeedPreview({ projectId, total }: { projectId: string; total: number }) {
  const preview = (await buildFeed(projectId, "google")).items;
  return (
    <Card title={`Previzualizare feed Google (${preview.length} din ${total} produse)`}>
      <Table head={["Produs", "Preț", "Etichete"]}>
        {preview.slice(0, 15).map((p) => (
          <tr key={p.id}><Td>{p.title}</Td><Td className="num whitespace-nowrap text-right">{money(p.price, p.currency)}</Td><Td className="text-xs text-muted">{p.labels.map((l) => LABELS[l] ?? l).join(", ")}</Td></tr>
        ))}
      </Table>
    </Card>
  );
}

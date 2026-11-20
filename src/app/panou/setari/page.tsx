import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { activeProviders, costThisMonth } from "@/core/ai/engine";
import { providerLabel } from "@/core/ai/types";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { addCompetitor, addPrompt, connectFeed, removeCompetitor, removeConnection, syncNow, togglePrompt, uploadFeed } from "@/app/actions";
import { FEED_HINTS } from "@/core/connectors/platforms";
import { dateShort } from "@/lib/format";

const INTENT: Record<string, string> = { general: "Generală", brand: "Despre magazin", comparatie: "Comparație", cumparare: "Cumpărare" };

export default async function Settings() {
  const { project } = await currentProject();
  const [conns, comps, prompts, cost] = await Promise.all([
    db.select().from(schema.connections).where(eq(schema.connections.projectId, project.id)).orderBy(desc(schema.connections.createdAt)),
    db.select().from(schema.competitors).where(eq(schema.competitors.projectId, project.id)),
    db.select().from(schema.prompts).where(eq(schema.prompts.projectId, project.id)).orderBy(desc(schema.prompts.createdAt)),
    costThisMonth(),
  ]);
  const providers = activeProviders();
  const hidden = <input type="hidden" name="projectId" value={project.id} />;
  const active = prompts.filter((p) => p.active).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Setări" subtitle={`${project.name} · ${project.domain}${project.pathPrefix} · ${project.country === "HU" ? "Ungaria" : "România"} · ${project.currency}`} />

      <Card title="Catalogul de produse">
        {conns.length > 0 && (
          <ul className="mb-6 divide-y divide-border">
            {conns.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0 flex-1"><span className="font-medium capitalize">{c.kind}</span><span className="block truncate text-xs text-muted">{c.url}</span>{c.lastError && <span className="block text-xs text-bad">{c.lastError}</span>}</span>
                <Badge tone={c.status === "ok" ? "good" : c.status === "error" ? "bad" : "warn"}>{c.status === "ok" ? `${c.productCount} produse` : c.status === "error" ? "Eroare" : "În lucru"}</Badge>
                <span className="text-xs text-muted">{c.lastSyncAt ? `sincronizat ${dateShort(c.lastSyncAt)}` : "nesincronizat"}</span>
                <form action={syncNow}>{hidden}<input type="hidden" name="connectionId" value={c.id} /><Button variant="secondary" size="sm">Sincronizează</Button></form>
                <form action={removeConnection}>{hidden}<input type="hidden" name="connectionId" value={c.id} /><Button variant="secondary" size="sm">Șterge</Button></form>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={connectFeed} className="grid gap-3 sm:grid-cols-[200px_1fr_1fr_auto] sm:items-end">
          {hidden}
          <Field label="Platformă">
            <Select name="kind" defaultValue="auto" className="w-full">
              <option value="auto">Detectare automată</option>
              <option value="feed">Link de feed sau API (XML, CSV, JSON, YAML, OpenAPI)</option>
              <option value="shopify">Shopify</option>
              <option value="woocommerce">WooCommerce</option>
              <option value="gomag">Gomag (cheie API)</option>
              <option value="merchantpro">MerchantPro (cheie API)</option>
              <option value="prestashop">PrestaShop (cheie Webservice)</option>
            </Select>
          </Field>
          <Field label="Link feed sau adresa magazinului" hint="Gol = adresa magazinului.">
            <Input name="url" placeholder="https://magazin.ro/feed/produse.xml" />
          </Field>
          <Field label="Cheie API (dacă e nevoie)" hint="Gomag, MerchantPro, PrestaShop sau feed/API cu cheie. Se păstrează criptată.">
            <Input name="secret" type="password" autoComplete="off" placeholder="cheie sau cheie:secret" />
          </Field>
          <Button>Conectează</Button>
        </ActionForm>
        <div className="mt-6 border-t border-border pt-5">
          <ActionForm action={uploadFeed} className="flex flex-wrap items-end gap-3">
            {hidden}
            <Field label="Sau încarcă un fișier de feed" hint="XML, CSV, TSV, JSON sau YAML, maxim 50 MB.">
              <input type="file" name="file" required accept=".xml,.csv,.tsv,.txt,.json,.yaml,.yml" className="block text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-bg file:px-3 file:py-2 file:text-sm" />
            </Field>
            <Button variant="secondary">Importă</Button>
          </ActionForm>
        </div>
        <details className="mt-4 text-xs text-muted"><summary className="cursor-pointer">Unde găsesc feed-ul sau cheia pe platforma mea?</summary><ul className="mt-2 space-y-1">{Object.values(FEED_HINTS).map((h) => <li key={h}>{h}</li>)}</ul></details>
      </Card>

      <Card title={`Concurenți (${comps.length})`}>
        <p className="mb-3 text-xs text-muted">Îi comparăm cu tine în fiecare zi. Adăugăm automat magazinele pe care AI-urile le recomandă des în locul tău.</p>
        <ul className="mb-4 flex flex-wrap gap-2">
          {comps.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border border-border py-1 pl-3 pr-1 text-sm">
              {c.name}<span className="text-xs text-muted">{c.domain}</span>
              <form action={removeCompetitor}>{hidden}<input type="hidden" name="id" value={c.id} /><button aria-label={`Șterge ${c.name}`} className="rounded px-2 text-muted hover:bg-surface hover:text-bad">×</button></form>
            </li>
          ))}
        </ul>
        <ActionForm action={addCompetitor} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          {hidden}
          <Field label="Adresa"><Input name="url" placeholder="concurent.ro" required /></Field>
          <Field label="Nume (opțional)"><Input name="name" placeholder="Concurent" /></Field>
          <Button variant="secondary">Adaugă</Button>
        </ActionForm>
      </Card>

      <Card title={`Întrebări urmărite (${active} active)`}>
        <p className="mb-3 text-xs text-muted">Întrebările pe care le punem zilnic fiecărui AI. Le-am propus din catalogul tău; adaugă-le pe cele pe care le pun clienții tăi.</p>
        <ActionForm action={addPrompt} className="mb-4 grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
          {hidden}
          <Field label="Întrebare nouă"><Input name="text" placeholder="Ce bormașină îmi recomanzi sub 500 de lei?" required /></Field>
          <Field label="Tip"><Select name="intent" className="w-full">{Object.entries(INTENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Button variant="secondary">Adaugă</Button>
        </ActionForm>
        <ul className="divide-y divide-border">
          {prompts.map((p) => (
            <li key={p.id} className={`flex flex-wrap items-center justify-between gap-3 py-2 text-sm ${p.active ? "" : "text-muted line-through"}`}>
              <span className="min-w-0 flex-1">{p.text}</span>
              <span className="flex gap-1"><Badge>{INTENT[p.intent] ?? p.intent}</Badge>{p.suggested && <Badge tone="primary">propusă</Badge>}</span>
              <form action={togglePrompt}>{hidden}<input type="hidden" name="id" value={p.id} /><button className="text-xs text-primary hover:underline">{p.active ? "Oprește" : "Pornește"}</button></form>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="AI-uri și costuri">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {providers.map((p) => <li key={p.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">{providerLabel(p.id)}<Badge tone={p.live ? "good" : "warn"}>{p.live ? "live" : "demo"}</Badge></li>)}
        </ul>
        <p className="mt-3 text-xs text-muted">Luna aceasta: {cost.n} interogări, cost estimat ${cost.usd.toFixed(2)} (toată platforma; răspunsurile identice se refolosesc între magazine în aceeași zi). „Demo” = lipsește cheia API, răspunsurile sunt simulate.</p>
      </Card>
    </div>
  );
}

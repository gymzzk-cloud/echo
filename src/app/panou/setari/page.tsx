import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { activeProviders, projectUsageThisMonth } from "@/core/ai/engine";
import { budgetLeft, costConfig } from "@/core/ai/budget";
import { providerLabel } from "@/core/ai/types";
import { Badge, Button, Card, Field, FormActions, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { addCompetitor, addPrompt, connectFeed, removeCompetitor, removeConnection, syncNow, togglePrompt, uploadFeed } from "@/app/actions";
import { FEED_HINTS } from "@/core/connectors/platforms";
import { dateShort } from "@/lib/format";
import { syncingConnections } from "@/core/jobs";
import { promptLimit } from "@/core/prompts";

// Tipurile noi (produs, cod, categorie) sunt primele; cele vechi rămân doar ca etichete pentru căutările adăugate înainte.
const usd = (n: number) => `$${n.toFixed(2)}`;
const INTENT_NEW: Record<string, string> = { produs: "Nume produs", cod: "Cod / EAN", categorie: "Tip de produs", brand: "Despre magazin", general: "Altă căutare" };
const INTENT: Record<string, string> = { ...INTENT_NEW, comparatie: "Comparație", cumparare: "Cumpărare" };

export default async function Settings() {
  const { project } = await currentProject();
  const [conns, comps, prompts, usage, org] = await Promise.all([
    db.select().from(schema.connections).where(eq(schema.connections.projectId, project.id)).orderBy(desc(schema.connections.createdAt)),
    db.select().from(schema.competitors).where(eq(schema.competitors.projectId, project.id)),
    db.select().from(schema.prompts).where(eq(schema.prompts.projectId, project.id)).orderBy(desc(schema.prompts.createdAt)),
    projectUsageThisMonth(project.id),
    db.select({ plan: schema.orgs.plan }).from(schema.orgs).where(eq(schema.orgs.id, project.orgId)),
  ]);
  const syncing = await syncingConnections(conns.map((c) => c.id));
  const limit = promptLimit(org[0]?.plan ?? "trial");
  const providers = activeProviders();
  const cfg = costConfig();
  const left = budgetLeft(usage.usd, cfg.monthlyBudgetUsd);
  const fmtInt = (n: number) => n.toLocaleString("ro-RO");
  const hidden = <input type="hidden" name="projectId" value={project.id} />;
  const active = prompts.filter((p) => p.active).length;
  const connectForms = (
    <>
      <ActionForm action={connectFeed} className="grid items-start gap-4 md:grid-cols-[200px_1fr_1fr_auto]">
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
          <Input name="feed_url" type="text" inputMode="url" autoComplete="off" data-1p-ignore data-lpignore="true" placeholder="https://magazin.ro/feed/produse.xml" />
        </Field>
        <Field label="Cheie API (dacă e nevoie)" hint="Gomag, MerchantPro, PrestaShop sau feed/API cu cheie. Se păstrează criptată.">
          <Input name="api_key" type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" placeholder="cheie sau cheie:secret" />
        </Field>
        <FormActions><Button>Conectează catalogul</Button></FormActions>
      </ActionForm>
      <div className="mt-6 border-t border-border pt-5">
        <ActionForm action={uploadFeed} className="grid items-start gap-4 md:grid-cols-[1fr_auto]">
          {hidden}
          <Field label="Sau încarcă un fișier de feed" hint="XML, CSV, TSV, JSON sau YAML, maxim 50 MB.">
            <input type="file" name="file" required accept=".xml,.csv,.tsv,.txt,.json,.yaml,.yml" className="block h-11 w-full rounded-lg border border-border bg-bg px-1.5 py-1 text-sm text-muted file:mr-3 file:h-full file:rounded-md file:border-0 file:bg-surface file:px-3 file:text-sm file:font-medium file:text-fg sm:h-10" />
          </Field>
          <FormActions><Button variant="secondary">Importă fișierul</Button></FormActions>
        </ActionForm>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Setări" subtitle={`${project.name} · ${project.domain}${project.pathPrefix} · ${project.country === "HU" ? "Ungaria" : "România"} · ${project.currency}`} />

      <Card title="Catalogul de produse">
        {conns.length > 0 && (
          <ul className="mb-6 divide-y divide-border">
            {conns.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0 flex-1"><span className="font-medium capitalize">{c.kind}</span><span className="block truncate text-xs text-muted">{c.url}</span>{c.lastError && <span className="block text-xs text-bad">{c.lastError}</span>}</span>
                <Badge tone={syncing.has(c.id) ? "warn" : c.status === "ok" ? "good" : c.status === "error" ? "bad" : "warn"}>{syncing.has(c.id) ? "În lucru" : c.status === "ok" ? `${c.productCount} produse` : c.status === "error" ? "Eroare" : "În lucru"}</Badge>
                <span className="text-xs text-muted">{c.lastSyncAt ? `sincronizat ${dateShort(c.lastSyncAt)}` : "nesincronizat"}</span>
                {!syncing.has(c.id) && <form action={syncNow}>{hidden}<input type="hidden" name="connectionId" value={c.id} /><Button variant="secondary" size="sm">Sincronizează</Button></form>}
                <form action={removeConnection}>{hidden}<input type="hidden" name="connectionId" value={c.id} /><Button variant="secondary" size="sm">Șterge</Button></form>
              </li>
            ))}
          </ul>
        )}
        {conns.length > 0 ? (
          <details className="group">
            <summary className="inline-flex h-11 cursor-pointer list-none items-center rounded-lg border border-border bg-bg px-4 text-sm font-medium hover:bg-surface sm:h-10 [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Schimbă sursa</span><span className="hidden group-open:inline">Ascunde</span>
            </summary>
            <div className="mt-5">{connectForms}</div>
          </details>
        ) : connectForms}
        <details className="mt-4 text-xs text-muted"><summary className="cursor-pointer">Unde găsesc feed-ul sau cheia pe platforma mea?</summary><ul className="mt-2 space-y-1">{Object.values(FEED_HINTS).map((h) => <li key={h}>{h}</li>)}</ul></details>
      </Card>

      <Card title={`Concurenți (${comps.length})`}>
        <p className="mb-3 text-xs text-muted">Îi comparăm cu tine în fiecare zi. Adăugăm automat magazinele pe care AI-urile le recomandă în locul tău sau înaintea ta. Dacă scoți unul, nu-l mai adăugăm.</p>
        <ul className="mb-4 flex flex-wrap gap-2">
          {comps.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border border-border py-1 pl-3 pr-1 text-sm">
              {c.name}<span className="text-xs text-muted">{c.domain}</span>
              <form action={removeCompetitor}>{hidden}<input type="hidden" name="id" value={c.id} /><button aria-label={`Șterge ${c.name}`} className="rounded px-2 text-muted hover:bg-surface hover:text-bad">×</button></form>
            </li>
          ))}
        </ul>
        <ActionForm action={addCompetitor} className="grid items-start gap-4 md:grid-cols-[1fr_1fr_auto]">
          {hidden}
          <Field label="Adresa"><Input name="url" autoComplete="off" placeholder="concurent.ro" required /></Field>
          <Field label="Nume (opțional)"><Input name="name" placeholder="Concurent" /></Field>
          <FormActions><Button variant="secondary">Adaugă concurent</Button></FormActions>
        </ActionForm>
      </Card>

      <Card title={`Căutări urmărite (${active} active din ${limit})`}>
        <p className="mb-3 text-xs text-muted">Căutările pe care le punem fiecărui AI, scrise cum caută un client: numele produsului, codul sau EAN-ul, tipul de produs. Le alegem din catalogul tău real (produse în stoc, din categoriile mari, cu mărci diferite) și le reîmprospătăm după fiecare sincronizare. Poți opri oricare sau adăuga căutarea ta.</p>
        {!prompts.some((p) => p.suggested && p.intent !== "brand") && <p className="mb-3 rounded-lg border border-border px-3 py-2 text-xs text-muted">Conectează catalogul real (mai sus) ca să propunem căutări pe produsele tale.</p>}
        <ActionForm action={addPrompt} className="mb-4 grid items-start gap-4 md:grid-cols-[1fr_200px_auto]">
          {hidden}
          <Field label="Căutare nouă"><Input name="text" placeholder="Bosch GSB 18V-55 sau 4053423841923" required /></Field>
          <Field label="Tip"><Select name="intent" className="w-full">{Object.entries(INTENT_NEW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <FormActions><Button variant="secondary">Adaugă căutarea</Button></FormActions>
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
          {providers.map((p) => <li key={p.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">{providerLabel(p.id)}<Badge tone={p.live ? "good" : undefined}>{p.live ? "activ" : "fără cheie"}</Badge></li>)}
        </ul>
        <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="label">Întrebări luna asta</dt><dd className="num mt-1 text-xl font-semibold">{fmtInt(usage.n)}</dd></div>
          <div><dt className="label">Tokeni (intrare / ieșire)</dt><dd className="num mt-1 text-xl font-semibold">{fmtInt(usage.inputTokens)} / {fmtInt(usage.outputTokens)}</dd></div>
          <div><dt className="label">Cost estimat</dt><dd className="num mt-1 text-xl font-semibold">{usd(usage.usd)}</dd></div>
          <div><dt className="label">Buget lunar</dt><dd className="num mt-1 text-xl font-semibold">{left === null ? "fără plafon" : <>{usd(left)} <span className="text-sm font-normal text-muted">rămași din {usd(cfg.monthlyBudgetUsd)}</span></>}</dd></div>
        </dl>
        <p className="mt-4 text-xs text-muted">Întrebările rulează automat o dată la {cfg.runEveryDays} {cfg.runEveryDays === 1 ? "zi" : "zile"}, pe modele ieftine, cu răspunsuri scurte. O întrebare pusă deja azi nu se mai plătește a doua oară, nici dacă o urmăresc mai multe magazine. AI-urile „fără cheie” nu sunt întrebate deloc. La atingerea bugetului ne oprim până luna viitoare.</p>
      </Card>
    </div>
  );
}

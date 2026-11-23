import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { activeProviders, projectUsageThisMonth } from "@/core/ai/engine";
import { costConfig } from "@/core/ai/budget";
import { providerLabel } from "@/core/ai/types";
import { Badge, btn, Card, Field, FileInput, FormActions, IconButton, Input, ListRow, Notice, PageHeader, Select, SubCard } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { ActionForm } from "@/components/forms";
import { addCompetitor, addPrompt, connectFeed, removeCompetitor, removeConnection, syncNow, togglePrompt, uploadFeed } from "@/app/actions";
import { FEED_HINTS } from "@/core/connectors/platforms";
import { dateShort } from "@/lib/format";
import { busyKinds, syncingConnections } from "@/core/jobs";
import { FocusCard } from "@/components/focus-card";
import { siteCategoryEstimate } from "@/core/focus";
import { promptLimit } from "@/core/prompts";
import { CardHelp } from "@/components/card-help";

// Tipurile noi (produs, cod, categorie) sunt primele; cele vechi rămân doar ca etichete pentru căutările adăugate înainte.
const INTENT_NEW: Record<string, string> = { produs: "Nume produs", cod: "Cod / EAN", categorie: "Tip de produs", brand: "Despre magazin", general: "Altă căutare" };
const INTENT: Record<string, string> = { ...INTENT_NEW, comparatie: "Comparație", cumparare: "Cumpărare", comercial: "Recomandare", informativ: "Informare" };

export default async function Settings() {
  const { project } = await currentProject();
  const [conns, comps, prompts, usage, org] = await Promise.all([
    db.select().from(schema.connections).where(eq(schema.connections.projectId, project.id)).orderBy(desc(schema.connections.createdAt)),
    db.select().from(schema.competitors).where(eq(schema.competitors.projectId, project.id)),
    // Căutările retrase din lista automată nu se mai arată (rămân doar pentru istoricul răspunsurilor).
    db.select().from(schema.prompts).where(and(eq(schema.prompts.projectId, project.id), isNull(schema.prompts.retiredAt))).orderBy(desc(schema.prompts.createdAt)),
    projectUsageThisMonth(project.id),
    db.select({ plan: schema.orgs.plan }).from(schema.orgs).where(eq(schema.orgs.id, project.orgId)),
  ]);
  const [syncing, busy] = await Promise.all([syncingConnections(conns.map((c) => c.id)), busyKinds(project.id)]);
  const limit = promptLimit(org[0]?.plan ?? "trial");
  const providers = activeProviders();
  const cfg = costConfig();
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
        <FormActions><SubmitButton pendingText="Conectez…">Conectează catalogul</SubmitButton></FormActions>
      </ActionForm>
      <div className="mt-6 border-t border-border pt-6">
        <ActionForm action={uploadFeed} className="grid items-start gap-4 md:grid-cols-[1fr_auto]">
          {hidden}
          <Field label="Sau încarcă un fișier de feed" hint="XML, CSV, TSV, JSON sau YAML, maxim 50 MB.">
            <FileInput name="file" required accept=".xml,.csv,.tsv,.txt,.json,.yaml,.yml" />
          </Field>
          <FormActions><SubmitButton variant="secondary" pendingText="Import…">Importă fișierul</SubmitButton></FormActions>
        </ActionForm>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Cont" title="Setări magazin" subtitle={`${project.name} · ${project.domain}${project.pathPrefix} · ${project.country === "HU" ? "Ungaria" : "România"} · ${project.currency}`} />

      <Card title="Catalogul de produse" description={<CardHelp id="settings.catalog" />}>
        {conns.length > 0 && (
          <ul className="mb-6 text-sm">
            {conns.map((c) => (
              <ListRow key={c.id} end={<>
                <Badge tone={syncing.has(c.id) ? "warn" : c.status === "ok" ? "good" : c.status === "error" ? "bad" : "warn"}>{syncing.has(c.id) ? "Sincronizare în lucru" : c.status === "ok" ? `${c.productCount} produse` : c.status === "error" ? "Eroare" : "În lucru"}</Badge>
                {!syncing.has(c.id) && <form action={syncNow}>{hidden}<input type="hidden" name="connectionId" value={c.id} /><SubmitButton variant="secondary" size="sm" pendingText="Pornesc…">Sincronizează</SubmitButton></form>}
                <form action={removeConnection}>{hidden}<input type="hidden" name="connectionId" value={c.id} /><SubmitButton variant="danger" size="sm" pendingText="Șterg…">Șterge</SubmitButton></form>
              </>}>
                <span className="font-medium capitalize">{c.kind}</span>
                <span className="block truncate text-xs text-muted">{c.url}</span>
                <span className="block text-xs text-muted">{c.lastSyncAt ? `Sincronizat ${dateShort(c.lastSyncAt)}` : "Nesincronizat"}</span>
                {c.lastError && <span className="block break-words text-xs text-bad">{c.lastError}</span>}
              </ListRow>
            ))}
          </ul>
        )}
        {conns.length > 0 ? (
          <details className="group">
            <summary className={`${btn("secondary")} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
              <span className="group-open:hidden">Schimbă sursa</span><span className="hidden group-open:inline">Ascunde</span>
            </summary>
            <div className="mt-6">{connectForms}</div>
          </details>
        ) : connectForms}
        <details className="mt-4 text-xs text-muted"><summary className="cursor-pointer font-medium text-primary">Unde găsesc feed-ul sau cheia pe platforma mea?</summary><ul className="mt-2 space-y-1">{Object.values(FEED_HINTS).map((h) => <li key={h}>{h}</li>)}</ul></details>
      </Card>

      <FocusCard projectId={project.id} cfg={project.focusConfig ?? null} busy={busy.has("focus")} site={project.focusConfig?.counts?.inStock ? null : await siteCategoryEstimate(project.id)} />

      <Card title={`Concurenți (${comps.length})`} description="Îi comparăm cu tine în fiecare zi. Adăugăm automat magazinele pe care AI-urile le recomandă în locul tău sau înaintea ta. Dacă scoți unul, nu-l mai adăugăm.">
        <ul className="mb-4 flex flex-wrap gap-2">
          {comps.map((c) => (
            <li key={c.id} className="flex min-w-0 max-w-full items-center gap-1 rounded-full border border-border pl-3 text-sm">
              <span className="truncate">{c.name} <span className="text-xs text-muted">{c.domain}</span></span>
              <form action={removeCompetitor}>{hidden}<input type="hidden" name="id" value={c.id} /><IconButton label={`Elimină ${c.name}`}>×</IconButton></form>
            </li>
          ))}
        </ul>
        <ActionForm action={addCompetitor} className="grid items-start gap-4 md:grid-cols-[1fr_1fr_auto]">
          {hidden}
          <Field label="Adresa"><Input name="url" autoComplete="off" placeholder="concurent.ro" required /></Field>
          <Field label="Nume (opțional)"><Input name="name" placeholder="Concurent" /></Field>
          <FormActions><SubmitButton variant="secondary" pendingText="Adaug…">Adaugă concurent</SubmitButton></FormActions>
        </ActionForm>
      </Card>

      <Card title={`Căutări urmărite (${active} active din ${limit})`} description={<>Căutările pe care le punem fiecărui AI, scrise cum caută un client: numele produsului, codul sau EAN-ul, tipul de produs. Le alegem din catalogul tău real: întâi din produsele focus de mai sus (în stoc, cu mărci diferite), din tot catalogul doar dacă setul focus e prea mic. Le reîmprospătăm după fiecare sincronizare și când se schimbă produsele focus. Poți opri oricare sau adăuga căutarea ta.</>}>
        {!prompts.some((p) => p.suggested && p.intent !== "brand") && <div className="mb-4"><Notice tone="muted">Conectează catalogul real (mai sus) ca să propunem căutări pe produsele tale.</Notice></div>}
        <ActionForm action={addPrompt} className="mb-4 grid items-start gap-4 md:grid-cols-[1fr_200px_auto]">
          {hidden}
          <Field label="Căutare nouă"><Input name="text" placeholder="Bosch GSB 18V-55 sau 4053423841923" required /></Field>
          <Field label="Tip"><Select name="intent" className="w-full">{Object.entries(INTENT_NEW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <FormActions><SubmitButton variant="secondary" pendingText="Adaug…">Adaugă căutarea</SubmitButton></FormActions>
        </ActionForm>
        <ul className="text-sm">
          {prompts.map((p) => (
            <ListRow key={p.id} end={<>
              <Badge>{INTENT[p.intent] ?? p.intent}</Badge>{p.suggested && <Badge tone="primary">Propusă</Badge>}{!p.active && <Badge>Oprită</Badge>}
              <form action={togglePrompt}>{hidden}<input type="hidden" name="id" value={p.id} /><SubmitButton variant="ghost" size="sm" pendingText="…">{p.active ? "Oprește" : "Pornește"}</SubmitButton></form>
            </>}>
              <span className={`break-words ${p.active ? "" : "text-muted"}`}>{p.text}</span>
            </ListRow>
          ))}
        </ul>
      </Card>

      <Card title="AI-uri întrebate" description={<CardHelp id="settings.aiCosts" />}>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {providers.map((p) => <li key={p.id}><SubCard className="flex items-center justify-between gap-2 p-3 text-sm">{providerLabel(p.id)}<Badge tone={p.live ? "good" : undefined}>{p.live ? "Activ" : p.off === "off" ? "Oprit" : "Fără cheie"}</Badge></SubCard></li>)}
        </ul>
        <dl className="mt-6 border-t border-border pt-6">
          <div><dt className="label">Întrebări puse luna asta</dt><dd className="num font-display mt-1 text-xl font-semibold">{fmtInt(usage.n)}</dd></div>
        </dl>
        <p className="mt-4 text-xs text-muted">Întrebările rulează automat o dată la {cfg.runEveryDays} {cfg.runEveryDays === 1 ? "zi" : "zile"}. AI-urile „fără cheie” sau „oprite” nu sunt întrebate deloc. Meta AI răspunde fără căutare pe web, din ce știe modelul.</p>
      </Card>
    </div>
  );
}

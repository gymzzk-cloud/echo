import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Checkbox, Field, FieldGroup, FormActions, Input, ListRow, PageHeader, RowActions, Table, Td } from "@/components/ui";
import { WEBHOOK_EVENTS } from "@/core/platform";
import { recentMcpCalls } from "@/core/mcp";
import { dateShort } from "@/lib/format";
import { addWebhook, createApiKey, deleteWebhook, revokeApiKey, saveMcpEnabled, testWebhook } from "@/app/actions-dev";
import { StorePoliciesView } from "@/components/store-policies";
import { busyKinds } from "@/core/jobs";
import { CardHelp } from "@/components/card-help";

export default async function Developers() {
  const { org, project, role } = await currentProject();
  const admin = ["owner", "admin"].includes(role);
  const keys = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.orgId, org.id));
  const hooks = await db.select().from(schema.webhooks).where(eq(schema.webhooks.orgId, org.id));
  const calls = await recentMcpCalls(project.id);
  const app = process.env.APP_URL ?? "http://localhost:3000";
  const busy = await busyKinds(project.id);
  return (
    <>
      <PageHeader eyebrow="Setări" title="API și MCP" subtitle="Agenții AI pot citi direct catalogul tău verificat prin MCP. Sistemele tale pot citi datele Echo prin API și pot primi evenimente prin webhook." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Serverul MCP al magazinului" description={<CardHelp id="dev.mcp" />} className="lg:col-span-2">
          <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">Adresa: <code className="break-all">{app}/mcp/magazin/{project.domain}{project.pathPrefix}</code> {project.mcpEnabled ? <Badge tone="good">Pornit</Badge> : <Badge>Oprit</Badge>}</p>
          <p className="mb-4 text-xs text-muted">Unelte: cauta_in_catalog, pret_si_stoc, livrare_si_retur, intrebari_frecvente, link_cumparare. Se adaugă în ChatGPT (Developer mode → Connectors), Claude (Settings → Connectors) sau orice client MCP. Serverul pentru cumpărători, peste toate magazinele verificate: <code>{app}/mcp</code>.</p>
          <ActionForm action={saveMcpEnabled} className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <input type="hidden" name="projectId" value={project.id} />
            <Checkbox name="mcpEnabled" defaultChecked={project.mcpEnabled} label="Serverul MCP al magazinului este pornit" />
            <SubmitButton>Salvează</SubmitButton>
          </ActionForm>
          <StorePoliciesView projectId={project.id} policies={project.storeInfo?.policies} busy={busy.has("policies")} />
        </Card>

        <Card title="Ce întreabă agenții (MCP)" description={<CardHelp id="dev.mcpCalls" />}>
          {calls.length === 0 ? <p className="text-sm text-muted">Niciun apel încă.</p> : (
            <ul className="text-sm">{calls.map((c) => <ListRow key={c.id}><span className="font-semibold">{c.tool}</span> <span className="break-words text-muted">{c.query}</span><div className="text-xs text-muted">{dateShort(c.createdAt)} · {c.client ?? "client necunoscut"}</div></ListRow>)}</ul>
          )}
        </Card>

        <Card title="Chei API" description={<CardHelp id="dev.apiKeys" />}>
          {keys.length > 0 && (
            <Table head={["Nume", "Început", "Folosită", ""]}>
              {keys.map((k) => <tr key={k.id}><Td>{k.name}</Td><Td><code>{k.prefix}…</code></Td><Td className="text-xs">{k.lastUsedAt ? dateShort(k.lastUsedAt) : "niciodată"}</Td><Td className="text-right">{admin && <form action={revokeApiKey}><input type="hidden" name="id" value={k.id} /><SubmitButton variant="danger" size="sm" pendingText="Revoc…">Revocă</SubmitButton></form>}</Td></tr>)}
            </Table>
          )}
          {admin && <ActionForm action={createApiKey} className="mt-4 grid items-start gap-4 md:grid-cols-[1fr_auto]"><Field label="Nume cheie"><Input name="name" placeholder="ex. ERP" /></Field><FormActions><SubmitButton>Creează cheia</SubmitButton></FormActions></ActionForm>}
          <pre className="mt-4 overflow-x-auto rounded-lg bg-surface p-3 text-xs">{`curl -H "Authorization: Bearer ek_..." \\
  ${app}/api/v1/projects/${project.id}/visibility?days=30`}</pre>
          <p className="mt-2 text-xs text-muted">Rute: /projects, /projects/{"{id}"}/visibility, /actions, /sales, /search?q=, POST /agent-gate, POST /reviews.</p>
        </Card>

        <Card title="Webhook-uri" description={<CardHelp id="dev.webhooks" />} className="lg:col-span-2">
          {hooks.length > 0 && (
            <Table head={["Adresă", "Evenimente", "Ultimul răspuns", ""]}>
              {hooks.map((h) => (
                <tr key={h.id}><Td className="break-all text-xs">{h.url}</Td><Td className="text-xs">{h.events.join(", ")}</Td><Td>{h.lastStatus ? <Badge tone={h.lastStatus < 300 ? "good" : "bad"}>{h.lastStatus}</Badge> : "–"}</Td>
                  <Td>{admin && <RowActions><form action={testWebhook}><input type="hidden" name="id" value={h.id} /><SubmitButton variant="secondary" size="sm" pendingText="Trimit…">Testează</SubmitButton></form><form action={deleteWebhook}><input type="hidden" name="id" value={h.id} /><SubmitButton variant="danger" size="sm" pendingText="Șterg…">Șterge</SubmitButton></form></RowActions>}</Td></tr>
              ))}
            </Table>
          )}
          {admin && (
            <ActionForm action={addWebhook} className="mt-4 space-y-4">
              <Field label="Adresă (https)"><Input name="url" placeholder="https://erp.magazin.ro/echo" /></Field>
              <FieldGroup label="Evenimente"><div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">{WEBHOOK_EVENTS.map((e) => <Checkbox key={e.id} name="events" value={e.id} defaultChecked label={e.label} />)}</div></FieldGroup>
              <SubmitButton>Adaugă webhook</SubmitButton>
            </ActionForm>
          )}
          <p className="mt-4 text-xs text-muted">Fiecare cerere are antetele <code>X-Echo-Timestamp</code> și <code>X-Echo-Signature: sha256=HMAC(secret, timestamp + &quot;.&quot; + corp)</code>. Reîncercăm de 3 ori la erori 5xx.</p>
        </Card>
      </div>
    </>
  );
}

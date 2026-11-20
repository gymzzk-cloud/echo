import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Field, Input, PageHeader, Table, Td } from "@/components/ui";
import { WEBHOOK_EVENTS } from "@/core/platform";
import { recentMcpCalls } from "@/core/mcp";
import { dateShort } from "@/lib/format";
import { addWebhook, createApiKey, deleteWebhook, revokeApiKey, saveMcpEnabled, testWebhook } from "@/app/actions-dev";
import { StorePoliciesView } from "@/components/store-policies";
import { busyKinds } from "@/core/jobs";

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
      <PageHeader eyebrow="Cont" title="API și MCP" subtitle="Agenții AI pot citi direct catalogul tău verificat prin MCP. Sistemele tale pot citi datele Echo prin API și pot primi evenimente prin webhook." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Serverul MCP al magazinului" className="lg:col-span-2">
          <p className="mb-2 text-sm">Adresa: <code className="break-all">{app}/mcp/magazin/{project.domain}{project.pathPrefix}</code> {project.mcpEnabled ? <Badge tone="good">pornit</Badge> : <Badge>oprit</Badge>}</p>
          <p className="mb-4 text-xs text-muted">Unelte: cauta_in_catalog, pret_si_stoc, livrare_si_retur, intrebari_frecvente, link_cumparare. Se adaugă în ChatGPT (Developer mode → Connectors), Claude (Settings → Connectors) sau orice client MCP. Serverul pentru cumpărători, peste toate magazinele verificate: <code>{app}/mcp</code>.</p>
          <ActionForm action={saveMcpEnabled} className="mb-6 flex flex-wrap items-center gap-3">
            <input type="hidden" name="projectId" value={project.id} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="mcpEnabled" defaultChecked={project.mcpEnabled} /> Serverul MCP al magazinului este pornit</label>
            <SubmitButton className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg">Salvează</SubmitButton>
          </ActionForm>
          <StorePoliciesView projectId={project.id} policies={project.storeInfo?.policies} busy={busy.has("policies")} />
        </Card>

        <Card title="Ce întreabă agenții (MCP)">
          {calls.length === 0 ? <p className="text-sm text-muted">Niciun apel încă.</p> : (
            <ul className="space-y-2 text-sm">{calls.map((c) => <li key={c.id}><b>{c.tool}</b> <span className="text-muted">{c.query}</span><div className="text-xs text-muted">{dateShort(c.createdAt)} · {c.client ?? "client necunoscut"}</div></li>)}</ul>
          )}
        </Card>

        <Card title="Chei API">
          {keys.length > 0 && (
            <Table head={["Nume", "Început", "Folosită", ""]}>
              {keys.map((k) => <tr key={k.id}><Td>{k.name}</Td><Td><code>{k.prefix}…</code></Td><Td className="text-xs">{k.lastUsedAt ? dateShort(k.lastUsedAt) : "niciodată"}</Td><Td>{admin && <form action={revokeApiKey}><input type="hidden" name="id" value={k.id} /><button className="text-xs text-muted hover:text-bad">Revocă</button></form>}</Td></tr>)}
            </Table>
          )}
          {admin && <ActionForm action={createApiKey} className="mt-3 flex items-end gap-2"><Field label="Nume cheie"><Input name="name" placeholder="ex. ERP" /></Field><SubmitButton className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-fg">Creează</SubmitButton></ActionForm>}
          <pre className="mt-4 overflow-x-auto rounded-lg bg-surface p-3 text-xs">{`curl -H "Authorization: Bearer ek_..." \\
  ${app}/api/v1/projects/${project.id}/visibility?days=30`}</pre>
          <p className="mt-2 text-xs text-muted">Rute: /projects, /projects/{"{id}"}/visibility, /actions, /sales, /search?q=, POST /agent-gate, POST /reviews.</p>
        </Card>

        <Card title="Webhook-uri" className="lg:col-span-2">
          {hooks.length > 0 && (
            <Table head={["Adresă", "Evenimente", "Ultimul răspuns", ""]}>
              {hooks.map((h) => (
                <tr key={h.id}><Td className="break-all text-xs">{h.url}</Td><Td className="text-xs">{h.events.join(", ")}</Td><Td>{h.lastStatus ? <Badge tone={h.lastStatus < 300 ? "good" : "bad"}>{h.lastStatus}</Badge> : "–"}</Td>
                  <Td className="whitespace-nowrap">{admin && <><form action={testWebhook} className="inline"><input type="hidden" name="id" value={h.id} /><button className="text-xs text-primary">Test</button></form>{" · "}<form action={deleteWebhook} className="inline"><input type="hidden" name="id" value={h.id} /><button className="text-xs text-muted hover:text-bad">Șterge</button></form></>}</Td></tr>
              ))}
            </Table>
          )}
          {admin && (
            <ActionForm action={addWebhook} className="mt-3 space-y-3">
              <Field label="Adresă (https)"><Input name="url" placeholder="https://erp.magazin.ro/echo" /></Field>
              <div className="flex flex-wrap gap-4 text-sm">{WEBHOOK_EVENTS.map((e) => <label key={e.id} className="flex items-center gap-1.5"><input type="checkbox" name="events" value={e.id} defaultChecked /> {e.label}</label>)}</div>
              <SubmitButton className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg">Adaugă webhook</SubmitButton>
            </ActionForm>
          )}
          <p className="mt-3 text-xs text-muted">Fiecare cerere are antetele <code>X-Echo-Timestamp</code> și <code>X-Echo-Signature: sha256=HMAC(secret, timestamp + &quot;.&quot; + corp)</code>. Reîncercăm de 3 ori la erori 5xx.</p>
        </Card>
      </div>
    </>
  );
}

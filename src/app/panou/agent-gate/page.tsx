import { currentProject } from "@/lib/project";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Field, Input, PageHeader, Stat, Table, Td } from "@/components/ui";
import { DEFAULT_POLICY, KNOWN_AGENTS, recentAgentOrders } from "@/core/agent-gate";
import { savePolicy, simulateOrder } from "@/app/actions-trust";
import { money, dateShort } from "@/lib/format";

const DEC: Record<string, { label: string; tone: "good" | "warn" | "bad" | "primary" }> = {
  accepta: { label: "Acceptată", tone: "good" }, confirma_sms: { label: "Confirmare SMS", tone: "primary" }, verificare: { label: "Verificare manuală", tone: "warn" }, respinge: { label: "Respinsă", tone: "bad" },
};

export default async function AgentGate() {
  const { project } = await currentProject();
  const policy = project.agentPolicy ?? DEFAULT_POLICY;
  const orders = await recentAgentOrders(project.id);
  const pid = <input type="hidden" name="projectId" value={project.id} />;
  const app = process.env.APP_URL ?? "http://localhost:3000";
  return (
    <>
      <PageHeader eyebrow="Reparații" title="Agent Gate" subtitle="Ce faci cu comenzile plasate de agenți AI (ChatGPT, Claude, Gemini…): accepți, ceri confirmare prin SMS pentru ramburs, verifici manual sau respingi." />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        {(["accepta", "confirma_sms", "verificare", "respinge"] as const).map((d) => <Stat key={d} label={DEC[d].label} value={orders.filter((o) => o.decision === d).length} hint="ultimele 50" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Regulile magazinului">
          <ActionForm action={savePolicy} className="space-y-4">
            {pid}
            <fieldset><legend className="mb-2 text-sm font-medium">Agenți acceptați</legend>
              <div className="flex flex-wrap gap-3 text-sm">{KNOWN_AGENTS.map((a) => <label key={a} className="flex items-center gap-1.5"><input type="checkbox" name="allowedAgents" value={a} defaultChecked={policy.allowedAgents.includes(a)} /> {a}</label>)}</div>
            </fieldset>
            <Field label="Alți agenți (separați prin virgulă)"><Input name="extraAgents" defaultValue={policy.allowedAgents.filter((a) => !KNOWN_AGENTS.includes(a)).join(", ")} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="codRequiresSms" defaultChecked={policy.codRequiresSms} /> Rambursul comandat de un agent se confirmă prin SMS de către client</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="blockUnknownAgents" defaultChecked={policy.blockUnknownAgents} /> Respinge agenții care nu sunt pe listă</label>
            <Field label="Peste această valoare, agenții neverificați trec prin verificare manuală"><Input name="maxOrderValueUnverified" type="number" defaultValue={policy.maxOrderValueUnverified} /></Field>
            <SubmitButton className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg">Salvează</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Încearcă o comandă">
          <ActionForm action={simulateOrder} className="grid gap-3 sm:grid-cols-2">
            {pid}
            <Field label="Agent"><Input name="agent" defaultValue="ChatGPT" /></Field>
            <Field label="Plată"><select name="paymentMethod" className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"><option value="ramburs">Ramburs</option><option value="card">Card</option><option value="transfer">Transfer</option></select></Field>
            <Field label="Valoare"><Input name="value" type="number" defaultValue={450} /></Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="verified" /> Agent verificat (semnătură)</label>
            <div className="sm:col-span-2"><SubmitButton className="rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary">Vezi decizia</SubmitButton></div>
          </ActionForm>
          <p className="mt-4 text-xs text-muted">Din magazin, decizia se cere prin API: <code>POST {app}/api/v1/agent-gate</code> cu cheia API (vezi API și MCP). Primești <code>accepta</code>, <code>confirma_sms</code>, <code>verificare</code> sau <code>respinge</code> și motivele.</p>
        </Card>
        <Card title="Ultimele comenzi de la agenți" className="lg:col-span-2">
          {orders.length === 0 ? <p className="text-sm text-muted">Nicio comandă încă.</p> : (
            <Table head={["Când", "Agent", "Plată", "Valoare", "Risc", "Decizie", "De ce"]}>
              {orders.map((o) => (
                <tr key={o.id}>
                  <Td className="whitespace-nowrap text-xs">{dateShort(o.createdAt)}</Td>
                  <Td>{o.agent}{o.verified && <span className="ml-1 text-xs text-good">✓</span>}</Td>
                  <Td>{o.paymentMethod}</Td>
                  <Td className="num">{money(o.value, project.currency)}</Td>
                  <Td className="num">{o.risk}</Td>
                  <Td><Badge tone={DEC[o.decision]?.tone ?? "muted"}>{DEC[o.decision]?.label ?? o.decision}</Badge></Td>
                  <Td className="text-xs text-muted">{o.reasons.join(" ")}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

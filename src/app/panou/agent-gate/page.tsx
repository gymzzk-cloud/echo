import { currentProject } from "@/lib/project";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Checkbox, Field, FieldGroup, FormActions, Input, PageHeader, Select, Stat, Table, Td } from "@/components/ui";
import { DEFAULT_POLICY, KNOWN_AGENTS, recentAgentOrders } from "@/core/agent-gate";
import { savePolicy, simulateOrder } from "@/app/actions-trust";
import { money, dateShort } from "@/lib/format";
import { CardHelp } from "@/components/card-help";

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
      <div className="mb-6 grid grid-cols-2 gap-6 lg:grid-cols-4">
        {(["accepta", "confirma_sms", "verificare", "respinge"] as const).map((d) => <Stat key={d} label={DEC[d].label} value={orders.filter((o) => o.decision === d).length} hint="ultimele 50" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Regulile magazinului" description={<CardHelp id="gate.rules" />}>
          <ActionForm action={savePolicy} className="space-y-4">
            {pid}
            <FieldGroup label="Agenți acceptați">
              <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">{KNOWN_AGENTS.map((a) => <Checkbox key={a} name="allowedAgents" value={a} defaultChecked={policy.allowedAgents.includes(a)} label={a} />)}</div>
            </FieldGroup>
            <Field label="Alți agenți (separați prin virgulă)"><Input name="extraAgents" defaultValue={policy.allowedAgents.filter((a) => !KNOWN_AGENTS.includes(a)).join(", ")} /></Field>
            <div>
              <Checkbox name="codRequiresSms" defaultChecked={policy.codRequiresSms} label="Rambursul comandat de un agent se confirmă prin SMS de către client" />
              <Checkbox name="blockUnknownAgents" defaultChecked={policy.blockUnknownAgents} label="Respinge agenții care nu sunt pe listă" />
            </div>
            <Field label="Peste această valoare, agenții neverificați trec prin verificare manuală"><Input name="maxOrderValueUnverified" type="number" defaultValue={policy.maxOrderValueUnverified} /></Field>
            <SubmitButton>Salvează regulile</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Încearcă o comandă" description={<CardHelp id="gate.try" />}>
          <ActionForm action={simulateOrder} className="grid items-start gap-4 sm:grid-cols-2">
            {pid}
            <Field label="Agent"><Input name="agent" defaultValue="ChatGPT" /></Field>
            <Field label="Plată"><Select name="paymentMethod"><option value="ramburs">Ramburs</option><option value="card">Card</option><option value="transfer">Transfer</option></Select></Field>
            <Field label="Valoare"><Input name="value" type="number" defaultValue={450} /></Field>
            <FormActions><Checkbox name="verified" label="Agent verificat (semnătură)" /></FormActions>
            <div className="sm:col-span-2"><SubmitButton variant="secondary">Testează decizia</SubmitButton></div>
          </ActionForm>
          <p className="mt-4 text-xs text-muted">Din magazin, decizia se cere prin API: <code>POST {app}/api/v1/agent-gate</code> cu cheia API (vezi API și MCP). Primești <code>accepta</code>, <code>confirma_sms</code>, <code>verificare</code> sau <code>respinge</code> și motivele.</p>
        </Card>
        <Card title="Ultimele comenzi de la agenți" description={<CardHelp id="gate.orders" />} className="lg:col-span-2">
          {orders.length === 0 ? <p className="text-sm text-muted">Nicio comandă încă.</p> : (
            <Table head={["Când", "Agent", "Plată", "Valoare", "Risc", "Decizie", "De ce"]}>
              {orders.map((o) => (
                <tr key={o.id}>
                  <Td className="whitespace-nowrap text-xs">{dateShort(o.createdAt)}</Td>
                  <Td>{o.agent}{o.verified && <span className="ml-1 text-xs text-good">✓</span>}</Td>
                  <Td>{o.paymentMethod}</Td>
                  <Td className="num text-right">{money(o.value, project.currency)}</Td>
                  <Td className="num text-right">{o.risk}</Td>
                  <Td><Badge tone={DEC[o.decision]?.tone ?? "muted"}>{DEC[o.decision]?.label ?? o.decision}</Badge></Td>
                  <Td className="min-w-48 text-xs text-muted">{o.reasons.join(" ")}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

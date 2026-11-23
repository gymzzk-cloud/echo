import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Chips, Field, Input, Notice, RowActions, Select, SubCard, Table, Td } from "@/components/ui";
import { CardHelp } from "@/components/card-help";
import { CHANNELS } from "@/core/feed";
import type { FeedSummary, SummaryProduct } from "@/core/feed-summary";
import { RULE_PRESETS, presetById, same, type RulePreset } from "@/core/feed-rule-presets";
import { addRule, deleteRule, toggleRule } from "@/app/actions-feed";
import { money, num } from "@/lib/format";
import type { schema } from "@/db";
import { ACT, FIELD_LABEL, LABELS, OPS } from "./labels";
import { channelLink, channelName } from "./feed-view";

type Rule = typeof schema.feedRules.$inferSelect;

/** Câmpurile ascunse care trimit o regulă gata făcută la `addRule`. */
function PresetFields({ p }: { p: RulePreset }) {
  return (
    <>
      <input type="hidden" name="name" value={p.name} />
      <input type="hidden" name="field" value={p.condition.field} />
      <input type="hidden" name="op" value={p.condition.op} />
      <input type="hidden" name="value" value={p.condition.value ?? ""} />
      <input type="hidden" name="type" value={p.action.type} />
      <input type="hidden" name="actionField" value={p.action.field ?? ""} />
      <input type="hidden" name="actionValue" value={p.action.value ?? ""} />
      <input type="hidden" name="channel" value="" />
      <input type="hidden" name="priority" value="100" />
    </>
  );
}

const show = (p: SummaryProduct | null, field: string | undefined) => {
  if (!p) return "nu mai intră în feed";
  if (field === "description") return p.description?.trim() || "(fără descriere)";
  return p.title;
};

/** Ce reguli ar ajuta acum, calculat pe produsele reale care pleacă spre canalul ales. */
function Suggestions({ projectId, channel, rules, summary }: { projectId: string; channel: string; rules: Rule[]; summary: FeedSummary | null }) {
  if (!summary) return <p className="animate-pulse text-sm text-muted">Verificăm produsele din feed, în fundal…</p>;
  // Calculate în worker; o regulă adăugată între timp nu se mai propune.
  const list = summary.suggestions.flatMap((s) => {
    const preset = presetById(s.presetId);
    return preset && !rules.some((r) => same(r, preset)) ? [{ ...s, preset }] : [];
  });
  const pid = <input type="hidden" name="projectId" value={projectId} />;
  if (!list.length) return <Notice tone="good">Feed-ul spre {channelName(channel)} nu are acum nimic pe care o regulă gata făcută l-ar repara. Nu trebuie să adaugi nicio regulă; folosește formularul de mai jos doar dacă vrei o schimbare a ta.</Notice>;
  return (
    <ul className="space-y-3">
      {list.map(({ preset, affected, examples }) => (
        <li key={preset.id}>
          <SubCard>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{preset.name}</p>
                <p className="mt-1 text-sm text-muted">{preset.why}</p>
              </div>
              <Badge tone="warn" className="self-start">{num(affected)} {affected === 1 ? "produs" : "produse"}</Badge>
            </div>
            <div className="label mt-4">Înainte → după, pe produsele tale</div>
            <ul className="mt-2 space-y-2 text-sm">
              {examples.map((e) => (
                <li key={e.id} className="min-w-0 break-words">
                  <span className="text-muted line-through">{show(e.before, preset.action.field)}</span>
                  {e.before.price != null && preset.action.type === "exclude" && <span className="num text-xs text-muted"> ({money(e.before.price, e.before.currency)})</span>}
                  <span className="text-muted"> → </span>
                  <span className={e.after ? "font-medium" : "text-warn"}>{show(e.after, preset.action.field)}</span>
                </li>
              ))}
            </ul>
            <ActionForm action={addRule} className="mt-4 flex flex-wrap gap-2">
              {pid}<PresetFields p={preset} />
              <SubmitButton variant="secondary" size="sm" pendingText="Adaug…">Adaugă regula</SubmitButton>
            </ActionForm>
          </SubCard>
        </li>
      ))}
    </ul>
  );
}

export function RulesCard({ projectId, rules, channel, example, summary }: { projectId: string; rules: Rule[]; channel: string; example?: string; summary: FeedSummary | null }) {
  const pid = <input type="hidden" name="projectId" value={projectId} />;
  const ex = presetById(example);
  return (
    <Card title="Reguli: schimbări automate în feed" description={<CardHelp id="feed.rules" />}>
      {rules.length > 0 && (
        <div className="mb-6">
          <Table head={["Regula ta", "Dacă", "Atunci", "Canal", ""]}>
            {rules.map((r) => (
              <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                <Td className="font-medium">{r.name}</Td>
                <Td className="text-sm">{r.conditions.map((c, i) => <div key={i}>{FIELD_LABEL[c.field] ?? c.field} {OPS[c.op]} {c.value && <b>{LABELS[c.value] ?? c.value}</b>}</div>)}</Td>
                <Td className="text-sm">{r.actions.map((a, i) => <div key={i}>{ACT[a.type]} {a.field && a.type !== "label" ? FIELD_LABEL[a.field]?.toLowerCase() : ""} {a.value && <b>„{a.value}”</b>}</div>)}</Td>
                <Td className="text-xs text-muted">{r.channels.length ? r.channels.map(channelName).join(", ") : "toate"}</Td>
                <Td>
                  <RowActions>
                    <form action={toggleRule}>{pid}<input type="hidden" name="id" value={r.id} /><SubmitButton variant="ghost" size="sm" pendingText="…">{r.active ? "Oprește" : "Pornește"}</SubmitButton></form>
                    <form action={deleteRule}>{pid}<input type="hidden" name="id" value={r.id} /><SubmitButton variant="danger" size="sm" pendingText="Șterg…">Șterge</SubmitButton></form>
                  </RowActions>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <div className="label mb-2">Propuse pentru catalogul tău</div>
      <Suggestions projectId={projectId} channel={channel} rules={rules} summary={summary} />

      <div id="regula-noua" className="mt-6 scroll-mt-6 border-t border-border pt-6">
        <div className="label mb-2">Regulă nouă, scrisă de tine</div>
        <p className="mb-4 text-sm text-muted">Alege un exemplu ca să completăm formularul, apoi schimbă ce vrei. În texte poți folosi {"{brand}"}, {"{title}"} sau {"{category}"}: punem valoarea fiecărui produs.</p>
        <Chips className="mb-4" items={RULE_PRESETS.map((p) => ({ href: channelLink(channel, `&regula=${p.id}#regula-noua`), label: p.name, active: p.id === ex?.id }))} />
        <ActionForm key={ex?.id ?? "gol"} action={addRule} className="grid items-start gap-4 md:grid-cols-2 lg:grid-cols-4">
          {pid}
          <div className="md:col-span-2 lg:col-span-4"><Field label="Numele regulii"><Input name="name" defaultValue={ex?.name} placeholder="ex. Scoate din feed produsele fără stoc" required /></Field></div>
          <Field label="Dacă"><Select name="field" defaultValue={ex?.condition.field}>{Object.entries(FIELD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Condiție"><Select name="op" defaultValue={ex?.condition.op}>{Object.entries(OPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Valoare" hint="La stoc: da sau nu. La etichete: recomandat_ai, ai_nu_apare, fara_stoc…"><Input name="value" defaultValue={ex?.condition.value} /></Field>
          <Field label="Canal"><Select name="channel" defaultValue=""><option value="">Toate</option>{CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Atunci"><Select name="type" defaultValue={ex?.action.type}>{Object.entries(ACT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Câmpul"><Select name="actionField" defaultValue={ex?.action.field ?? ""}><option value="">–</option>{["title", "description", "brand", "category", "price"].map((k) => <option key={k} value={k}>{FIELD_LABEL[k]}</option>)}</Select></Field>
          <Field label="Text / valoare"><Input name="actionValue" defaultValue={ex?.action.value} placeholder="ex. {brand} sau | Livrare gratuită" /></Field>
          <Field label="Ordine" hint="Mai mic = se aplică primul"><Input name="priority" type="number" defaultValue={100} /></Field>
          <div className="md:col-span-2 lg:col-span-4"><SubmitButton>Adaugă regula</SubmitButton></div>
        </ActionForm>
        {ex && <p className="mt-4 text-xs text-muted">{ex.why}</p>}
      </div>
    </Card>
  );
}

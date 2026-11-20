import { startPage } from "@/lib/start";
import { addQuestionAction, removeQuestionAction, setFocusAction, startRunAction } from "@/app/actions-start";
import { questions } from "@/core/onboarding";
import { TRIAL_PROVIDERS, type Focus } from "@/core/onboarding/types";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Badge, Card, IconButton, Input, ListRow, Notice, cx } from "@/components/ui";
import { StartShell, StepHeader } from "@/components/onboarding/shell";

export const metadata = { title: "Întrebări" };

const FOCUS: { id: Focus; title: string; text: string }[] = [
  { id: "research", title: "Se documentează", text: "„cum aleg o mașină de găurit”" },
  { id: "compare", title: "Compară", text: "„Makita sau Bosch, ce să aleg?”" },
  { id: "buy", title: "Vrea să cumpere", text: "„de unde cumpăr online…”" },
];
const LANG = { ro: "RO", hu: "HU" } as const;

/** Pasul 6: întrebările testului. Accentul le rescrie; clientul poate scoate sau adăuga, apoi pornește rularea. */
export default async function Questions() {
  const { org, p } = await startPage("questions");
  const ob = p.onboarding;
  const qs = await questions(org.id, p.id);
  const cats = [...new Set(qs.map((q) => q.category))];
  return (
    <StartShell current="questions" reached={ob.step}>
      <StepHeader n={6} title="Ce întrebări punem AI-urilor?">
        Le-am scris din profilul tău, cum caută un client. Alege pe ce punem accent, scoate ce nu ți se potrivește sau adaugă ale tale.
      </StepHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {FOCUS.map((f) => (
          <form key={f.id} action={setFocusAction}>
            <input type="hidden" name="focus" value={f.id} />
            <SubmitButton variant="secondary" pendingText="Rescriem…" disabled={ob.focus === f.id}
              className={cx("h-auto w-full flex-col items-start gap-1 whitespace-normal p-4 text-left sm:h-auto", ob.focus === f.id && "border-primary bg-primary-bg disabled:opacity-100")}>
              <span className="text-sm font-semibold">{f.title}</span>
              <span className="text-xs font-normal text-muted">{f.text}</span>
            </SubmitButton>
          </form>
        ))}
      </div>
      <Card title={`${qs.length} întrebări`} action={<Badge tone="primary">Gratuit</Badge>}
        description={`Le punem pe ${TRIAL_PROVIDERS.length === 2 ? "ChatGPT și Gemini" : TRIAL_PROVIDERS.join(", ")}, o singură dată. ${cats.length} grupe: ${cats.join(", ")}.`}>
        {qs.length ? (
          <ul>
            {qs.map((q) => (
              <ListRow key={q.id} end={
                <form action={removeQuestionAction}>
                  <input type="hidden" name="id" value={q.id} />
                  <IconButton type="submit" label={`Scoate „${q.text}”`}>×</IconButton>
                </form>
              }>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 text-sm font-medium">{q.text}</span>
                  <Badge>{q.category}</Badge>
                  {q.language !== "ro" && <Badge tone="primary">{LANG[q.language as "hu"] ?? q.language}</Badge>}
                </div>
              </ListRow>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Nu avem încă întrebări. Adaugă categorii sau produse la pasul Profil.</p>}
        <ActionForm action={addQuestionAction} className="mt-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input name="text" placeholder="Ex.: unde găsesc flex cu acumulator ieftin" aria-label="Întrebare nouă" className="min-w-0 flex-1" />
            <SubmitButton variant="secondary" pendingText="Adăugăm…">Adaugă întrebarea</SubmitButton>
          </div>
        </ActionForm>
      </Card>
      <Notice>Cu un plan urmărim tot catalogul (din feed sau API), toate AI-urile, automat în fiecare săptămână.</Notice>
      <form action={startRunAction} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-bg p-4 sm:p-6">
        <p className="text-sm text-muted">Rularea durează câteva minute și se face o singură dată în testul gratuit.</p>
        <SubmitButton pendingText="Pornim…" disabled={!qs.length}>Pornește prima rulare</SubmitButton>
      </form>
    </StartShell>
  );
}

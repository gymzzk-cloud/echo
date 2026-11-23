import { Suspense } from "react";
import { currentProject } from "@/lib/project";
import { Card, Notice, PageHeader } from "@/components/ui";
import { AskBox } from "@/components/client";
import { ASSISTANT_EXAMPLES, askAssistant } from "@/core/assistant";

type Project = Awaited<ReturnType<typeof currentProject>>["project"];

/**
 * Asistentul: întrebi în cuvintele tale despre datele magazinului (scor, concurenți, acțiuni, vânzări din AI)
 * și primești un răspuns scurt, doar din datele tale. Antetul și întrebările apar imediat; răspunsul vine în
 * <Suspense>, cu „Caut răspunsul…” cât lucrăm (regula de viteză din CLAUDE.md).
 */
export default async function Assistant({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { project } = await currentProject();
  const { q = "" } = await searchParams;
  const question = q.trim();
  return (
    <>
      <PageHeader eyebrow="Vizibilitate" title="Întreabă asistentul" subtitle="Întrebi în cuvintele tale despre magazinul tău și primești un răspuns scurt, doar din datele din panou: scorul, concurenții, ce ai de făcut, vânzările din AI. Nu trebuie să cauți prin pagini." />
      <Card>
        <AskBox initial={q} examples={ASSISTANT_EXAMPLES} />
        {question.length >= 3 && (
          <Suspense key={question} fallback={<Searching />}>
            <Answer project={project} question={question} />
          </Suspense>
        )}
      </Card>
    </>
  );
}

function Searching() {
  return (
    <div className="mt-6 flex items-center gap-3 rounded-lg bg-surface p-4 text-sm text-muted" role="status" aria-live="polite">
      <span className="size-4 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden />
      Caut răspunsul în datele magazinului tău…
    </div>
  );
}

async function Answer({ project, question }: { project: Project; question: string }) {
  const res = await askAssistant(project, question);
  return (
    <>
      <div className="mt-6 rounded-lg bg-surface p-4">
        <div className="label mb-2">Răspuns</div>
        <p className="whitespace-pre-line text-sm leading-relaxed">{res.answer}</p>
      </div>
      {!res.live && <div className="mt-4"><Notice tone="muted">Răspuns compus pe loc din datele tale. Pentru o întrebare scrisă de tine răspunde AI-ul, tot doar din datele tale.</Notice></div>}
    </>
  );
}

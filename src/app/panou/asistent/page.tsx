import { currentProject } from "@/lib/project";
import { Button, Card, Chips, Input, Notice, PageHeader } from "@/components/ui";
import { askAssistant } from "@/core/assistant";

const EXAMPLES = ["De ce a scăzut scorul săptămâna asta?", "Ce fac săptămâna asta?", "Cine mă depășește la recomandări?", "Câte vânzări am din AI?"];

export default async function Assistant({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { project } = await currentProject();
  const { q = "" } = await searchParams;
  const res = q.trim().length >= 3 ? await askAssistant(project, q.trim()) : null;
  return (
    <>
      <PageHeader eyebrow="Vizibilitate" title="Întreabă asistentul" subtitle="Răspunde doar din datele magazinului tău: scor, concurenți, acțiuni, vânzări din AI." />
      <Card>
        <form className="flex flex-col gap-2 md:flex-row">
          <label htmlFor="q" className="sr-only">Întrebare</label>
          <Input id="q" name="q" defaultValue={q} placeholder="ex. De ce nu mă recomandă Gemini?" />
          <div className="[&>*]:w-full md:[&>*]:w-auto"><Button>Întreabă</Button></div>
        </form>
        <Chips className="mt-4" items={EXAMPLES.map((e) => ({ href: `?q=${encodeURIComponent(e)}`, label: e, active: e === q }))} />
        {res && (
          <div className="mt-6 rounded-lg bg-surface p-4">
            <div className="label mb-2">Răspuns</div>
            <p className="whitespace-pre-line text-sm leading-relaxed">{res.answer}</p>
          </div>
        )}
        {res && !res.live && <div className="mt-4"><Notice tone="muted">Răspuns compus automat din date. Cu cheia Anthropic adăugată, răspunde Claude, tot doar din datele tale.</Notice></div>}
      </Card>
    </>
  );
}

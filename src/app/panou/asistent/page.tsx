import { currentProject } from "@/lib/project";
import { Card, Notice, PageHeader } from "@/components/ui";
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
        <form className="flex gap-2">
          <label htmlFor="q" className="sr-only">Întrebare</label>
          <input id="q" name="q" defaultValue={q} placeholder="ex. De ce nu mă recomandă Gemini?" className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm" />
          <button className="rounded-lg bg-primary px-4 text-sm font-medium text-primary-fg">Întreabă</button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">{EXAMPLES.map((e) => <a key={e} href={`?q=${encodeURIComponent(e)}`} className="rounded-full border border-border px-2.5 py-1 text-muted hover:bg-surface hover:text-fg">{e}</a>)}</div>
        {res && (
          <div className="mt-6 rounded-xl bg-surface p-4">
            <div className="label mb-2">Răspuns</div>
            <p className="whitespace-pre-line text-[15px] leading-relaxed">{res.answer}</p>
          </div>
        )}
        {res && !res.live && <div className="mt-3"><Notice tone="muted">Răspuns compus automat din date. Cu cheia Anthropic adăugată, răspunde Claude, tot doar din datele tale.</Notice></div>}
      </Card>
    </>
  );
}

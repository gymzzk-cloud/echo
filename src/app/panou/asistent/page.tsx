import Form from "next/form";
import { Suspense } from "react";
import { currentProject } from "@/lib/project";
import { Button, Card, Chips, Input, Notice, PageHeader } from "@/components/ui";
import { askAssistant } from "@/core/assistant";

const EXAMPLES = ["De ce a scăzut scorul săptămâna asta?", "Ce fac săptămâna asta?", "Cine mă depășește la recomandări?", "Câte vânzări am din AI?"];

// Pagina și întrebarea apar imediat; răspunsul (poate dura câteva secunde) vine după, în Suspense, cu un mesaj de așteptare.
export default async function Assistant({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { project } = await currentProject();
  const { q = "" } = await searchParams;
  const ask = q.trim().length >= 3 ? q.trim() : "";
  return (
    <>
      <PageHeader eyebrow="Vizibilitate" title="Întreabă asistentul" subtitle="Răspunde doar din datele magazinului tău: scor, concurenți, acțiuni, vânzări din AI." />
      <Card>
        <Form action="/panou/asistent" prefetch={false} className="flex flex-col gap-2 md:flex-row">
          <label htmlFor="q" className="sr-only">Întrebare</label>
          <Input id="q" name="q" defaultValue={q} placeholder="ex. De ce nu mă recomandă Gemini?" />
          <div className="[&>*]:w-full md:[&>*]:w-auto"><Button type="submit">Întreabă</Button></div>
        </Form>
        <Chips className="mt-4" items={EXAMPLES.map((e) => ({ href: `?q=${encodeURIComponent(e)}`, label: e, active: e === q }))} />
        {ask && (
          <Suspense key={ask} fallback={<div className="mt-6 flex items-center gap-2 rounded-lg bg-surface p-4 text-sm text-muted" role="status"><span aria-hidden className="size-3 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />Caut răspunsul în datele magazinului tău…</div>}>
            <Answer project={project} q={ask} />
          </Suspense>
        )}
      </Card>
    </>
  );
}

async function Answer({ project, q }: { project: Awaited<ReturnType<typeof currentProject>>["project"]; q: string }) {
  const res = await askAssistant(project, q);
  return (
    <>
      <div className="mt-6 rounded-lg bg-surface p-4">
        <div className="label mb-2">Răspuns</div>
        <p className="whitespace-pre-line text-sm leading-relaxed">{res.answer}</p>
      </div>
      {!res.live && <div className="mt-4"><Notice tone="muted">Răspuns compus automat din date. Cu cheia Anthropic adăugată, răspunde Claude, tot doar din datele tale.</Notice></div>}
    </>
  );
}

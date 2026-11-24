import { PROVIDERS, providerLabel } from "@/core/ai/types";
import type { perPrompt } from "@/core/insights";
import { Badge, SubCard } from "../ui";

type Prompts = ReturnType<typeof perPrompt>;

/**
 * Dovezile: fiecare întrebare urmărită cu ultimul răspuns al fiecărui AI, întreg.
 * Numărul din insignă e locul tău în răspuns; „–” = lipsești; „!” = AI-ul nu a putut fi întrebat (nu se socotește).
 */
export function AnswersList({ prompts, shown, open = false }: { prompts: Prompts; shown: typeof PROVIDERS; open?: boolean }) {
  return (
    <div className="divide-y divide-border">
      {prompts.map((p) => {
        const hits = shown.filter((x) => p.byProvider[x.id]?.me).length;
        const asked = shown.filter((x) => p.byProvider[x.id] && !p.byProvider[x.id].failure).length;
        return (
          <details key={p.id} className="group py-3" open={open}>
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
              <span className="min-w-0 flex-1 text-sm font-medium">{p.prompt}{p.category && <span className="ml-2 text-xs font-normal text-muted">{p.category}</span>}</span>
              <span className="flex flex-wrap gap-1">
                {shown.map((x) => {
                  const b = p.byProvider[x.id];
                  if (b?.failure) return <Badge key={x.id} tone="warn"><span title={`Nu am putut întreba: ${b.failure}`}>{x.short} !</span></Badge>;
                  return <Badge key={x.id} tone={!b ? "muted" : b.me ? "good" : "bad"}>{x.short} {b?.me ? `#${b.me}` : "–"}</Badge>;
                })}
              </span>
              <span className="w-16 text-right text-xs text-muted">{asked ? `${hits}/${asked}` : "–"}</span>
            </summary>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {shown.map((x) => {
                const b = p.byProvider[x.id];
                if (!b) return null;
                return (
                  <SubCard key={x.id} className="p-3 text-xs">
                    <div className="mb-1 flex flex-wrap justify-between gap-2 font-medium"><span>{providerLabel(x.id)}{!b.failure && (b.me ? ` · tu pe locul ${b.me}` : " · lipsești")}</span>{!b.failure && <span className="text-muted">Primele: {b.top.map((t) => (b.lookalikes.includes(t) ? `${t} (alt site)` : t)).join(", ") || "–"}</span>}</div>
                    {b.lookalikes.length > 0 && (
                      <p className="mb-2 rounded-lg bg-warn-bg p-2 text-warn">
                        Atenție: {providerLabel(x.id)} citează {b.lookalikes.join(", ")}, un alt site cu nume asemănător, nu magazinul tău. Ce scrie de acolo (retur, contact, adresă) poate fi prezentat greșit ca fiind al tău.
                      </p>
                    )}
                    {b.failure
                      ? <p className="text-warn">Nu am putut întreba {providerLabel(x.id)}: {b.failure}. Nu știm dacă te-ar fi recomandat, așa că nu intră în scor.</p>
                      : <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-sans leading-relaxed text-muted">{b.answer.replace(/\*\*/g, "")}</pre>}
                  </SubCard>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}

import { Badge, cx } from "@/components/ui";
import { providerLabel } from "@/core/ai/types";
import { PLAN_PROVIDERS, TRIAL_PROVIDERS } from "@/core/onboarding/types";

/**
 * Ce AI-uri întrebăm: testul gratuit doar pe cele ieftine; cu un plan, analiza se face din nou cu toate.
 * Aceeași listă pe fiecare pas, ca clientul să știe de la început ce primește.
 */
export function AiCoverage({ className }: { className?: string }) {
  return (
    <div className={cx("flex flex-wrap items-center gap-2 text-xs text-muted", className)}>
      <span className="font-medium text-fg">Test gratuit:</span>
      {TRIAL_PROVIDERS.map((p) => <Badge key={p} tone="primary">{providerLabel(p)}</Badge>)}
      <span className="font-medium text-fg sm:ml-2">Cu un plan, în plus:</span>
      {PLAN_PROVIDERS.map((p) => <Badge key={p}>{providerLabel(p)}</Badge>)}
      <span>și cele care urmează</span>
    </div>
  );
}

/** Lista ca text: „ChatGPT și Gemini”, „Claude, Perplexity și Google AI Overviews”. */
export const aiList = (ids: readonly string[]) => {
  const l = ids.map(providerLabel);
  return l.length > 1 ? `${l.slice(0, -1).join(", ")} și ${l[l.length - 1]}` : (l[0] ?? "");
};

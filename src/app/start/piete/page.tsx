import { startPage } from "@/lib/start";
import { saveMarketsAction } from "@/app/actions-start";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { StartShell, StepHeader } from "@/components/onboarding/shell";
import { MarketMap } from "@/components/onboarding/market-map";
import type { Market } from "@/core/onboarding/types";

export const metadata = { title: "Piețe" };

/** Pasul 5: unde vinzi. Fiecare piață primește întrebări în limba ei. */
export default async function Markets() {
  const { p } = await startPage("markets");
  const ob = p.onboarding;
  return (
    <StartShell current="markets" reached={ob.step}>
      <StepHeader n={5} title="Unde vinzi?">
        Apasă pe hartă. AI-urile recomandă alte magazine în română și în maghiară, așa că fiecare piață primește întrebări în limba ei.
      </StepHeader>
      <ActionForm action={saveMarketsAction} className="space-y-6">
        <MarketMap initial={ob.markets} initialCity={ob.city} detected={p.country as Market} store={`${p.domain}${p.pathPrefix}`} />
        <div className="flex justify-end"><SubmitButton pendingText="Scriem întrebările…">Continuă</SubmitButton></div>
      </ActionForm>
    </StartShell>
  );
}

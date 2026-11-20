import { startPage } from "@/lib/start";
import { showResultAction } from "@/app/actions-start";
import { StartShell } from "@/components/onboarding/shell";
import { RunLive } from "@/components/onboarding/run-live";
import { aiList } from "@/components/onboarding/ai-coverage";
import { PLAN_PROVIDERS, TRIAL_PROVIDERS } from "@/core/onboarding/types";

export const metadata = { title: "Prima rulare" };

export default async function Run() {
  const { p } = await startPage("run");
  return (
    <StartShell current="run" reached={p.onboarding.step}>
      <RunLive action={showResultAction} store={p.name} trialAi={aiList(TRIAL_PROVIDERS)} planAi={aiList(PLAN_PROVIDERS)} />
    </StartShell>
  );
}

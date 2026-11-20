import { startPage } from "@/lib/start";
import { showResultAction } from "@/app/actions-start";
import { StartShell } from "@/components/onboarding/shell";
import { RunLive } from "@/components/onboarding/run-live";

export const metadata = { title: "Prima rulare" };

export default async function Run() {
  const { p } = await startPage("run");
  return (
    <StartShell current="run" reached={p.onboarding.step}>
      <RunLive action={showResultAction} store={p.name} />
    </StartShell>
  );
}

import { startPage } from "@/lib/start";
import { confirmScan } from "@/app/actions-start";
import { StartShell } from "@/components/onboarding/shell";
import { ScanLive } from "@/components/onboarding/scan-live";

export const metadata = { title: "Scanare" };

export default async function Scan() {
  const { p } = await startPage("scan");
  return (
    <StartShell current="scan" reached={p.onboarding.step}>
      <ScanLive action={confirmScan} />
    </StartShell>
  );
}

import "server-only";
import { redirect } from "next/navigation";
import { requireAuth } from "./auth";
import { trialProject } from "@/core/onboarding";
import { STEP_META, stepIndex, type Onboarding, type OnboardingStep } from "@/core/onboarding/types";

/**
 * Contextul unei pagini din testul gratuit (/start/*).
 * Cine are deja un plan merge în panou; un pas încă neatins trimite clientul la pasul lui;
 * după pornirea rulării nu se mai pot schimba pașii de dinainte (rularea e o singură dată).
 */
export async function startPage(step: OnboardingStep) {
  const auth = await requireAuth();
  if (auth.org.plan !== "trial" || auth.projectIds) redirect("/panou");
  const p = await trialProject(auth.org.id);
  if (!p?.onboarding) redirect("/start");
  const ob = p.onboarding as Onboarding;
  const reached = stepIndex(ob.step), here = stepIndex(step);
  const runLocked = reached >= stepIndex("run") && here < stepIndex("run");
  if (here > reached || runLocked) redirect(STEP_META[ob.step].path);
  return { ...auth, p: { ...p, onboarding: ob } };
}

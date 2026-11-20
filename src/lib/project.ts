import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAuth } from "./auth";
import { projectsForOrg } from "@/core/projects";

export async function currentProject() {
  const auth = await requireAuth();
  const all = await projectsForOrg(auth.org.id);
  const list = auth.projectIds ? all.filter((p) => auth.projectIds!.includes(p.id)) : all;
  if (!list.length && auth.projectIds) throw new Error("Contul tău nu are încă acces la niciun magazin. Cere agenției să ți-l adauge.");
  // Contul nou, fără plan: totul trece prin testul gratuit (/start) până alege un plan. Detaliile nu se văd înainte.
  if (auth.org.plan === "trial" && !auth.projectIds && (!list.length || list.some((p) => p.onboarding))) redirect("/start");
  if (!list.length) redirect("/panou/magazin-nou");
  const wanted = (await cookies()).get("echo_project")?.value;
  const project = list.find((p) => p.id === wanted) ?? list[0];
  return { ...auth, project, projects: list };
}

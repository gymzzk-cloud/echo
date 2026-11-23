"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, ownProject } from "@/lib/guard";
import { enqueue } from "@/core/jobs";
import { saveFocusChoice } from "@/core/focus";

const Names = z.array(z.string().trim().min(1).max(200)).max(200);

/**
 * „Produse focus”: salvează doar alegerea (câteva rânduri) și pune recalculul la coadă (regula de viteză, KNOWLEDGE B41).
 * „Automat” șterge alegerea: categoriile le propune din nou workerul.
 */
export async function saveFocus(form: FormData) {
  const { org, user, project } = await ownProject(String(form.get("projectId")));
  const auto = form.get("mode") === "auto";
  const categories = auto ? null : Names.parse(form.getAll("category").map(String));
  const brands = auto ? null : Names.parse(form.getAll("brand").map(String));
  await saveFocusChoice(project.id, categories, brands?.length ? brands : null);
  await enqueue("focus", { projectId: project.id, then: "audit" });
  await audit(org.id, user.id, "project.focus");
  revalidatePath("/panou/setari");
}

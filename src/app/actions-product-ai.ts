"use server";

import { revalidatePath } from "next/cache";
import { audit, ownProject } from "@/lib/guard";
import { enqueue } from "@/core/jobs";

/** „Recalculează”: pune la coadă calculul pe produs (în worker, din răspunsurile salvate, fără apeluri AI). Dublurile le refuză `enqueue`. */
export async function recomputeProductAi(form: FormData) {
  const { org, user, project } = await ownProject(String(form.get("projectId")));
  await enqueue("product_ai", { projectId: project.id });
  await audit(org.id, user.id, "project.product_ai");
  revalidatePath("/panou/produse-ai");
}

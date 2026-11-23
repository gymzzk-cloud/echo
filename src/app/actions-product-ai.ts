"use server";

import { revalidatePath } from "next/cache";
import { audit, ownProject } from "@/lib/guard";
import { z } from "zod";
import { enqueue } from "@/core/jobs";

/** „Recalculează”: pune la coadă calculul pe produs (în worker, din răspunsurile salvate, fără apeluri AI). Dublurile le refuză `enqueue`. */
export async function recomputeProductAi(form: FormData) {
  const { org, user, project } = await ownProject(String(form.get("projectId")));
  await enqueue("product_ai", { projectId: project.id });
  await audit(org.id, user.id, "project.product_ai");
  revalidatePath("/panou/produse-ai");
}

/** „Verifică pagina”: pune la coadă citirea paginii unui produs (o singură cerere la magazin, în worker). */
export async function checkProductPageNow(form: FormData) {
  const { org, user, project } = await ownProject(String(form.get("projectId")));
  const productId = z.uuid().parse(String(form.get("productId")));
  await enqueue("product_page", { projectId: project.id, productId });
  await audit(org.id, user.id, "project.product_page");
  revalidatePath(`/panou/produse-ai/${productId}`);
}

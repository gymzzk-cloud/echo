"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit, ownProject } from "@/lib/guard";
import { addTrackedProducts, parseCodes, productsByCodes, removeTrackedProducts } from "@/core/tracked-products";

const PAGE = "/panou/produse-urmarite";
const ids = (form: FormData) => z.array(z.uuid()).max(500).parse(form.getAll("productId").map(String));

function done(msg: Record<string, string | number>) {
  revalidatePath(PAGE);
  revalidatePath("/panou/produse");
  revalidatePath("/panou/produse-ai");
  const q = new URLSearchParams(Object.entries(msg).map(([k, v]) => [k, String(v)]));
  redirect(`${PAGE}?${q}`);
}

/** „Adaugă”: unul sau mai multe produse bifate din căutare. Peste limita planului nu adăugăm, spunem câte n-au încăput. */
export async function addTracked(form: FormData) {
  const { org, user, project } = await ownProject(String(form.get("projectId")));
  const r = await addTrackedProducts(project.id, ids(form));
  await audit(org.id, user.id, "project.tracked.add", { added: r.added, over: r.over });
  done({ adaugate: r.added, peste: r.over, deja: r.already, cauta: String(form.get("cauta") ?? "").slice(0, 100) });
}

/** „Adaugă din listă”: codurile lipite (cod din catalog, EAN, cod producător), un cod pe rând. */
export async function addTrackedCodes(form: FormData) {
  const { org, user, project } = await ownProject(String(form.get("projectId")));
  const codes = parseCodes(z.string().max(50_000).parse(String(form.get("codes") ?? "")));
  const { ids: found, missing } = await productsByCodes(project.id, codes);
  const r = await addTrackedProducts(project.id, found);
  await audit(org.id, user.id, "project.tracked.codes", { codes: codes.length, added: r.added, missing: missing.length });
  done({ adaugate: r.added, peste: r.over, deja: r.already, negasite: missing.slice(0, 20).join(", "), negasiteN: missing.length });
}

/** „Scoate”: produsul nu mai e întrebat, iar lista automată nu-l mai pune la loc. */
export async function removeTracked(form: FormData) {
  const { org, user, project } = await ownProject(String(form.get("projectId")));
  const list = ids(form);
  await removeTrackedProducts(project.id, list);
  await audit(org.id, user.id, "project.tracked.remove", { n: list.length });
  done({ scoase: list.length });
}

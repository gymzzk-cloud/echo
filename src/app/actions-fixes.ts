"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, ownProject } from "@/lib/guard";
import { invalidateFeed } from "@/core/feed";
import { enqueue } from "@/core/jobs";
import { approveAbove, decideFixes, FIX_FIELDS, setAutoThreshold } from "@/core/fixes";
import type { FormState } from "./actions";

/** După o decizie: feed-ul se reface în worker (nu aici), iar pagina se reîncarcă. */
const done = async (projectId: string) => {
  invalidateFeed();
  await enqueue("feed", { projectId });
  revalidatePath("/panou/reparatii");
};

const Uuid = z.string().regex(/^[0-9a-f-]{36}$/);
const Status = z.enum(["aprobat", "respins", "propus"]);
const Field = z.enum(FIX_FIELDS as [string, ...string[]]).optional();

/** Aprobă, respinge sau anulează (înapoi la „de aprobat”) una sau mai multe reparații. */
export async function decideFix(form: FormData) {
  const { project, org, user } = await ownProject(String(form.get("projectId")));
  const status = Status.safeParse(form.get("status"));
  const ids = form.getAll("id").map(String).filter((x) => Uuid.safeParse(x).success).slice(0, 200);
  if (!status.success || !ids.length) return;
  const n = await decideFixes(project.id, ids, status.data);
  await audit(org.id, user.id, "fixes.decide", { status: status.data, n });
  await done(project.id);
}

/** Aprobă dintr-un clic toate propunerile cu încredere mare (implicit 80%), eventual doar pe un câmp. */
export async function approveConfident(form: FormData) {
  const { project, org, user } = await ownProject(String(form.get("projectId")));
  const min = z.coerce.number().int().min(50).max(100).safeParse(form.get("min"));
  const field = Field.safeParse(form.get("field") || undefined);
  if (!min.success || !field.success) return;
  const n = await approveAbove(project.id, min.data, field.data);
  await audit(org.id, user.id, "fixes.approve_above", { min: min.data, field: field.data, n });
  await done(project.id);
}

/** Pragul de aplicare automată (oprit sau 70–100%). Se aplică imediat și pe propunerile deja în așteptare. */
export async function saveAutoThreshold(_: FormState, form: FormData): Promise<FormState> {
  const { project, org, user } = await ownProject(String(form.get("projectId")));
  const raw = String(form.get("threshold") ?? "");
  const t = raw === "" ? null : z.coerce.number().int().min(70).max(100).safeParse(raw);
  if (t && !t.success) return { error: "Alege un prag între 70% și 100%, sau Oprit." };
  const threshold = t ? t.data : null;
  const n = await setAutoThreshold(project.id, threshold);
  await audit(org.id, user.id, "fixes.threshold", { threshold, n });
  await done(project.id);
  if (threshold === null) return { ok: "Aplicarea automată e oprită. Aprobi tu fiecare reparație." };
  return { ok: `Salvat. De acum, reparațiile cu încredere de cel puțin ${threshold}% intră singure în feed${n ? ` (acum: ${n})` : ""}.` };
}

/** Caută reparații acum (în worker). Dacă e deja la coadă sau în lucru, nu se adaugă încă o dată. */
export async function runFixes(form: FormData) {
  const { project } = await ownProject(String(form.get("projectId")));
  await enqueue("fixes", { projectId: project.id });
  revalidatePath("/panou/reparatii");
}

"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import type { FeedAction, FeedCondition } from "@/db/schema";
import { audit, ownProject } from "@/lib/guard";
import { randomToken } from "@/lib/util";
import { CHANNELS, FIELDS, proposeTitleEdits } from "@/core/feed";
import type { FormState } from "./actions";

const done = () => revalidatePath("/panou/feed");

export async function toggleChannel(form: FormData) {
  const { project, org, user } = await ownProject(String(form.get("projectId")));
  const channel = String(form.get("channel"));
  if (!CHANNELS.some((c) => c.id === channel)) return;
  const [o] = await db.select().from(schema.feedOutputs).where(and(eq(schema.feedOutputs.projectId, project.id), eq(schema.feedOutputs.channel, channel)));
  if (!o) await db.insert(schema.feedOutputs).values({ projectId: project.id, channel, token: randomToken(24) });
  else await db.update(schema.feedOutputs).set({ active: !o.active }).where(eq(schema.feedOutputs.id, o.id));
  await audit(org.id, user.id, "feed.channel", { channel });
  done();
}

export async function addRule(_: FormState, form: FormData): Promise<FormState> {
  const { project, org, user } = await ownProject(String(form.get("projectId")));
  const name = String(form.get("name") ?? "").trim().slice(0, 80);
  const field = String(form.get("field")), op = String(form.get("op")) as FeedCondition["op"];
  const type = String(form.get("type")) as FeedAction["type"];
  const aField = String(form.get("actionField") ?? "");
  if (!name) return { error: "Dă un nume regulii." };
  if (!(FIELDS as readonly string[]).includes(field) || !["eq", "neq", "contains", "lt", "gt", "empty", "not_empty"].includes(op)) return { error: "Condiție invalidă." };
  if (!["set", "prefix", "suffix", "exclude", "label"].includes(type)) return { error: "Acțiune invalidă." };
  if (["set", "prefix", "suffix"].includes(type) && !["title", "description", "brand", "category", "price"].includes(aField)) return { error: "Alege câmpul pe care îl modifică regula." };
  const channel = String(form.get("channel") ?? "");
  await db.insert(schema.feedRules).values({
    projectId: project.id, name,
    conditions: [{ field, op, value: String(form.get("value") ?? "").slice(0, 200) }],
    actions: [{ type, field: aField || undefined, value: String(form.get("actionValue") ?? "").slice(0, 200) }],
    channels: CHANNELS.some((c) => c.id === channel) ? [channel] : [],
    priority: Number(form.get("priority")) || 100,
  });
  await audit(org.id, user.id, "feed.rule.add", { name });
  done();
  return { ok: "Regula a fost adăugată. Se aplică la următoarea descărcare a feed-ului." };
}

export async function toggleRule(form: FormData) {
  const { project } = await ownProject(String(form.get("projectId")));
  const [r] = await db.select().from(schema.feedRules).where(and(eq(schema.feedRules.id, String(form.get("id"))), eq(schema.feedRules.projectId, project.id)));
  if (r) await db.update(schema.feedRules).set({ active: !r.active }).where(eq(schema.feedRules.id, r.id));
  done();
}

export async function deleteRule(form: FormData) {
  const { project } = await ownProject(String(form.get("projectId")));
  await db.delete(schema.feedRules).where(and(eq(schema.feedRules.id, String(form.get("id"))), eq(schema.feedRules.projectId, project.id)));
  done();
}

export async function proposeTitles(form: FormData) {
  const { project } = await ownProject(String(form.get("projectId")));
  await proposeTitleEdits(project.id);
  done();
}

/** Aprobă, respinge sau anulează (înapoi la propus) una sau toate modificările. */
export async function setEditStatus(form: FormData) {
  const { project, org, user } = await ownProject(String(form.get("projectId")));
  const status = String(form.get("status"));
  if (!["aprobat", "respins", "propus"].includes(status)) return;
  const ids = form.getAll("id").map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x));
  if (!ids.length) return;
  const own = await db.select({ id: schema.productEdits.id }).from(schema.productEdits).innerJoin(schema.products, eq(schema.products.id, schema.productEdits.productId))
    .where(and(inArray(schema.productEdits.id, ids), eq(schema.products.projectId, project.id)));
  if (own.length) await db.update(schema.productEdits).set({ status }).where(inArray(schema.productEdits.id, own.map((o) => o.id)));
  await audit(org.id, user.id, "feed.edits", { status, n: own.length });
  done();
}

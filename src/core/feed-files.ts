import { once } from "node:events";
import { createGzip } from "node:zlib";
import { and, asc, eq, gt, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FeedOutputSettings } from "@/db/schema";
import { sha256, today } from "@/lib/util";
import { applyRules, feedWriter, labelContext, labelsFor, type FeedProduct } from "./feed";
import { effectivePolicy, withDetectedPolicyLinks } from "./feed-channels/policy-links";

/**
 * Fișierele de feed pe canale, generate în worker și salvate gata comprimate.
 * Adresa publică (/feed/<token>) doar citește fișierul: nimic nu se calculează la descărcare,
 * oricât de des ar cere canalul (ChatGPT, Google, Meta…). Magazinul nu e întrebat nimic: totul vine din catalogul deja sincronizat.
 */

const MAX_PRODUCTS = 100_000;
const FORMAT_VERSION = "1"; // crește când se schimbă formatul unui canal, ca fișierele să se regenereze

/**
 * Amprenta datelor din care se face feed-ul: produse (număr + ultima modificare), titluri aprobate, reguli, ziua curentă
 * (etichetele automate se schimbă cu clicurile și răspunsurile AI, deci reîmprospătăm cel puțin o dată pe zi).
 * Calculată în SQL, fără să citim catalogul.
 */
export async function feedStamp(projectId: string) {
  const [r] = await db.execute(dsql`select
    (select count(*) || '|' || coalesce(max(updated_at)::text, '') from products where project_id = ${projectId}) as products,
    (select coalesce(md5(string_agg(e.id::text || e.status || e.value, ',' order by e.id)), '') from product_edits e
       join products p on p.id = e.product_id where p.project_id = ${projectId} and e.status = 'aprobat') as edits,
    (select coalesce(md5(string_agg(r.id::text || r.active || r.priority || r.conditions::text || r.actions::text || r.channels::text, ',' order by r.id)), '')
       from feed_rules r where r.project_id = ${projectId}) as rules`) as unknown as { products: string; edits: string; rules: string }[];
  return `${FORMAT_VERSION}|${today()}|${r.products}|${r.edits}|${r.rules}`;
}

const PAGE = 2000;

/** Titlurile aprobate ale magazinului (puține), ca să le aplicăm produs cu produs. */
async function approvedEdits(projectId: string) {
  const rows = await db.select({ productId: schema.productEdits.productId, field: schema.productEdits.field, value: schema.productEdits.value })
    .from(schema.productEdits).innerJoin(schema.products, eq(schema.products.id, schema.productEdits.productId))
    .where(and(eq(schema.products.projectId, projectId), eq(schema.productEdits.status, "aprobat"))).orderBy(schema.productEdits.createdAt);
  const by = new Map<string, { field: string; value: string }[]>();
  for (const r of rows) by.set(r.productId, [...(by.get(r.productId) ?? []), r]);
  return by;
}

/**
 * Generează fișierele canalelor pornite ale unui magazin. Idempotent: un canal cu aceeași amprentă (aceleași date și setări)
 * nu se regenerează. Catalogul se citește pe bucăți de 2.000 de produse, iar fișierele se comprimă pe măsură ce se scriu,
 * ca un catalog de zeci de mii de produse să nu umple memoria serverului mic. Întoarce câte fișiere au fost scrise.
 */
export async function generateFeedFiles(projectId: string) {
  const outputs = await db.select({ id: schema.feedOutputs.id, channel: schema.feedOutputs.channel, settings: schema.feedOutputs.settings, stamp: schema.feedOutputs.stamp })
    .from(schema.feedOutputs).where(and(eq(schema.feedOutputs.projectId, projectId), eq(schema.feedOutputs.active, true)));
  if (!outputs.length) return 0;
  const stamp = await feedStamp(projectId);
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
  const site = project.storeInfo?.policies; // retur citit de pe site (src/core/policies), când feed-ul nu are pagina sau termenul
  const key = (channel: string, st: FeedOutputSettings | null) => sha256(`${stamp}|${channel}|${JSON.stringify(effectivePolicy(st, site))}`);
  const todo = outputs.map((o) => ({ ...o, next: key(o.channel, o.settings) })).filter((o) => o.next !== o.stamp);
  if (!todo.length) return 0;
  const store = { name: project.name, domain: project.domain, pathPrefix: project.pathPrefix, country: project.country };
  for (const o of todo) {
    if (o.channel !== "openai") continue;
    // Paginile de retur, confidențialitate și termeni: găsite automat pe site (cel mult o dată pe săptămână).
    const next = await withDetectedPolicyLinks(o.settings ?? null, `https://${store.domain}${store.pathPrefix}/`);
    if (next !== o.settings) {
      o.settings = next;
      o.next = key(o.channel, next);
      await db.update(schema.feedOutputs).set({ settings: next }).where(eq(schema.feedOutputs.id, o.id));
    }
  }
  const [ctx, edits, rules] = await Promise.all([
    labelContext(projectId, project.domain),
    approvedEdits(projectId),
    db.select().from(schema.feedRules).where(eq(schema.feedRules.projectId, projectId)).orderBy(schema.feedRules.priority),
  ]);
  const files = todo.map((o) => {
    const writer = feedWriter(o.channel, store, o.channel === "openai" ? effectivePolicy(o.settings ?? null, site) : o.settings);
    const gz = createGzip({ level: 6 });
    const chunks: Buffer[] = [];
    gz.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((res, rej) => { gz.on("end", () => res(Buffer.concat(chunks))); gz.on("error", rej); });
    return { o, writer, gz, done, buf: [writer.head] as string[] };
  });
  const flush = async () => {
    for (const f of files) {
      if (f.buf.length && !f.gz.write(f.buf.join(""))) await once(f.gz, "drain");
      f.buf = [];
    }
  };

  let after = "";
  for (let n = 0; n < MAX_PRODUCTS; n += PAGE) {
    const p = schema.products;
    const page = await db.select({ id: p.id, externalId: p.externalId, title: p.title, description: p.description, url: p.url, imageUrl: p.imageUrl, price: p.price,
      currency: p.currency, inStock: p.inStock, brand: p.brand, category: p.category, gtin: p.gtin, mpn: p.mpn })
      .from(p).where(and(eq(p.projectId, projectId), after ? gt(p.id, after) : undefined)).orderBy(asc(p.id)).limit(PAGE);
    if (!page.length) break;
    after = page[page.length - 1].id;
    for (const r of page) {
      let fp: FeedProduct = { ...r, price: r.price ? parseFloat(r.price) : null, labels: labelsFor(r, ctx) };
      for (const e of edits.get(r.id) ?? []) fp = { ...fp, [e.field]: e.value };
      for (const f of files) {
        const out = applyRules(fp, rules, f.o.channel);
        const line = out ? f.writer.row(out) : null;
        if (line !== null) f.buf.push(line);
      }
    }
    await flush();
    if (page.length < PAGE) break;
  }

  let written = 0;
  for (const f of files) {
    try {
      f.buf.push(f.writer.foot);
      await flush();
      f.gz.end();
      const file = await f.done;
      const stats = f.writer.stats();
      await db.update(schema.feedOutputs).set({
        file, fileType: f.writer.type, itemCount: stats.included, stats, stamp: f.o.next, generatedAt: new Date(), lastError: null,
      }).where(eq(schema.feedOutputs.id, f.o.id));
      written++;
    } catch (e) {
      console.error(`feed ${f.o.channel} (${projectId}):`, e);
      await db.update(schema.feedOutputs).set({ lastError: String(e).slice(0, 500) }).where(eq(schema.feedOutputs.id, f.o.id));
    }
  }
  return written;
}

/** Magazinele cu canale pornite al căror fișier lipsește sau e mai vechi de o zi (reîmprospătare zilnică din worker). */
export async function projectsWithStaleFeeds() {
  const rows = await db.selectDistinct({ projectId: schema.feedOutputs.projectId }).from(schema.feedOutputs)
    .where(and(eq(schema.feedOutputs.active, true), dsql`coalesce(${schema.feedOutputs.generatedAt}, 'epoch') < now() - interval '20 hours'`));
  return rows.map((r) => r.projectId);
}

/** Fișierul gata generat pentru o adresă publică (doar canalele pornite). */
export async function feedFileByToken(token: string) {
  const [o] = await db.select({ file: schema.feedOutputs.file, fileType: schema.feedOutputs.fileType, generatedAt: schema.feedOutputs.generatedAt, stamp: schema.feedOutputs.stamp, channel: schema.feedOutputs.channel })
    .from(schema.feedOutputs).where(and(eq(schema.feedOutputs.token, token), eq(schema.feedOutputs.active, true))).limit(1);
  return o ?? null;
}

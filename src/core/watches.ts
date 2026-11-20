import { and, desc, eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { esc, sendEmail } from "@/lib/email";
import { money } from "@/lib/format";

/**
 * Contul de cumpărător: produse urmărite, liste și alerte.
 * Alerta pleacă atunci când prețul scade sub ținta aleasă (sau cu cel puțin 5% dacă nu există țintă)
 * ori când produsul revine în stoc. Nu trimitem aceeași alertă de mai multe ori pe zi.
 */

export async function addWatch(userId: string, productId: string, list = "Favorite", targetPrice?: number | null) {
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, productId)).limit(1);
  if (!p) throw new Error("Produs inexistent.");
  await db.insert(schema.watches).values({
    userId, productId, list: list.slice(0, 40) || "Favorite", targetPrice: targetPrice ? String(targetPrice) : null,
    lastPrice: p.price, lastInStock: p.inStock,
  }).onConflictDoUpdate({
    target: [schema.watches.userId, schema.watches.productId],
    set: { list: list.slice(0, 40) || "Favorite", ...(targetPrice !== undefined ? { targetPrice: targetPrice ? String(targetPrice) : null } : {}) },
  });
}

export async function removeWatch(userId: string, watchId: string) {
  await db.delete(schema.watches).where(and(eq(schema.watches.id, watchId), eq(schema.watches.userId, userId)));
}

export async function listWatches(userId: string) {
  return db.select({ w: schema.watches, p: schema.products, store: schema.projects })
    .from(schema.watches)
    .innerJoin(schema.products, eq(schema.products.id, schema.watches.productId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.products.projectId))
    .where(eq(schema.watches.userId, userId))
    .orderBy(schema.watches.list, desc(schema.watches.createdAt));
}

export async function userNotifications(userId: string, limit = 30) {
  return db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).orderBy(desc(schema.notifications.createdAt)).limit(limit);
}

export async function unreadCount(userId: string) {
  const [r] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.notifications).where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.read, false)));
  return r.n;
}

/** Decide ce alertă (dacă există) trebuie trimisă pentru un produs urmărit. Funcție pură, testată. */
export function watchAlert(w: { targetPrice: number | null; lastPrice: number | null; lastInStock: boolean | null; notifyStock: boolean }, now: { price: number | null; inStock: boolean | null }) {
  if (w.notifyStock && w.lastInStock === false && now.inStock === true) return "stoc" as const;
  if (now.price == null || now.inStock === false) return null;
  if (w.targetPrice != null) {
    const crossed = now.price <= w.targetPrice && (w.lastPrice == null || w.lastPrice > w.targetPrice);
    return crossed ? ("tinta" as const) : null;
  }
  if (w.lastPrice != null && now.price <= w.lastPrice * 0.95) return "scadere" as const;
  return null;
}

/** Jobul periodic: verifică toate produsele urmărite față de catalogul sincronizat. */
export async function checkWatches() {
  const rows = await db.select({ w: schema.watches, p: schema.products, store: schema.projects, email: schema.users.email })
    .from(schema.watches)
    .innerJoin(schema.products, eq(schema.products.id, schema.watches.productId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.products.projectId))
    .innerJoin(schema.users, eq(schema.users.id, schema.watches.userId));
  let sent = 0;
  for (const { w, p, store, email } of rows) {
    const price = p.price ? parseFloat(p.price) : null;
    const kind = watchAlert(
      { targetPrice: w.targetPrice ? parseFloat(w.targetPrice) : null, lastPrice: w.lastPrice ? parseFloat(w.lastPrice) : null, lastInStock: w.lastInStock, notifyStock: w.notifyStock },
      { price, inStock: p.inStock },
    );
    const recently = w.lastNotifiedAt && Date.now() - w.lastNotifiedAt.getTime() < 20 * 3600e3;
    if (kind && !recently) {
      const msg = kind === "stoc" ? `${p.title} este din nou în stoc la ${store.name}${price ? `, ${money(price, store.currency)}` : ""}.`
        : kind === "tinta" ? `${p.title} a ajuns la ${money(price, store.currency)} la ${store.name}, sub ținta ta.`
        : `${p.title} s-a ieftinit la ${money(price, store.currency)} la ${store.name}.`;
      const url = `/go/${p.id}`;
      await db.insert(schema.notifications).values({ userId: w.userId, message: msg, url });
      const app = process.env.APP_URL ?? "";
      await sendEmail(email, "Alertă de preț: " + p.title.slice(0, 60), `<p>${esc(msg)}</p><p><a href="${app}${url}">Vezi produsul</a> · <a href="${app}/cont">Produsele tale urmărite</a></p>`);
      sent++;
    }
    await db.update(schema.watches).set({ lastPrice: p.price, lastInStock: p.inStock, ...(kind && !recently ? { lastNotifiedAt: new Date() } : {}) }).where(eq(schema.watches.id, w.id));
  }
  return { checked: rows.length, sent };
}

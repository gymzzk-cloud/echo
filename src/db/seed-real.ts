/**
 * Profil REAL, fără date inventate: un cont cu ShopExpert RO (și HU, cu REAL_STORES=RO,HU) conectate la API-ul lor de produse.
 * Nu creează istoric, vânzări, recenzii sau răspunsuri AI simulate. Catalogul vine din sincronizare (worker),
 * iar întrebările se generează din catalogul real după prima sincronizare.
 *
 * Rulează: SHOPEXPERT_API_KEY=... tsx src/db/seed-real.ts   (pe Render: SEED_MODE=real, la bază goală)
 */
import bcrypt from "bcryptjs";
import { db, sql, schema } from "./index";
import { parseStoreUrl } from "@/lib/util";
import { claimStore } from "@/core/stores";
import { connectStore } from "@/core/projects";
import { enqueue } from "@/core/jobs";

const EMAIL = process.env.OWNER_EMAIL || "demo@echo.local";
const PASSWORD = process.env.OWNER_PASSWORD || "echo-demo-2026";
const KEY = process.env.SHOPEXPERT_API_KEY;

// Pas cu pas: întâi doar RO. HU se adaugă din panou (Magazin nou) când trecem la el.
const ALL = [
  { name: "ShopExpert RO", url: "shopexpert.com/ro", country: "RO" as const, feed: "https://www.shopexpert.com/ro/openapi.yaml" },
  { name: "ShopExpert HU", url: "shopexpert.com/hu", country: "HU" as const, feed: "https://www.shopexpert.com/hu/openapi.yaml" },
];
const wanted = (process.env.REAL_STORES || "RO").split(",").map((x) => x.trim().toUpperCase());
const STORES = ALL.filter((s) => wanted.includes(s.country));

async function main() {
  if (!KEY) console.warn("Lipsește SHOPEXPERT_API_KEY: conectez feed-urile fără cheie (sincronizarea va da eroare până pui cheia din Setări).");
  const [user] = await db.insert(schema.users).values({ email: EMAIL, name: "ZoZo", passwordHash: await bcrypt.hash(PASSWORD, 12) }).returning();
  const [org] = await db.insert(schema.orgs).values({ name: "ShopExpert", kind: "agency", trialEndsAt: new Date(Date.now() + 30 * 864e5) }).returning();
  await db.insert(schema.memberships).values({ orgId: org.id, userId: user.id, role: "owner" });

  for (const [i, s] of STORES.entries()) {
    const info = parseStoreUrl(s.url);
    const [p] = await db.insert(schema.projects).values({
      orgId: org.id, name: s.name, domain: info.domain, pathPrefix: info.pathPrefix, country: s.country,
      language: s.country === "HU" ? "hu" : "ro", currency: s.country === "HU" ? "HUF" : "RON",
    }).returning();
    await claimStore(p);
    const c = await connectStore(p.id, { kind: "feed", url: s.feed, secret: KEY });
    // Sincronizările pornesc una după alta (RO acum, HU peste 6 minute), ca să nu încărcăm magazinul în paralel.
    await enqueue("sync", { connectionId: c.id }, new Date(Date.now() + i * 6 * 60e3));
    await enqueue("audit", { projectId: p.id }, new Date(Date.now() + 60e3 + i * 6 * 60e3));
    console.log(`${s.name}: profil creat, sincronizarea catalogului e programată.`);
  }
  console.log(`Gata. Cont real: ${EMAIL}`);
  await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });

import { eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Datele mici despre magazin de care au nevoie mai multe pagini: mărcile din catalog și magazinele aceluiași client.
 * Fără importuri din projects/insights, ca să poată fi folosite de oricare.
 */

/** Mărcile cu cele mai multe produse în stoc din catalog (o interogare SQL, nu tot catalogul în memorie). */
export async function catalogBrands(projectId: string, limit = 30) {
  const r = await db.execute(dsql`select brand from products where project_id = ${projectId} and in_stock and coalesce(brand, '') <> ''
    group by brand order by count(*) desc limit ${limit}`);
  return (r as unknown as { brand: string }[]).map((x) => x.brand).filter((b) => b.trim().length >= 2);
}

/** Domeniile tuturor magazinelor clientului (nu sunt concurenți sau surse unul pentru altul, KNOWLEDGE B19). */
export async function orgDomains(orgId: string) {
  const rows = await db.select({ domain: schema.projects.domain }).from(schema.projects).where(eq(schema.projects.orgId, orgId));
  return rows.map((r) => r.domain);
}

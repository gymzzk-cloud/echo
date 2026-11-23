import { sql as dsql } from "drizzle-orm";
import { db } from "@/db";

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

/**
 * Domeniile tuturor magazinelor clientului (nu sunt concurenți sau surse unul pentru altul, KNOWLEDGE B19):
 * cele din contul curent și cele din alte conturi ale aceluiași proprietar (același om e owner/admin în ambele),
 * ca hardlineconstruct.ro să nu apară ca „în locul tău” la shopexpert.com. Întoarce doar domenii, nicio altă dată din celălalt cont.
 */
export async function orgDomains(orgId: string) {
  const r = await db.execute(dsql`select distinct p.domain from projects p where p.org_id = ${orgId}
    union select distinct p.domain from projects p
      join memberships m2 on m2.org_id = p.org_id and m2.role in ('owner', 'admin')
      join memberships m1 on m1.user_id = m2.user_id and m1.role in ('owner', 'admin')
    where m1.org_id = ${orgId}`);
  return (r as unknown as { domain: string }[]).map((x) => x.domain);
}

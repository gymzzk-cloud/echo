import { and, eq, ne, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";

/** Mărcile cu cele mai multe produse în stoc din catalog (o interogare SQL, nu tot catalogul în memorie). */
export async function catalogBrands(projectId: string, limit = 30) {
  const r = await db.execute(dsql`select brand from products where project_id = ${projectId} and in_stock and coalesce(brand, '') <> ''
    group by brand order by count(*) desc limit ${limit}`);
  return (r as unknown as { brand: string }[]).map((x) => x.brand).filter((b) => b.trim().length >= 2);
}

/** Domeniile celorlalte magazine din același cont: nu sunt concurenți și nici surse de „apărut pe”. */
export async function ownedDomains(project: { id: string; orgId: string; domain: string }) {
  const r = await db.select({ domain: schema.projects.domain }).from(schema.projects)
    .where(and(eq(schema.projects.orgId, project.orgId), ne(schema.projects.id, project.id)));
  return [...new Set(r.map((x) => x.domain).filter((d) => d !== project.domain))];
}

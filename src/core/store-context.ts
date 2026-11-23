import { sql as dsql } from "drizzle-orm";
import { db } from "@/db";
import { GOOD_DESCRIPTION_WORDS, type DescriptionStats } from "./audit/signals";

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

/**
 * Câte produse în stoc are fiecare categorie din catalog, pe tot catalogul (un group by în SQL), pentru llms.txt.
 * Gruparea pe primele niveluri o face categoryHead (fixes.ts), care scoate și marca de la final.
 */
export async function catalogCategories(projectId: string) {
  const r = await db.execute(dsql`select category, brand, count(*)::int as n from products
    where project_id = ${projectId} and in_stock and coalesce(category, '') <> '' group by category, brand order by n desc limit 3000`);
  return r as unknown as { category: string; brand: string | null; n: number }[];
}

/**
 * Descrierile din catalog (ce primesc AI-urile în feed), pe tot catalogul în stoc, numărate în SQL (în worker, la audit).
 * „bună” = cel puțin 40 de cuvinte; „lipsă” = goală sau doar titlul repetat; „necitite” = încă nu am citit-o din API (product_details).
 */
export async function catalogDescriptionStats(projectId: string, focusOnly = false): Promise<DescriptionStats> {
  const r = await db.execute(dsql`
    with p as (
      select p.title, coalesce(p.description, '') as d,
        exists (select 1 from product_details d where d.project_id = p.project_id and d.external_id = p.external_id and d.fetched_at is null) as pending
      from products p where p.project_id = ${projectId} and p.in_stock ${focusOnly ? dsql`and p.focus` : dsql``}
    ), w as (
      select pending, case when btrim(regexp_replace(d, '<[^>]+>', ' ', 'g')) = '' or lower(btrim(d)) = lower(btrim(title)) then 0
        else coalesce(array_length(regexp_split_to_array(btrim(regexp_replace(d, '<[^>]+>', ' ', 'g')), '\\s+'), 1), 0) end as words
      from p
    )
    select count(*)::int as total,
      count(*) filter (where pending and words < ${GOOD_DESCRIPTION_WORDS})::int as pending,
      count(*) filter (where words >= ${GOOD_DESCRIPTION_WORDS})::int as good,
      count(*) filter (where not pending and words between 1 and ${GOOD_DESCRIPTION_WORDS - 1})::int as short,
      count(*) filter (where not pending and words = 0)::int as none
    from w`);
  const row = (r as unknown as DescriptionStats[])[0];
  return row ?? { total: 0, pending: 0, good: 0, short: 0, none: 0 };
}

import { and, eq, isNotNull, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { fetchPopular } from "./connectors/popularity";
import type { CatalogItem, ConnectorKind } from "./connectors";

/**
 * Salvează topul vânzărilor unui magazin (products.popularity_rank, 1 = cel mai vândut).
 * Rescriem doar câteva sute de rânduri: ștergem rangurile vechi și le punem pe cele noi.
 */
export async function savePopularity(projectId: string, externalIds: string[]) {
  await db.update(schema.products).set({ popularityRank: null })
    .where(and(eq(schema.products.projectId, projectId), isNotNull(schema.products.popularityRank)));
  if (!externalIds.length) return 0;
  const values = dsql.join(externalIds.map((id, i) => dsql`(${id.slice(0, 200)}, ${i + 1}::int)`), dsql`, `);
  await db.execute(dsql`update products p set popularity_rank = v.r from (values ${values}) as v(ext, r)
    where p.project_id = ${projectId} and p.external_id = v.ext`);
  return externalIds.length;
}

/**
 * Citește topul de la platformă (o listă scurtă) și îl salvează. Nu oprește niciodată sincronizarea:
 * dacă platforma nu are un top real, produsele rămân fără rang și alegerea întrebărilor merge ca înainte.
 */
export async function refreshPopularity(projectId: string, kind: ConnectorKind, url: string, currency: string, secret?: string, items: CatalogItem[] = []) {
  try {
    const ids = await fetchPopular(kind, url, currency, secret, items);
    const n = await savePopularity(projectId, ids ?? []);
    if (n) console.log(`populare ${url}: ${n} produse în top`);
    return n;
  } catch (e) {
    console.error(`populare ${url}: ${String(e).slice(0, 200)}`);
    return 0;
  }
}

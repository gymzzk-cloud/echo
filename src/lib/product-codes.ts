/**
 * Codurile după care magazinul găsește un produs: codul producătorului și EAN-ul (ZoZo, 23.11.2026: „codul intern nu ne
 * ajută”). Codul intern din catalog apare doar când produsul nu are niciunul dintre ele.
 */
export function productCodes(p: { externalId: string; mpn?: string | null; gtin?: string | null }): string[] {
  const out = [p.mpn?.trim() && `Cod producător ${p.mpn.trim()}`, p.gtin?.trim() && `EAN ${p.gtin.trim()}`].filter(Boolean) as string[];
  return out.length ? out : [`Cod intern ${p.externalId}`];
}

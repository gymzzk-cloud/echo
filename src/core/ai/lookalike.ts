import { brandLabel } from "./extract";

/**
 * Site cu nume aproape la fel cu al magazinului, dar ALT site (KNOWLEDGE B59): „shexpert.ro” lângă „shopexpert.com”.
 * ShopExpert, 24.11.2026: ChatGPT a citat www.shexpert.ro/refund_returns și contact@shexpert.ro ca fiind ale ShopExpert.
 * Doar aceeași marcă exactă (shopexpert.ro) e „tu” (B60); orice nume cu cel mult 2 caractere diferite
 * (shexpert.ro, shop-expert.ro) e alt site, ca magazinul să vadă că AI-ul îl confundă cu altcineva.
 */
function distance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** `domain` seamănă cu magazinul (`ownDomain`), dar nu e el? */
export function isLookalike(domain: string, ownDomain: string) {
  const a = brandLabel(domain), b = brandLabel(ownDomain);
  if (a === b || a.length < 5 || b.length < 5) return false;
  return distance(a, b) <= 2;
}

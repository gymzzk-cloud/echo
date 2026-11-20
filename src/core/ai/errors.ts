/**
 * Motivul pe înțelesul clientului pentru o rulare eșuată, din mesajul de eroare al API-ului.
 * O rulare eșuată nu înseamnă „nu ești recomandat”: nu știm ce ar fi răspuns AI-ul.
 */
export function failureReason(answer: string): string {
  const a = answer.toLowerCase();
  if (/planului gratuit|creditele lunare serpapi/.test(a)) return "limita planului gratuit e atinsă; continuăm automat la următoarea rulare";
  if (/credit balance|insufficient_quota|billing/.test(a)) return "contul AI nu mai are credit";
  if (/\b401\b|authentication|api key|api-key|x-api-key|unauthorized/.test(a)) return "cheia API nu e validă";
  if (/\b403\b|permission|forbidden/.test(a)) return "cheia API nu are acces la acest model";
  if (/\b429\b|rate.?limit|too many requests|quota/.test(a)) return "limita de cereri a contului AI e depășită";
  if (/timeout|timed out|abort/.test(a)) return "AI-ul nu a răspuns la timp";
  if (/\b5\d\d\b|overloaded|unavailable|internal/.test(a)) return "AI-ul era indisponibil";
  if (/\b400\b|invalid_request|not supported/.test(a)) return "AI-ul a respins setările cererii (o reparăm noi)";
  return "eroare neașteptată";
}

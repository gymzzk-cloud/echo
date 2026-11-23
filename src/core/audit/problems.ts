/**
 * Titlurile acțiunilor care vin din audit spun PROBLEMA, nu criteriul verificat.
 * Ex.: verificarea „Pagina principală răspunde rapid” a picat → acțiunea se numește „Pagina principală se încarcă greu”.
 */
export const PROBLEM_TITLES: Record<string, string> = {
  reachable: "Site-ul nu răspunde",
  robots: "Roboții AI sunt blocați în robots.txt",
  firewall: "Firewall-ul blochează asistenții AI",
  "jsonld-org": "Lipsesc datele firmei pentru AI (Organization)",
  "jsonld-product": "Produsele nu au date structurate complete (Product)",
  "content-product": "Descrierile de produs sunt prea scurte",
  llms: "Lipsește llms.txt (rezumatul pentru AI)",
  sitemap: "Nu am găsit un sitemap valid",
  "sitemap-robots": "Sitemap-ul nu e declarat în robots.txt",
  meta: "Lipsesc titlul, descrierea sau limba paginii",
  trust: "Prea puține semnale de încredere pe site",
  speed: "Pagina principală se încarcă greu",
};

/** Titlul unei acțiuni pentru afișare: pentru cele din audit, problema; pentru restul, titlul salvat. */
export function actionTitle(a: { key: string; title: string }) {
  return a.key.startsWith("audit:") ? PROBLEM_TITLES[a.key.slice(6)] ?? a.title : a.title;
}

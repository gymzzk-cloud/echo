import { storeSearchName } from "@/core/prompts";
import { keywords, normalizeText, seededRandom, today } from "@/lib/util";
import type { KnownProduct, KnownStore, Provider, RunInput, RunOutput } from "./types";

/**
 * Modul DEMO: simulează răspunsuri realiste ca panoul și căutarea să poată fi testate fără chei API.
 * Determinist: aceeași întrebare + AI + zi = același răspuns. Toate cifrele sunt fictive.
 */

const RETAILERS_HU: { domain: string; name: string; topics: string[] }[] = [
  { domain: "emag.hu", name: "eMAG.hu", topics: ["*"] },
  { domain: "alza.hu", name: "Alza", topics: ["*"] },
  { domain: "mediamarkt.hu", name: "MediaMarkt", topics: ["laptop", "telefon", "porszivo", "robotporszivo", "kave", "tv"] },
  { domain: "obi.hu", name: "OBI", topics: ["furogep", "akkus", "csempe", "ragaszto", "kert", "festek"] },
  { domain: "praktiker.hu", name: "Praktiker", topics: ["furogep", "akkus", "csempe", "ragaszto", "kert", "festek"] },
];
const HU_STYLE = { intro: (q: string) => `Néhány jó lehetőség erre: „${q}”, magyarországi webshopokban:`, outro: "Rendelés előtt érdemes ellenőrizni az aktuális árat és készletet." };

const RETAILERS: { domain: string; name: string; topics: string[] }[] = [
  { domain: "emag.ro", name: "eMAG", topics: ["*"] },
  { domain: "altex.ro", name: "Altex", topics: ["electro", "telefon", "laptop", "tv", "aspirator", "frigider", "masina", "cafea"] },
  { domain: "flanco.ro", name: "Flanco", topics: ["electro", "telefon", "laptop", "tv", "aspirator", "frigider", "masina"] },
  { domain: "dedeman.ro", name: "Dedeman", topics: ["constructii", "bormasina", "flex", "scule", "unelte", "gresie", "faianta", "vopsea", "ciment", "adeziv", "polistiren", "rigips", "acoperis", "gradina"] },
  { domain: "leroymerlin.ro", name: "Leroy Merlin", topics: ["constructii", "scule", "unelte", "gresie", "baie", "bucatarie", "gradina", "vopsea", "parchet"] },
  { domain: "hornbach.ro", name: "Hornbach", topics: ["constructii", "scule", "unelte", "gradina", "lemn", "vopsea"] },
  { domain: "sculemarket.ro", name: "Scule Market", topics: ["scule", "unelte", "bormasina", "flex", "surubelnita", "fierastrau"] },
  { domain: "notino.ro", name: "Notino", topics: ["parfum", "cosmetice", "crema", "machiaj"] },
  { domain: "elefant.ro", name: "Elefant", topics: ["carte", "jucarii", "cadou", "parfum"] },
  { domain: "pcgarage.ro", name: "PC Garage", topics: ["laptop", "pc", "monitor", "placa", "gaming", "periferice"] },
  { domain: "decathlon.ro", name: "Decathlon", topics: ["sport", "bicicleta", "cort", "fitness", "alergare"] },
  { domain: "pethome.ro", name: "PetHome", topics: ["caine", "pisica", "hrana", "animale"] },
];
const SOURCES = ["compari.ro", "forum.softpedia.com", "go4it.ro", "playtech.ro", "youtube.com", "reddit.com/r/Romania", "storia.ro/blog", "casesidecor.ro", "construieste.ro", "pricy.ro"];

const STYLE: Record<Provider, { intro: (q: string) => string; outro: string }> = {
  chatgpt: { intro: (q) => `Iată câteva opțiuni bune pentru „${q}”, disponibile în România:`, outro: "Îți recomand să verifici stocul și prețul actual înainte de comandă." },
  gemini: { intro: (q) => `Pentru „${q}”, acestea sunt alegerile cele mai populare:`, outro: "Prețurile pot varia; compară și costul livrării." },
  perplexity: { intro: () => "Pe baza recenziilor și a comparatoarelor de prețuri:", outro: "Surse: recenzii utilizatori și comparatoare de prețuri." },
  claude: { intro: (q) => `Câteva recomandări pentru „${q}”, cu magazine din România:`, outro: "Dacă îmi spui bugetul exact, pot restrânge lista." },
  aioverview: { intro: (q) => `Prezentare generată de AI pentru „${q}”:`, outro: "Verifică prețul și livrarea pe site-ul magazinului." },
  aimode: { intro: (q) => `Rezumat AI pentru „${q}”:`, outro: "Compară ofertele și verifică recenziile înainte să cumperi." },
  copilot: { intro: (q) => `Am căutat pe web „${q}”. Iată ce am găsit:`, outro: "Pot compara două dintre ele dacă vrei." },
};

const REASONS = [
  "raport bun calitate-preț și recenzii foarte bune",
  "livrare rapidă și politică de retur clară",
  "printre cele mai vândute din categorie",
  "garanție extinsă și service în țară",
  "potrivit pentru utilizare intensă",
  "recomandat frecvent pe forumuri",
  "stoc limitat la unele modele",
  "prețul e puțin mai mare decât media, dar livrare gratuită",
  "recenzii mixte despre livrare",
];

const BRAND_POS = ["are recenzii în general bune pentru livrare", "prețurile sunt competitive", "politica de retur e clară", "răspunde repede la întrebări", "are o gamă bună de produse"];
const BRAND_NEG = ["unii clienți se plâng de întârzieri la livrare", "informațiile despre firmă sunt greu de găsit pe site", "nu am găsit date clare despre garanție", "sunt puține recenzii independente"];

/** Întrebări despre un magazin anume („X e de încredere?”): răspuns despre magazin, cu plusuri și minusuri. */
function brandAnswer(provider: Provider, store: KnownStore, rnd: () => number): RunOutput {
  const known = rnd() < 0.75;
  const pos = [...BRAND_POS].sort(() => rnd() - 0.5).slice(0, 2);
  const neg = [...BRAND_NEG].sort(() => rnd() - 0.5).slice(0, rnd() < 0.5 ? 1 : 2);
  const answer = known
    ? `${store.name} (${store.domain}) este un magazin online din România. Din ce am găsit: ${pos.join(", ")}. Totuși, ${neg.join(" și ")}. ${rnd() < 0.5 ? "Pare un magazin de încredere, dar verifică datele firmei înainte de o comandă mare." : "Recomand să citești recenziile recente."}`
    : `Nu am găsit suficiente informații despre ${store.name}. Verifică dacă site-ul afișează CUI-ul, adresa și politica de retur.`;
  return { answer, sources: known ? [{ url: `https://${store.domain}/`, title: store.name }] : [], model: "demo", mode: "demo", costUsd: 0, latencyMs: 400 + Math.floor(rnd() * 600) };
}

export function demoRun(provider: Provider, input: RunInput, world: { stores: KnownStore[]; products: KnownProduct[]; ownDomains: string[] }): RunOutput {
  const rnd = seededRandom(`${provider}|${input.query}|${today()}`);
  const ql = input.query.toLowerCase();
  const own = world.stores.find((s) => world.ownDomains.includes(s.domain) && (ql.includes(s.name.toLowerCase()) || ql.includes(storeSearchName(s.name).toLowerCase()) || ql.includes(s.domain)));
  if (own && /încredere|incredere|părer|parer|clienți|clienti|retur|livr|megbízható|vélemény|szállít|recenzi/.test(ql)) return brandAnswer(provider, own, rnd);
  const kw = keywords(input.query);
  const match = (text: string) => kw.filter((k) => text.toLowerCase().includes(k.slice(0, Math.max(4, k.length - 2)))).length;

  // Produse reale din cataloagele conectate care se potrivesc întrebării
  // Căutare după cod (EAN sau codul producătorului): potrivire exactă, ca un motor de căutare real.
  const qTokens = new Set(normalizeText(input.query).split(" "));
  const prodCandidates = world.products
    .map((p) => ({ p, s: (p.codes ?? []).some((c) => qTokens.has(c)) ? 100 : match(`${p.title} ${p.category ?? ""}`) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || rnd() - 0.5)
    .slice(0, 12);

  // Retaileri mari relevanți tematic
  const hu = input.language === "hu";
  const retailers = (hu ? RETAILERS_HU : RETAILERS).filter((r) => r.topics.includes("*") || r.topics.some((t) => kw.some((k) => k.startsWith(t.slice(0, 5)) || t.startsWith(k.slice(0, 5)))));

  type Pick = { domain: string; name: string; title: string; price: number | null };
  const picks: Pick[] = [];
  const used = new Set<string>();
  const want = 3 + Math.floor(rnd() * 3);

  // Magazinele urmărite apar cu o probabilitate care diferă pe AI (simulare de vizibilitate)
  const bias: Record<Provider, number> = { chatgpt: 0.55, gemini: 0.45, perplexity: 0.6, claude: 0.4, aioverview: 0.5, aimode: 0.5, copilot: 0.35 };
  for (const c of prodCandidates) {
    if (picks.length >= want) break;
    if (used.has(c.p.domain)) continue;
    const own = world.ownDomains.includes(c.p.domain);
    if (rnd() < (own ? bias[provider] : 0.7)) {
      const store = world.stores.find((s) => s.domain === c.p.domain);
      // Uneori AI-ul greșește prețul (date vechi)
      const priceErr = c.p.price && rnd() < 0.2 ? Math.round(c.p.price * (rnd() < 0.5 ? 0.9 : 1.08)) : c.p.price;
      picks.push({ domain: c.p.domain, name: store?.name ?? c.p.domain, title: c.p.title, price: priceErr });
      used.add(c.p.domain);
    }
  }
  const pool = [...retailers].sort(() => rnd() - 0.5);
  for (const r of pool) {
    if (picks.length >= want) break;
    if (used.has(r.domain)) continue;
    const label = kw.slice(0, 3).join(" ") || (hu ? "termék" : "produs");
    // Ca un AI real: respectă de obicei bugetul din întrebare („sub 400 lei”), uneori îl depășește puțin.
    const cap = Number((/(?:sub|max(?:im)?|până(?: la)?|alatt)\s*(\d[\d.]*)/i.exec(input.query) ?? /(\d[\d.\s]*)\s*(?:ft|forint)?\s*alatt/i.exec(input.query))?.[1]?.replace(/\s/g, "")?.replace(/\./g, "")) || 0;
    const base = cap ? Math.round(cap * (0.55 + rnd() * 0.55)) : 150 + Math.floor(rnd() * 2400);
    picks.push({ domain: r.domain, name: r.name, title: `${label.charAt(0).toUpperCase() + label.slice(1)} (model popular)`, price: base });
    used.add(r.domain);
  }
  picks.sort(() => rnd() - 0.45);

  const lines = picks.map((p, i) =>
    hu ? `${i + 1}. **${p.title}** – ${p.name} (${p.domain})${p.price ? `: kb. ${p.price.toLocaleString("hu-HU")} Ft` : ""}.`
      : `${i + 1}. **${p.title}** la ${p.name} (${p.domain})${p.price ? `: în jur de ${p.price.toLocaleString("ro-RO")} lei` : ""}. ${REASONS[Math.floor(rnd() * REASONS.length)]}.`);
  const style = hu ? HU_STYLE : STYLE[provider];
  const answer = [style.intro(input.query), "", ...lines, "", style.outro].join("\n");

  const srcPool = [...SOURCES].sort(() => rnd() - 0.5).slice(0, 2 + Math.floor(rnd() * 3));
  const sources = [
    ...picks.slice(0, 3).map((p) => ({ url: `https://${p.domain}/`, title: p.name })),
    ...srcPool.map((s) => ({ url: `https://${s}/`, title: s })),
  ];
  return { answer, sources, model: "demo", mode: "demo", costUsd: 0, latencyMs: 300 + Math.floor(rnd() * 900) };
}

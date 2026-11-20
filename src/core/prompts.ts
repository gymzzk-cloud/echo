/**
 * Întrebări sugerate automat din catalog: ce ar întreba un cumpărător real un AI.
 * Magazinul nu trebuie să scrie nimic; poate doar scoate sau adăuga.
 */
type P = { title: string; category: string | null; brand: string | null; price: string | null };

// Substantivele feminine (bormașină, gresie, vopsea) cer „cea mai bună” / „o”.
const fem = (c: string) => /[ăae]$/.test(c.split(" ")[0]);
const TPL = {
  ro: {
    best: (c: string) => `${fem(c) ? "Care este cea mai bună" : "Care este cel mai bun"} ${c} în ${new Date().getFullYear()}?`,
    budget: (c: string, b: number) => `Recomandă-mi ${fem(c) ? "o" : "un"} ${c} sub ${b} lei`,
    where: (c: string) => `De unde cumpăr ${c} online în România?`,
    brand: (b: string, c: string) => `Merită ${b}? Unde găsesc ${c} ${b} la cel mai bun preț?`,
    compare: (a: string, b: string, c: string) => `${a} sau ${b}: ce ${c} să aleg?`,
    store: (s: string) => `${s} este un magazin de încredere?`,
    opinion: (s: string) => `Ce părere au clienții despre ${s}?`,
    delivery: (s: string) => `${s} livrează rapid? Cum funcționează returul?`,
  },
  hu: {
    best: (c: string) => `Melyik a legjobb ${c} ${new Date().getFullYear()}-ben?`,
    budget: (c: string, b: number) => `Ajánlj egy ${c} terméket ${b} Ft alatt`,
    where: (c: string) => `Hol vásárolhatok ${c} terméket online Magyarországon?`,
    brand: (b: string, c: string) => `Megéri a ${b}? Hol a legolcsóbb ${b} ${c}?`,
    compare: (a: string, b: string, c: string) => `${a} vagy ${b}: melyik ${c} jobb?`,
    store: (s: string) => `Megbízható webáruház a ${s}?`,
    opinion: (s: string) => `Milyen vélemények vannak a ${s} webáruházról?`,
    delivery: (s: string) => `Gyorsan szállít a ${s}? Hogyan működik a visszaküldés?`,
  },
};

const roundBudget = (n: number) => {
  const step = n > 2000 ? 500 : n > 500 ? 100 : 50;
  return Math.ceil(n / step) * step;
};

const CONNECTORS = new Set(["de", "cu", "pentru", "fara", "fără", "din", "la", "si", "și", "in", "în", "pe", "si", "és"]);
const isStop = (w: string) => /\d/.test(w) || /^[A-Z]{2,}/.test(w) || /^[(\[]/.test(w);

/** Tipul produsului din titlu: „Fier de călcat cu abur 2800W” → „fier de călcat”; HU: „Automata kávéfőző” → „automata kávéfőző”. */
export function productType(title: string, language: "ro" | "hu") {
  const words: string[] = [];
  for (const w of title.split(/[\s,]+/)) { if (!w || isStop(w)) break; words.push(w.replace(/[^\p{L}-]/gu, "")); }
  if (!words.length) return null;
  let pick = language === "hu" ? words.slice(-2) : words.slice(0, 3);
  while (pick.length > 1 && CONNECTORS.has(pick[pick.length - 1].toLowerCase())) pick = pick.slice(0, -1);
  const t = pick.join(" ").toLowerCase().trim();
  return t.length >= 3 ? t : null;
}

export function suggestPrompts(products: P[], storeName: string, language: "ro" | "hu" = "ro", max = 30) {
  const t = TPL[language];
  const byCat = new Map<string, P[]>();
  for (const p of products) {
    const c = productType(p.title, language) ?? (p.category ?? "").split(/[>/|]/).pop()?.trim().toLowerCase();
    if (!c || c.length < 3) continue;
    byCat.set(c, [...(byCat.get(c) ?? []), p]);
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  const out: { text: string; category: string; intent: string }[] = [];
  for (const [c, list] of cats) {
    out.push({ text: t.best(c), category: c, intent: "general" });
    out.push({ text: t.where(c), category: c, intent: "cumparare" });
    const prices = list.map((p) => parseFloat(p.price ?? "")).filter((n) => n > 0).sort((a, b) => a - b);
    if (prices.length) out.push({ text: t.budget(c, roundBudget(prices[Math.floor(prices.length / 2)])), category: c, intent: "cumparare" });
    const brands = [...new Set(list.map((p) => p.brand).filter(Boolean) as string[])];
    if (brands[0]) out.push({ text: t.brand(brands[0], c), category: c, intent: "brand" });
    if (brands.length >= 2) out.push({ text: t.compare(brands[0], brands[1], c), category: c, intent: "comparatie" });
  }
  out.push({ text: t.store(storeName), category: "magazin", intent: "brand" });
  out.push({ text: t.opinion(storeName), category: "magazin", intent: "brand" });
  out.push({ text: t.delivery(storeName), category: "magazin", intent: "brand" });
  const seen = new Set<string>();
  // Întrebările despre magazin rămân mereu, chiar dacă tăiem lista.
  const brand = out.filter((p) => p.category === "magazin");
  const rest = out.filter((p) => p.category !== "magazin" && !seen.has(p.text) && seen.add(p.text));
  return [...rest.slice(0, max - brand.length), ...brand];
}

/**
 * Testul gratuit de la prima logare (onboarding): ce a completat magazinul și la ce pas a ajuns.
 * Se păstrează pe proiect (projects.onboarding). Un proiect fără acest câmp e un magazin obișnuit.
 */
export type Focus = "research" | "compare" | "buy";
export type Market = "RO" | "HU";
export const ONBOARDING_STEPS = ["scan", "identity", "profile", "markets", "questions", "run", "result"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type Onboarding = {
  step: OnboardingStep;
  /** Celelalte adrese ale magazinului (redirecționări, domenii vechi): o mențiune a lor contează pentru tine. */
  aliases: string[];
  /** Variantele numelui (ShopExpert, Shop Expert). */
  names: string[];
  /** Site-uri cu nume asemănător care nu sunt ale tale (shopexpert.dk): nu contează nici ca tine, nici ca concurent. */
  notMine: string[];
  cui?: string;
  /** Sigla citită de pe prima pagină (adresă absolută http/https). */
  logo?: string;
  categories: string[];
  brands: string[];
  products: string[];
  markets: Market[];
  city?: string;
  focus: Focus;
  runStartedAt?: string;
  runFinishedAt?: string;
};

/** Pașii, cu textul din meniul onboarding-ului și adresa lor. */
export const STEP_META: Record<OnboardingStep, { label: string; path: string }> = {
  scan: { label: "Scanare", path: "/start/scanare" },
  identity: { label: "Identitate", path: "/start/identitate" },
  profile: { label: "Profil", path: "/start/profil" },
  markets: { label: "Piețe", path: "/start/piete" },
  questions: { label: "Întrebări", path: "/start/intrebari" },
  run: { label: "Prima rulare", path: "/start/rulare" },
  result: { label: "Rezultat", path: "/start/rezultat" },
};

/** Câte întrebări are testul gratuit și pe ce AI-uri (cele ieftine). */
export const TRIAL_QUESTIONS = 20;
export const TRIAL_PROVIDERS = ["chatgpt", "gemini"] as const;

export const stepIndex = (s: OnboardingStep) => ONBOARDING_STEPS.indexOf(s);
/** Pasul următor; un pas deja trecut nu dă înapoi starea (clientul poate reveni să corecteze). */
export const advance = (current: OnboardingStep, done: OnboardingStep): OnboardingStep => {
  const next = ONBOARDING_STEPS[Math.min(ONBOARDING_STEPS.length - 1, stepIndex(done) + 1)];
  return stepIndex(next) > stepIndex(current) ? next : current;
};

export function emptyOnboarding(storeName: string, country: Market): Onboarding {
  return { step: "scan", aliases: [], names: [storeName], notMine: [], categories: [], brands: [], products: [], markets: [country], focus: "buy" };
}

/** Lista curată dintr-un text cu virgule sau rânduri noi: fără spații în plus, fără dubluri, cel mult `max`. */
export function cleanList(raw: string | string[] | null | undefined, max = 12, maxLen = 80) {
  const items = (Array.isArray(raw) ? raw : (raw ?? "").split(/[\n,;]+/)).map((x) => x.replace(/\s+/g, " ").trim()).filter((x) => x.length >= 2 && x.length <= maxLen);
  const seen = new Set<string>();
  return items.filter((x) => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, max);
}

/**
 * Concurent scris doar cu numele: „Dedeman” → dedeman.ro, „Atelierul Tău” → atelierultau.ro.
 * Majoritatea magazinelor din RO/HU au domeniul numelui lor; clientul vede adresa și o poate corecta.
 */
export function domainFromName(raw: string, tld: "ro" | "hu" = "ro") {
  const slug = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "si").replace(/[^a-z0-9-]+/g, "");
  return slug.length >= 3 && slug.length <= 40 ? `${slug}.${tld}` : null;
}

/** Domeniu curat dintr-o adresă scrisă de om: „https://www.Shop-Expert.ro/” → „shop-expert.ro”. */
export function cleanDomain(raw: string) {
  const d = raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#\s]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

/** AI-urile adăugate după alegerea unui plan (analiza completă rulează din nou, cu toate). Ordinea din pagini. */
export const PLAN_PROVIDERS = ["claude", "perplexity", "aioverview"] as const;

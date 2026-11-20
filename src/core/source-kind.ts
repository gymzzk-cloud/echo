/**
 * Ce fel de site e o sursă citată de AI-uri și dacă magazinul poate face ceva realist acolo.
 * Un site de producător (bosch-professional.com, makitatools.com) sau un alt magazin nu e o „oportunitate”:
 * magazinul nu poate apărea acolo pentru că vrea. Comparatoarele, recenziile, forumurile, presa și marketplace-urile, da.
 */
import { brandLabel } from "./ai/extract";
import { isStoreLike } from "./ai/domains";

export type SourceKind =
  | "site propriu" | "concurent" | "magazin" | "producător" | "marketplace" | "comparator"
  | "recenzii" | "forum" | "video" | "rețea socială" | "enciclopedie" | "director firme" | "presă / blog";

export type SourceInfo = { kind: SourceKind; actionable: boolean; advice: string; brand?: string };

/** Unde poate vinde orice magazin (cont de vânzător), deci are sens să-și completeze fișele. */
const MARKETPLACE = ["emag.ro", "emag.hu", "emag.bg", "altex.ro", "okazii.ro", "olx.ro", "vatera.hu", "jofogas.hu", "allegro.pl", "allegro.ro", "amazon.de", "amazon.com", "kaufland.ro", "kaufland.de"];
const is = (d: string, list: string[]) => list.some((x) => d === x || d.endsWith(`.${x}`));
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

/** `owned`: domeniile celorlalte magazine din același cont (nu sunt concurenți și nici surse). */
export type SourceContext = { domain: string; competitors: Iterable<string>; brands: string[]; owned?: Iterable<string> };

export function classifySource(d: string, ctx: SourceContext): SourceInfo {
  const domain = d.toLowerCase().replace(/^www\./, "");
  if (domain === ctx.domain || domain.endsWith(`.${ctx.domain}`)) return { kind: "site propriu", actionable: false, advice: "Site-ul tău." };
  if ([...(ctx.owned ?? [])].some((o) => domain === o || domain.endsWith(`.${o}`))) return { kind: "site propriu", actionable: false, advice: "Alt magazin din contul tău." };
  const comps = ctx.competitors instanceof Set ? ctx.competitors as Set<string> : new Set(ctx.competitors);
  if (comps.has(domain)) return { kind: "concurent", actionable: false, advice: "Magazin concurent: AI-ul îl citează, dar nu e o sursă pe care o poți influența." };
  const label = norm(brandLabel(domain));
  const brand = ctx.brands.find((b) => { const n = norm(b); return n.length >= 3 && label.startsWith(n); });
  if (brand) return { kind: "producător", actionable: false, brand, advice: `Site-ul mărcii ${brand}. Nu poți apărea aici cum vrei; dacă ești distribuitor autorizat, cere să fii trecut în lista „Unde cumperi” / dealeri a mărcii.` };
  if (is(domain, MARKETPLACE)) return { kind: "marketplace", actionable: true, advice: `Dacă vinzi și pe ${domain}, completează fișele produselor principale (titlu, specificații, poze, recenzii): AI-urile citesc fișele de aici.` };
  const t = `.${domain}.`;
  if (/[.-](compari|pricy|shopmania|arukereso|idealo|pricerunner|price|preturi|cauta)[.-]/.test(t)) return { kind: "comparator", actionable: true, advice: `Listează produsele pe ${domain} prin feed, cu prețul și stocul corecte.` };
  if (/[.-](trustpilot|reviews|recenzii|feedback|trusted|google)[.-]/.test(t)) return { kind: "recenzii", actionable: true, advice: `Cere clienților o recenzie pe ${domain} după livrare și răspunde la recenzii.` };
  if (/[.-](reddit|quora|forum|softpedia|mtbiker|hwb)[.-]/.test(t)) return { kind: "forum", actionable: true, advice: "Răspunde util la discuțiile despre produsele tale, fără reclamă." };
  if (/[.-](youtube|youtu|tiktok|vimeo)[.-]/.test(t)) return { kind: "video", actionable: true, advice: "Un video scurt de prezentare sau comparație, cu link spre produs." };
  if (/[.-](facebook|instagram|linkedin|pinterest|twitter)[.-]/.test(t) || domain === "x.com") return { kind: "rețea socială", actionable: false, advice: "Rețea socială: AI-urile o citesc rar ca sursă de recomandare." };
  if (/[.-](wikipedia|wiki)[.-]/.test(t)) return { kind: "enciclopedie", actionable: false, advice: "Enciclopedie: nu e un loc pentru magazine." };
  if (/[.-](listafirme|termene|risco|infocui|cylex|paginiaurii|firmadeaur|citymaps|firme|opencorporates)[.-]/.test(t)) return { kind: "director firme", actionable: false, advice: "Director de firme: datele vin din registre, nu e o sursă de recomandări." };
  if (isStoreLike(domain)) return { kind: "magazin", actionable: false, advice: "Alt magazin: AI-ul îl citează, dar nu e o sursă pe care o poți influența." };
  return { kind: "presă / blog", actionable: true, advice: `Propune un articol, un test de produs sau intrarea în topurile „cele mai bune …” de pe ${domain}.` };
}

/** Titlul acțiunii pentru o sursă pe care magazinul o poate influența. */
export function sourceActionTitle(d: string, kind: SourceKind) {
  switch (kind) {
    case "marketplace": return `Completează fișele produselor pe ${d}`;
    case "comparator": return `Listează produsele pe ${d}`;
    case "recenzii": return `Strânge recenzii pe ${d}`;
    case "forum": return `Răspunde la discuțiile de pe ${d}`;
    case "video": return `Un video despre produsele tale pe ${d}`;
    default: return `Apari în articolele de pe ${d}`;
  }
}

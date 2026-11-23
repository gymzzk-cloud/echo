import type { FocusConfig } from "@/db/schema";
import { Badge, Card, Checkbox, FieldGroup, Notice, TextLink, Working } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { CardHelp } from "@/components/card-help";
import { saveFocus } from "@/app/actions-focus";

const n = (x: number) => x.toLocaleString("ro-RO");

/**
 * Setări → „Produse focus”: ce măsurăm întâi. Citește doar ce a salvat workerul (focus_config), nimic din catalog.
 * Categoriile bifate = alegerea magazinului sau, până alege, cele propuse automat.
 */
type SiteEstimate = { categories: { name: string; pages: number | null }[]; sitemapUrl: string | null } | null;

export function FocusCard({ projectId, cfg, busy, site }: { projectId: string; cfg: FocusConfig | null; busy: boolean; site?: SiteEstimate }) {
  const chosen = cfg?.categories ?? null;
  const selected = new Set((chosen ?? cfg?.auto?.categories ?? []).map((c) => c.toLowerCase()));
  const brands = new Set((cfg?.brands ?? []).map((b) => b.toLowerCase()));
  // Fără produse în stoc în catalog (magazin fără feed încă): nu arătăm „0 din 0”, ci estimarea din site.
  const c = cfg?.counts && cfg.counts.inStock > 0 ? cfg.counts : undefined;
  const noCatalog = !!cfg?.counts && cfg.counts.inStock === 0;
  const available = cfg?.available;
  return (
    <Card title={c ? `Produse focus (${n(c.focus)} din ${n(c.inStock)} în stoc)` : "Produse focus"} description={<CardHelp id="settings.focus" />}>
      <div id="focus" className="space-y-4">
        {busy && <Working hint="Scorul se reface după calcul.">Recalculăm produsele focus</Working>}
        {c ? (
          <ul className="flex flex-wrap gap-2 text-sm">
            <li><Badge>{n(c.chosen)} alese de tine</Badge></li>
            <li><Badge>{n(c.bestsellers)} cele mai vândute</Badge></li>
            <li><Badge>{n(c.aiNamed)} numite de AI-uri</Badge></li>
            <li><Badge>{n(c.fromCategories)} din categoriile bifate</Badge></li>
          </ul>
        ) : noCatalog
          ? <Notice>Nu avem încă produsele tale. <TextLink href="/panou/setari">Conectează catalogul</TextLink> (feed sau platforma magazinului) ca să alegem produsele focus exact, cu numărul de produse din fiecare categorie.</Notice>
          : <Notice>Setul nu e calculat încă. Îl calculăm după sincronizarea catalogului și la următorul audit; apare aici în câteva minute.</Notice>}
        {!c && site && site.categories.length > 0 && <SiteCategories site={site} />}
        {c && c.bestsellers === 0 && <p className="text-sm text-muted">Nu avem topul vânzărilor de la platforma ta. Dacă feed-ul are un câmp de vânzări (ex. vânzări pe 30 de zile), îl folosim automat.</p>}
        {available && available.categories.length > 0 && (
          <form action={saveFocus} className="space-y-4">
            <input type="hidden" name="projectId" value={projectId} />
            <p className="text-sm">{chosen ? <Badge tone="primary">Alese de tine</Badge> : <Badge>Propuse automat</Badge>} <span className="text-muted">{chosen ? "" : "din categoriile produselor alese, vândute sau numite de AI-uri."}</span></p>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Categorii ({selected.size} bifate din {available.categories.length})</summary>
              <FieldGroup label="Categorii de focus" className="mt-2 grid gap-x-6 sm:grid-cols-2">
                {available.categories.map((x) => <Checkbox key={x.name} name="category" value={x.name} defaultChecked={selected.has(x.name.toLowerCase())} label={x.name} hint={`${n(x.n)} produse în stoc`} />)}
              </FieldGroup>
            </details>
            {available.brands.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-medium">Mărci ({brands.size ? `${brands.size} bifate` : "toate"})</summary>
                <FieldGroup label="Doar aceste mărci din categoriile de focus (nebifat = toate)" className="mt-2 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                  {available.brands.map((x) => <Checkbox key={x.name} name="brand" value={x.name} defaultChecked={brands.has(x.name.toLowerCase())} label={x.name} hint={`${n(x.n)} produse`} />)}
                </FieldGroup>
              </details>
            )}
            <div className="flex flex-wrap gap-3">
              <SubmitButton pendingText="Salvez…" disabled={busy}>Salvează alegerea</SubmitButton>
              {chosen && <SubmitButton variant="secondary" name="mode" value="auto" pendingText="Revin…" disabled={busy}>Revino la automat</SubmitButton>}
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}

/** Înainte de feed: categoriile din meniul site-ului, cu paginile din sitemap. Pagini, nu produse (estimare). */
function SiteCategories({ site }: { site: NonNullable<SiteEstimate> }) {
  const counted = site.categories.some((x) => x.pages !== null);
  return (
    <div className="space-y-2">
      <p className="text-sm"><Badge>Din site, estimat</Badge> <span className="text-muted">Categoriile din meniul site-ului{counted ? " și câte pagini are fiecare în sitemap" : ""}.</span></p>
      <ul className="grid gap-x-6 text-sm sm:grid-cols-2">
        {site.categories.map((x) => (
          <li key={x.name} className="flex justify-between gap-3 border-b border-border py-2">
            <span>{x.name}</span>
            <span className="num text-muted">{x.pages === null ? "nu am putut număra" : `${n(x.pages)} pagini`}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted">
        {site.sitemapUrl
          ? counted ? "Sunt pagini din sitemap (produse, dar și filtre sau articole), nu produse numărate. " : `Sitemap-ul (${site.sitemapUrl}) e un index de fișiere sau categoriile nu au adresă proprie, așa că nu am numărat paginile. `
          : "Nu am găsit sitemap, așa că nu putem estima câte pagini are fiecare categorie. "}
        Numărul exact de produse și alegerea categoriilor vin după ce conectăm catalogul.
      </p>
    </div>
  );
}

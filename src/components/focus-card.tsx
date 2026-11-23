import type { FocusConfig } from "@/db/schema";
import { Badge, Card, Checkbox, FieldGroup, Notice, Working } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { CardHelp } from "@/components/card-help";
import { saveFocus } from "@/app/actions-focus";

const n = (x: number) => x.toLocaleString("ro-RO");

/**
 * Setări → „Produse focus”: ce măsurăm întâi. Citește doar ce a salvat workerul (focus_config), nimic din catalog.
 * Categoriile bifate = alegerea magazinului sau, până alege, cele propuse automat.
 */
export function FocusCard({ projectId, cfg, busy }: { projectId: string; cfg: FocusConfig | null; busy: boolean }) {
  const chosen = cfg?.categories ?? null;
  const selected = new Set((chosen ?? cfg?.auto?.categories ?? []).map((c) => c.toLowerCase()));
  const brands = new Set((cfg?.brands ?? []).map((b) => b.toLowerCase()));
  const c = cfg?.counts;
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
        ) : <Notice>Calculăm setul după prima sincronizare a catalogului.</Notice>}
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

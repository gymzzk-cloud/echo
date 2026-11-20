import type { ReactNode } from "react";
import type { StorePolicies } from "@/core/policies";
import { Badge, Notice } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { rereadPolicies } from "@/app/actions-dev";
import { dateShort } from "@/lib/format";

/**
 * Ce află agenții AI despre condițiile magazinului: totul citit automat (catalog și site), nimic completat de mână.
 * Componenta doar afișează ce a salvat workerul.
 */
function Row({ label, children, url }: { label: string; children: ReactNode; url?: string | null }) {
  return (
    <div className="grid gap-1 border-t border-border py-3 first:border-t-0 md:grid-cols-[9rem_1fr]">
      <div className="text-xs font-medium">{label}</div>
      <div className="min-w-0 text-sm">
        {children}
        {url && <a href={url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-primary">{url}</a>}
      </div>
    </div>
  );
}

const missing = (t: string) => <span className="text-muted">{t}</span>;

export function StorePoliciesView({ projectId, policies, busy }: { projectId: string; policies?: StorePolicies; busy: boolean }) {
  const p = policies;
  const reread = busy
    ? <span className="text-xs text-muted">Citirea de pe site e în lucru…</span>
    : <form action={rereadPolicies}><input type="hidden" name="projectId" value={projectId} /><SubmitButton pendingText="Pornesc…" className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-surface">Citește din nou de pe site</SubmitButton></form>;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Ce află agenții despre livrare, retur și plată</h3>
        {reread}
      </div>
      <p className="mb-3 text-xs text-muted">
        Nu completezi nimic. Termenul de livrare și stocul vin din catalog, pentru fiecare produs. Returul, plata și întrebările frecvente le citim de pe site-ul tău
        {p?.checkedAt ? `, ultima dată pe ${dateShort(p.checkedAt)}, și le recitim o dată pe lună.` : ". Prima citire pornește automat în câteva minute."}
      </p>
      {p?.error && <div className="mb-3"><Notice tone="bad">Ultima citire nu a reușit: {p.error}. Dacă site-ul blochează vizitatorii automați (firewall, Cloudflare), permite robotul EchoCatalogBot.{p.returns || p.payment ? " Agenții primesc între timp ce am citit data trecută." : ""}</Notice></div>}
      <div className="rounded-lg border border-border px-4">
        <Row label="Livrare">
          <div>Pe fiecare produs, din catalog: termenul și stocul.</div>
          {p?.catalogDelivery && <div className="text-xs text-muted">Cele mai dese termene: {p.catalogDelivery}</div>}
          {p?.delivery && <div className="mt-1 line-clamp-3 text-xs text-muted">{p.delivery.freeOver && <b className="font-semibold">Transport gratuit peste {p.delivery.freeOver}. </b>}{p.delivery.text}</div>}
        </Row>
        <Row label="Retur" url={p?.returns?.url}>
          {p?.returns ? <>{p.returns.days && <Badge tone="good">{p.returns.days} zile</Badge>} <span className="line-clamp-3 text-xs text-muted">{p.returns.text}</span></>
            : missing(p?.checkedAt ? "Nu am găsit pagina de retur pe site. Agenții spun termenul legal de 14 zile. Pune un link „Retur” în subsolul site-ului." : "Se citește de pe site.")}
        </Row>
        <Row label="Plată" url={p?.payment?.url}>
          {p?.payment ? <div className="flex flex-wrap gap-1">{p.payment.methods.map((m) => <Badge key={m}>{m}</Badge>)}</div>
            : missing(p?.checkedAt ? "Nu am găsit metodele de plată pe site. Pune un link „Metode de plată” în subsolul site-ului." : "Se citește de pe site.")}
        </Row>
        <Row label="Întrebări frecvente" url={p?.faq?.url}>
          {p?.faq ? <><div>{p.faq.items.length === 1 ? "O întrebare citită" : `${p.faq.items.length} întrebări citite`}</div><ul className="mt-1 space-y-1 text-xs text-muted">{p.faq.items.slice(0, 3).map((f) => <li key={f.q} className="truncate">{f.q}</li>)}</ul></>
            : missing(p?.checkedAt ? "Nu am găsit o pagină de întrebări frecvente pe site." : "Se citește de pe site.")}
        </Row>
      </div>
    </div>
  );
}

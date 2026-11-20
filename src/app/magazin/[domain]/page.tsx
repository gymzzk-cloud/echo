import { desc, eq, sql as dsql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { Badge, Card } from "@/components/ui";
import type { AuditResult } from "@/core/audit";
import { PROVIDERS, providerLabel } from "@/core/ai/types";
import { dateShort } from "@/lib/format";
import { daysAgo } from "@/lib/util";
import { trustForDomain, trustPublic } from "@/core/trust";
import { and, isNotNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function StorePage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain: raw } = await params;
  const domain = decodeURIComponent(raw).toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) notFound();

  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.domain, domain)).limit(1);
  const [registry] = await db.select().from(schema.stores).where(eq(schema.stores.domain, domain)).limit(1);
  const [audit] = await db.select().from(schema.audits).where(eq(schema.audits.domain, domain)).orderBy(desc(schema.audits.createdAt)).limit(1);
  // Agregat direct în Postgres (rapid și la milioane de rulări)
  const agg = (await db.execute(dsql`
    select provider, count(*)::int as total,
           count(*) filter (where mentions @> ${JSON.stringify([{ domain }])}::jsonb)::int as hit
    from runs where run_date >= ${daysAgo(30)} group by provider`)) as unknown as { provider: string; total: number; hit: number }[];
  const byProvider = new Map(agg.map((r) => [r.provider, r]));
  const recommending = PROVIDERS.filter((p) => (byProvider.get(p.id)?.hit ?? 0) > 0);
  const productCount = project ? (await db.select({ n: dsql<number>`count(*)::int` }).from(schema.products).where(eq(schema.products.projectId, project.id)))[0].n : 0;
  const f = (audit?.result as AuditResult | undefined)?.facts;
  const trust = project && trustPublic() ? await trustForDomain(domain) : null;
  const reviews = project ? await db.select().from(schema.reviews).where(and(eq(schema.reviews.projectId, project.id), eq(schema.reviews.status, "publicat"), isNotNull(schema.reviews.submittedAt))).orderBy(desc(schema.reviews.submittedAt)).limit(10) : [];
  // Statistici pentru proprietar: vizualizările profilului
  if (project) await db.insert(schema.events).values({ projectId: project.id, kind: "profile_view", source: "echo" }).catch(() => {});

  const facts: { label: string; ok: boolean | null; detail?: string }[] = [
    { label: "Date de identificare a firmei (CUI)", ok: f ? !!f.cui : null, detail: f?.cui ? `CUI ${f.cui}` : undefined },
    { label: "Politică de retur publicată", ok: f ? f.hasReturnPolicy : null },
    { label: "Termeni și condiții", ok: f ? f.hasTerms : null },
    { label: "Pagină de contact", ok: f ? f.hasContact : null },
    { label: "Link-uri ANPC / SOL", ok: f ? f.hasAnpc : null },
    { label: "Certificări de încredere", ok: f ? f.trustmarks.length > 0 : null, detail: f?.trustmarks.join(", ") || undefined },
    { label: "Catalog conectat și verificat zilnic", ok: !!project, detail: project ? `${productCount} produse` : undefined },
  ];

  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{project?.name ?? registry?.name ?? domain}</h1>
            <a href={`https://${domain}`} target="_blank" rel="nofollow noopener" className="text-sm text-muted hover:underline">{domain}</a>
          </div>
          {project ? <Badge tone="good">Profil revendicat</Badge> : <Badge>Profil nerevendicat</Badge>}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Fapte verificabile">
            {!f && <p className="mb-3 text-sm text-muted">Nu am verificat încă acest magazin.</p>}
            <ul className="space-y-2 text-sm">
              {facts.map((x) => (
                <li key={x.label} className="flex items-start justify-between gap-3">
                  <span>{x.label}{x.detail && <span className="block text-xs text-muted">{x.detail}</span>}</span>
                  {x.ok === null ? <Badge>neverificat</Badge> : x.ok ? <Badge tone="good">Da</Badge> : <Badge tone="warn">Nu am găsit</Badge>}
                </li>
              ))}
            </ul>
            {audit && <p className="mt-4 text-xs text-muted">Verificat automat din date publice pe {dateShort(audit.createdAt)}.</p>}
          </Card>
          <Card title="Ce spun AI-urile">
            <p className="text-sm">Recomandat de <b>{recommending.length} din {PROVIDERS.length}</b> AI-uri în ultimele 30 de zile.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {PROVIDERS.map((p) => {
                const b = byProvider.get(p.id);
                return (
                  <li key={p.id} className="flex justify-between">
                    <span>{providerLabel(p.id)}</span>
                    {b?.hit ? <Badge tone="good">Recomandă</Badge> : <Badge>Nu a menționat</Badge>}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
        {trust && <Card title="Scor de încredere" className="mt-4"><p className="text-sm"><b className="font-display text-2xl">{trust.score}/100</b> · calculat doar din fapte verificabile: {trust.parts.filter((x) => x.points > 0).map((x) => x.label.toLowerCase()).join(", ")}.</p></Card>}
        {reviews.length > 0 && (
          <Card title="Recenzii de la comenzi verificate" className="mt-4">
            <ul className="space-y-3 text-sm">
              {reviews.map((r) => <li key={r.id}><span className="text-warn">{"★".repeat(r.rating ?? 0)}</span> {r.text} <span className="text-xs text-muted">· {r.authorName ?? "Cumpărător"}, comandă verificată, {dateShort(r.submittedAt!)}</span></li>)}
            </ul>
          </Card>
        )}
        <p className="mt-6 text-xs text-muted">Afișăm doar fapte verificabile din surse publice, fără notă sau scor. Scorul de încredere public va apărea doar după validarea juridică și doar pentru profilurile revendicate. Ești proprietarul magazinului? <a href="/pentru-magazine" className="underline">Revendică profilul</a>.</p>
      </main>
      <PublicFooter />
    </>
  );
}

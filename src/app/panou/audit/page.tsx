import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { latestAudit, projectBase } from "@/core/projects";
import type { AuditResult } from "@/core/audit";
import { AuditView } from "@/components/audit-view";
import { Empty, Notice, PageHeader, Working } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { runNow } from "@/app/actions";
import { dateShort } from "@/lib/format";
import { busyKinds } from "@/core/jobs";
import { catalogCategories } from "@/core/store-context";

export default async function AuditPage() {
  const { project } = await currentProject();
  const audit = await latestAudit(project.id);
  const [last] = await db.select().from(schema.audits).where(eq(schema.audits.projectId, project.id)).orderBy(desc(schema.audits.createdAt)).limit(1);
  const failed = last && last.status === "error" ? String((last.result as { error?: string } | null)?.error ?? "eroare necunoscută") : null;
  const prods = await db.select().from(schema.products).where(eq(schema.products.projectId, project.id)).limit(300);
  const busy = await busyKinds(project.id);
  const run = busy.has("audit") ? <Working hint="Pagina se actualizează singură când e gata.">Verificarea e în lucru</Working> : <form action={runNow}><input type="hidden" name="projectId" value={project.id} /><SubmitButton variant="secondary" pendingText="Pornesc…">Verifică din nou</SubmitButton></form>;
  const failNotice = failed && <div className="mb-6"><Notice tone="bad">Ultima verificare nu a putut accesa {project.domain}{project.pathPrefix}: {failed}. Dacă site-ul merge în browser, probabil blochează vizitatorii automați (firewall, Cloudflare). Asta blochează și AI-urile.</Notice></div>;
  if (!audit) return <><PageHeader eyebrow="Repară" title="Audit tehnic" action={run} />{failNotice}{!failed && <Empty title="Auditul rulează">Verificăm robots.txt, Cloudflare, datele structurate și încrederea. Durează un minut.</Empty>}</>;
  const result = audit.result as AuditResult;
  return (
    <div>
      <PageHeader eyebrow="Repară" title="Audit tehnic" subtitle={`Ce văd AI-urile când îți vizitează magazinul. Verificat pe ${dateShort(audit.createdAt)}, automat în fiecare săptămână.`} action={run} />
      {failNotice}
      <AuditView audit={result} showFixes fixCtx={{
        domain: project.domain, origin: result.url ? result.url.replace(/\/$/, "") : projectBase(project), categories: await catalogCategories(project.id), platform: result.platform, storeName: project.name, facts: result.facts, currency: project.currency, logo: result.home?.logo ?? null,
        products: prods.map((p) => ({ title: p.title, url: p.url, price: p.price, currency: p.currency, category: p.category, brand: p.brand, inStock: p.inStock, imageUrl: p.imageUrl, gtin: p.gtin, description: p.description })),
      }} />
    </div>
  );
}

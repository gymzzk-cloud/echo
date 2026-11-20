import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { AuditView } from "@/components/audit-view";
import { ButtonLink, Notice } from "@/components/ui";
import type { AuditResult } from "@/core/audit";
import { dateShort } from "@/lib/format";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { startAudit } from "@/app/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Raport audit AI", robots: { index: false } };

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [a] = await db.select().from(schema.audits).where(eq(schema.audits.id, id)).limit(1);
  if (!a) notFound();
  const r = a.result as AuditResult | null;
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Audit AI: {a.domain}</h1>
        <div className="mb-6 mt-1 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Verificat pe {dateShort(a.createdAt)}, ora {a.createdAt.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" })}. Raportul e privat: îl vede doar cine are acest link.</p>
          {a.status !== "pending" && Date.now() - a.createdAt.getTime() > 10 * 60e3 && (
            <ActionForm action={startAudit}><input type="hidden" name="url" value={a.url} /><input type="hidden" name="force" value="1" /><SubmitButton className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface">Verifică din nou acum</SubmitButton></ActionForm>
          )}
        </div>
        {r?.reusedFacts?.length ? <div className="mb-4"><Notice tone="muted">Site-ul nu a mai afișat acum {r.reusedFacts.map((f) => (f === "cui" ? "CUI-ul" : "datele firmei")).join(" și ")}; am folosit ce găsisem la verificarea anterioară (păstrăm aceste date cel mult 90 de zile).</Notice></div> : null}
        {a.status !== "done" || !r ? (
          <Notice tone={a.status === "error" ? "bad" : "warn"}>{a.status === "error" ? "Nu am putut verifica site-ul. Verifică adresa și încearcă din nou." : "Auditul rulează. Reîncarcă pagina în câteva secunde."}</Notice>
        ) : (
          <>
            <AuditView audit={r} showFixes fixCtx={{ domain: a.domain, origin: new URL(r.url).origin, platform: r.platform, storeName: r.facts.title?.split(/[|–-]/)[0].trim() || a.domain, facts: r.facts }} />
            <div className="mt-8 rounded-xl border border-border bg-primary-bg p-6 text-center">
              <div className="text-lg font-semibold">Acesta e doar accesul tehnic.</div>
              <p className="mx-auto mt-1 max-w-xl text-sm text-muted">Conectează magazinul ca să vezi zilnic dacă te recomandă ChatGPT, Gemini, Perplexity și Claude, pentru ce produse și față de ce concurenți.</p>
              <ButtonLink href="/inregistrare" className="mt-4">Conectează magazinul: 14 zile gratuit</ButtonLink>
            </div>
          </>
        )}
      </main>
      <PublicFooter />
    </>
  );
}

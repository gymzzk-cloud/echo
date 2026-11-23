import { and, desc, eq, ilike, isNotNull, isNull, sql as dsql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/admin";
import { PublicHeader } from "@/components/public-header";
import { Badge, Card, Stat, Table, Td } from "@/components/ui";
import { dateShort } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registrul de magazine", robots: { index: false } };

const SRC: Record<string, string> = { audit: "audit gratuit", ai: "menționat de AI", client: "client" };

/** Registrul intern: toate magazinele văzute, revendicate sau nu. Sursă pentru vânzări și pentru index. */
export default async function StoreRegistry({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  await requireAdmin();
  const { f = "toate", q = "" } = await searchParams;
  const where: SQL[] = [];
  if (f === "nerevendicate") where.push(isNull(schema.stores.claimedProjectId));
  if (f === "revendicate") where.push(isNotNull(schema.stores.claimedProjectId));
  if (f === "audit") where.push(eq(schema.stores.source, "audit"));
  if (q) where.push(ilike(schema.stores.domain, `%${q.replace(/[%_]/g, "")}%`));
  const rows = await db.select().from(schema.stores).where(where.length ? and(...where) : undefined).orderBy(desc(schema.stores.auditRequests), desc(schema.stores.lastAuditAt)).limit(300);
  // Emailuri lăsate la audit, pe domeniu (cu acord de marketing separat)
  const leads = (await db.execute(dsql`select domain, count(distinct email)::int as emails, count(distinct email) filter (where marketing_consent)::int as consent from audits where email is not null group by domain`)) as unknown as { domain: string; emails: number; consent: number }[];
  const leadBy = new Map(leads.map((l) => [l.domain, l]));
  // Ultima verificare pe magazinul etalon (ShopExpert RO), făcută automat după fiecare publicare.
  const [golden] = await db.select().from(schema.jobs).where(eq(schema.jobs.kind, "golden_check")).orderBy(desc(schema.jobs.createdAt)).limit(1);
  const [tot] = (await db.execute(dsql`select count(*)::int as n, count(*) filter (where claimed_project_id is null)::int as unclaimed, count(*) filter (where source = 'audit')::int as audited, count(*) filter (where source = 'ai')::int as ai from stores`)) as unknown as { n: number; unclaimed: number; audited: number; ai: number }[];
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div><div className="label">Intern</div><h1 className="mt-1 text-3xl font-semibold">Registrul de magazine</h1>
          <p className="mt-1 text-sm text-muted">Fiecare magazin pentru care s-a cerut audit, pe care l-a menționat un AI sau care e client. Datele firmei se refolosesc 90 de zile; auditul gratuit se refolosește 24 de ore. Costurile AI pe magazin: <a href="/admin/costuri" className="text-primary hover:underline">Costuri AI</a>.</p></div>
        <Card title="Verificarea pe magazinul etalon (ShopExpert RO)" description="Rulează singură după fiecare publicare: auditul, clasificarea surselor și recomandările deschise, comparate cu ce știm sigur despre ShopExpert RO.">
          {!golden ? <p className="text-sm text-muted">Încă nu a rulat.</p> : (
            <div className="space-y-2 text-sm">
              <Badge tone={golden.status === "done" ? "good" : golden.status === "failed" || golden.lastError ? "bad" : "warn"}>{golden.status === "done" ? "Totul corect" : golden.status === "failed" ? "Afirmații greșite" : golden.lastError ? "Afirmații greșite (reîncerc)" : "În lucru"}</Badge>
              <p className="text-muted">Publicarea {String((golden.payload as { commit?: string }).commit ?? "").slice(0, 7)} · {dateShort(golden.createdAt)}</p>
              {golden.lastError && <p className="break-words">{golden.lastError}</p>}
            </div>
          )}
        </Card>
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Magazine în registru" value={tot.n} /><Stat label="Nerevendicate" value={tot.unclaimed} /><Stat label="Din audit gratuit" value={tot.audited} /><Stat label="Doar menționate de AI" value={tot.ai} />
        </div>
        <form className="flex flex-wrap items-center gap-2 text-sm">
          {["toate", "nerevendicate", "audit", "revendicate"].map((x) => <button key={x} name="f" value={x} className={`rounded-full border px-3 py-1 ${f === x ? "border-primary text-primary" : "border-border text-muted"}`}>{x}</button>)}
          <input name="q" defaultValue={q} placeholder="caută domeniu" className="ml-auto rounded-lg border border-border bg-bg px-3 py-1.5" />
        </form>
        <Card>
          <Table head={["Magazin", "Sursă", "Cereri audit", "Ultimul audit", "Scor", "Date firmă", "Emailuri", "Stare"]}>
            {rows.map((s) => {
              const facts = s.facts as { cui?: string; hasReturnPolicy?: boolean; hasAnpc?: boolean } | null;
              const l = leadBy.get(s.domain);
              return (
                <tr key={s.id}>
                  <Td><a href={`/magazin/${s.domain}`} className="font-medium hover:underline">{s.name ?? s.domain}</a><div className="text-xs text-muted">{s.domain}{s.pathPrefix} · {s.country ?? "?"}{s.platform ? ` · ${s.platform}` : ""}</div></Td>
                  <Td className="text-xs">{SRC[s.source] ?? s.source}</Td>
                  <Td className="num">{s.auditRequests}</Td>
                  <Td className="text-xs">{s.lastAuditAt ? <>{dateShort(s.lastAuditAt)} {s.lastAuditOk ? "" : <Badge tone="warn">eșuat</Badge>}{s.lastAuditId && <a href={`/audit/${s.lastAuditId}`} className="ml-1 underline">vezi</a>}</> : "–"}</Td>
                  <Td className="num">{s.auditScore ?? "–"}</Td>
                  <Td className="text-xs">{facts ? [facts.cui && `CUI ${facts.cui}`, facts.hasReturnPolicy && "retur", facts.hasAnpc && "ANPC"].filter(Boolean).join(", ") || "nimic găsit" : "–"}</Td>
                  <Td className="text-xs">{l ? `${l.emails} (${l.consent} cu acord)` : "–"}</Td>
                  <Td>{s.claimedProjectId ? <Badge tone="good">revendicat</Badge> : <Badge>nerevendicat</Badge>}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <p className="text-xs text-muted">Emailurile de la audit se folosesc doar pentru raport; cele „cu acord” pot primi și sfaturi. Nu le folosim în alt scop și nu le dăm altcuiva.</p>
      </main>
    </>
  );
}

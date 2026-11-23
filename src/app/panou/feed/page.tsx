import { eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { Badge, ButtonLink, Card, Empty, Notice, PageHeader } from "@/components/ui";
import { CardHelp } from "@/components/card-help";
import { CHANNELS } from "@/core/feed";
import { readFeedSummary, type FeedSummary } from "@/core/feed-summary";
import { busyKinds, enqueue } from "@/core/jobs";
import { ChannelsCard, ChatGptCard } from "./channels";
import { fixCounts } from "@/core/fixes";
import { DEFAULT_CHANNEL, FeedView } from "./feed-view";
import { RulesCard } from "./rules";
import { LABELS } from "./labels";

type Sp = { canal?: string; regula?: string };

export default async function FeedPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const channel = CHANNELS.some((c) => c.id === sp.canal) ? sp.canal! : DEFAULT_CHANNEL;
  const { project } = await currentProject();
  const rules = await db.select().from(schema.feedRules).where(eq(schema.feedRules.projectId, project.id)).orderBy(schema.feedRules.priority);
  const fixes = await fixCounts(project.id);
  // Rezumatul feed-ului (etichete, ce lipsește, primele 20, reguli sugerate) e calculat în worker pe tot catalogul;
  // aici doar îl citim (un rând). Lipsește sau e mai vechi de o zi → îl punem la coadă, iar JobWatcher reîncarcă pagina la final.
  const [[{ total }], summary, busy] = await Promise.all([
    db.select({ total: dsql<number>`count(*)::int` }).from(schema.products).where(eq(schema.products.projectId, project.id)),
    readFeedSummary(project.id, channel),
    busyKinds(project.id),
  ]);
  const stale = !summary || Date.now() - summary.computedAt.getTime() > 24 * 3600e3;
  if (total > 0 && stale && !busy.has("feed")) await enqueue("feed", { projectId: project.id });
  const working = busy.has("feed") || (total > 0 && stale);
  const at = summary?.computedAt.toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" });

  return (
    <>
      <PageHeader eyebrow="Reparații" title="Feed și canale" subtitle="Un singur catalog, optimizat automat pentru fiecare canal. Catalogul tău nu se modifică: regulile și titlurile aprobate se aplică doar în feed și se pot anula oricând." />
      {total === 0 ? <Empty title="Nu există încă produse">Conectează catalogul din Setări magazin.</Empty> : (
      <div className="space-y-6">
        {working && <Notice tone="muted">{summary ? `Actualizăm feed-ul în fundal. Cifrele de mai jos sunt calculate la ${at}; pagina se reîncarcă singură când e gata.` : "Calculăm feed-ul pe tot catalogul, în fundal. Pagina se reîncarcă singură când e gata (de obicei sub un minut)."}</Notice>}
        {summary && <AutoLabels summary={summary.data} />}

        <ChatGptCard projectId={project.id} />
        <ChannelsCard projectId={project.id} />

        <Card title={fixes.pending ? `${fixes.pending} reparații de produs așteaptă aprobarea ta` : "Reparații de produs"} action={<ButtonLink href="/panou/reparatii" variant="secondary" size="sm">Vezi reparațiile</ButtonLink>} description={<CardHelp id="feed.fixes" />}>
          <p className="text-sm">{fixes.approved ? `${fixes.approved} reparații sunt deja aplicate în feed.` : "Încă nu ai aprobat nicio reparație."}</p>
        </Card>

        {summary && <FeedView summary={summary.data} channel={channel} total={total} at={at!} />}

        <RulesCard projectId={project.id} rules={rules} channel={channel} example={sp.regula} summary={summary?.data ?? null} />
      </div>
      )}
    </>
  );
}

function AutoLabels({ summary }: { summary: FeedSummary }) {
  return (
    <Card title="Etichete automate" description={<CardHelp id="feed.labels" />}>
      <div className="flex flex-wrap gap-2">{summary.labelCounts.map(([k, n]) => <Badge key={k} tone={k === "recomandat_ai" || k === "pret_cel_mai_bun" ? "good" : k === "zombie" || k === "pret_peste_piata" || k === "date_lipsa" ? "warn" : "muted"}>{LABELS[k] ?? k}: {n}</Badge>)}</div>
    </Card>
  );
}

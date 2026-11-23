import { Suspense } from "react";
import { eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { Badge, ButtonLink, Card, Empty, PageHeader } from "@/components/ui";
import { CardHelp } from "@/components/card-help";
import { CHANNELS, buildFeed } from "@/core/feed";
import { ChannelsCard, ChatGptCard } from "./channels";
import { fixCounts } from "@/core/fixes";
import { DEFAULT_CHANNEL, FeedView, channelName } from "./feed-view";
import { RulesCard } from "./rules";
import { LABELS } from "./labels";

type Sp = { canal?: string; regula?: string };

export default async function FeedPage({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const channel = CHANNELS.some((c) => c.id === sp.canal) ? sp.canal! : DEFAULT_CHANNEL;
  const { project } = await currentProject();
  const rules = await db.select().from(schema.feedRules).where(eq(schema.feedRules.projectId, project.id)).orderBy(schema.feedRules.priority);
  const fixes = await fixCounts(project.id);
  // Doar numărul de produse aici; etichetele și previzualizarea (calcul pe tot catalogul) vin separat, în Suspense.
  const [{ total }] = await db.select({ total: dsql<number>`count(*)::int` }).from(schema.products).where(eq(schema.products.projectId, project.id));

  return (
    <>
      <PageHeader eyebrow="Reparații" title="Feed și canale" subtitle="Un singur catalog, optimizat automat pentru fiecare canal. Catalogul tău nu se modifică: regulile și titlurile aprobate se aplică doar în feed și se pot anula oricând." />
      {total === 0 ? <Empty title="Nu există încă produse">Conectează catalogul din Setări magazin.</Empty> : (
      <div className="space-y-6">
        <Suspense fallback={<Card title="Etichete automate" description={<CardHelp id="feed.labels" />}><Loading /></Card>}>
          <AutoLabels projectId={project.id} channel={channel} />
        </Suspense>

        <ChatGptCard projectId={project.id} />
        <ChannelsCard projectId={project.id} />

        <Card title={fixes.pending ? `${fixes.pending} reparații de produs așteaptă aprobarea ta` : "Reparații de produs"} action={<ButtonLink href="/panou/reparatii" variant="secondary" size="sm">Vezi reparațiile</ButtonLink>} description={<CardHelp id="feed.fixes" />}>
          <p className="text-sm">{fixes.approved ? `${fixes.approved} reparații sunt deja aplicate în feed.` : "Încă nu ai aprobat nicio reparație."}</p>
        </Card>

        <Suspense key={channel} fallback={<Card title={`Cum arată feed-ul acum: ${channelName(channel)}`} description={<CardHelp id="feed.view" />}><Loading /></Card>}>
          <FeedView projectId={project.id} channel={channel} total={total} />
        </Suspense>

        <RulesCard projectId={project.id} rules={rules} channel={channel} example={sp.regula} />
      </div>
      )}
    </>
  );
}

const Loading = () => <p className="animate-pulse text-sm text-muted">Calculăm pentru tot catalogul…</p>;

async function AutoLabels({ projectId, channel }: { projectId: string; channel: string }) {
  // Același feed ca restul paginii (calculat o dată, din cache): etichetele nu depind de canal.
  const feed = await buildFeed(projectId, channel);
  const counts = new Map<string, number>();
  for (const l of feed.labels.values()) for (const x of l) counts.set(x, (counts.get(x) ?? 0) + 1);
  return (
    <Card title="Etichete automate" description={<CardHelp id="feed.labels" />}>
      <div className="flex flex-wrap gap-2">{[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => <Badge key={k} tone={k === "recomandat_ai" || k === "pret_cel_mai_bun" ? "good" : k === "zombie" || k === "pret_peste_piata" || k === "date_lipsa" ? "warn" : "muted"}>{LABELS[k] ?? k}: {n}</Badge>)}</div>
    </Card>
  );
}

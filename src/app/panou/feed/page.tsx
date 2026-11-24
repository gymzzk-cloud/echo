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
import { QualityCard } from "./quality";

type Sp = { canal?: string; regula?: string; problema?: string; p?: string };

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
        {summary?.data.quality && <QualityCard projectId={project.id} quality={summary.data.quality} channel={channel} open={sp.problema} page={Number(sp.p) || 1} />}
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
      <div className="flex flex-wrap gap-2">{summary.labelCounts.filter(([k]) => k !== "zombie").map(([k, n]) => <Badge key={k} tone={k === "recomandat_ai" || k === "pret_cel_mai_bun" ? "good" : k === "ai_nu_apare" || k === "pret_peste_piata" || k === "date_lipsa" ? "warn" : "muted"}>{LABELS[k] ?? k}: {n.toLocaleString("ro-RO")}</Badge>)}</div>
      <AiCoverage summary={summary} />
    </Card>
  );
}

/**
 * Pe câte produse se sprijină etichetele AI: „neîntrebat” e separat de „întrebat și nu apare” (KNOWLEDGE A0).
 * Fără date de vânzări de la platformă nu există etichetă de vânzări; spunem asta, nu „fără vânzări”.
 */
function AiCoverage({ summary }: { summary: FeedSummary }) {
  const count = (k: string) => summary.labelCounts.find(([x]) => x === k)?.[1] ?? 0;
  const named = count("recomandat_ai"), notNamed = count("ai_nu_apare");
  const notAsked = Math.max(0, summary.total - named - notNamed);
  const n = (x: number) => x.toLocaleString("ro-RO");
  return (
    <ul className="mt-4 space-y-1 text-sm text-muted">
      <li><span className="font-medium text-fg">AI:</span> {n(named)} produse numite de AI în răspunsuri; {n(notNamed)} întrebate direct și nu apar; {n(notAsked)} din {n(summary.total)} încă neîntrebate, deci nu știm (nu primesc etichetă AI).</li>
      <li><span className="font-medium text-fg">Vânzări:</span> nu avem date de vânzări de la platforma ta, așa că nu punem etichete de vânzări (de exemplu „fără vânzări”).</li>
    </ul>
  );
}

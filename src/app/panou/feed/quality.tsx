import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { Badge, Card, Table, Td, TextLink } from "@/components/ui";
import { CardHelp } from "@/components/card-help";
import { ISSUES, type FeedQuality, type IssueId } from "@/core/feed-quality";
import { num } from "@/lib/format";
import { channelLink, channelName } from "./feed-view";

const PER_PAGE = 50;
const issueInfo = new Map(ISSUES.map((i) => [i.id, i]));

/**
 * „Verificarea feed-ului” (KNOWLEDGE A54): scorul (produse fără nicio problemă), apoi problemele pe categorii,
 * cele care blochează produsul întâi. Un clic pe o problemă arată produsele afectate, focus întâi, câte 50 pe pagină.
 */
export async function QualityCard({ projectId, quality, channel, open, page }: { projectId: string; quality: FeedQuality; channel: string; open?: string; page: number }) {
  const q = quality;
  const sel = q.issues.find((i) => i.id === open);
  const link = (extra: string) => `${channelLink(channel, extra)}#verificare`;
  const title = !q.checked ? "Verificarea feed-ului"
    : q.score === 100 ? `Feed-ul spre ${channelName(channel)} e 100% corect`
    : `${num(q.checked - q.perfect)} din ${num(q.checked)} produse au de reparat ceva`;
  return (
    <Card title={title} description={<CardHelp id="feed.quality" />}>
      <div id="verificare" className="scroll-mt-6" />
      {!q.checked ? <p className="text-sm text-muted">Niciun produs nu pleacă încă spre {channelName(channel)}.</p> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={q.score === 100 ? "good" : q.score >= 80 ? "warn" : "bad"}>Scor {q.score}%</Badge>
            <span><b className="num">{num(q.perfect)}</b> din <span className="num">{num(q.checked)}</span> produse fără nicio problemă</span>
            <span className="text-muted">·</span>
            <span><b className="num">{num(q.accepted)}</b> acceptate de canal{q.accepted < q.checked && <>, <b className="num">{num(q.checked - q.accepted)}</b> respinse</>}</span>
          </div>
          {q.issues.length > 0 && (
            <Table head={["Problemă", "Produse", "Din focus", "Cum repari"]}>
              {q.issues.map((i) => {
                const info = issueInfo.get(i.id)!;
                return (
                  <tr key={i.id}>
                    <Td>
                      <TextLink href={link(`&problema=${i.id}`)}>{info.label}</TextLink>
                      <div className="mt-1 flex flex-wrap gap-1"><Badge tone="muted">{info.group}</Badge>{info.blocking ? <Badge tone="bad">produsul e respins</Badge> : <Badge tone="warn">intră, dar cu date slabe</Badge>}</div>
                    </Td>
                    <Td className="num whitespace-nowrap text-right">{num(i.count)}</Td>
                    <Td className="num whitespace-nowrap text-right">{num(i.focus)}</Td>
                    <Td className="max-w-sm text-xs text-muted">{info.fix}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
          {sel && <IssueProducts projectId={projectId} id={sel.id} count={sel.count} sample={sel.sample} page={page} link={link} />}
        </>
      )}
    </Card>
  );
}

async function IssueProducts({ projectId, id, count, sample, page, link }: { projectId: string; id: IssueId; count: number; sample: string[]; page: number; link: (extra: string) => string }) {
  const pages = Math.max(1, Math.ceil(sample.length / PER_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const ids = sample.slice((p - 1) * PER_PAGE, p * PER_PAGE);
  const rows = ids.length ? await db.select({ id: schema.products.id, title: schema.products.title, mpn: schema.products.mpn, gtin: schema.products.gtin, focus: schema.products.focus })
    .from(schema.products).where(and(eq(schema.products.projectId, projectId), inArray(schema.products.id, ids))) : [];
  const by = new Map(rows.map((r) => [r.id, r]));
  const info = issueInfo.get(id)!;
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-sm font-semibold">{info.label}: <span className="num">{num(count)}</span> produse</h3>
      <Table head={["Produs", "Coduri"]}>
        {ids.map((pid) => by.get(pid)).filter((r) => !!r).map((r) => (
          <tr key={r.id}>
            <Td><TextLink href={`/panou/produse-ai/${r.id}`}>{r.title || "(fără titlu)"}</TextLink>{r.focus && <Badge tone="primary" className="ml-2">focus</Badge>}</Td>
            <Td className="num break-all text-xs text-muted">{[r.mpn && `Cod producător ${r.mpn}`, r.gtin ? `EAN ${r.gtin}` : "fără EAN"].filter(Boolean).join(" · ")}</Td>
          </tr>
        ))}
      </Table>
      <div className="mt-3 flex items-center justify-between text-sm">
        {p > 1 ? <TextLink href={link(`&problema=${id}&p=${p - 1}`)}>← Înapoi</TextLink> : <span />}
        <span className="num text-muted">Pagina {p} din {pages}</span>
        {p < pages ? <TextLink href={link(`&problema=${id}&p=${p + 1}`)}>Înainte →</TextLink> : <span />}
      </div>
      <p className="mt-2 text-xs text-muted">
        {sample.length < count ? `Arătăm ${num(sample.length)} din ${num(count)} produse, cele din focus întâi.` : `Toate cele ${num(count)} produse, cele din focus întâi.`} Apasă pe un produs ca să vezi fișa lui și ce trimitem fiecărui canal.
      </p>
    </div>
  );
}

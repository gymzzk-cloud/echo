import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { CopyButton, SubmitButton } from "@/components/client";
import { Badge, Card, Notice, Table, Td, Working } from "@/components/ui";
import { CHANNELS } from "@/core/feed";
import { busyKinds } from "@/core/jobs";
import { missingOpenAiSettings } from "@/core/feed-channels/openai";
import { effectivePolicy } from "@/core/feed-channels/policy-links";
import { regenerateFeeds, toggleChannel } from "@/app/actions-feed";
import { dateTime, num } from "@/lib/format";

/** Doar coloanele de afișat: fișierul generat (câțiva MB) nu se citește niciodată în pagină. */
async function outputsOf(projectId: string) {
  const o = schema.feedOutputs;
  return db.select({ id: o.id, channel: o.channel, token: o.token, active: o.active, settings: o.settings, itemCount: o.itemCount, stats: o.stats, generatedAt: o.generatedAt, lastError: o.lastError, hasFile: o.fileType })
    .from(o).where(eq(o.projectId, projectId));
}
type Output = Awaited<ReturnType<typeof outputsOf>>[number];

const EXT: Record<string, string> = { openai: ".csv", emag: ".csv" };
export const feedUrl = (o: { token: string; channel: string }) => `${process.env.APP_URL ?? "http://localhost:3000"}/feed/${o.token}${EXT[o.channel] ?? ""}`;

const MISSING: Record<string, string> = { brand: "fără marcă", gtin_mpn: "fără EAN și fără cod de producător", product_category: "fără categorie" };

function Status({ o, busy }: { o: Output | undefined; busy: boolean }) {
  if (!o?.active) return <Badge>Oprit</Badge>;
  if (busy || !o.hasFile) return <Badge tone="warn">Se generează…</Badge>;
  if (o.lastError) return <Badge tone="bad">Eroare la ultima generare</Badge>;
  return <Badge tone="good">Gata · {num(o.itemCount ?? 0)} produse</Badge>;
}

/** Cardul ChatGPT: pornești canalul, Echo generează feed-ul în fundal și îți dă adresa de lipit în ChatGPT Merchants. */
export async function ChatGptCard({ projectId }: { projectId: string }) {
  const [outputs, busy, [proj]] = await Promise.all([outputsOf(projectId), busyKinds(projectId),
    db.select({ storeInfo: schema.projects.storeInfo }).from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1)]);
  const o = outputs.find((x) => x.channel === "openai");
  const working = busy.has("feed");
  const pid = <input type="hidden" name="projectId" value={projectId} />;
  const missing = missingOpenAiSettings(effectivePolicy(o?.settings ?? null, proj?.storeInfo?.policies));
  const det = o?.settings?.detected;
  const s = o?.stats;
  const excluded = s ? Object.entries(s.excluded).filter(([, n]) => n > 0) : [];
  const gaps = s ? Object.entries(s.missing).filter(([, n]) => n > 0) : [];

  return (
    <Card title="ChatGPT (OpenAI)" action={<Status o={o} busy={working} />}>
      <p className="mb-4 text-sm text-muted">Feed-ul de produse pentru ChatGPT, în formatul cerut de OpenAI (CSV). Echo îl generează singur din catalogul deja sincronizat, îl reface după fiecare sincronizare și cel puțin o dată pe zi. Magazinul nu e întrebat nimic în plus.</p>
      {!o?.active ? (
        <form action={toggleChannel}>{pid}<input type="hidden" name="channel" value="openai" /><SubmitButton pendingText="Pornim…">Pornește feed-ul ChatGPT</SubmitButton></form>
      ) : (
        <div className="space-y-4">
          <div>
            <span className="label mb-2 block">Adresa feed-ului</span>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <code className="min-w-0 break-all text-xs">{feedUrl(o)}</code>
              <CopyButton text={feedUrl(o)} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {o.generatedAt ? <>Generat la {dateTime(o.generatedAt)}{s ? <> · {num(s.included)} din {num(s.total)} produse</> : null}. </> : "Primul fișier e gata în câteva minute (catalogul mare durează mai mult). "}
              Adresa e secretă: o dai doar lui ChatGPT.
            </p>
          </div>
          {o.lastError && <Notice tone="bad">Ultima generare n-a reușit, așa că ChatGPT primește încă fișierul anterior. Apasă „Regenerează acum”; dacă se repetă, scrie-ne.</Notice>}
          {missing.length > 0 && o.settings?.detectedAt && <Notice tone="warn">N-am găsit pe site: {missing.join(", ")}. OpenAI le cere; dacă există, pune un link spre ele în subsolul primei pagini și apasă „Regenerează acum”.</Notice>}
          {(excluded.length > 0 || gaps.length > 0) && (
            <div className="text-sm">
              {excluded.length > 0 && <p><b className="font-semibold">Nu intră în feed</b> (lipsește un câmp obligatoriu): {excluded.map(([k, n]) => `${num(n)} ${k}`).join(", ")}.</p>}
              {gaps.length > 0 && <p className="text-muted">Intră, dar ar fi recomandate mai multe date: {gaps.map(([k, n]) => `${num(n)} ${MISSING[k] ?? k}`).join(", ")}.</p>}
            </div>
          )}
          <ol className="list-decimal space-y-1 pl-6 text-sm">
            <li>Copiază adresa de mai sus.</li>
            <li>În ChatGPT Merchants, la „Add products to ChatGPT”, alege <b>Use a hosted URL</b>.</li>
            <li>Lipește adresa și salvează. ChatGPT o descarcă singur, periodic.</li>
            <li>Dacă OpenAI arată erori la import, le vezi acolo. Feed-ul se reface singur după fiecare sincronizare a catalogului.</li>
          </ol>
          <div className="border-t border-border pt-6">
            <span className="label mb-2 block">Găsite automat pe site</span>
            <ul className="space-y-1 text-sm">
              {([["Politica de retur", det?.returnPolicyUrl], ["Confidențialitate", det?.privacyPolicyUrl], ["Termeni și condiții", det?.termsUrl]] as const).map(([label, u]) => (
                <li key={label} className="min-w-0">{label}: {u ? <span className="break-all text-muted">{u}</span> : <span className="text-muted">{o.settings?.detectedAt ? "negăsită" : "o căutăm la prima generare"}</span>}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            {working ? <Working>Feed-ul e în lucru</Working>
              : <form action={regenerateFeeds}>{pid}<SubmitButton variant="secondary" pendingText="Pornim…">Regenerează acum</SubmitButton></form>}
            <form action={toggleChannel}>{pid}<input type="hidden" name="channel" value="openai" /><SubmitButton variant="ghost" pendingText="Oprim…">Oprește feed-ul</SubmitButton></form>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Celelalte canale: pornit/oprit, starea fișierului generat și adresa cu buton de copiere. */
export async function ChannelsCard({ projectId }: { projectId: string }) {
  const [outputs, busy, [proj]] = await Promise.all([outputsOf(projectId), busyKinds(projectId),
    db.select({ storeInfo: schema.projects.storeInfo }).from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1)]);
  const pid = <input type="hidden" name="projectId" value={projectId} />;
  return (
    <Card title="Alte canale">
      <Table head={["Canal", "Stare", "Adresa feed-ului", ""]}>
        {CHANNELS.filter((c) => c.id !== "openai").map((c) => {
          const o = outputs.find((x) => x.channel === c.id);
          return (
            <tr key={c.id}>
              <Td className="font-medium">{c.name}<div className="text-xs uppercase text-muted">{c.format}</div></Td>
              <Td><Status o={o} busy={busy.has("feed")} /></Td>
              <Td className="min-w-48">{o?.active ? <div className="flex min-w-0 items-center gap-2"><code className="min-w-0 break-all text-xs">{feedUrl(o)}</code><CopyButton text={feedUrl(o)} /></div> : <span className="text-xs text-muted">–</span>}</Td>
              <Td className="text-right"><form action={toggleChannel}>{pid}<input type="hidden" name="channel" value={c.id} /><SubmitButton variant="ghost" size="sm" pendingText="…">{o?.active ? "Oprește" : "Pornește"}</SubmitButton></form></Td>
            </tr>
          );
        })}
      </Table>
      <p className="mt-4 text-xs text-muted">Adresa e secretă: o lipești în Merchant Center, Commerce Manager, TikTok, Compari etc. Fișierele se generează în fundal după fiecare sincronizare a catalogului și cel puțin o dată pe zi, deci descărcarea e imediată.</p>
    </Card>
  );
}

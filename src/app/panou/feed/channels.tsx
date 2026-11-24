import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { CopyButton, SubmitButton } from "@/components/client";
import { merchantsOpen, countryName } from "@/core/feed-channels/chatgpt-markets";
import { Badge, Card, Notice, Table, Td, TextLink, Working } from "@/components/ui";
import { CHANNELS } from "@/core/feed";
import { busyKinds } from "@/core/jobs";
import { missingOpenAiSettings, OPENAI_SKIP_NO_BRAND } from "@/core/feed-channels/openai";
import { effectivePolicy } from "@/core/feed-channels/policy-links";
import { CardHelp } from "@/components/card-help";
import { regenerateFeeds, toggleChannel } from "@/app/actions-feed";
import { dateTime, num } from "@/lib/format";
import { FeedFetches } from "./fetches";

/** Doar coloanele de afișat: fișierul generat (câțiva MB) nu se citește niciodată în pagină. */
async function outputsOf(projectId: string) {
  const o = schema.feedOutputs;
  return db.select({ id: o.id, channel: o.channel, token: o.token, active: o.active, settings: o.settings, itemCount: o.itemCount, stats: o.stats, generatedAt: o.generatedAt, lastError: o.lastError, hasFile: o.fileType })
    .from(o).where(eq(o.projectId, projectId));
}
type Output = Awaited<ReturnType<typeof outputsOf>>[number];

const EXT: Record<string, string> = { openai: ".csv", emag: ".csv" };
export const feedUrl = (o: { token: string; channel: string }) => `${process.env.APP_URL ?? "http://localhost:3000"}/feed/${o.token}${EXT[o.channel] ?? ""}`;

const MISSING: Record<string, string> = { gtin_mpn: "fără EAN și fără cod de producător", product_category: "fără categorie" };

function Status({ o, busy }: { o: Output | undefined; busy: boolean }) {
  if (!o?.active) return <Badge>Oprit</Badge>;
  if (busy || !o.hasFile) return <Badge tone="warn">Se generează…</Badge>;
  if (o.lastError) return <Badge tone="bad">Eroare la ultima generare</Badge>;
  return <Badge tone="good">Gata · {num(o.itemCount ?? 0)} produse</Badge>;
}

/** Cardul ChatGPT: pornești canalul, Echo generează feed-ul în fundal și îți dă adresa: pentru ChatGPT Merchants unde e deschis (SUA), altfel pentru ChatGPT Ads Manager (B57). */
export async function ChatGptCard({ projectId }: { projectId: string }) {
  const [outputs, busy, [proj]] = await Promise.all([outputsOf(projectId), busyKinds(projectId),
    db.select({ storeInfo: schema.projects.storeInfo, country: schema.projects.country }).from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1)]);
  const o = outputs.find((x) => x.channel === "openai");
  const working = busy.has("feed");
  const pid = <input type="hidden" name="projectId" value={projectId} />;
  const missing = missingOpenAiSettings(effectivePolicy(o?.settings ?? null, proj?.storeInfo?.policies));
  const det = o?.settings?.detected;
  const s = o?.stats;
  const excluded = s ? Object.entries(s.excluded).filter(([, n]) => n > 0) : [];
  const gaps = s ? Object.entries(s.missing).filter(([k, n]) => n > 0 && MISSING[k]) : [];
  const noBrand = s?.samples?.brand_missing ?? [];

  return (
    <Card title="ChatGPT (OpenAI)" action={<Status o={o} busy={working} />} description={<CardHelp id="feed.chatgpt" />}>
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
            <span className="label mb-2 mt-4 block">Același feed, comprimat (.csv.gz)</span>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <code className="min-w-0 break-all text-xs">{feedUrl(o)}.gz</code>
              <CopyButton text={`${feedUrl(o)}.gz`} />
              <TextLink href={`${feedUrl(o)}.gz`} className="text-xs" external>Descarcă fișierul</TextLink>
            </div>
            <p className="mt-1 text-xs text-muted">De vreo 3 ori mai mic și trimis pe loc, fără lucru pe server. OpenAI acceptă și csv.gz: îl folosești dacă adresa simplă dă eroare sau îl încarci de mână.</p>
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
          {noBrand.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">Produse scoase din feed pentru că nu au marcă ({num(s?.excluded[OPENAI_SKIP_NO_BRAND] ?? 0)})</summary>
              <p className="mt-2 text-muted">OpenAI cere marca și respinge rândurile fără ea, așa că nu le trimitem. Completează marca în magazin; produsele intră singure în feed după următoarea sincronizare.</p>
              <Table className="mt-2" head={["Cod", "Produs", "Marca din magazin"]}>
                {noBrand.map((x) => (
                  <tr key={x.code} className="border-b border-border last:border-0">
                    <Td className="whitespace-nowrap font-mono text-xs">{x.code}</Td>
                    <Td>{x.title}</Td>
                    <Td className="break-all font-mono text-xs">{x.value || <span className="font-sans text-muted">goală</span>}</Td>
                  </tr>
                ))}
              </Table>
              {(s?.excluded[OPENAI_SKIP_NO_BRAND] ?? 0) > noBrand.length && <p className="mt-2 text-xs text-muted">Arătăm primele {num(noBrand.length)} din {num(s?.excluded[OPENAI_SKIP_NO_BRAND] ?? 0)}.</p>}
            </details>
          )}
          {merchantsOpen(proj?.country) ? (
            <ol className="list-decimal space-y-1 pl-6 text-sm">
              <li>Copiază adresa de mai sus.</li>
              <li>În ChatGPT Merchants, la „Add products to ChatGPT”, alege <b>Use a hosted URL</b>.</li>
              <li>Lipește adresa și salvează. ChatGPT o descarcă singur, periodic.</li>
              <li>Dacă OpenAI arată erori la import, le vezi acolo. Feed-ul se reface singur după fiecare sincronizare a catalogului.</li>
            </ol>
          ) : (
            <Notice tone="muted">ChatGPT Merchants (produsele gratuite în aplicația ChatGPT) nu primește încă magazine din {countryName(proj?.country)}: OpenAI îl are deschis doar în SUA. Adresa de mai sus o folosești acum pentru reclamele din ChatGPT Ads Manager (mai jos). Când OpenAI deschide Merchants pentru {countryName(proj?.country)}, același feed merge și acolo, fără altă muncă.</Notice>
          )}
          <div className="border-t border-border pt-6">
            <span className="label mb-2 block">Reclame în ChatGPT (ChatGPT Ads Manager)</span>
            <p className="text-sm text-muted">
              Pentru campaniile din feed în ChatGPT Ads Manager folosești <b className="font-semibold text-fg">aceeași adresă</b>: OpenAI cere același format de catalog ca pentru ChatGPT Merchants, așa că nu e nevoie de un al doilea feed. Reclamele și bugetul lor le setezi în contul tău de reclame OpenAI, nu în Echo.
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-6 text-sm">
              <li>Intră în <TextLink href="https://ads.openai.com" external>ads.openai.com</TextLink>, la <b>Tools → Feeds</b>, și apasă <b>Create feed</b>.</li>
              <li>Alege varianta cu adresă găzduită (hosted URL) și lipește adresa de mai sus. Adresa ține reclamele la zi singură (prețuri, stoc); un fișier încărcat de mână rămâne cum l-ai încărcat.</li>
              <li>Dacă „Connect” sau o actualizare dă eroare, uită-te mai jos la „Descărcări făcute de OpenAI”: dacă OpenAI nici n-a cerut fișierul, eroarea e la ei. Încearcă adresa .csv.gz; ca rezervă, descarcă fișierul .csv.gz și încarcă-l de mână (el nu se mai actualizează singur).</li>
              <li>Când feed-ul apare ca procesat, creează o campanie de tip <b>Product feed</b> și alege {countryName(proj?.country)} la țări.</li>
            </ol>
          </div>
          <FeedFetches outputId={o.id} label="OpenAI" />
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
    db.select({ storeInfo: schema.projects.storeInfo, country: schema.projects.country }).from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1)]);
  const pid = <input type="hidden" name="projectId" value={projectId} />;
  return (
    <Card title="Alte canale" description={<CardHelp id="feed.channels" />}>
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

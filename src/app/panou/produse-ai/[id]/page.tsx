import { Suspense } from "react";
import { productCodes } from "@/lib/product-codes";
import { notFound } from "next/navigation";
import { z } from "zod";
import { currentProject } from "@/lib/project";
import { proofAnswers } from "@/core/product-ai-read";
import { productSheet } from "@/core/product-sheet/read";
import { enqueue, pendingJobs } from "@/core/jobs";
import { PRODUCT_AI_WINDOW_DAYS } from "@/core/product-visibility-job";
import { providerLabel } from "@/core/ai/types";
import { SubmitButton } from "@/components/client";
import { Badge, ButtonLink, Card, Notice, PageHeader, Stat, TextLink, Working } from "@/components/ui";
import { ChannelCard, scoreTone } from "@/components/product-sheet/channel-card";
import { AnswersCard } from "@/components/product-sheet/answers-card";
import { HonestCard } from "@/components/product-sheet/honest-card";
import { Proof } from "@/components/product-sheet/proof";
import { dateTime, money, num } from "@/lib/format";
import { checkProductPageNow } from "@/app/actions-product-ai";
import { trackProduct } from "@/app/actions";
import type { ChannelReport } from "@/core/product-sheet/channels";

const PAGE_RECHECK_DAYS = 7;

/**
 * Fișa unui produs: ce primește ChatGPT (feed OpenAI), ce primește Google (feed + pagina citită de Google și Gemini),
 * cu scor și reparații pe fiecare canal, apoi răspunsurile AI în care apar alții în locul magazinului și de ce.
 * Citește un singur produs; răspunsurile AI (partea grea) vin în <Suspense>.
 */
export default async function ProductSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { project, role } = await currentProject();
  const [sheet, pageBusy] = await Promise.all([productSheet(project.id, id), pendingJobs(["product_page"], "productId", id)]);
  if (!sheet) notFound();
  const { product: p, stat: s, openai, google, page } = sheet;
  const canWrite = role !== "viewer" && role !== "client";

  // Pagina produsului se citește în worker (o cerere la magazin): automat prima dată și după 7 zile.
  const stale = !page || Date.now() - page.checkedAt.getTime() > PAGE_RECHECK_DAYS * 864e5;
  const checking = pageBusy > 0 || (stale && canWrite && !!(await enqueue("product_page", { projectId: project.id, productId: id })));
  const answers = s ? await proofAnswers(project.id, s.examples.map((e) => e.runId)) : new Map<string, string>();
  const tracked = sheet.prompts.some((x) => x.active && x.intent === "produs");
  const fixes = topFixes([openai.report, google.report, page?.report ?? null]);

  const ids = [...productCodes(p), p.brand, money(p.price, p.currency), !p.inStock && "fără stoc"].filter(Boolean).join(" · ");
  const trackForm = canWrite && p.inStock && !tracked && (
    <form action={trackProduct}>
      <input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="productId" value={p.id} /><input type="hidden" name="on" value="1" />
      <SubmitButton variant="secondary" pendingText="Adaug…">Urmărește în AI</SubmitButton>
    </form>
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={<TextLink href="/panou/produse-ai" className="label">Produse în AI</TextLink>} title={p.title}
        subtitle={<><span className="num break-all">{ids}</span> · <TextLink href={p.url} external>Pagina produsului</TextLink></>}
        action={trackForm || (tracked && <Badge tone="good">Urmărit în AI</Badge>)} />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Date trimise la ChatGPT" value={scoreValue(openai.report)} hint={openai.active ? "calitatea feed-ului OpenAI, din 100 (nu de câte ori apari)" : "feed-ul ChatGPT nu e pornit"} />
        <Stat label="Date pentru Google (feed)" value={scoreValue(google.report)} hint={google.active ? "calitatea feed-ului Google, din 100" : "calitatea, din 100, dacă am trimite feed-ul Google Echo (e oprit)"} />
        <Stat label="Date din pagină (Google, Gemini)" value={page?.report ? scoreValue(page.report, "Necitită") : "–"} hint={page ? `citită la ${dateTime(page.checkedAt)}` : "o citim acum"} />
        <Stat label={`Numit de AI-uri, ${PRODUCT_AI_WINDOW_DAYS} de zile`} value={s ? `${s.withStore} / ${s.appearances}` : "0"} hint={s ? `răspunsuri care te numesc, din cele care numesc produsul · loc mediu ${num(parseFloat(s.avgPosition))}` : "niciun răspuns nu numește produsul"} />
      </div>

      {(fixes.length > 0 || sheet.pendingEdits.length > 0) && (
        <Card title={`${fixes.length + sheet.pendingEdits.length} ${fixes.length + sheet.pendingEdits.length === 1 ? "lucru" : "lucruri"} de reparat la acest produs`} description="Cele mai importante primele. Corectezi în catalog (sau aprobi propunerea Echo), iar feed-urile se refac singure la următoarea sincronizare.">
          <ol className="space-y-3 text-sm">
            {sheet.pendingEdits.map((e, i) => <li key={`e${i}`}><span className="font-medium">Echo propune {FIELD_LABEL[e.field] ?? e.field}: „{e.value.slice(0, 120)}”.</span> <span className="text-muted">{e.reason}</span> <TextLink href="/panou/reparatii">Aprobă în Reparații</TextLink></li>)}
            {fixes.map((f, i) => <li key={i}><span className="font-medium">{f.label ? `${f.where}, ${f.label.toLowerCase()}` : f.where}:</span> <span className="text-muted">{f.fix}</span></li>)}
          </ol>
        </Card>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <ChannelCard title="Ce primește ChatGPT" report={openai.report}
          description="Rândul exact din feed-ul ChatGPT (OpenAI), calculat acum din catalog, cu titlurile aprobate și regulile tale."
          status={!openai.active
            ? <Notice tone="warn">Feed-ul ChatGPT nu e pornit. Pornește-l din <TextLink href="/panou/feed">Feed și canale</TextLink>, apoi pune adresa lui în ChatGPT Merchants. Mai jos vezi ce am trimite.</Notice>
            : openai.generatedAt && <p className="text-xs text-muted">Fișierul feed-ului e generat la {dateTime(openai.generatedAt)}. Ce ai schimbat după, intră automat la următoarea generare.</p>}
          footer="OpenAI nu ne spune cum folosește fiecare câmp în clasament; scorul arată cât de complete sunt datele pe care le cere specificația lor (EAN, marcă, descriere, stoc, retur)." />
        <ChannelCard title="Ce primește Google din feed" report={google.report}
          description="Produsul în feed-ul Google generat de Echo (Merchant Center). Gemini și AI Overviews folosesc datele Google despre produse."
          status={!google.active && <Notice tone="primary">Feed-ul Google din Echo nu e pornit. Dacă trimiți deja produsele la Google din alt loc, Merchant Center vede acel feed; aici vezi ce ar primi din Echo.</Notice>}
          footer={google.generatedAt ? `Fișierul feed-ului e generat la ${dateTime(google.generatedAt)}.` : undefined} />
      </div>

      <ChannelCard title="Ce citesc Google și Gemini din pagina produsului" report={page?.report ?? null} notIncluded="Necitită"
        description="Datele de produs (schema.org) din pagina ta, cum le citesc Google, Gemini și roboții AI, comparate cu feed-ul. Un preț, un stoc sau un EAN diferit e motivul cel mai des de respingere în Google."
        status={checking
          ? <Working hint="Pagina se actualizează singură.">Citim pagina produsului…</Working>
          : page && <p className="break-all text-xs text-muted">Citită la {dateTime(page.checkedAt)}: {page.url}</p>}
        action={!checking && canWrite && page && (
          <form action={checkProductPageNow}><input type="hidden" name="projectId" value={project.id} /><input type="hidden" name="productId" value={p.id} />
            <SubmitButton variant="secondary" pendingText="Pornesc…">Verifică pagina din nou</SubmitButton></form>
        )} />

      <Suspense fallback={<Card title="Când AI-urile aleg pe altcineva" description="Răspunsurile AI despre acest produs în care apar alte magazine în locul tău și de ce."><p className="text-sm text-muted">Calculăm…</p></Card>}>
        <AnswersCard projectId={project.id} productId={p.id} productUrl={p.url} ownDomain={project.domain} orgId={sheet.project.orgId} inStock={p.inStock} tracked={tracked}
          namedRunIds={s?.examples.map((e) => e.runId) ?? []} wrongPrices={s?.wrongPrices ?? []}
          openai={openai.report} openaiActive={openai.active} google={google.report} page={page?.report ?? null} />
      </Suspense>

      {s && (
        <Card title="Unde numesc AI-urile produsul" description="Fiecare apariție a produsului, cele mai noi primele: AI-ul, data și ora, întrebarea, rândul exact și după ce l-am recunoscut. Prețul e doar cel scris pe rândul cu magazinul tău.">
          <p className="mb-3 text-sm text-muted">
            Comparăm cu {s.realSource === "site" && s.realPrice
              ? <>prețul de pe site, <span className="num font-medium text-fg">{money(s.realPrice, p.currency)}</span>{s.siteCheckedAt && <>, citit la <span className="num">{dateTime(s.siteCheckedAt)}</span></>} (în catalog: <span className="num">{money(p.price, p.currency)}</span>)</>
              : <>prețul din catalog, <span className="num font-medium text-fg">{money(p.price, p.currency)}</span>{s.statedPrice ? " (pagina produsului se citește automat în câteva minute)" : ""}</>}. Diferență peste 5% = preț greșit.
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            {Object.entries(s.providers).sort((a, b) => b[1] - a[1]).map(([x, n]) => <Badge key={x}>{providerLabel(x)}: {n}×</Badge>)}
            {s.wrongPrices.map((w) => <Badge key={`w${w.provider}`} tone="bad">{providerLabel(w.provider)} spune {money(w.price, p.currency)}</Badge>)}
          </div>
          <div id="dovezi" className="scroll-mt-6 space-y-4">
            {s.examples.map((e) => <Proof key={`${e.runId}-${e.provider}`} e={e} real={s.realPrice ? parseFloat(s.realPrice) : p.price ? parseFloat(p.price) : null} realLabel={s.realSource === "site" ? "pe site" : "în catalog"} currency={p.currency} answer={answers.get(e.runId)} />)}
          </div>
        </Card>
      )}

      <HonestCard title={p.title} url={p.url} />
      <ButtonLink href="/panou/produse-ai" variant="secondary">Caută alt produs</ButtonLink>
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = { title: "titlul", description: "descrierea", brand: "marca", gtin: "EAN-ul", category: "categoria" };

function scoreValue(r: ChannelReport | null, notIncluded = "Nu intră") {
  if (!r) return "–";
  if (!r.included) return <span className="text-bad">{notIncluded}</span>;
  const tone = scoreTone(r.score);
  return <span className={tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : "text-bad"}>{r.score}</span>;
}

/** Reparațiile din toate canalele, fără dubluri (același text apare la ChatGPT și Google), cele grave primele. Cel mult 6. */
function topFixes(reports: (ChannelReport | null)[]) {
  const where = ["ChatGPT", "Google", "Pagina"];
  const seen = new Set<string>();
  const out: { where: string; label: string; fix: string; bad: boolean }[] = [];
  reports.forEach((r, i) => {
    for (const c of r?.checks ?? []) {
      if (!c.fix || seen.has(c.fix)) continue;
      seen.add(c.fix);
      out.push({ where: where[i], label: c.label, fix: c.fix, bad: c.status === "bad" });
    }
    if (r && !r.included && r.reason && !seen.has(r.reason)) { seen.add(r.reason); out.push({ where: i === 2 ? "Pagina produsului" : where[i], label: "", fix: r.reason, bad: true }); }
  });
  return out.sort((a, b) => Number(b.bad) - Number(a.bad)).slice(0, 6);
}

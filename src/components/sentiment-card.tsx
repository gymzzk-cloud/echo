import { ASPECTS, aspectLabel, MIN_OPINIONS, type Aspect, type SentimentScore, type SourcedOpinion, type StoreSentiment, type sampleQuotes } from "@/core/ai/sentiment";
import { providerLabel } from "@/core/ai/types";
import { dateShort } from "@/lib/format";
import { domainOf } from "@/lib/util";
import { Badge, Card, SubCard, Table, Td, TextLink, type Tone } from "./ui";
import { CardHelp } from "@/components/card-help";

/** Unde repari fiecare aspect criticat (DESIGN §1.3: fiecare problemă are o acțiune). */
const FIX: Record<Aspect, { href: string; label: string }> = {
  pret: { href: "/panou/produse", label: "Verifică prețurile din catalog" },
  livrare: { href: "/panou/setari", label: "Verifică livrarea afișată pe site" },
  oferta: { href: "/panou/produse", label: "Verifică stocul și produsele" },
  incredere: { href: "/panou/reputatie", label: "Vezi reputația și recenziile" },
  servicii: { href: "/panou/recenzii", label: "Vezi ce spun clienții" },
};

const tone = (s: number | null): Tone => (s === null ? "muted" : s >= 20 ? "good" : s <= -20 ? "bad" : "warn");
const signed = (s: number) => (s > 0 ? `+${s}` : s < 0 ? `−${Math.abs(s)}` : "0");
const word = (s: number) => (s >= 20 ? "pozitiv" : s <= -20 ? "negativ" : "neutru");

function ScoreBadge({ s }: { s: SentimentScore }) {
  if (s.score === null) return <span className="text-xs text-muted" title={s.positive + s.negative ? "Prea puține păreri pentru un scor" : "Nicio părere"}>–</span>;
  return <span title={`${s.positive} laude, ${s.negative} critici`}><Badge tone={tone(s.score)}><span className="num">{signed(s.score)}</span></Badge></span>;
}

/**
 * Vizibilitate: cum vorbesc AI-urile despre tine și despre concurenți, pe aspecte.
 * Scorurile vin din mențiunile deja salvate (extrase din text, fără apeluri AI în plus).
 */
export function SentimentCard({ board, visibility, names, quotes, projectName }: {
  /** Primul rând e magazinul tău. */
  board: StoreSentiment[];
  visibility: Map<string, number>;
  names: Map<string, string>;
  quotes: ReturnType<typeof sampleQuotes>;
  projectName: string;
}) {
  const [me, ...others] = board;
  const rows = [me, ...others.filter((o) => o.answers > 0).sort((a, b) => b.withOpinion - a.withOpinion || b.answers - a.answers).slice(0, 7)];
  const scored = ASPECTS.map((a) => ({ ...a, s: me.aspects[a.id] })).filter((a) => a.s.score !== null);
  const best = [...scored].sort((a, b) => b.s.score! - a.s.score!)[0];
  const worst = [...scored].sort((a, b) => a.s.score! - b.s.score!)[0];
  const rivalBetter = others.filter((o) => o.overall.score !== null && me.overall.score !== null && o.overall.score > me.overall.score)
    .sort((a, b) => b.overall.score! - a.overall.score!)[0];

  return (
    <Card title="Cum vorbesc AI-urile despre tine" description={<CardHelp id="vis.sentiment" />}>
      {me.overall.score !== null ? (
        <p className="mb-4 text-sm">
          Când te numesc, AI-urile vorbesc <strong>{word(me.overall.score)}</strong> despre tine: scor <strong className="num">{signed(me.overall.score)}</strong> din {me.withOpinion} răspunsuri cu păreri.
          {best && best.s.score! > 0 && <> Cel mai bine: <strong>{best.label}</strong> (<span className="num">{signed(best.s.score!)}</span>).</>}
          {worst && worst.s.score! < 0 && <> Cel mai slab: <strong>{worst.label}</strong> (<span className="num">{signed(worst.s.score!)}</span>), <TextLink href={FIX[worst.id].href}>{FIX[worst.id].label.toLowerCase()}</TextLink>.</>}
          {rivalBetter && <> {names.get(rivalBetter.domain) ?? rivalBetter.domain} are un ton mai bun (<span className="num">{signed(rivalBetter.overall.score!)}</span>).</>}
        </p>
      ) : (
        <p className="mb-4 text-sm text-muted">
          {me.answers
            ? `AI-urile te-au numit în ${me.answers} răspunsuri, dar au spus prea puțin despre tine (preț, livrare, încredere) ca să avem un scor.`
            : "AI-urile nu te-au numit încă în răspunsurile din această perioadă, deci nu știm cum vorbesc despre tine."}
        </p>
      )}

      <Table head={["Magazin", "Vizibilitate", "Ton general", ...ASPECTS.map((a) => a.label)]}>
        {rows.map((r, i) => (
          <tr key={r.domain} className={i === 0 ? "bg-primary-bg/40 font-medium" : ""}>
            <Td>
              {i === 0 ? `${projectName} (tu)` : names.get(r.domain) ?? r.domain}
              <span className="block text-xs font-normal text-muted">{r.withOpinion} din {r.answers} răspunsuri cu păreri</span>
            </Td>
            <Td className="num text-right">{visibility.get(r.domain) ?? 0}%</Td>
            <Td><ScoreBadge s={r.overall} /></Td>
            {ASPECTS.map((a) => <Td key={a.id}><ScoreBadge s={r.aspects[a.id]} /></Td>)}
          </tr>
        ))}
      </Table>

      {(quotes.positive.length > 0 || quotes.negative.length > 0) && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {([["Ce laudă AI-urile la tine", quotes.positive, "good"], ["Ce critică AI-urile la tine", quotes.negative, "bad"]] as const).map(([title, list, t]) => (
            <SubCard key={title}>
              <h3 className="mb-3 text-sm font-semibold">{title}</h3>
              {list.length ? (
                <ul className="divide-y divide-border">
                  {list.map((q) => <QuoteItem key={q.runId + q.aspect + q.quote} q={q} tone={t} />)}
                </ul>
              ) : <p className="text-sm text-muted">Nimic în această perioadă.</p>}
            </SubCard>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        Scorul merge de la −100 (doar critici) la +100 (doar laude). Îl estimăm din cuvintele pe care AI-ul le folosește lângă numele magazinului („livrare rapidă”, „prețuri mai mari”, „recenzii mixte”), în răspunsurile deja primite, fără întrebări în plus.
        „–” înseamnă sub {MIN_OPINIONS} păreri, prea puțin pentru un scor. La fiecare laudă și critică, „Vezi sursa” arată întrebarea, AI-ul, ziua, linkurile citate și răspunsul întreg, ca să verifici că e corectă și chiar despre tine.
      </p>
    </Card>
  );
}

/** Fraza din răspuns, evidențiată, ca să se vadă unde a spus-o AI-ul. */
function Highlighted({ answer, quote }: { answer: string; quote: string }) {
  const text = answer.replace(/\*\*/g, "");
  const probe = quote.replace(/…$/, "").slice(0, 60);
  const at = probe.length >= 12 ? text.indexOf(probe) : -1;
  if (at < 0) return <>{text}</>;
  const end = text.indexOf("\n", at + probe.length);
  const stop = Math.min(end < 0 ? text.length : end, at + quote.replace(/…$/, "").length);
  return <>{text.slice(0, at)}<mark className="bg-warn-bg text-fg">{text.slice(at, stop)}</mark>{text.slice(stop)}</>;
}

/** O laudă sau o critică, cu sursa ei: întrebarea, AI-ul, ziua, linkurile citate și răspunsul întreg. */
function QuoteItem({ q, tone: t }: { q: SourcedOpinion; tone: "good" | "bad" }) {
  const links = q.sources.filter((s) => /^https?:\/\//.test(s.url)).slice(0, 8);
  return (
    <li className="py-3 text-sm first:pt-0 last:pb-0">
      <span className="flex flex-wrap gap-1">{q.aspects.map((a) => <Badge key={String(a)} tone={t}>{t === "good" ? "+" : "−"} {aspectLabel(a)}</Badge>)}</span>
      <span className="mt-1 block">„{q.quote}”</span>
      <span className="block text-xs text-muted">
        {providerLabel(q.provider)} · {dateShort(q.runDate)}{q.total > 1 && <> · în <span className="num">{q.total}</span> răspunsuri</>}
      </span>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-primary">Vezi sursa</summary>
        <div className="mt-2 space-y-2 text-xs">
          {q.prompt && <p><span className="text-muted">Întrebarea: </span>„{q.prompt}”</p>}
          <div>
            <span className="text-muted">Linkuri citate de {providerLabel(q.provider)}: </span>
            {links.length ? (
              <ul className="mt-1 space-y-1">
                {links.map((l) => <li key={l.url} className="min-w-0 break-all"><TextLink href={l.url} external className="text-xs">{l.title || domainOf(l.url) || l.url}</TextLink><span className="text-muted"> · {domainOf(l.url)}</span></li>)}
              </ul>
            ) : <span>niciunul (AI-ul a răspuns fără să citeze pagini)</span>}
          </div>
          <div>
            <span className="text-muted">Răspunsul întreg (fraza e evidențiată):</span>
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap font-sans leading-relaxed"><Highlighted answer={q.answer} quote={q.quote} /></pre>
          </div>
        </div>
      </details>
    </li>
  );
}

import { providerLabel } from "@/core/ai/types";
import { actionTitle } from "@/core/audit/problems";
import type { progressData } from "@/core/engine-view-read";
import { progressSince, type SameQuestions } from "@/core/engine-view";
import { dateShort } from "@/lib/format";
import { Badge, ButtonLink, Card, Delta, ListRow, SubCard, TextLink, impactTone } from "../ui";
import { CardHelp } from "@/components/card-help";

type Data = Awaited<ReturnType<typeof progressData>>;

/**
 * „Ce s-a schimbat de când folosești Echo” și „Ce repari acum”: cifrele de la prima măsurătoare până azi,
 * ce ai rezolvat (cu vizibilitatea de atunci) și următorii pași, fiecare cu locul unde îl faci.
 */
/** `same`: prima zi față de ultima, doar pe întrebările puse în ambele (total și pe fiecare AI); null = nu se pot compara. */
export type SameChange = { all: SameQuestions | null; perProvider: { provider: string; change: SameQuestions | null }[] };

export function ProgressCards({ data, links, same }: { data: Data; links: { wrongPrice: string; withoutStore: string }; same: SameChange }) {
  const p = progressSince(data.stats);
  const now = p.last?.visibility ?? null;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Ce s-a schimbat de când folosești Echo" description={p.first ? `De la prima măsurătoare (${dateShort(p.first.day)}) până la ultima (${dateShort(p.last!.day)}), ${p.measurements} ${p.measurements === 1 ? "zi măsurată" : "zile măsurate"}.` : undefined}>
        {!p.first ? <p className="text-sm text-muted">Apare după prima măsurătoare.</p> : (
          <>
            <dl className="grid gap-4 sm:grid-cols-2">
              <SubCard>
                <dt className="label">Apari în răspunsuri</dt>
                {same.all ? (
                  <>
                    <dd className="mt-1 flex flex-wrap items-baseline gap-2"><span className="num font-display text-2xl font-semibold">{same.all.fromVis}% → {same.all.toVis}%</span><Delta value={same.all.delta} suffix=" pp" /></dd>
                    <dd className="mt-1 text-xs text-muted">Pe aceleași {same.all.prompts} întrebări, {dateShort(same.all.from)} → {dateShort(same.all.to)}.</dd>
                  </>
                ) : (
                  <>
                    <dd className="mt-1 num font-display text-2xl font-semibold">{p.last!.visibility}%</dd>
                    <dd className="mt-1 text-xs text-muted">Fără comparație: în zilele măsurate s-au pus alte întrebări.</dd>
                  </>
                )}
              </SubCard>
              <SubCard>
                <dt className="label">Scor de vizibilitate</dt>
                <dd className="mt-1 flex flex-wrap items-baseline gap-2"><span className="num font-display text-2xl font-semibold">{p.first.score} → {p.last!.score}</span><Delta value={p.scoreDelta} /></dd>
              </SubCard>
            </dl>
            {same.perProvider.length > 0 && (
              <ul className="mt-4 text-sm">
                {same.perProvider.map(({ provider, change: c }) => (
                  <ListRow key={provider} end={c ? <Delta value={c.delta} suffix=" pp" /> : <span className="text-xs text-muted">alte întrebări</span>}>
                    {providerLabel(provider)}{" "}
                    {c ? <span className="num text-muted">{c.fromVis}% → {c.toVis}% pe aceleași {c.prompts} întrebări</span> : <span className="text-muted">nu se poate compara</span>}
                  </ListRow>
                ))}
              </ul>
            )}
            <h3 className="mt-6 text-sm font-semibold">Ce ai rezolvat ({data.counts.resolved})</h3>
            {data.resolved.length === 0 ? <p className="mt-2 text-sm text-muted">Nimic încă. Când marchezi o acțiune „Am rezolvat”, o vezi aici, cu vizibilitatea de atunci și de acum.</p> : (
              <ul className="mt-2 text-sm">
                {data.resolved.map((a) => (
                  <ListRow key={a.id} end={a.baselineVisibility !== null && now !== null ? <span className="num text-xs text-muted">atunci {a.baselineVisibility}% · acum {now}%</span> : undefined}>
                    {actionTitle(a)}
                    {a.resolvedAt && <span className="block text-xs text-muted">rezolvat pe {dateShort(a.resolvedAt)}</span>}
                  </ListRow>
                ))}
              </ul>
            )}
            {data.edits.approved > 0 && <p className="mt-2 text-sm">Corecturi de produs aprobate: <TextLink href="/panou/reparatii">{data.edits.approved}</TextLink></p>}
            <p className="mt-4 text-xs text-muted">Arătăm doar cifrele măsurate, ca să le poți verifica. AI-urile se schimbă și singure, deci nu orice creștere vine din ce ai reparat.</p>
          </>
        )}
      </Card>

      <Card title="Ce repari acum" description={<CardHelp id="vis.fixNow" />} action={<TextLink href="/panou/actiuni">Toate ({data.counts.open})</TextLink>}>
        <ul className="space-y-3">
          {data.prods.wrongPrice > 0 && (
            <li><SubCard>
              <Badge tone="bad">Prețuri</Badge>
              <h3 className="mt-2 font-semibold">AI-urile spun alt preț la {data.prods.wrongPrice} {data.prods.wrongPrice === 1 ? "produs" : "produse"}</h3>
              <p className="mt-1 text-sm text-muted">Vezi rândul exact din răspuns, apoi verifică prețul din feed și de pe pagina produsului.</p>
              <div className="mt-4"><ButtonLink href={links.wrongPrice} size="sm">Vezi produsele</ButtonLink></div>
            </SubCard></li>
          )}
          {data.prods.withoutStore > 0 && (
            <li><SubCard>
              <Badge tone="warn">Produse</Badge>
              <h3 className="mt-2 font-semibold">{data.prods.withoutStore} {data.prods.withoutStore === 1 ? "produs e numit" : "produse sunt numite"} fără magazinul tău</h3>
              <p className="mt-1 text-sm text-muted">AI-ul recomandă produsul, dar nu te dă pe tine ca loc de cumpărare.</p>
              <div className="mt-4"><ButtonLink href={links.withoutStore} size="sm" variant="secondary">Vezi produsele</ButtonLink></div>
            </SubCard></li>
          )}
          {data.edits.proposed > 0 && (
            <li><SubCard>
              <Badge tone="primary">Catalog</Badge>
              <h3 className="mt-2 font-semibold">{data.edits.proposed} corecturi de produs așteaptă aprobarea ta</h3>
              <div className="mt-4"><ButtonLink href="/panou/reparatii" size="sm" variant="secondary">Vezi corecturile</ButtonLink></div>
            </SubCard></li>
          )}
          {data.open.map((a) => (
            <li key={a.id}><SubCard>
              <Badge tone={impactTone(a.impact)}>Impact {a.impact}</Badge>
              <h3 className="mt-2 font-semibold">{actionTitle(a)}</h3>
              <p className="mt-1 text-sm text-muted">{a.why}</p>
              <div className="mt-4"><ButtonLink href={a.fixKind && a.fixKind !== "source" ? "/panou/audit#rezolva" : "/panou/actiuni"} size="sm" variant="secondary">Vezi pașii</ButtonLink></div>
            </SubCard></li>
          ))}
          {!data.open.length && !data.prods.wrongPrice && !data.prods.withoutStore && !data.edits.proposed && <li className="text-sm text-muted">Nimic urgent acum.</li>}
        </ul>
      </Card>
    </div>
  );
}

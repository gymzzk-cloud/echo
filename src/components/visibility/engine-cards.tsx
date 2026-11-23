import type { ReactNode } from "react";
import { providerLabel } from "@/core/ai/types";
import type { EngineView } from "@/core/engine-view";
import { engineVerdict } from "@/core/engine-view";
import { dateShort } from "@/lib/format";
import { Badge, Card, Delta, TextLink, type Tone } from "../ui";

/** Legăturile spre dovezi: fiecare cifră duce la răspunsurile sau produsele din care vine. */
export type EvidenceLinks = { answers: (ai: string, only?: "lipsesti" | "apari") => string; products: (ai: string, f?: "pret") => string; tone: (ai: string) => string; rivals: (ai: string) => string };

const toneWord = (s: number) => (s >= 20 ? "pozitiv" : s <= -20 ? "negativ" : "neutru");
const toneTone = (s: number): Tone => (s >= 20 ? "good" : s <= -20 ? "bad" : "warn");
const signed = (s: number) => (s > 0 ? `+${s}` : s < 0 ? `−${Math.abs(s)}` : "0");

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border py-3 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="num min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

function EngineCard({ e, links }: { e: EngineView; links: EvidenceLinks }) {
  const label = providerLabel(e.provider);
  if (!e.answers) {
    return (
      <Card title={label} action={<Badge tone="warn">Nu am putut întreba</Badge>}>
        <p className="text-sm">Motivul: {e.failure ?? "nu a răspuns în perioada aleasă"}.</p>
        <p className="mt-2 text-xs text-muted">Nu intră în cifre și nu înseamnă că lipsești. Încercăm din nou la următoarea rulare.</p>
      </Card>
    );
  }
  const state = e.hits ? <Badge tone="good">Te recomandă</Badge> : <Badge tone="bad">Nu te recomandă</Badge>;
  return (
    <Card title={label} action={state}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="num font-display text-3xl font-semibold">{e.visibility}%</span>
        <Delta value={e.delta} suffix=" pp" />
      </div>
      <p className="mt-1 text-xs text-muted" title="Variația e față de măsurătoarea dinainte">din răspunsuri te numesc</p>
      <dl className="mt-4">
        <Row label="Apari în">
          <TextLink href={links.answers(e.provider, "apari")}>{e.hits} din {e.answers} răspunsuri</TextLink>
        </Row>
        <Row label="Locul tău, în medie">{e.avgPosition !== null ? `#${e.avgPosition.toLocaleString("ro-RO")}` : "–"}</Row>
        <Row label="În locul tău">
          {e.instead ? <TextLink href={links.rivals(e.provider)}>{e.instead.name} ({e.instead.times}×)</TextLink> : <span className="text-muted">nimeni</span>}
        </Row>
        <Row label="Cel mai vizibil magazin">
          {e.leader ? <span>{e.leader.name} · {e.leader.visibility}%</span> : <span className="text-muted">–</span>}
        </Row>
        <Row label="Produse tale numite">
          {e.named ? <TextLink href={links.products(e.provider)}>{e.named}</TextLink> : <span className="text-muted">0</span>}
        </Row>
        <Row label="Prețuri greșite">
          {e.wrongPrice ? <TextLink href={links.products(e.provider, "pret")}><Badge tone="bad">{e.wrongPrice} {e.wrongPrice === 1 ? "produs" : "produse"}</Badge></TextLink> : <span className="text-muted">niciunul</span>}
        </Row>
        <Row label="Cum vorbește despre tine">
          {e.tone !== null ? <TextLink href={links.tone(e.provider)}><Badge tone={toneTone(e.tone)}>{toneWord(e.tone)} {signed(e.tone)}</Badge></TextLink> : <span className="text-muted">prea puține păreri</span>}
        </Row>
      </dl>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-xs text-muted">Ultima întrebare: {e.lastDay ? dateShort(e.lastDay) : "–"}</span>
        {e.hits < e.answers && <TextLink href={links.answers(e.provider, "lipsesti")} className="text-xs">Unde lipsești ({e.answers - e.hits})</TextLink>}
      </div>
      {e.failure && <p className="mt-2 text-xs text-warn">Ultima încercare nu a mers ({e.failure}); cifrele sunt din răspunsurile de dinainte.</p>}
    </Card>
  );
}

/** Verdictul și câte un card pe fiecare AI, unul lângă altul. */
export function EngineCards({ list, links, off }: { list: EngineView[]; links: EvidenceLinks; off: string[] }) {
  const v = engineVerdict(list, providerLabel);
  return (
    <div className="space-y-6">
      <Card>
        <div className="label">Pe scurt</div>
        <p className="font-display mt-1 text-2xl font-semibold">{v.headline}</p>
        <p className="mt-2 text-sm text-muted">
          {v.best && <>Cel mai bine stai la {v.best.name} ({v.best.visibility}% din răspunsuri). </>}
          {v.missing.length > 0 && <>Lipsești la: {v.missing.join(", ")}. </>}
          Fiecare cifră de mai jos are linkul ei: deschide-l ca să vezi răspunsurile exacte ale AI-ului.
        </p>
        {off.length > 0 && <p className="mt-2 text-xs text-muted">Nu le întrebăm încă (fără cheie): {off.join(", ")}. Le pornești din <TextLink href="/panou/setari" className="text-xs">Setări</TextLink>.</p>}
      </Card>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {list.map((e) => <EngineCard key={e.provider} e={e} links={links} />)}
      </div>
    </div>
  );
}

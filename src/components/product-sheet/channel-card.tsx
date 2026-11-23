import type { ReactNode } from "react";
import type { ChannelReport, CheckStatus, FieldCheck } from "@/core/product-sheet/channels";
import { Badge, Card, Notice, type Tone } from "@/components/ui";

/** Fișa produsului pe un canal (ChatGPT, Google, pagina): scorul, fiecare câmp exact cum îl trimitem și reparația lui. */

export const scoreTone = (s: number): Tone => (s >= 80 ? "good" : s >= 50 ? "warn" : "bad");
const STATUS: Record<CheckStatus, { tone: Tone; label: string }> = {
  ok: { tone: "good", label: "Bine" }, warn: { tone: "warn", label: "De îmbunătățit" }, bad: { tone: "bad", label: "Problemă" }, info: { tone: "muted", label: "Info" },
};

export function ScoreBadge({ report, notIncluded = "Nu intră" }: { report: ChannelReport | null; notIncluded?: string }) {
  if (!report) return <Badge>Neverificat</Badge>;
  if (!report.included) return <Badge tone="bad">{notIncluded}</Badge>;
  return <Badge tone={scoreTone(report.score)}>Scor {report.score} / 100</Badge>;
}

function Row({ c }: { c: FieldCheck }) {
  const s = STATUS[c.status];
  return (
    <li className="space-y-1 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{c.label} <span className="num text-xs font-normal text-muted">{c.field}</span></span>
        {c.status !== "info" && <Badge tone={s.tone}>{c.max ? `${s.label} · ${Math.min(c.points, c.max)}/${c.max}` : s.label}</Badge>}
      </div>
      <p className="break-all text-xs text-muted">{c.value}</p>
      {c.fix && <p className="text-sm">{c.fix}</p>}
    </li>
  );
}

export function ChannelCard({ title, description, report, status, action, footer, notIncluded }: {
  title: string; notIncluded?: string; description: ReactNode; report: ChannelReport | null; status?: ReactNode; action?: ReactNode; footer?: ReactNode;
}) {
  return (
    <Card title={title} action={<ScoreBadge report={report} notIncluded={notIncluded} />} description={description}>
      <div className="space-y-4">
        {status}
        {report && !report.included && <Notice tone="bad">{report.reason}</Notice>}
        {report?.included && <ul className="divide-y divide-border">{report.checks.map((c) => <Row key={c.field} c={c} />)}</ul>}
        {action}
        {footer && <p className="text-xs text-muted">{footer}</p>}
      </div>
    </Card>
  );
}

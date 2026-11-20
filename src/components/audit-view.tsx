import type { AuditResult } from "@/core/audit";
import { fixFor } from "@/core/audit/fixes";
import { Badge, Card, SubCard, statusLabel, statusTone } from "./ui";
import { CopyButton } from "./client";

const GROUPS: Record<string, string> = { acces: "Acces pentru AI", date: "Date structurate", continut: "Conținut", incredere: "Încredere", viteza: "Viteză" };

export function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = size / 2 - 8, c = 2 * Math.PI * r;
  const color = score >= 75 ? "var(--good)" : score >= 50 ? "var(--warn)" : "var(--bad)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Scor ${score} din 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="num" fontFamily="var(--font-display)" fontSize={size / 3.6} fontWeight="600" fill="var(--text)">{score}</text>
    </svg>
  );
}

type FixCtx = Parameters<typeof fixFor>[1];

export function AuditView({ audit, fixCtx, showFixes }: { audit: AuditResult; fixCtx: FixCtx; showFixes: boolean }) {
  const groups = Object.keys(GROUPS).map((g) => ({ g, checks: audit.checks.filter((c) => c.group === g) })).filter((x) => x.checks.length);
  const problems = audit.checks.filter((c) => c.status === "fail" || c.status === "warn");
  const kinds = [...new Set(problems.map((c) => c.fixKind).filter(Boolean) as string[])];
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-6">
          <ScoreRing score={audit.score} />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold">
              {audit.score >= 75 ? "AI-urile îți pot citi bine magazinul." : audit.score >= 50 ? "AI-urile te citesc parțial. Câteva reparații fac diferența." : "AI-urile au probleme serioase să-ți citească magazinul."}
            </div>
            <p className="mt-1 text-sm text-muted">{problems.length ? `${problems.length} lucruri de reparat` : "Nicio problemă găsită"} · platformă: {audit.platform ?? "necunoscută"} · {audit.url}</p>
            {audit.error && <p className="mt-2 text-sm text-bad">{audit.error}</p>}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {groups.map(({ g, checks }) => (
          <Card key={g} title={GROUPS[g]}>
            <ul>
              {checks.map((c) => (
                <li key={c.id} className="border-b border-border py-3 first:pt-0 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3"><span className="min-w-0 font-medium">{c.title}</span><Badge tone={statusTone(c.status)}>{statusLabel(c.status)}</Badge></div>
                  <p className="mt-1 text-sm text-muted">{c.detail}</p>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {audit.bots.length > 0 && (
        <Card title="Roboții AI în robots.txt">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {audit.bots.map((b) => (
              <SubCard key={b.ua} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0"><span className="font-medium">{b.ua}</span><span className="block text-xs text-muted">{b.vendor} · {b.purpose}</span></span>
                <Badge tone={b.robots === "allowed" ? "good" : b.robots === "partial" ? "warn" : b.important ? "bad" : "muted"}>{b.robots === "allowed" ? "Permis" : b.robots === "partial" ? "Parțial" : "Blocat"}</Badge>
              </SubCard>
            ))}
          </div>
        </Card>
      )}

      {showFixes && kinds.length > 0 && (
        <section id="rezolva" className="space-y-6">
          <h2 className="text-xl font-semibold">Rezolvă</h2>
          {kinds.map((k) => {
            const f = fixFor(k, fixCtx);
            if (!f) return null;
            return (
              <Card key={k} title={f.title} action={f.file && <Badge className="hidden sm:inline-flex">{f.file}</Badge>}>
                <ol className="list-decimal space-y-1 pl-6 text-sm">{f.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                {f.code && (
                  <div className="mt-4 rounded-lg border border-border bg-surface">
                    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-xs text-muted"><span>{f.codeLang}</span><CopyButton text={f.code} /></div>
                    <pre className="max-h-96 overflow-auto p-3 text-xs">{f.code}</pre>
                  </div>
                )}
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}

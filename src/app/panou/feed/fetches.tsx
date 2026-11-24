import { recentFetches } from "@/core/feed-fetches";
import { Badge, Table, Td, type Tone } from "@/components/ui";
import { dateTime, num } from "@/lib/format";

const OUTCOME: Record<string, { label: string; tone: Tone }> = {
  trimis: { label: "trimis complet", tone: "good" },
  verificat: { label: "doar verificare", tone: "good" },
  nemodificat: { label: "nemodificat (are deja ultima versiune)", tone: "good" },
  intrerupt: { label: "întrerupt de cel care descarcă", tone: "bad" },
  "in-generare": { label: "feed în generare (503)", tone: "warn" },
};

const mb = (b: number | null) => (b === null ? "–" : b >= 1e6 ? `${(b / 1e6).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} MB` : `${num(Math.round(b / 1000))} KB`);
const secs = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} s`);

/**
 * Ultimele descărcări ale feed-ului, din jurnalul nostru (KNOWLEDGE B58): dacă OpenAI arată o eroare și aici nu e
 * nicio cerere la ora aceea, OpenAI nici n-a cerut fișierul. Durata e măsurată de serverul Echo (fără trezirea serverului).
 */
export async function FeedFetches({ outputId, label }: { outputId: string; label: string }) {
  const rows = await recentFetches(outputId, 10);
  return (
    <div className="border-t border-border pt-6">
      <span className="label mb-2 block">Descărcări ale feed-ului ({label} și alții)</span>
      {!rows.length ? (
        <p className="text-sm text-muted">Nicio descărcare înregistrată încă. Le notăm de la 24.11.2026; cele mai vechi nu le avem aici.</p>
      ) : (
        <>
          <Table head={["Când", "Cine", "Rezultat", "Mărime", "Durată"]}>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <Td className="num whitespace-nowrap">{dateTime(r.at)}</Td>
                <Td>{r.bot}</Td>
                <Td><Badge tone={OUTCOME[r.outcome]?.tone ?? "muted"}>{OUTCOME[r.outcome]?.label ?? r.outcome}</Badge></Td>
                <Td className="num whitespace-nowrap">{mb(r.bytes)}{r.compressed ? " (.gz)" : ""}</Td>
                <Td className="num whitespace-nowrap">{secs(r.durationMs)}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-xs text-muted">Ultimele {rows.length} cereri, cele mai noi întâi (păstrăm 30 de zile). Dacă {label} arată o eroare la o oră la care aici nu apare nicio cerere, fișierul nici n-a fost cerut. Dacă serverul Echo doarme (planul gratuit), prima cerere așteaptă trezirea, aproape un minut.</p>
        </>
      )}
    </div>
  );
}

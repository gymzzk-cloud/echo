import { dateTime } from "@/lib/format";

/**
 * Sub cifrele calculate de worker (`panel_snapshots`): când au apărut date noi de la calcul, spune de când sunt
 * cifrele și că se refac acum; pagina se reîncarcă singură la final (JobWatcher). Când sunt la zi, nu arată nimic.
 */
export function SnapshotNote({ computedAt, stale }: { computedAt: Date | string; stale: boolean }) {
  if (!stale) return null;
  return <p className="mb-3 text-xs text-muted">Cifre calculate la {dateTime(computedAt)}. Au apărut date noi: le recalculăm acum, iar pagina se actualizează singură.</p>;
}

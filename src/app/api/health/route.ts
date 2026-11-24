/**
 * Verificare ușoară că serverul răspunde (fără bază de date, fără lucru). Folosită de trezirea de noapte
 * (.github/workflows/keep-awake.yml), ca OpenAI să găsească serverul pornit la actualizarea feed-ului (~02:00, ora României).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { Badge, Card, Empty } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { listWatches, userNotifications } from "@/core/watches";
import { money, dateShort } from "@/lib/format";
import { readNotifications, unwatch, updateWatch } from "@/app/actions-cont";
import { logout } from "@/app/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contul meu", robots: { index: false } };

export default async function Account() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const [watches, notes] = await Promise.all([listWatches(user.id), userNotifications(user.id)]);
  const lists = [...new Set(watches.map((w) => w.w.list))];
  const unread = notes.filter((n) => !n.read).length;
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="label">Contul meu</div>
            <h1 className="mt-1 text-3xl font-semibold">Produse urmărite</h1>
            <p className="mt-1 text-sm text-muted">Verificăm prețul și stocul în catalogul magazinelor de mai multe ori pe zi. Primești alertă aici și pe email ({user.email}).</p>
          </div>
          <form action={logout}><button className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface">Ieșire</button></form>
        </div>
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <section className="space-y-6">
            {watches.length === 0 && <Empty title="Nu urmărești încă niciun produs">Caută un produs și apasă „Urmărește” lângă rezultat. <Link href="/" className="text-primary underline">Caută acum</Link></Empty>}
            {lists.map((list) => (
              <Card key={list} title={list}>
                <ul className="divide-y divide-border">
                  {watches.filter((w) => w.w.list === list).map(({ w, p, store }) => (
                    <li key={w.id} className="flex flex-wrap items-center gap-4 py-3">
                      <div className="min-w-0 flex-1">
                        <a href={`/go/${p.id}`} className="font-medium hover:underline">{p.title}</a>
                        <div className="text-xs text-muted">{store.name} · urmărit din {dateShort(w.createdAt)}</div>
                      </div>
                      <div className="w-32 text-right">
                        <div className="num font-display font-semibold">{money(p.price, store.currency)}</div>
                        {p.inStock === false ? <Badge tone="bad">fără stoc</Badge> : <span className="text-xs text-good">în stoc</span>}
                      </div>
                      <form action={updateWatch} className="flex flex-wrap items-center gap-2 text-xs">
                        <input type="hidden" name="id" value={w.id} />
                        <label className="flex items-center gap-1">Țintă <input name="targetPrice" type="number" step="0.01" min="0" defaultValue={w.targetPrice ?? ""} className="w-24 rounded border border-border bg-bg px-2 py-1" aria-label="Preț țintă" /></label>
                        <label className="flex items-center gap-1">Listă <input name="list" defaultValue={w.list} className="w-24 rounded border border-border bg-bg px-2 py-1" /></label>
                        <label className="flex items-center gap-1"><input type="checkbox" name="notifyStock" defaultChecked={w.notifyStock} /> stoc</label>
                        <button className="rounded border border-border px-2 py-1 hover:bg-surface">Salvează</button>
                      </form>
                      <form action={unwatch}><input type="hidden" name="id" value={w.id} /><button className="text-xs text-muted hover:text-bad" aria-label={`Nu mai urmări ${p.title}`}>Șterge</button></form>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </section>
          <aside>
            <Card title={`Alerte${unread ? ` (${unread} noi)` : ""}`} action={unread ? <form action={readNotifications}><button className="text-xs text-primary">Marchează citite</button></form> : null}>
              {notes.length === 0 ? <p className="text-sm text-muted">Nicio alertă încă. Fără țintă, te anunțăm la o scădere de cel puțin 5%.</p> : (
                <ul className="space-y-3 text-sm">
                  {notes.map((n) => (
                    <li key={n.id} className={n.read ? "text-muted" : ""}>
                      {n.url ? <a href={n.url} className="hover:underline">{n.message}</a> : n.message}
                      <div className="text-xs text-muted">{dateShort(n.createdAt)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </aside>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}

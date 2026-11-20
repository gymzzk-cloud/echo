import Link from "next/link";
import { and, eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { BRAND } from "@/lib/brand";
import { isDemo } from "@/core/ai/engine";
import { PanelNav } from "@/components/panel-nav";
import { ThemeToggle } from "@/components/client";
import { Logo } from "@/components/ui";
import { logout, selectProject } from "@/app/actions";
import { getLang } from "@/lib/i18n";
import { setLang } from "@/app/actions-lang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Panou", robots: { index: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, org, role, project, projects } = await currentProject();
  const lang = await getLang();
  const [{ n }] = await db.select({ n: dsql<number>`count(*)::int` }).from(schema.alerts).where(and(eq(schema.alerts.projectId, project.id), eq(schema.alerts.read, false)));
  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[248px_1fr]" style={org.brandColor ? ({ "--primary": org.brandColor } as React.CSSProperties) : undefined}>
      {/* Meniul lateral închis la culoare, ca în ilustrații */}
      <aside className="bg-side text-side-fg lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-5">
          <Link prefetch={false} href="/panou"><Logo name={org.brandName ?? BRAND.name} dark /></Link>
        </div>
        <form action={selectProject} className="mx-4 mb-4 flex items-center gap-1">
          <label htmlFor="proj" className="sr-only">Magazin</label>
          <select id="proj" name="projectId" defaultValue={project.id} className="w-full min-w-0 rounded-lg border border-side-active bg-side-active px-2 py-2 text-sm text-side-fg">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="rounded-lg border border-side-active px-2 py-2 text-xs text-side-muted hover:text-side-fg">OK</button>
        </form>
        <div className="px-3 pb-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"><PanelNav alerts={n} agency={org.kind === "agency"} client={role === "client"} lang={lang} /></div>
        <div className="hidden space-y-1 border-t border-side-active px-5 py-4 text-xs text-side-muted lg:block">
          <Link prefetch={false} href="/panou/magazin-nou" className="block hover:text-side-fg">+ Adaugă magazin</Link>
          <div className="truncate">{user.email}</div>
          <form action={logout}><button className="hover:text-side-fg">Ieșire</button></form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-bg px-6 py-3">
          <span className="label truncate">{project.domain}{project.pathPrefix} · {project.country === "HU" ? "Ungaria" : "România"}</span>
          <div className="flex items-center gap-3 text-sm">
            {isDemo() && <span className="rounded-full bg-warn-bg px-2.5 py-1 text-xs font-medium text-warn">Mod demo: răspunsuri AI simulate</span>}
            <form action={setLang}><input type="hidden" name="lang" value={lang === "hu" ? "ro" : "hu"} /><button className="rounded-md px-2 py-1 text-xs font-medium text-muted hover:bg-surface">{lang === "hu" ? "RO" : "HU"}</button></form>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}

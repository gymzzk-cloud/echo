import Link from "next/link";
import { and, eq, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { BRAND } from "@/lib/brand";
import { isDemo } from "@/core/ai/engine";
import { PanelNav } from "@/components/panel-nav";
import { JobWatcher } from "@/components/job-watcher";
import { ProjectSwitcher, SubmitButton, ThemeToggle } from "@/components/client";
import { Badge, Logo } from "@/components/ui";
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
        <div className="flex items-center gap-3 px-4 pt-4 sm:px-6 lg:px-4">
          <Link prefetch={false} href="/panou" className="shrink-0"><Logo name={org.brandName ?? BRAND.name} dark /></Link>
          <div className="min-w-0 flex-1 lg:hidden"><ProjectSwitcher projects={projects} current={project.id} action={selectProject} /></div>
        </div>
        <div className="hidden px-4 pt-4 lg:block"><ProjectSwitcher projects={projects} current={project.id} action={selectProject} /></div>
        <div className="px-4 pb-2 pt-4 sm:px-6 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-3 lg:pb-4 lg:pt-6"><PanelNav alerts={n} agency={org.kind === "agency"} client={role === "client"} lang={lang} /></div>
        <div className="hidden space-y-2 border-t border-side-active px-4 py-4 text-xs text-side-muted lg:block">
          <Link prefetch={false} href="/panou/magazin-nou" className="block px-3 hover:text-side-fg">+ Adaugă magazin</Link>
          <div className="truncate px-3">{user.email}</div>
          <form action={logout}><SubmitButton variant="side" size="sm" pendingText="Ieșim…">Ieșire</SubmitButton></form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-bg px-4 py-2 sm:px-6 lg:px-8">
          <span className="label min-w-0 truncate">{project.domain}{project.pathPrefix} · {project.country === "HU" ? "Ungaria" : "România"}</span>
          <div className="flex shrink-0 items-center gap-2">
            {isDemo() && <Badge tone="warn"><span className="sm:hidden">Mod demo</span><span className="hidden sm:inline">Mod demo: răspunsuri AI simulate</span></Badge>}
            <form action={setLang}><input type="hidden" name="lang" value={lang === "hu" ? "ro" : "hu"} /><SubmitButton variant="ghost" size="sm" pendingText="…">{lang === "hu" ? "RO" : "HU"}</SubmitButton></form>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        <JobWatcher />
      </div>
    </div>
  );
}

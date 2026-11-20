import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { currentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { setLang } from "@/app/actions-lang";
import { ThemeToggle } from "./client";
import { Logo } from "./ui";

export async function PublicHeader() {
  const user = await currentUser();
  const { t, lang } = await getT();
  return (
    <header className="border-b border-border bg-bg">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/"><Logo name={BRAND.name} /></Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/" className="hidden rounded-md px-3 py-1.5 text-muted hover:bg-surface hover:text-fg sm:block">{t("nav.search")}</Link>
          <Link href="/pentru-magazine" className="rounded-md px-3 py-1.5 text-muted hover:bg-surface hover:text-fg">{t("nav.forStores")}</Link>
          <form action={setLang}>
            <input type="hidden" name="lang" value={lang === "hu" ? "ro" : "hu"} />
            <button className="rounded-md px-2 py-1.5 text-xs font-medium text-muted hover:bg-surface hover:text-fg" aria-label={lang === "hu" ? "Română" : "Magyar"}>{lang === "hu" ? "RO" : "HU"}</button>
          </form>
          <ThemeToggle />
          <Link href={user ? "/panou" : "/login"} className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-surface">{user ? t("nav.account") : t("nav.login")}</Link>
        </nav>
      </div>
    </header>
  );
}

export async function PublicFooter() {
  const { t } = await getT();
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-4 py-6 text-xs text-muted">
        <span>© {new Date().getFullYear()} {BRAND.name}. {t("footer.pay")}</span>
        <nav className="flex gap-4">
          <Link href="/cum-ordonam" className="hover:text-fg">{t("nav.ranking")}</Link>
          <Link href="/index-ai" className="hover:text-fg">{t("nav.index")}</Link>
          <Link href="/pentru-magazine" className="hover:text-fg">{t("nav.forStores")}</Link>
        </nav>
      </div>
    </footer>
  );
}

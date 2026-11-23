import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { currentUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { setLang } from "@/app/actions-lang";
import { SubmitButton, ThemeToggle } from "./client";
import { ButtonLink, btn, Logo } from "./ui";

export async function PublicHeader() {
  const user = await currentUser();
  const { t, lang } = await getT();
  return (
    <header className="border-b border-border bg-bg">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8">
        <Link prefetch={false} href="/" className="shrink-0"><Logo name={BRAND.name} /></Link>
        <nav className="flex min-w-0 flex-wrap items-center justify-end gap-1 text-sm">
          <Link prefetch={false} href="/" className={`${btn("ghost", "sm")} max-sm:hidden`}>{t("nav.search")}</Link>
          <Link prefetch={false} href="/pentru-magazine" className={btn("ghost", "sm")}>{t("nav.forStores")}</Link>
          <form action={setLang}>
            <input type="hidden" name="lang" value={lang === "hu" ? "ro" : "hu"} />
            <SubmitButton variant="ghost" size="sm" pendingText="…">{lang === "hu" ? "RO" : "HU"}</SubmitButton>
          </form>
          <ThemeToggle />
          <ButtonLink href={user ? "/panou" : "/login"} variant="secondary" size="sm">{user ? t("nav.account") : t("nav.login")}</ButtonLink>
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
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          <Link prefetch={false} href="/cum-ordonam" className="hover:text-fg">{t("nav.ranking")}</Link>
          <Link prefetch={false} href="/index-ai" className="hover:text-fg">{t("nav.index")}</Link>
          <Link prefetch={false} href="/pentru-magazine" className="hover:text-fg">{t("nav.forStores")}</Link>
          <Link prefetch={false} href="/conector" className="hover:text-fg">{t("nav.connector")}</Link>
          <Link prefetch={false} href="/confidentialitate" className="hover:text-fg">{t("nav.privacy")}</Link>
        </nav>
      </div>
    </footer>
  );
}

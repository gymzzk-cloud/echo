"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Linkul sau formularul duce la o pagină din aplicație (nu altă filă, nu descărcare, nu aceeași adresă). */
export function isInternalNav(href: string, current: string, origin: string) {
  const here = new URL(current, origin);
  let u: URL;
  try { u = new URL(href, here); } catch { return false; }
  if (u.origin !== origin) return false;
  return u.pathname + u.search !== here.pathname + here.search;
}

/**
 * Semnul imediat după orice clic care schimbă pagina din panou: linkuri, filtre (chips), paginare, căutări (formulare GET).
 * Fără el, pe serverul gratuit (0,15 procesor) clicul nu arăta nimic câteva secunde și părea că butonul nu merge.
 * Butoanele care pornesc o lucrare au deja starea lor (SubmitButton + JobWatcher); aici e doar schimbarea paginii.
 */
export function NavProgress() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [since, setSince] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pagina nouă a sosit: ascundem semnul.
  useEffect(() => { setSince(null); setSlow(false); }, [path, search]);

  useEffect(() => {
    const start = () => { setSince(Date.now()); setSlow(false); };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      if (isInternalNav(a.getAttribute("href") ?? "", location.pathname + location.search, location.origin)) start();
    };
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      // Formularele cu acțiuni de server au starea pe buton (SubmitButton); aici doar căutările (GET).
      const sub = e.submitter as HTMLButtonElement | null;
      if (f.method.toLowerCase() !== "get" || sub?.hasAttribute("formaction")) return;
      const target = new URL(f.getAttribute("action") || location.pathname, location.href);
      target.search = new URLSearchParams([...new FormData(f, sub)].map(([k, v]) => [k, String(v)])).toString();
      if (isInternalNav(target.pathname + target.search, location.pathname + location.search, location.origin)) start();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => { document.removeEventListener("click", onClick, true); document.removeEventListener("submit", onSubmit, true); };
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (since === null) return;
    timer.current = setTimeout(() => setSlow(true), 4000);
    // Siguranță: dacă navigarea a fost anulată (ex. clic din nou pe altceva), semnul nu rămâne la nesfârșit.
    const stop = setTimeout(() => setSince(null), 60_000);
    return () => { if (timer.current) clearTimeout(timer.current); clearTimeout(stop); };
  }, [since]);

  if (since === null) return null;
  return (
    <>
      <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-1 animate-pulse bg-primary" />
      <div role="status" aria-live="polite" className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-border bg-bg px-4 py-3 text-sm shadow-lg">
        <span aria-hidden className="size-3 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span>{slow ? "Se încarcă… durează mai mult decât de obicei, încă lucrăm." : "Se încarcă…"}</span>
      </div>
    </>
  );
}

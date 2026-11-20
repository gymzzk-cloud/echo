"use client";
import { useState } from "react";
import { cx } from "@/components/ui";

/** Sigla magazinului citită de pe site; dacă lipsește sau nu se încarcă, inițiala pe fond verde. */
export function StoreLogo({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  const ok = !!src && !broken && /^https?:\/\//.test(src);
  return (
    <span aria-hidden className={cx("grid h-12 min-w-12 max-w-28 shrink-0 place-items-center overflow-hidden rounded-lg sm:max-w-40", ok ? "border border-border bg-logo-bg px-2" : "bg-primary", className)}>
      {ok
        // eslint-disable-next-line @next/next/no-img-element -- adresă de pe site-ul magazinului, nu o optimizăm prin serverul nostru
        ? <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} className="ob-pop max-h-10 w-auto max-w-24 object-contain sm:max-w-36" />
        : <span className="font-display text-lg font-semibold text-primary-fg">{(name || "M")[0].toUpperCase()}</span>}
    </span>
  );
}

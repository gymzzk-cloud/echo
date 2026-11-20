"use client";
import { useState } from "react";
import { cx } from "@/components/ui";

/** Sigla magazinului citită de pe site; dacă lipsește sau nu se încarcă, inițiala pe fond verde. */
export function StoreLogo({ src, srcs, name, className }: { src?: string | null; srcs?: string[]; name: string; className?: string }) {
  // Încercăm pe rând adresele găsite; dacă niciuna nu se încarcă, rămâne inițiala.
  const list = (srcs?.length ? srcs : src ? [src] : []).filter((u) => /^https?:\/\//.test(u));
  const [k, setK] = useState(0);
  const cur = list[k];
  const ok = !!cur;
  return (
    <span aria-hidden className={cx("grid h-12 min-w-12 max-w-28 shrink-0 place-items-center overflow-hidden rounded-lg sm:max-w-40", ok ? "border border-border bg-logo-bg px-2" : "bg-primary", className)}>
      {ok
        // eslint-disable-next-line @next/next/no-img-element -- adresă de pe site-ul magazinului, nu o optimizăm prin serverul nostru
        ? <img src={cur} alt="" referrerPolicy="no-referrer" onError={() => setK((x) => x + 1)} className="ob-pop max-h-10 w-auto max-w-24 object-contain sm:max-w-36" />
        : <span className="font-display text-lg font-semibold text-primary-fg">{(name || "M")[0].toUpperCase()}</span>}
    </span>
  );
}

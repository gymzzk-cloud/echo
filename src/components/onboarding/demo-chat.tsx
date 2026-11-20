"use client";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui";

/** Exemplul de pe primul ecran: un răspuns AI care se scrie live și nu numește magazinul. Text fix, fără apeluri AI. */
const DEMO = [
  { ai: "ChatGPT", q: "De unde cumpăr o mașină de găurit cu acumulator?", a: ["Poți găsi modele bune la ", "*Dedeman", ", ", "*eMAG", " și ", "*Leroy Merlin", ". Compară garanția și dacă acumulatorul e inclus."] },
  { ai: "Gemini", q: "Ce magazin online are retur gratuit la electrocasnice?", a: ["Opțiuni populare în România sunt ", "*eMAG", ", ", "*Altex", " și ", "*Flanco", ". Verifică termenul de retur pentru produsele desigilate."] },
  { ai: "ChatGPT", q: "Unde găsesc cea mai bună ofertă la o canapea extensibilă?", a: ["Merită să te uiți la ", "*IKEA", ", ", "*Mobexpert", " și ", "*Jysk", ", care au des reduceri și livrare la domiciliu."] },
];

export function DemoChat({ store }: { store: string }) {
  const [k, setK] = useState(0);
  const [chars, setChars] = useState(0);
  const d = DEMO[k % DEMO.length];
  const full = d.a.map((x) => x.replace(/^\*/, "")).join("");
  const done = chars >= full.length;
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setChars(full.length); return; }
    const t = done ? setTimeout(() => { setK((x) => x + 1); setChars(0); }, 2800) : setTimeout(() => setChars((c) => c + 2), 22);
    return () => clearTimeout(t);
  }, [chars, done, full.length]);
  // Textul scris până acum, cu numele magazinelor îngroșate.
  let left = chars;
  const parts = d.a.map((x, i) => {
    const bold = x.startsWith("*");
    const t = bold ? x.slice(1) : x;
    const shown = t.slice(0, Math.max(0, left));
    left -= t.length;
    return bold ? <b key={i} className="font-semibold text-fg">{shown}</b> : <span key={i}>{shown}</span>;
  });
  return (
    <div className="flex min-h-80 min-w-0 flex-col gap-3 rounded-xl border border-border bg-bg p-4 sm:p-6" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-medium text-muted"><span aria-hidden className="size-2 rounded-full bg-primary" />{d.ai}</span>
        <span className="label">Exemplu</span>
      </div>
      <div className="self-end rounded-xl bg-primary-bg px-3 py-2 text-sm font-medium">{d.q}</div>
      <div className="min-h-24 rounded-xl bg-surface p-3 text-sm leading-6 text-muted">{parts}{!done && <span className="ob-caret" />}</div>
      {done && <Badge tone="bad" className="ob-pop self-start">{store} nu apare în răspuns</Badge>}
    </div>
  );
}

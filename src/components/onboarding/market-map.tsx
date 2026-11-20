"use client";
import { useState } from "react";
import { Badge, Button, Checkbox, cx } from "@/components/ui";
import GEO from "./geo.json";

type Market = "RO" | "HU";
const CITIES: Record<Market, string[]> = { RO: ["București", "Cluj-Napoca", "Timișoara", "Iași", "Brașov", "Constanța", "Oradea"], HU: ["Budapesta", "Debrecen", "Szeged"] };
const CODE: Record<string, Market> = { Romania: "RO", Hungary: "HU" };
const LABEL: Record<Market, string> = { RO: "România", HU: "Ungaria" };
const geo = GEO as { W: number; H: number; out: { id: string; n: string; d: string }[]; c: Record<string, number[]>; cen: Record<string, number[]> };

/**
 * Pasul „Piețe”: harta reală a regiunii (din date geografice), cu România și Ungaria de apăsat,
 * plus magazinul fizic și orașul pentru întrebările locale. Trimite câmpurile `markets`, `local`, `city`.
 */
export function MarketMap({ initial, initialCity, detected, store }: { initial: Market[]; initialCity?: string; detected: Market; store: string }) {
  const [mk, setMk] = useState<Record<Market, boolean>>({ RO: initial.includes("RO"), HU: initial.includes("HU") });
  const [local, setLocal] = useState(!!initialCity);
  const [city, setCity] = useState(initialCity ?? (detected === "HU" ? "Budapesta" : "București"));
  const toggle = (m: Market) => setMk((cur) => {
    const next = { ...cur, [m]: !cur[m] };
    return next.RO || next.HU ? next : cur; // cel puțin o piață
  });
  const cities = [...(mk.RO ? CITIES.RO : []), ...(mk.HU ? CITIES.HU : [])];
  const cityOk = cities.includes(city) ? city : cities[0];
  const markets = (["RO", "HU"] as Market[]).filter((m) => mk[m]);

  return (
    <div className="space-y-6">
      <input type="hidden" name="markets" value={markets.join("\n")} />
      {local && <input type="hidden" name="local" value="on" />}
      {local && <input type="hidden" name="city" value={cityOk} />}
      <div className="relative overflow-hidden rounded-xl border border-border bg-sea">
        <svg viewBox={`0 0 ${geo.W} ${geo.H}`} role="img" aria-label="Harta României, Ungariei și a țărilor vecine" className="ob-geo block h-auto w-full">
          {geo.out.map((f) => {
            const m = CODE[f.n];
            if (!m) return <path key={f.id} d={f.d} className="fill-land"><title>{f.n}</title></path>;
            return (
              <path key={f.id} d={f.d} role="button" tabIndex={0} aria-pressed={mk[m]} aria-label={LABEL[m]}
                className={cx("cursor-pointer outline-none focus-visible:opacity-80", mk[m] ? "fill-primary" : "fill-land hover:fill-primary-bg")}
                onClick={() => toggle(m)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(m); } }}>
                <title>{LABEL[m]}</title>
              </path>
            );
          })}
          {(Object.keys(CODE) as string[]).map((n) => {
            const m = CODE[n];
            const [x, y] = geo.cen[n];
            return <text key={n} x={x} y={y + (m === "RO" ? 14 : 6)} textAnchor="middle" className={cx("pointer-events-none font-display text-base font-semibold", mk[m] ? "fill-primary-fg" : "fill-muted")}>{LABEL[m]}</text>;
          })}
          {cities.map((c) => {
            const [x, y] = geo.c[c];
            const sel = local && cityOk === c;
            return (
              <g key={c} className="pointer-events-none">
                {sel && <circle cx={x} cy={y} r={7} className="ob-pulse fill-none stroke-primary-fg" strokeWidth={2} />}
                <circle cx={x} cy={y} r={sel ? 6 : 3.5} className={mk.RO || mk.HU ? "fill-primary-fg" : "fill-fg"} />
                {(sel || !local) && <text x={x + 9} y={y + 4} className="fill-primary-fg text-xs font-medium">{c}</text>}
              </g>
            );
          })}
        </svg>
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
          {mk.RO && <Badge tone="primary">România · română · lei</Badge>}
          {mk.HU && <Badge tone="primary">Ungaria · maghiară · forint</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-border bg-bg p-4 sm:p-6">
          {(["RO", "HU"] as Market[]).map((m) => (
            <Checkbox key={m} checked={mk[m]} onChange={() => toggle(m)}
              label={<span className="flex flex-wrap items-center gap-2 font-medium">{LABEL[m]}{detected === m && <Badge tone="primary">Detectat din {store}</Badge>}</span>}
              hint={m === "RO" ? "Întrebări în română, prețuri în lei." : "Întrebări în maghiară, prețuri în forint."} />
          ))}
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-bg p-4 sm:p-6">
          <Checkbox checked={local} onChange={(e) => setLocal(e.target.checked)} label={<span className="font-medium">Am magazin fizic sau ridicare personală</span>}
            hint={`Adăugăm întrebări locale, de exemplu „magazin în ${cityOk}”.`} />
          {local && (
            <div className="flex flex-wrap gap-2">
              {cities.map((c) => (
                <Button key={c} type="button" size="sm" variant={cityOk === c ? "primary" : "secondary"} aria-pressed={cityOk === c} onClick={() => setCity(c)}>{c}</Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Radar, ShoppingCart, Wrench, Settings, type LucideIcon } from "lucide-react";
import { cx } from "./ui";

type Item = readonly [href: string, label: string];
const GROUPS: { label: string; icon: LucideIcon; items: Item[]; hideForClient?: boolean }[] = [
  { label: "Vizibilitate", icon: Radar, items: [["/panou", "Acasă"], ["/panou/vizibilitate", "Vizibilitate AI"], ["/panou/produse", "Produse"], ["/panou/produse-ai", "Produse în AI"], ["/panou/surse", "Surse"], ["/panou/reputatie", "Ce spune AI-ul"], ["/panou/asistent", "Întreabă asistentul"]] },
  { label: "Vânzări", icon: ShoppingCart, items: [["/panou/vanzari", "Vânzări din AI"], ["/panou/recenzii", "Recenzii verificate"]] },
  { label: "Reparații", icon: Wrench, items: [["/panou/audit", "Audit tehnic"], ["/panou/actiuni", "Acțiuni"], ["/panou/reparatii", "Reparații produse"], ["/panou/roboti", "Roboții AI"], ["/panou/feed", "Feed și canale"], ["/panou/agent-gate", "Agent Gate"]] },
  { label: "Cont", icon: Settings, items: [["/panou/rapoarte", "Rapoarte"], ["/panou/setari", "Setări magazin"], ["/panou/dezvoltatori", "API și MCP"], ["/panou/cont", "Echipă și abonament"]], hideForClient: true },
];

const HU: Record<string, string> = {
  Vizibilitate: "Láthatóság", Vânzări: "Eladások", Reparații: "Javítások", Cont: "Fiók",
  "Acasă": "Kezdőlap", "Vizibilitate AI": "AI-láthatóság", Produse: "Termékek", "Produse în AI": "Termékek az AI-ban", Surse: "Források", "Ce spune AI-ul": "Mit mond az AI", "Întreabă asistentul": "Kérdezd az asszisztenst",
  "Vânzări din AI": "Eladások AI-ból", "Recenzii verificate": "Ellenőrzött vélemények", "Audit tehnic": "Technikai audit", "Acțiuni": "Teendők", "Reparații produse": "Termékjavítások", "Roboții AI": "AI-robotok",
  "Feed și canale": "Feed és csatornák", "Agent Gate": "Agent Gate", Rapoarte: "Jelentések", "Setări magazin": "Webshop beállítások", "API și MCP": "API és MCP",
  "Echipă și abonament": "Csapat és előfizetés", "Toți clienții": "Összes ügyfél",
};

/**
 * Meniul panoului (DESIGN §7). Pe ecran mare: grupuri cu titlu de secțiune (icon, text deschis și gros), paginile indentate sub el.
 * Pe telefon și tabletă: o bandă cu grupurile ca file, iar dedesubt paginile grupului deschis.
 */
export function PanelNav({ alerts, agency, client, lang = "ro" }: { alerts: number; agency?: boolean; client?: boolean; lang?: "ro" | "hu" }) {
  const path = usePathname();
  const tr = (s: string) => (lang === "hu" ? HU[s] ?? s : s);
  const groups = GROUPS.filter((g) => !(client && g.hideForClient)).map((g) => g.label === "Vizibilitate" && agency && !client ? { ...g, items: [["/panou/clienti", "Toți clienții"] as Item, ...g.items] } : g);
  const isActive = (href: string) => (href === "/panou" ? path === href : path === href || path.startsWith(`${href}/`));
  const current = groups.find((g) => g.items.some(([href]) => isActive(href))) ?? groups[0];
  const link = ([href, label]: Item) => {
    const active = isActive(href);
    return (
      <Link key={href} href={href} prefetch={false} aria-current={active ? "page" : undefined}
        className={cx("flex min-h-11 items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 text-sm lg:min-h-9", active ? "bg-side-active font-semibold text-side-fg" : "text-side-muted hover:bg-side-active hover:text-side-fg")}>
        {tr(label)}
        <Pending />
        {href === "/panou" && alerts > 0 && <span className="rounded-full bg-bad px-2 text-xs font-semibold text-primary-fg">{alerts}</span>}
      </Link>
    );
  };
  return (
    <nav aria-label="Panou">
      {/* Telefon și tabletă: grupurile ca file, apoi paginile grupului */}
      <div className="lg:hidden">
        <div className="flex gap-1 overflow-x-auto border-b border-side-active">
          {groups.map((g) => {
            const on = g === current;
            return (
              <Link key={g.label} href={g.items[0][0]} prefetch={false} aria-current={on ? "true" : undefined}
                className={cx("-mb-px flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-semibold", on ? "border-primary text-side-fg" : "border-transparent text-side-muted hover:text-side-fg")}>
                <g.icon aria-hidden className="size-4" />{tr(g.label)}
              </Link>
            );
          })}
        </div>
        <div className="flex gap-1 overflow-x-auto pt-2">{current.items.map(link)}</div>
      </div>
      {/* Ecran mare: grupuri cu antet de secțiune */}
      <div className="hidden space-y-6 lg:block">
        {groups.map((g) => (
          <div key={g.label}>
            <div className={cx("mb-1 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wider", g === current ? "text-side-fg" : "text-side-fg/80")}>
              <g.icon aria-hidden className="size-4" />{tr(g.label)}
            </div>
            <div className="ml-3 space-y-1 border-l border-side-active pl-2">{g.items.map(link)}</div>
          </div>
        ))}
      </div>
    </nav>
  );
}

/** Semn imediat la clic, cât timp pagina se încarcă (fără să mai pară că meniul „nu face nimic”). */
function Pending() {
  const { pending } = useLinkStatus();
  return pending ? <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-side-muted border-t-transparent" /> : null;
}

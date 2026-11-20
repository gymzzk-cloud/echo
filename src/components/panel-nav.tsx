"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

type Item = readonly [href: string, label: string];
const GROUPS: { label: string; items: Item[]; hideForClient?: boolean }[] = [
  { label: "Vizibilitate", items: [["/panou", "Acasă"], ["/panou/vizibilitate", "Vizibilitate AI"], ["/panou/produse", "Produse"], ["/panou/surse", "Surse"], ["/panou/reputatie", "Ce spune AI-ul"], ["/panou/asistent", "Întreabă asistentul"]] },
  { label: "Vânzări", items: [["/panou/vanzari", "Vânzări din AI"], ["/panou/recenzii", "Recenzii verificate"]] },
  { label: "Reparații", items: [["/panou/audit", "Audit tehnic"], ["/panou/actiuni", "Acțiuni"], ["/panou/roboti", "Roboții AI"], ["/panou/feed", "Feed și canale"], ["/panou/agent-gate", "Agent Gate"]] },
  { label: "Cont", items: [["/panou/rapoarte", "Rapoarte"], ["/panou/setari", "Setări magazin"], ["/panou/dezvoltatori", "API și MCP"], ["/panou/cont", "Echipă și abonament"]], hideForClient: true },
];

const HU: Record<string, string> = {
  Vizibilitate: "Láthatóság", Vânzări: "Eladások", Reparații: "Javítások", Cont: "Fiók",
  "Acasă": "Kezdőlap", "Vizibilitate AI": "AI-láthatóság", Produse: "Termékek", Surse: "Források", "Ce spune AI-ul": "Mit mond az AI", "Întreabă asistentul": "Kérdezd az asszisztenst",
  "Vânzări din AI": "Eladások AI-ból", "Recenzii verificate": "Ellenőrzött vélemények", "Audit tehnic": "Technikai audit", "Acțiuni": "Teendők", "Roboții AI": "AI-robotok",
  "Feed și canale": "Feed és csatornák", "Agent Gate": "Agent Gate", Rapoarte: "Jelentések", "Setări magazin": "Webshop beállítások", "API și MCP": "API és MCP",
  "Echipă și abonament": "Csapat és előfizetés", "Toți clienții": "Összes ügyfél",
};

export function PanelNav({ alerts, agency, client, lang = "ro" }: { alerts: number; agency?: boolean; client?: boolean; lang?: "ro" | "hu" }) {
  const path = usePathname();
  const tr = (s: string) => (lang === "hu" ? HU[s] ?? s : s);
  const groups = GROUPS.filter((g) => !(client && g.hideForClient)).map((g) => g.label === "Vizibilitate" && agency && !client ? { ...g, items: [["/panou/clienti", "Toți clienții"] as Item, ...g.items] } : g);
  return (
    <nav aria-label="Panou" className="flex gap-4 overflow-x-auto lg:flex-col lg:gap-4 lg:overflow-visible">
      {groups.map((g) => (
        <div key={g.label} className="flex gap-1 lg:flex-col">
          <div className="label hidden px-3 pb-1 text-[10px] text-side-muted lg:block">{tr(g.label)}</div>
          {g.items.map(([href, label]) => {
            const active = href === "/panou" ? path === href : path.startsWith(href);
            return (
              <Link key={href} href={href} prefetch={false} aria-current={active ? "page" : undefined}
                className={cx("flex items-center justify-between whitespace-nowrap rounded-lg px-3 py-2 text-[14px]", active ? "bg-side-active font-semibold text-side-fg" : "text-side-muted hover:bg-side-active hover:text-side-fg")}>
                {tr(label)}
                <Pending />
                {href === "/panou" && alerts > 0 && <span className="ml-2 rounded-full bg-bad px-1.5 text-[10px] font-semibold text-white">{alerts}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Semn imediat la clic, cât timp pagina se încarcă (fără să mai pară că meniul „nu face nimic”). */
function Pending() {
  const { pending } = useLinkStatus();
  return pending ? <span aria-hidden className="ml-2 size-3 animate-spin rounded-full border-2 border-side-muted border-t-transparent" /> : null;
}

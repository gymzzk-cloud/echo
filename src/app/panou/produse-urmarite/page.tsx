import { currentProject } from "@/lib/project";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { findCatalogProducts } from "@/core/product-sheet/read";
import { monthlyCostEstimate, trackedProductList, type TrackedStatus } from "@/core/tracked-products";
import { promptLimit } from "@/core/prompts";
import { activeProviders, projectUsageThisMonth } from "@/core/ai/engine";
import { costConfig } from "@/core/ai/budget";
import { SubmitButton } from "@/components/client";
import { CardHelp } from "@/components/card-help";
import { Badge, Button, Card, Checkbox, Input, Notice, PageHeader, Stat, Table, Td, Textarea, TextLink } from "@/components/ui";
import { money, num } from "@/lib/format";
import { addTracked, addTrackedCodes, removeTracked } from "@/app/actions-tracked";

type Sp = { cauta?: string; adaugate?: string; peste?: string; deja?: string; negasite?: string; negasiteN?: string; scoase?: string };

const STATUS: Record<TrackedStatus, { label: string; tone: "good" | "muted" | "warn" }> = {
  ales: { label: "Ales de tine", tone: "good" }, automat: { label: "Propus automat", tone: "muted" }, scos: { label: "Scos", tone: "warn" },
};

/**
 * Produse urmărite: magazinul alege din catalog ce produse întrebăm AI-urile direct (cod, EAN, nume sau listă de coduri),
 * le scoate sau le adaugă înapoi. Lista intră în rularea programată obișnuită: aceeași limită pe plan și același buget.
 * Pagina citește doar lista (cel mult 1000 de rânduri) și cel mult 10 rezultate de căutare, nimic pe tot catalogul.
 */
export default async function TrackedProducts({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const { project, role } = await currentProject();
  const canWrite = role !== "viewer" && role !== "client";
  const q = (sp.cauta ?? "").trim().slice(0, 100);
  const [list, hits, [org], usage] = await Promise.all([
    trackedProductList(project.id),
    q ? findCatalogProducts(project.id, q) : Promise.resolve(null),
    db.select({ plan: schema.orgs.plan }).from(schema.orgs).where(eq(schema.orgs.id, project.orgId)),
    projectUsageThisMonth(project.id),
  ]);
  const limit = promptLimit(org?.plan ?? "trial");
  const providers = activeProviders().filter((p) => !p.off).length;
  const cfg = costConfig();
  const cost = monthlyCostEstimate(list.activePrompts, providers, cfg.runEveryDays, usage);
  const room = Math.max(0, limit - list.manualActive);
  const active = list.items.filter((i) => i.status !== "scos");
  const removed = list.items.filter((i) => i.status === "scos");
  const chosen = new Set(active.filter((i) => i.status === "ales").map((i) => i.productId));
  const hidden = <input type="hidden" name="projectId" value={project.id} />;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Vizibilitate" title="Produse urmărite" subtitle="Alegi tu ce produse din catalog întrebăm AI-urile, la fiecare rulare programată. Tu știi cel mai bine ce produse contează." />

      <Feedback sp={sp} limit={limit} />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Alese de tine" value={`${num(list.manualActive)} / ${num(limit)}`} hint={room ? `mai poți adăuga ${num(room)} (produse și întrebări alese de tine)` : "ai atins limita planului"} />
        <Stat label="Propuse automat" value={num(active.length - chosen.size)} hint="cele mai vândute, din fiecare categorie, în locurile libere" />
        <Stat label="Întrebări pe rulare" value={num(list.activePrompts * providers)} hint={`${num(list.activePrompts)} întrebări × ${providers} AI-uri, o dată la ${cfg.runEveryDays} zile`} />
        <Stat label="Cost estimat pe lună" value={cost ? `$${cost.usd.toFixed(2)}` : "–"} hint={cost ? `din costul mediu de luna asta; plafon ${cfg.monthlyBudgetUsd ? `$${cfg.monthlyBudgetUsd}` : "fără"}, peste el nu mai întrebăm` : "după primele întrebări de luna asta"} />
      </div>

      {canWrite && (
        <Card title="Adaugă produse" description={<CardHelp id="tracked.add" />}>
          <form role="search" className="grid items-start gap-2 md:grid-cols-[1fr_auto]">
            <label htmlFor="cauta" className="sr-only">Cod, EAN, cod producător sau nume</label>
            <Input id="cauta" name="cauta" defaultValue={q} placeholder="ex. 24924, un EAN sau „GBH 4-32”" />
            <Button type="submit" variant="secondary">Caută</Button>
          </form>
          {hits && (hits.length ? (
            <form action={addTracked} className="mt-4 space-y-3">
              {hidden}<input type="hidden" name="cauta" value={q} />
              <ul className="divide-y divide-border">
                {hits.map((h) => (
                  <li key={h.id} className="flex items-start justify-between gap-3 py-1">
                    <Checkbox name="productId" value={h.id} disabled={chosen.has(h.id)} defaultChecked={hits.length === 1 && !chosen.has(h.id)} className="min-w-0 flex-1"
                      label={<span className="font-medium">{h.title}</span>}
                      hint={<span className="num break-all">{[`Cod ${h.externalId}`, h.mpn && h.mpn !== h.externalId && `Cod producător ${h.mpn}`, h.gtin && `EAN ${h.gtin}`, h.brand, money(h.price, h.currency)].filter(Boolean).join(" · ")}</span>} />
                    <span className="pt-2">{chosen.has(h.id) ? <Badge tone="good">Urmărit</Badge> : !h.inStock && <Badge tone="warn">Fără stoc</Badge>}</span>
                  </li>
                ))}
              </ul>
              <SubmitButton pendingText="Adaug…" disabled={!room}>Adaugă produsele bifate</SubmitButton>
            </form>
          ) : <p className="mt-4 text-sm text-muted">Niciun produs din catalog pentru „{q}”. Verifică codul sau încearcă o parte din nume.</p>)}
          <form action={addTrackedCodes} className="mt-6 space-y-2 border-t border-border pt-4">
            {hidden}
            <label htmlFor="codes" className="text-sm font-medium">Sau lipește o listă de coduri</label>
            <Textarea id="codes" name="codes" rows={4} placeholder={"24924\n5901234123457\n0611332100"} />
            <p className="text-xs text-muted">Cod din catalog, EAN sau cod producător, câte unul pe rând (sau cu virgulă). Adăugăm până la limita planului și îți spunem ce n-am găsit.</p>
            <SubmitButton variant="secondary" pendingText="Adaug…" disabled={!room}>Adaugă din listă</SubmitButton>
          </form>
        </Card>
      )}

      <Card title={`Lista ta: ${num(active.length)} produse`} description={<CardHelp id="tracked.list" />}>
        {active.length ? (
          <form className="space-y-4">
            {hidden}
            <Table head={["", "Produs", "Preț", "Stare"]}>
              {active.map((i) => (
                <tr key={i.productId}>
                  <Td className="w-8">{canWrite && <Checkbox name="productId" value={i.productId!} className="py-0" label={<span className="sr-only">Bifează {i.title}</span>} />}</Td>
                  <Td className="min-w-56">
                    <TextLink href={`/panou/produse-ai/${i.productId}`} className="font-medium">{i.title}</TextLink>
                    <span className="num block break-all text-xs text-muted">{[`Cod ${i.externalId}`, i.gtin && `EAN ${i.gtin}`, i.brand, i.rank && `Top vânzări #${i.rank}`].filter(Boolean).join(" · ")}</span>
                  </Td>
                  <Td className="num whitespace-nowrap text-right">{money(i.price, i.currency)}</Td>
                  <Td><div className="flex flex-wrap gap-1"><Badge tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Badge>{!i.inStock && <Badge tone="warn">Fără stoc</Badge>}</div></Td>
                </tr>
              ))}
            </Table>
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                <SubmitButton formAction={removeTracked} variant="secondary" pendingText="Scot…">Scoate bifate</SubmitButton>
                <SubmitButton formAction={addTracked} variant="secondary" pendingText="Păstrez…" disabled={!room}>Păstrează bifate (alese de tine)</SubmitButton>
              </div>
            )}
          </form>
        ) : <p className="text-sm text-muted">Încă nu urmărim niciun produs direct. Caută mai sus produsele importante pentru tine.</p>}
        <p className="mt-4 text-xs text-muted">Pentru fiecare produs întrebăm AI-urile numele lui, cum l-ar căuta un client. Rezultatele apar în <TextLink href="/panou/produse-ai" className="text-xs">Produse în AI</TextLink> după următoarea rulare programată. O întrebare pusă azi pentru alt magazin nu se plătește din nou.</p>
      </Card>

      {removed.length > 0 && (
        <Card title={`Scoase de tine: ${num(removed.length)}`} description={<CardHelp id="tracked.removed" />}>
          <form action={addTracked} className="space-y-3">
            {hidden}
            <ul className="divide-y divide-border">
              {removed.map((i) => (
                <li key={i.productId}>
                  {canWrite
                    ? <Checkbox name="productId" value={i.productId!} label={i.title} hint={<span className="num">Cod {i.externalId}</span>} />
                    : <p className="py-2 text-sm">{i.title} <span className="num text-xs text-muted">· Cod {i.externalId}</span></p>}
                </li>
              ))}
            </ul>
            {canWrite && <SubmitButton variant="secondary" pendingText="Adaug…" disabled={!room}>Adaugă înapoi bifate</SubmitButton>}
          </form>
        </Card>
      )}
    </div>
  );
}

/** Rezultatul ultimei acțiuni, din adresa paginii (după redirect), cu ce nu a încăput sau nu s-a găsit. */
function Feedback({ sp, limit }: { sp: Sp; limit: number }) {
  const added = Number(sp.adaugate ?? NaN), over = Number(sp.peste ?? 0), missN = Number(sp.negasiteN ?? 0), removed = Number(sp.scoase ?? NaN);
  if (Number.isFinite(removed)) return <Notice tone="good">{removed === 1 ? "Am scos produsul. Nu îl mai întrebăm, iar locul lui e liber." : `Am scos ${removed} produse. Nu le mai întrebăm, iar locul lor e liber.`}</Notice>;
  if (!Number.isFinite(added)) return null;
  return (
    <div className="space-y-2">
      <Notice tone={added ? "good" : "warn"}>
        {added ? `Am adăugat ${added} ${added === 1 ? "produs" : "produse"}. Le întrebăm la următoarea rulare programată.` : "N-am adăugat niciun produs nou."}
        {Number(sp.deja) > 0 && ` ${sp.deja} erau deja în listă.`}
      </Notice>
      {over > 0 && <Notice tone="warn">{over} {over === 1 ? "produs n-a încăput" : "produse n-au încăput"}: planul tău urmărește cel mult {limit} produse și întrebări alese de tine. Scoate câteva ca să faci loc.</Notice>}
      {missN > 0 && <Notice tone="warn">N-am găsit în catalog {missN} {missN === 1 ? "cod" : "coduri"}: <span className="num break-all">{sp.negasite}{missN > 20 ? "…" : ""}</span></Notice>}
    </div>
  );
}

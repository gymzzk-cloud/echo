import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentProject } from "@/lib/project";
import { ActionForm } from "@/components/forms";
import { SubmitButton } from "@/components/client";
import { Badge, Card, Empty, Field, Input, PageHeader, Table, Td } from "@/components/ui";
import { CHANNELS, buildFeed } from "@/core/feed";
import { addRule, deleteRule, proposeTitles, setEditStatus, toggleChannel, toggleRule } from "@/app/actions-feed";
import { money } from "@/lib/format";

const OPS: Record<string, string> = { eq: "este", neq: "nu este", contains: "conține", lt: "mai mic decât", gt: "mai mare decât", empty: "lipsește", not_empty: "există" };
const FIELD_LABEL: Record<string, string> = { title: "Titlu", description: "Descriere", brand: "Marcă", category: "Categorie", gtin: "GTIN/EAN", price: "Preț", inStock: "În stoc (da/nu)", label: "Etichetă" };
const ACT: Record<string, string> = { set: "setează", prefix: "adaugă în față", suffix: "adaugă la final", exclude: "exclude produsul", label: "adaugă eticheta" };
const LABELS: Record<string, string> = { recomandat_ai: "Recomandat de AI", popular: "Popular", zombie: "Fără vânzări / fără AI", in_stoc: "În stoc", fara_stoc: "Fără stoc", pret_cel_mai_bun: "Cel mai bun preț", pret_in_piata: "Preț în piață", pret_peste_piata: "Peste piață", date_lipsa: "Date lipsă" };
const sel = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm";

export default async function FeedPage() {
  const { project } = await currentProject();
  const outputs = await db.select().from(schema.feedOutputs).where(eq(schema.feedOutputs.projectId, project.id));
  const rules = await db.select().from(schema.feedRules).where(eq(schema.feedRules.projectId, project.id)).orderBy(schema.feedRules.priority);
  const edits = await db.select({ e: schema.productEdits, p: schema.products }).from(schema.productEdits).innerJoin(schema.products, eq(schema.products.id, schema.productEdits.productId))
    .where(and(eq(schema.products.projectId, project.id))).orderBy(desc(schema.productEdits.createdAt)).limit(200);
  // Un singur calcul pentru tot catalogul: etichetele și previzualizarea vin din același feed.
  const feed = await buildFeed(project.id, "google");
  const counts = new Map<string, number>();
  for (const l of feed.labels.values()) for (const x of l) counts.set(x, (counts.get(x) ?? 0) + 1);
  const preview = feed.items;
  const total = feed.total;
  const app = process.env.APP_URL ?? "http://localhost:3000";
  const proposed = edits.filter((x) => x.e.status === "propus");
  const pid = <input type="hidden" name="projectId" value={project.id} />;

  return (
    <>
      <PageHeader eyebrow="Reparații" title="Feed și canale" subtitle="Un singur catalog, optimizat automat pentru fiecare canal. Catalogul tău nu se modifică: regulile și titlurile aprobate se aplică doar în feed și se pot anula oricând." />
      {total === 0 ? <Empty title="Nu există încă produse">Conectează catalogul din Setări magazin.</Empty> : (
      <div className="space-y-6">
        <Card title="Etichete automate">
          <p className="mb-3 text-sm text-muted">Calculate din ce văd AI-urile, din clicuri și din prețurile altor magazine pentru același GTIN. Le primești în feed ca custom_label, pentru campanii separate.</p>
          <div className="flex flex-wrap gap-2">{[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => <Badge key={k} tone={k === "recomandat_ai" || k === "pret_cel_mai_bun" ? "good" : k === "zombie" || k === "pret_peste_piata" || k === "date_lipsa" ? "warn" : "muted"}>{LABELS[k] ?? k}: {n}</Badge>)}</div>
        </Card>

        <Card title="Canale">
          <Table head={["Canal", "Format", "Adresa feed-ului", ""]}>
            {CHANNELS.map((c) => {
              const o = outputs.find((x) => x.channel === c.id);
              return (
                <tr key={c.id}>
                  <Td className="font-medium">{c.name}</Td>
                  <Td className="text-xs uppercase text-muted">{c.format}</Td>
                  <Td>{o?.active ? <code className="break-all text-xs">{app}/feed/{o.token}</code> : <span className="text-xs text-muted">oprit</span>}</Td>
                  <Td><form action={toggleChannel}>{pid}<input type="hidden" name="channel" value={c.id} /><button className="text-sm text-primary hover:underline">{o?.active ? "Oprește" : "Pornește"}</button></form></Td>
                </tr>
              );
            })}
          </Table>
          <p className="mt-3 text-xs text-muted">Adresa e secretă: o lipești în Merchant Center, Commerce Manager, TikTok, Compari etc. Feed-ul se regenerează la fiecare descărcare (cache 15 minute). Feed-ul OpenAI este pregătit pentru momentul în care ChatGPT acceptă magazine din RO/HU.</p>
        </Card>

        <Card title={`Titluri optimizate${proposed.length ? ` (${proposed.length} de aprobat)` : ""}`} action={<form action={proposeTitles}>{pid}<button className="text-sm text-primary hover:underline">Caută titluri de îmbunătățit</button></form>}>
          {edits.length === 0 ? <p className="text-sm text-muted">Analizăm titlurile: marca lipsă, majuscule, categoria. AI-urile recomandă mai des produsele cu titluri clare „Marcă + tip + atribut”.</p> : (
            <>
              {proposed.length > 1 && <form action={setEditStatus} className="mb-3">{pid}<input type="hidden" name="status" value="aprobat" />{proposed.map((x) => <input key={x.e.id} type="hidden" name="id" value={x.e.id} />)}<button className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg">Aprobă toate ({proposed.length})</button></form>}
              <Table head={["Înainte", "Propus", "Stare", ""]}>
                {edits.slice(0, 40).map(({ e }) => (
                  <tr key={e.id}>
                    <Td className="text-muted">{e.previous}</Td>
                    <Td className="font-medium">{e.value}</Td>
                    <Td><Badge tone={e.status === "aprobat" ? "good" : e.status === "respins" ? "muted" : "warn"}>{e.status}</Badge></Td>
                    <Td className="whitespace-nowrap">
                      {e.status === "propus" ? (<>
                        <form action={setEditStatus} className="inline">{pid}<input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="aprobat" /><button className="text-sm text-primary">Aprobă</button></form>{" · "}
                        <form action={setEditStatus} className="inline">{pid}<input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="respins" /><button className="text-sm text-muted">Respinge</button></form>
                      </>) : <form action={setEditStatus}>{pid}<input type="hidden" name="id" value={e.id} /><input type="hidden" name="status" value="propus" /><button className="text-sm text-muted hover:text-fg">Anulează</button></form>}
                    </Td>
                  </tr>
                ))}
              </Table>
            </>
          )}
        </Card>

        <Card title="Reguli">
          {rules.length > 0 && (
            <Table head={["Regulă", "Dacă", "Atunci", "Canal", ""]}>
              {rules.map((r) => (
                <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                  <Td className="font-medium">{r.name}</Td>
                  <Td className="text-sm">{r.conditions.map((c, i) => <div key={i}>{FIELD_LABEL[c.field] ?? c.field} {OPS[c.op]} {c.value && <b>{LABELS[c.value] ?? c.value}</b>}</div>)}</Td>
                  <Td className="text-sm">{r.actions.map((a, i) => <div key={i}>{ACT[a.type]} {a.field && a.type !== "label" ? FIELD_LABEL[a.field]?.toLowerCase() : ""} {a.value && <b>„{a.value}”</b>}</div>)}</Td>
                  <Td className="text-xs text-muted">{r.channels.length ? r.channels.join(", ") : "toate"}</Td>
                  <Td className="whitespace-nowrap">
                    <form action={toggleRule} className="inline">{pid}<input type="hidden" name="id" value={r.id} /><button className="text-sm text-primary">{r.active ? "Oprește" : "Pornește"}</button></form>{" · "}
                    <form action={deleteRule} className="inline">{pid}<input type="hidden" name="id" value={r.id} /><button className="text-sm text-muted hover:text-bad">Șterge</button></form>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <ActionForm action={addRule} className="mt-4 grid gap-3 md:grid-cols-4">
            {pid}
            <div className="md:col-span-4"><Field label="Numele regulii"><Input name="name" placeholder="ex. Exclude produsele fără stoc din Meta" required /></Field></div>
            <Field label="Dacă"><select name="field" className={sel}>{Object.entries(FIELD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Condiție"><select name="op" className={sel}>{Object.entries(OPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Valoare" hint="Pentru etichete: recomandat_ai, zombie, fara_stoc…"><Input name="value" /></Field>
            <Field label="Canal"><select name="channel" className={sel}><option value="">Toate</option>{CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Atunci"><select name="type" className={sel}>{Object.entries(ACT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Câmpul"><select name="actionField" className={sel}><option value="">–</option>{["title", "description", "brand", "category", "price"].map((k) => <option key={k} value={k}>{FIELD_LABEL[k]}</option>)}</select></Field>
            <Field label="Text / valoare"><Input name="actionValue" placeholder="ex. | Livrare gratuită" /></Field>
            <Field label="Ordine" hint="Mai mic = se aplică primul"><Input name="priority" type="number" defaultValue={100} /></Field>
            <div className="md:col-span-4"><SubmitButton className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg">Adaugă regula</SubmitButton></div>
          </ActionForm>
        </Card>

        <Card title={`Previzualizare feed Google (${preview.length} din ${total} produse)`}>
          <Table head={["Produs", "Preț", "Etichete"]}>
            {preview.slice(0, 15).map((p) => (
              <tr key={p.id}><Td>{p.title}</Td><Td className="num whitespace-nowrap">{money(p.price, p.currency)}</Td><Td className="text-xs text-muted">{p.labels.map((l) => LABELS[l] ?? l).join(", ")}</Td></tr>
            ))}
          </Table>
        </Card>
      </div>
      )}
    </>
  );
}

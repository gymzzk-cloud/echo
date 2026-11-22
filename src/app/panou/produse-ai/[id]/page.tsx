import { notFound } from "next/navigation";
import { z } from "zod";
import { currentProject } from "@/lib/project";
import { productAiDetail } from "@/core/product-ai-read";
import { PRODUCT_AI_WINDOW_DAYS } from "@/core/product-visibility-job";
import { providerLabel } from "@/core/ai/types";
import { Badge, Card, Empty, PageHeader, Stat, Table, Td, TextLink } from "@/components/ui";
import { dateShort, money, num } from "@/lib/format";

/** Un produs în AI: cifrele salvate și răspunsurile în care a apărut (cel mult 20, cele mai noi primele). */
export default async function ProductInAi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { project } = await currentProject();
  const row = await productAiDetail(project.id, id);
  if (!row) notFound();
  const s = row.stat;
  const back = <TextLink href="/panou/produse-ai">Toate produsele</TextLink>;
  const header = <PageHeader eyebrow="Produse în AI" title={row.title} subtitle={[row.brand, money(row.price, row.currency), !row.inStock && "fără stoc"].filter(Boolean).join(" · ")} action={back} />;
  if (!s) return <>{header}<Empty title="AI-urile nu au numit acest produs">În ultimele {PRODUCT_AI_WINDOW_DAYS} de zile, produsul nu apare în niciun răspuns la întrebările urmărite. Îl poți urmări din pagina Produse, ca să întrebăm AI-urile direct despre el.</Empty></>;

  return (
    <div className="space-y-6">
      {header}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Apare în" value={`${s.appearances}×`} hint={`la ${s.prompts} ${s.prompts === 1 ? "întrebare" : "întrebări"}`} />
        <Stat label="Loc mediu" value={num(parseFloat(s.avgPosition))} hint={`cel mai bun: ${s.bestPosition}`} />
        <Stat label="Cu magazinul tău" value={`${s.withStore} / ${s.appearances}`} hint={s.withStore ? "răspunsuri care te numesc" : "AI-ul trimite în alt magazin"} />
        <Stat label="Preț spus de AI" value={s.statedPrice ? money(s.statedPrice, row.currency) : "–"} hint={s.priceWrong ? `în catalog ${money(row.price, row.currency)}; greșit la ${s.wrongPrices.map((w) => providerLabel(w.provider)).join(", ")}` : s.statedPrice ? "corect" : "niciun AI nu spune prețul"} />
      </div>

      <Card title="Pe fiecare AI">
        <div className="flex flex-wrap gap-2">
          {Object.entries(s.providers).sort((a, b) => b[1] - a[1]).map(([p, n]) => <Badge key={p}>{providerLabel(p)}: {n}×</Badge>)}
          {s.wrongPrices.map((w) => <Badge key={`w${w.provider}`} tone="bad">{providerLabel(w.provider)} spune {money(w.price, row.currency)}</Badge>)}
        </div>
      </Card>

      <Card title="Răspunsurile în care apare" description="Cele mai noi primele. Rândul din răspunsul AI-ului, așa cum l-a scris.">
        <Table head={["Data", "AI", "Întrebarea", "Loc", "Preț spus", "Ce a scris AI-ul"]}>
          {s.examples.map((e) => (
            <tr key={e.runId}>
              <Td className="num whitespace-nowrap">{dateShort(e.runDate)}</Td>
              <Td className="whitespace-nowrap">{providerLabel(e.provider)}</Td>
              <Td className="min-w-48">{e.query}{!e.withStore && <span className="mt-1 block"><Badge tone="warn">Fără magazinul tău</Badge></span>}</Td>
              <Td className="num text-right">{e.position}</Td>
              <Td className="num whitespace-nowrap text-right">{money(e.statedPrice, row.currency)}</Td>
              <Td className="min-w-64 text-muted">{e.snippet}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

import { currentProject } from "@/lib/project";
import { productCodes } from "@/lib/product-codes";
import { busyKinds } from "@/core/jobs";
import { PRODUCT_AI_PAGE_SIZE, productAiList, productAiSummary, type ProductAiFilter } from "@/core/product-ai-read";
import { PRODUCT_AI_WINDOW_DAYS } from "@/core/product-visibility-job";
import { PROVIDERS, providerLabel } from "@/core/ai/types";
import { SubmitButton } from "@/components/client";
import { Badge, ButtonLink, Card, Chips, Empty, Input, Notice, PageHeader, Stat, Table, Td, TextLink, Working } from "@/components/ui";
import { dateTime, money, num, pct } from "@/lib/format";
import { recomputeProductAi } from "@/app/actions-product-ai";
import { redirect } from "next/navigation";
import { findCatalogProducts } from "@/core/product-sheet/read";
import { ProductSearchCard } from "@/components/product-sheet/search";

type Sp = { f?: string; ai?: string; q?: string; p?: string; cauta?: string };

/**
 * Produse în AI: pentru fiecare produs din catalog, în câte răspunsuri AI apare, pe ce loc și ce preț spune AI-ul.
 * Cifrele sunt calculate în worker (`product_ai_stats`); pagina citește 50 de rânduri, cu totalurile în SQL.
 */
export default async function ProductsInAi({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const { project, role } = await currentProject();
  const filter: ProductAiFilter = sp.f === "fara-magazin" || sp.f === "pret" ? sp.f : "";
  const provider = PROVIDERS.some((p) => p.id === sp.ai) ? sp.ai : undefined;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const page = Math.max(1, parseInt(sp.p ?? "1", 10) || 1);
  const cauta = (sp.cauta ?? "").trim().slice(0, 300);
  const [sum, list, busy, hits] = await Promise.all([productAiSummary(project.id), productAiList(project.id, { filter, provider, q, page }), busyKinds(project.id), cauta ? findCatalogProducts(project.id, cauta) : null]);
  // Un singur produs găsit (cod, EAN, link): deschidem direct fișa lui.
  if (hits?.length === 1) redirect(`/panou/produse-ai/${hits[0].id}`);
  const search = <ProductSearchCard q={cauta} hits={hits} />;

  const working = busy.has("product_ai") || busy.has("run_project");
  const canWrite = role !== "viewer" && role !== "client";
  const action = working
    ? <Working hint="Pagina se actualizează singură.">{busy.has("run_project") ? "Analiza AI e în lucru" : "Calculăm pe produs…"}</Working>
    : canWrite && sum.answers !== null && (
      <form action={recomputeProductAi}><input type="hidden" name="projectId" value={project.id} /><SubmitButton variant="secondary" pendingText="Pornesc…">Recalculează</SubmitButton></form>
    );
  const header = <PageHeader eyebrow="Vizibilitate" title="Produse în AI" subtitle="Ce produse din catalogul tău numesc AI-urile, pe ce loc și la ce preț, și fișa fiecărui produs în ChatGPT și Google." action={action} />;

  if (!sum.catalog) return <>{header}<Empty title="Nu avem încă produsele tale" action={<ButtonLink href="/panou/setari">Conectează catalogul</ButtonLink>}>Conectează magazinul sau feed-ul de produse, ca să căutăm produsele tale în răspunsurile AI-urilor.</Empty></>;
  if (sum.answers === null) return <div className="space-y-6">{header}{search}<Empty title={working ? "Calculăm vizibilitatea pe produs" : "Încă nu avem răspunsuri AI"} action={!working && <ButtonLink href="/panou/vizibilitate" variant="secondary">Vezi întrebările urmărite</ButtonLink>}>
    {working ? "Citim răspunsurile AI deja primite și căutăm în ele produsele tale. Durează un minut." : "După prima analiză AI, aici vezi fiecare produs pe care AI-urile îl recomandă."}
  </Empty></div>;

  const answers = sum.answers;
  const share = (n: number) => (answers ? pct((n / answers) * 100) : "0%");
  const base = (o: Partial<Sp>) => {
    const s = new URLSearchParams();
    const v = { f: filter, ai: provider ?? "", q, ...o };
    for (const [k, x] of Object.entries(v)) if (x) s.set(k, String(x));
    const str = s.toString();
    return str ? `?${str}` : "?";
  };
  const pages = Math.ceil(list.total / PRODUCT_AI_PAGE_SIZE);

  return (
    <div className="space-y-6">
      {header}
      {search}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Doar produsele găsite în răspunsuri; catalogul nu e numitorul (ZoZo a citit „57 / 28192” ca „doar 57 apar în AI”). */}
        <Stat label="Produse numite de AI" value={num(sum.named)} hint={`în ${num(answers)} răspunsuri AI deja primite, ultimele ${PRODUCT_AI_WINDOW_DAYS} de zile`} />
        <Stat label="Numite fără magazinul tău" value={sum.named ? sum.withoutStore : "–"} hint={!sum.named ? "niciun produs numit" : sum.withoutStore ? "AI-ul le trimite în alt magazin" : "de fiecare dată cu tine"} />
        <Stat label="Preț greșit spus de AI" value={sum.named ? sum.wrongPrice : "–"} hint={!sum.named ? "niciun produs numit" : sum.wrongPrice ? "diferență peste 5% față de catalog" : "fără prețuri greșite"} />
        <Stat label="Calculat" value={sum.computedAt ? dateTime(sum.computedAt).split(", ")[1] ?? "–" : "–"} hint={sum.computedAt ? `${dateTime(sum.computedAt).split(", ")[0]}, fără întrebări noi către AI` : "încă nu"} />
      </div>

      <Notice tone="primary">
        Am citit doar răspunsurile AI la cele {num(sum.questions)} întrebări urmărite, nu am întrebat despre fiecare produs. Din {num(sum.catalog)} produse în catalog, {sum.asked ? <>despre {num(sum.asked)} întrebăm AI-urile direct</> : "despre niciunul nu întrebăm încă direct"}; pentru restul, nu știm încă dacă AI-urile le recomandă, nu înseamnă că lipsesc. <TextLink href="/panou/produse-urmarite">Alege produsele pe care le urmărim</TextLink> ca să le verificăm.
      </Notice>

      {sum.named === 0 && <Notice tone="warn">În cele {answers} răspunsuri AI din ultimele {PRODUCT_AI_WINDOW_DAYS} de zile nu apare niciun produs din catalogul tău, cu numele sau codul lui. Alege produsele importante în <TextLink href="/panou/produse-urmarite">Produse urmărite</TextLink>, ca să întrebăm AI-urile direct despre ele.</Notice>}

      {sum.named > 0 && <Card>
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <Chips items={[["", "Toate"], ["fara-magazin", "Fără magazinul tău"], ["pret", "Preț greșit"]].map(([k, l]) => ({ href: base({ f: k as ProductAiFilter, p: "" }), label: l, active: filter === k }))} />
            <Chips items={[{ href: base({ ai: "", p: "" }), label: "Toate AI-urile", active: !provider }, ...PROVIDERS.filter((x) => sum.providers.includes(x.id)).map((x) => ({ href: base({ ai: x.id, p: "" }), label: x.label, active: provider === x.id }))]} />
          </div>
          <form role="search" className="w-full lg:w-64">
            {filter && <input type="hidden" name="f" value={filter} />}
            {provider && <input type="hidden" name="ai" value={provider} />}
            <label htmlFor="q" className="sr-only">Caută produs</label>
            <Input id="q" name="q" defaultValue={q} placeholder="Caută produs…" />
          </form>
        </div>
        {/* Pe telefon: listă de carduri (DESIGN §6.4); de la 768 px, tabelul. */}
        <ul className="divide-y divide-border md:hidden">
          {list.rows.map((r) => (
            <li key={r.productId} className="space-y-2 py-3">
              <div className="flex items-start justify-between gap-3">
                <TextLink href={`/panou/produse-ai/${r.productId}`} className="min-w-0 font-medium">{r.title}</TextLink>
                <span className="num shrink-0 text-right text-sm">{money(r.price, r.currency)}<SitePrice r={r} /></span>
              </div>
              <ProductIds r={r} />
              <p className="num text-xs text-muted">{r.appearances}× ({share(r.appearances)} din răspunsuri) · loc mediu {num(parseFloat(r.avgPosition))} · {Object.keys(r.providers).map(providerLabel).join(", ")}</p>
              <div className="flex flex-wrap gap-1">
                {r.wrongPrices.map((w) => <Badge key={w.provider} tone="bad">{providerLabel(w.provider)}: {money(w.price, r.currency)}</Badge>)}
                {!r.priceWrong && r.statedPrice && <Badge tone="good">Preț corect</Badge>}
                {r.withStore === 0 ? <Badge tone="warn">Fără magazinul tău</Badge> : <Badge>Cu tine: {r.withStore} din {r.appearances}</Badge>}
              </div>
              <TextLink href={proofHref(r)} className="block text-xs">{r.statedPrice ? "Vezi unde a spus prețul" : "Vezi răspunsurile și dovezile"}</TextLink>
            </li>
          ))}
        </ul>
        <Table className="hidden md:block" head={["Produs", "Preț", "Apare în", "Loc mediu", "Numit de", "Preț spus de AI", "Cu magazinul tău"]}>
          {list.rows.map((r) => (
            <tr key={r.productId}>
              <Td className="min-w-56">
                <TextLink href={`/panou/produse-ai/${r.productId}`} className="font-medium">{r.title}</TextLink>
                <ProductIds r={r} />
              </Td>
              <Td className="num whitespace-nowrap text-right">{money(r.price, r.currency)}<SitePrice r={r} /></Td>
              <Td className="num whitespace-nowrap text-right">{r.appearances}× <span className="block text-xs text-muted">{share(r.appearances)} din răspunsuri</span></Td>
              <Td className="num whitespace-nowrap text-right">{num(parseFloat(r.avgPosition))}<span className="block text-xs text-muted">cel mai bun: {r.bestPosition}</span></Td>
              <Td><div className="flex flex-wrap gap-1">{Object.entries(r.providers).sort((a, b) => b[1] - a[1]).map(([x, n]) => <Badge key={x}>{providerLabel(x)} {n}</Badge>)}</div></Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {r.wrongPrices.map((w) => <Badge key={w.provider} tone="bad">{providerLabel(w.provider)}: {money(w.price, r.currency)}</Badge>)}
                  {!r.priceWrong && (r.statedPrice ? <Badge tone="good">Corect: {money(r.statedPrice, r.currency)}</Badge> : <span className="text-xs text-muted">Nu spune prețul tău</span>)}
                </div>
                {r.statedPrice && <TextLink href={proofHref(r)} className="mt-1 block text-xs">Vezi unde a spus-o</TextLink>}
              </Td>
              <Td className="num whitespace-nowrap text-right">{r.withStore === 0 ? <Badge tone="warn">Niciodată</Badge> : `${r.withStore} din ${r.appearances}`}</Td>
            </tr>
          ))}
        </Table>
        {list.rows.length === 0 && <p className="mt-4 text-sm text-muted">Niciun produs pentru acest filtru.</p>}
        {pages > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <span className="num">Pagina {page} din {pages} · {list.total} produse</span>
            <div className="flex gap-2">
              {page > 1 && <ButtonLink variant="secondary" size="sm" href={base({ p: String(page - 1) })}>Înapoi</ButtonLink>}
              {page < pages && <ButtonLink variant="secondary" size="sm" href={base({ p: String(page + 1) })}>Mai departe</ButtonLink>}
            </div>
          </div>
        )}
        <p className="mt-4 text-xs text-muted">Căutăm produsele tale în răspunsurile AI deja primite la întrebările urmărite, doar după dovezi sigure: codul (EAN, cod producător), linkul spre pagina produsului sau numele complet din catalog, fără întrebări în plus. „Preț spus de AI” e doar prețul scris pe rândul care numește magazinul tău (sau are linkul lui); prețurile altor magazine din răspuns nu contează. Îl comparăm cu prețul de pe pagina produsului (citită automat, o dată pe zi), iar până o citim, cu cel din catalog, actualizat la fiecare preluare. Pe pagina fiecărui produs vezi răspunsul AI-ului, data și ora, rândul exact cu prețul și criteriul după care l-am recunoscut. „Cu magazinul tău” înseamnă că răspunsul numește și magazinul sau dă linkul produsului. Locul e al câtelea produs recomandat în răspuns.</p>
      </Card>}
    </div>
  );
}

/** Prețul de pe site, sub cel din catalog, când diferă (comparația cu AI-ul se face cu el). */
function SitePrice({ r }: { r: { price: string | null; currency: string; realPrice: string | null; realSource: string | null } }) {
  if (r.realSource !== "site" || !r.realPrice || r.realPrice === r.price) return null;
  return <span className="block text-xs text-muted">pe site {money(r.realPrice, r.currency)}</span>;
}

/** Linkul spre dovada exactă a prețului afișat: întâi prețul greșit (cel arătat în roșu), apoi ultimul preț spus. */
function proofHref(r: { productId: string; statedRunId: string | null; wrongPrices: { runId?: string }[] }) {
  const run = r.wrongPrices[0]?.runId ?? r.statedRunId;
  return `/panou/produse-ai/${r.productId}#${run ? `dovada-${run}` : "dovezi"}`;
}

/** Cum găsești produsul sigur: codul din catalog, EAN-ul și pagina lui de pe magazin. */
function ProductIds({ r }: { r: { externalId: string; mpn: string | null; gtin: string | null; brand: string | null; inStock: boolean; url: string } }) {
  const ids = [...productCodes(r), r.brand, !r.inStock && "fără stoc"].filter(Boolean).join(" · ");
  return (
    <span className="block text-xs text-muted">
      <span className="num break-all">{ids}</span> · <TextLink href={r.url} external className="text-xs">Pe site</TextLink>
    </span>
  );
}

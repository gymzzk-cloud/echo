import { eq, inArray, desc, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { catalogSearch } from "./search";
import { trustForDomain, reviewStats } from "./trust";
import { deliveryFromCatalog } from "./policies";

/**
 * Servere MCP (Model Context Protocol, transport Streamable HTTP, fără sesiune):
 *  - /mcp: pentru cumpărători și agenți AI, peste toate magazinele verificate;
 *  - /mcp/magazin/{domeniu}[/{subfolder}]: serverul unui singur magazin (catalog, preț, stoc, livrare, retur, întrebări).
 * Răspunsurile vin doar din date verificate: catalogul sincronizat și condițiile citite automat de pe site-ul magazinului.
 */
type Tool = { name: string; title: string; description: string; inputSchema: Record<string, unknown>; run: (args: Record<string, unknown>) => Promise<unknown> };

/**
 * Adnotările cerute de directoarele Claude și ChatGPT: toate uneltele Echo doar citesc date verificate din baza Echo.
 * Nu scriu nimic la magazin, nu plătesc și nu ies pe internet în timpul apelului (openWorldHint: false).
 */
export const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

/** Ce trimitem la tools/list: numele, titlul, descrierea, schema și adnotările (fără funcția run). */
export const listTools = (tools: Tool[]) =>
  tools.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema, annotations: { title, ...READ_ONLY_ANNOTATIONS } }));

const PRODUCT_ID = { type: "string", description: "product_id dintr-un rezultat de căutare (UUID)." };
type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

const APP = () => process.env.APP_URL ?? "http://localhost:3000";
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
const productById = async (id: string) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [r] = await db.select({ p: schema.products, s: schema.projects }).from(schema.products).innerJoin(schema.projects, eq(schema.projects.id, schema.products.projectId)).where(eq(schema.products.id, id)).limit(1);
  return r ?? null;
};
const productOut = (r: NonNullable<Awaited<ReturnType<typeof productById>>>) => ({
  product_id: r.p.id, title: r.p.title, store: r.s.name, domain: r.s.domain, price: r.p.price ? parseFloat(r.p.price) : null, currency: r.p.currency,
  in_stock: r.p.inStock, brand: r.p.brand, category: r.p.category, gtin: r.p.gtin, delivery: r.p.delivery, description: r.p.description?.slice(0, 800) ?? null, verified_at: r.p.updatedAt.toISOString(),
  buy_url: `${APP()}/go/${r.p.id}${r.p.cartUrl ? "?cos=1" : ""}`,
});

export function buyerTools(): Tool[] {
  return [
    { name: "cauta_produse", title: "Caută produse în magazine verificate", description: "Caută produse în magazinele verificate din România și Ungaria. Prețul și stocul vin din catalogul magazinului, actualizat zilnic. Plata se face pe site-ul magazinului.",
      inputSchema: { type: "object", properties: { intrebare: { type: "string", description: "Ce caută cumpărătorul, ex. „bormașină cu percuție sub 400 lei”" }, buget_max: { type: "number", description: "Prețul maxim, în moneda magazinului (lei sau forinți)." }, doar_in_stoc: { type: "boolean", description: "Doar produse aflate în stoc." } }, required: ["intrebare"] },
      run: async (a) => catalogSearch(str(a.intrebare) + (a.doar_in_stoc ? " doar în stoc" : ""), { budgetMax: typeof a.buget_max === "number" ? a.buget_max : null }) },
    { name: "verifica_pret_si_stoc", title: "Verifică prețul și stocul", description: "Prețul și stocul verificate pentru un produs (după product_id din cauta_produse).",
      inputSchema: { type: "object", properties: { product_id: PRODUCT_ID }, required: ["product_id"] },
      run: async (a) => { const r = await productById(str(a.product_id)); return r ? productOut(r) : { eroare: "Produs inexistent." }; } },
    { name: "compara_produse", title: "Compară produse", description: "Compară 2–4 produse: preț, stoc, marcă, magazin.",
      inputSchema: { type: "object", properties: { product_ids: { type: "array", items: { type: "string" }, description: "2–4 valori product_id din cauta_produse.", minItems: 2, maxItems: 4 } }, required: ["product_ids"] },
      run: async (a) => {
        const ids = (Array.isArray(a.product_ids) ? a.product_ids : []).map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 4);
        if (!ids.length) return [];
        const rows = await db.select({ p: schema.products, s: schema.projects }).from(schema.products).innerJoin(schema.projects, eq(schema.projects.id, schema.products.projectId)).where(inArray(schema.products.id, ids));
        return rows.map(productOut);
      } },
    { name: "profil_magazin", title: "Profilul unui magazin", description: "Fapte verificabile despre un magazin: date firmă, retur, ANPC, recenzii din comenzi verificate.",
      inputSchema: { type: "object", properties: { domeniu: { type: "string", description: "ex. hardlineconstruct.ro" } }, required: ["domeniu"] },
      run: async (a) => {
        const d = str(a.domeniu, 120).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
        const t = await trustForDomain(d);
        const reviews = t.project ? await reviewStats(t.project.id) : { n: 0, avg: null };
        return { domeniu: d, revendicat: !!t.project, fapte: t.parts.map((p) => ({ criteriu: p.label, indeplinit: p.points > 0, detaliu: p.detail ?? null })), recenzii_verificate: reviews, profil: `${APP()}/magazin/${d}` };
      } },
    { name: "link_cumparare", title: "Link de cumpărare", description: "Linkul de cumpărare pentru un produs, pe site-ul magazinului (pune produsul în coș când magazinul permite). Echo nu face plăți: cumpărătorul plătește pe site-ul magazinului.",
      inputSchema: { type: "object", properties: { product_id: PRODUCT_ID }, required: ["product_id"] },
      run: async (a) => { const r = await productById(str(a.product_id)); return r ? { buy_url: productOut(r).buy_url, magazin: r.s.name } : { eroare: "Produs inexistent." }; } },
  ];
}

export function storeTools(project: typeof schema.projects.$inferSelect): Tool[] {
  const pol = project.storeInfo?.policies;
  return [
    { name: "cauta_in_catalog", title: `Caută în catalogul ${project.name}`, description: `Caută produse în catalogul ${project.name} (${project.domain}${project.pathPrefix}). Prețul și stocul vin din catalogul magazinului, sincronizat de Echo.`,
      inputSchema: { type: "object", properties: { intrebare: { type: "string", description: "Ce caută cumpărătorul, cu cuvintele lui." }, buget_max: { type: "number", description: "Prețul maxim, în moneda magazinului." } }, required: ["intrebare"] },
      run: async (a) => catalogSearch(str(a.intrebare), { projectId: project.id, budgetMax: typeof a.buget_max === "number" ? a.buget_max : null, limit: 15 }) },
    { name: "pret_si_stoc", title: "Preț și stoc", description: "Prețul și stocul actual pentru un produs al magazinului (după product_id din cauta_in_catalog).",
      inputSchema: { type: "object", properties: { product_id: PRODUCT_ID }, required: ["product_id"] },
      run: async (a) => { const r = await productById(str(a.product_id)); return r && r.s.id === project.id ? productOut(r) : { eroare: "Produs inexistent în acest magazin." }; } },
    { name: "livrare_si_retur", title: "Livrare, retur și plată", description: "Livrarea (termenul și stocul pe produs, din catalog), returul și plata, citite de pe site-ul magazinului. Cu product_id, răspunde pentru acel produs.",
      inputSchema: { type: "object", properties: { product_id: { type: "string", description: "Opțional: produsul pentru care vrei termenul de livrare" } } },
      run: async (a) => {
        const r = a.product_id ? await productById(str(a.product_id)) : null;
        const produs = r && r.s.id === project.id ? { titlu: r.p.title, in_stoc: r.p.inStock, termen_livrare: r.p.delivery ?? "nespecificat în catalog" } : undefined;
        return {
          livrare: {
            ...(produs ? { produs } : {}),
            termene_din_catalog: pol?.catalogDelivery ?? (await deliveryFromCatalog(project.id)) ?? "Catalogul nu are termene de livrare.",
            conditii: pol?.delivery?.text ?? null, transport_gratuit_peste: pol?.delivery?.freeOver ?? null, pagina: pol?.delivery?.url ?? null,
          },
          retur: pol?.returns
            ? { zile: pol.returns.days ?? null, conditii: pol.returns.text, pagina: pol.returns.url }
            : { zile: 14, conditii: "Magazinul nu are o pagină de retur pe care s-o fi putut citi. Legea dă 14 zile pentru produsele cumpărate online.", pagina: null },
          plata: pol?.payment ? { metode: pol.payment.methods, conditii: pol.payment.text ?? null, pagina: pol.payment.url ?? null } : "Nu am găsit metodele de plată pe site.",
          verificat_pe_site: pol?.checkedAt ?? null,
          site: `https://${project.domain}${project.pathPrefix}`,
        };
      } },
    { name: "intrebari_frecvente", title: "Întrebări frecvente", description: "Întrebările frecvente ale magazinului, citite de pe site-ul lui. Fără intrebare, le dă pe toate (max. 20).",
      inputSchema: { type: "object", properties: { intrebare: { type: "string", description: "Opțional: cuvintele după care filtrăm întrebările." } } },
      run: async (a) => {
        const q = str(a.intrebare).toLowerCase();
        const faq = pol?.faq?.items ?? [];
        return q ? faq.filter((f) => q.split(/\s+/).some((w) => w.length > 3 && (f.q + f.a).toLowerCase().includes(w))).slice(0, 5) : faq.slice(0, 20);
      } },
    { name: "link_cumparare", title: "Link de cumpărare", description: "Linkul spre produs pe site-ul magazinului (îl pune în coș când platforma permite). Echo nu face plăți: cumpărătorul plătește pe site-ul magazinului.",
      inputSchema: { type: "object", properties: { product_id: PRODUCT_ID }, required: ["product_id"] },
      run: async (a) => { const r = await productById(str(a.product_id)); return r && r.s.id === project.id ? { buy_url: productOut(r).buy_url } : { eroare: "Produs inexistent în acest magazin." }; } },
  ];
}

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function handleMcp(body: unknown, server: { name: string; tools: Tool[]; projectId?: string | null; client?: string | null }) {
  const one = async (m: Rpc) => {
    if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return err(null, -32600, "Invalid Request");
    if (m.id === undefined) return null; // notificare (ex. notifications/initialized): fără răspuns
    switch (m.method) {
      case "initialize":
        return ok(m.id, { protocolVersion: str(m.params?.protocolVersion) || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: server.name, title: server.name, version: "1.1.0" },
          instructions: "Date verificate din cataloagele magazinelor. Prețurile pot varia; confirmă pe site-ul magazinului înainte de plată." });
      case "ping": return ok(m.id, {});
      case "tools/list": return ok(m.id, { tools: listTools(server.tools) });
      case "tools/call": {
        const name = str(m.params?.name, 80);
        const tool = server.tools.find((t) => t.name === name);
        if (!tool) return err(m.id, -32602, `Unknown tool: ${name}`);
        const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
        await db.insert(schema.mcpCalls).values({ projectId: server.projectId ?? null, tool: name, query: JSON.stringify(args).slice(0, 500), client: server.client?.slice(0, 120) ?? null }).catch(() => {});
        try {
          const data = await tool.run(args);
          return ok(m.id, { content: [{ type: "text", text: JSON.stringify(data, null, 1) }], structuredContent: Array.isArray(data) ? { rezultate: data } : data, isError: false });
        } catch (e) {
          return ok(m.id, { content: [{ type: "text", text: `Eroare: ${(e as Error).message}` }], isError: true });
        }
      }
      default: return err(m.id, -32601, `Method not found: ${m.method}`);
    }
  };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.slice(0, 20).map(one))).filter(Boolean);
    return out.length ? out : null;
  }
  return one(body as Rpc);
}

export const recentMcpCalls = (projectId: string) =>
  db.select().from(schema.mcpCalls).where(eq(schema.mcpCalls.projectId, projectId)).orderBy(desc(schema.mcpCalls.createdAt)).limit(30);

/** Câte zile păstrăm jurnalul apelurilor MCP (MCP_LOG_DAYS, implicit 90). E promis în /confidentialitate. */
export const mcpLogDays = () => Math.max(1, Number(process.env.MCP_LOG_DAYS) || 90);

/** Șterge apelurile MCP mai vechi decât termenul. Idempotent: rulat de două ori, nu mai șterge nimic. */
export const pruneMcpCalls = () =>
  db.delete(schema.mcpCalls).where(lt(schema.mcpCalls.createdAt, new Date(Date.now() - mcpLogDays() * 864e5)));

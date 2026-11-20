import { and, eq, inArray, desc, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { catalogSearch } from "./search";
import { trustForDomain, reviewStats } from "./trust";

/**
 * Servere MCP (Model Context Protocol, transport Streamable HTTP, fără sesiune):
 *  - /mcp: pentru cumpărători și agenți AI, peste toate magazinele verificate;
 *  - /mcp/magazin/{domeniu}[/{subfolder}]: serverul unui singur magazin (catalog, preț, stoc, livrare, retur, întrebări).
 * Răspunsurile vin doar din date verificate: catalogul sincronizat și ce a completat magazinul.
 */
type Tool = { name: string; description: string; inputSchema: Record<string, unknown>; run: (args: Record<string, unknown>) => Promise<unknown> };
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
    { name: "cauta_produse", description: "Caută produse în magazinele verificate din România și Ungaria. Prețul și stocul vin din catalogul magazinului, actualizat zilnic. Plata se face pe site-ul magazinului.",
      inputSchema: { type: "object", properties: { intrebare: { type: "string", description: "Ce caută cumpărătorul, ex. „bormașină cu percuție sub 400 lei”" }, buget_max: { type: "number" }, doar_in_stoc: { type: "boolean" } }, required: ["intrebare"] },
      run: async (a) => catalogSearch(str(a.intrebare) + (a.doar_in_stoc ? " doar în stoc" : ""), { budgetMax: typeof a.buget_max === "number" ? a.buget_max : null }) },
    { name: "verifica_pret_si_stoc", description: "Prețul și stocul verificate pentru un produs (după product_id din cauta_produse).",
      inputSchema: { type: "object", properties: { product_id: { type: "string" } }, required: ["product_id"] },
      run: async (a) => { const r = await productById(str(a.product_id)); return r ? productOut(r) : { eroare: "Produs inexistent." }; } },
    { name: "compara_produse", description: "Compară 2–4 produse: preț, stoc, marcă, magazin.",
      inputSchema: { type: "object", properties: { product_ids: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } }, required: ["product_ids"] },
      run: async (a) => {
        const ids = (Array.isArray(a.product_ids) ? a.product_ids : []).map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 4);
        if (!ids.length) return [];
        const rows = await db.select({ p: schema.products, s: schema.projects }).from(schema.products).innerJoin(schema.projects, eq(schema.projects.id, schema.products.projectId)).where(inArray(schema.products.id, ids));
        return rows.map(productOut);
      } },
    { name: "profil_magazin", description: "Fapte verificabile despre un magazin: date firmă, retur, ANPC, recenzii din comenzi verificate.",
      inputSchema: { type: "object", properties: { domeniu: { type: "string", description: "ex. hardlineconstruct.ro" } }, required: ["domeniu"] },
      run: async (a) => {
        const d = str(a.domeniu, 120).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
        const t = await trustForDomain(d);
        const reviews = t.project ? await reviewStats(t.project.id) : { n: 0, avg: null };
        return { domeniu: d, revendicat: !!t.project, fapte: t.parts.map((p) => ({ criteriu: p.label, indeplinit: p.points > 0, detaliu: p.detail ?? null })), recenzii_verificate: reviews, profil: `${APP()}/magazin/${d}` };
      } },
    { name: "link_cumparare", description: "Linkul de cumpărare pentru un produs (pune produsul în coș când magazinul permite).",
      inputSchema: { type: "object", properties: { product_id: { type: "string" } }, required: ["product_id"] },
      run: async (a) => { const r = await productById(str(a.product_id)); return r ? { buy_url: productOut(r).buy_url, magazin: r.s.name } : { eroare: "Produs inexistent." }; } },
  ];
}

/** Dacă magazinul n-a completat livrarea, o rezumăm din catalog (termenele și costurile cele mai des întâlnite). */
async function deliveryFromCatalog(projectId: string) {
  const rows = await db.select({ d: schema.products.delivery, n: dsql<number>`count(*)::int` }).from(schema.products)
    .where(and(eq(schema.products.projectId, projectId), dsql`${schema.products.delivery} is not null`))
    .groupBy(schema.products.delivery).orderBy(dsql`count(*) desc`).limit(3);
  if (!rows.length) return null;
  const total = rows.reduce((a, r) => a + r.n, 0);
  return "Din catalog: " + rows.map((r) => `${r.d} (${Math.round((r.n / total) * 100)}% din produse)`).join("; ") + ". Termenul exact apare la fiecare produs.";
}

export function storeTools(project: typeof schema.projects.$inferSelect): Tool[] {
  const info = project.storeInfo ?? {};
  return [
    { name: "cauta_in_catalog", description: `Caută în catalogul ${project.name} (${project.domain}). Preț și stoc verificate.`,
      inputSchema: { type: "object", properties: { intrebare: { type: "string" }, buget_max: { type: "number" } }, required: ["intrebare"] },
      run: async (a) => catalogSearch(str(a.intrebare), { projectId: project.id, budgetMax: typeof a.buget_max === "number" ? a.buget_max : null, limit: 15 }) },
    { name: "pret_si_stoc", description: "Prețul și stocul actual pentru un produs al magazinului.",
      inputSchema: { type: "object", properties: { product_id: { type: "string" } }, required: ["product_id"] },
      run: async (a) => { const r = await productById(str(a.product_id)); return r && r.s.id === project.id ? productOut(r) : { eroare: "Produs inexistent în acest magazin." }; } },
    { name: "livrare_si_retur", description: "Condițiile de livrare, retur și plată, așa cum le-a declarat magazinul.",
      inputSchema: { type: "object", properties: {} },
      run: async () => ({ livrare: info.delivery ?? (await deliveryFromCatalog(project.id)) ?? "Nedeclarat.", retur: info.returns ?? "Conform legii: 14 zile pentru produsele cumpărate online.", plata: info.payment ?? "Nedeclarat.", site: `https://${project.domain}${project.pathPrefix}` }) },
    { name: "intrebari_frecvente", description: "Răspunsurile magazinului la întrebările frecvente.",
      inputSchema: { type: "object", properties: { intrebare: { type: "string" } } },
      run: async (a) => {
        const q = str(a.intrebare).toLowerCase();
        const faq = info.faq ?? [];
        return q ? faq.filter((f) => q.split(/\s+/).some((w) => w.length > 3 && (f.q + f.a).toLowerCase().includes(w))).slice(0, 5) : faq.slice(0, 20);
      } },
    { name: "link_cumparare", description: "Linkul care pune produsul în coș pe site-ul magazinului.",
      inputSchema: { type: "object", properties: { product_id: { type: "string" } }, required: ["product_id"] },
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
        return ok(m.id, { protocolVersion: str(m.params?.protocolVersion) || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: server.name, version: "1.0.0" },
          instructions: "Date verificate din cataloagele magazinelor. Prețurile pot varia; confirmă pe site-ul magazinului înainte de plată." });
      case "ping": return ok(m.id, {});
      case "tools/list": return ok(m.id, { tools: server.tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
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

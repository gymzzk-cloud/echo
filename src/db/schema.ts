import {
  customType, pgTable, uuid, text, timestamp, integer, boolean, jsonb, numeric, date, uniqueIndex, index, primaryKey,
} from "drizzle-orm/pg-core";
import type { StorePolicies } from "../core/policies/extract";
import type { Onboarding } from "../core/onboarding/types";
import type { Opinion } from "../core/ai/sentiment";
import type { ProductExample } from "../core/product-visibility";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ── Conturi ────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  totpSecret: text("totp_secret"),        // criptat; 2FA activ când totpEnabled
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  locale: text("locale").notNull().default("ro"), // ro | hu
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256(token); tokenul brut stă doar în cookie
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const orgs = pgTable("orgs", {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("store"), // store | agency
  plan: text("plan").notNull().default("trial"), // trial | start | pro | agentie
  billingStatus: text("billing_status").notNull().default("trialing"), // trialing | active | past_due | canceled
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  brandName: text("brand_name"),   // white-label pentru agenții
  brandColor: text("brand_color"),
  createdAt: createdAt(),
});

export const memberships = pgTable("memberships", {
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("owner"), // owner | admin | member | viewer | client
  projectIds: jsonb("project_ids").$type<string[] | null>(), // rol „client” la agenție: vede doar aceste magazine
}, (t) => [primaryKey({ columns: [t.orgId, t.userId] })]);

export const invites = pgTable("invites", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  projectIds: jsonb("project_ids").$type<string[] | null>(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const auditLog = pgTable("audit_log", {
  id: id(),
  orgId: uuid("org_id"),
  userId: uuid("user_id"),
  action: text("action").notNull(),
  details: jsonb("details"),
  createdAt: createdAt(),
});

// ── Magazine (proiecte) ────────────────────────────────────────────────────
export const projects = pgTable("projects", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  domain: text("domain").notNull(),     // ex. shopexpert.com
  pathPrefix: text("path_prefix").notNull().default(""), // ex. /ro pentru magazine pe subfolder
  country: text("country").notNull().default("RO"), // RO | HU
  language: text("language").notNull().default("ro"),
  currency: text("currency").notNull().default("RON"),
  platform: text("platform"),           // shopify | woocommerce | feed | unknown
  trackingKey: text("tracking_key").notNull().unique().$defaultFn(() => crypto.randomUUID().replace(/-/g, "").slice(0, 20)),
  commissionPct: numeric("commission_pct", { precision: 5, scale: 2 }).notNull().default("3"), // comision pe vânzările aduse de Echo
  mcpEnabled: boolean("mcp_enabled").notNull().default(true),
  agentPolicy: jsonb("agent_policy").$type<AgentPolicy>(),
  storeInfo: jsonb("store_info").$type<StoreInfo>(), // condițiile citite automat de pe site: răspunsurile MCP ale magazinului
  rivalsCheckedAt: timestamp("rivals_checked_at", { withTimezone: true }), // ultima căutare automată de concurenți în răspunsurile AI
  productAiAt: timestamp("product_ai_at", { withTimezone: true }), // ultimul calcul al vizibilității pe produs (worker)
  productAiAnswers: integer("product_ai_answers"), // câte răspunsuri AI au intrat în acel calcul (numitorul procentelor)
  onboarding: jsonb("onboarding").$type<Onboarding>(), // testul gratuit de la prima logare; gol = magazin obișnuit
  fixAutoThreshold: integer("fix_auto_threshold"), // reparațiile de produs cu încredere de cel puțin atât se aplică singure; gol = oprit
  fixesCheckedAt: timestamp("fixes_checked_at", { withTimezone: true }), // ultima căutare de reparații de produs
  createdAt: createdAt(),
}, (t) => [index("projects_org_idx").on(t.orgId), index("projects_domain_idx").on(t.domain)]);

/** Condițiile magazinului citite automat de pe site (retur, plată, livrare, întrebări frecvente); nu se completează de mână. */
export type StoreInfo = { policies?: StorePolicies };

export type AgentPolicy = {
  allowedAgents: string[];          // ex. ["ChatGPT", "Claude", "Gemini", "Perplexity"]
  codRequiresSms: boolean;          // ramburs prin agent → confirmare SMS
  blockUnknownAgents: boolean;
  maxOrderValueUnverified: number;  // peste această valoare, comanda de la agent se verifică manual
};

export const connections = pgTable("connections", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // shopify | woocommerce | feed
  url: text("url").notNull(),
  secret: text("secret"),       // criptat (AES-256-GCM), pentru chei API viitoare
  status: text("status").notNull().default("pending"), // pending | ok | error
  lastError: text("last_error"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  nextSyncAt: timestamp("next_sync_at", { withTimezone: true }), // sincronizări rare și împrăștiate, ca să nu încărcăm magazinul
  failures: integer("failures").notNull().default(0),
  etag: text("etag"),                  // descărcăm feed-ul doar dacă s-a schimbat
  lastModified: text("last_modified"),
  contentHash: text("content_hash"),   // hash-ul ultimului catalog: dacă e același, nu rescriem nimic
  productCount: integer("product_count").notNull().default(0),
  createdAt: createdAt(),
});

export const products = pgTable("products", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  cartUrl: text("cart_url"), // link care pune produsul direct în coș (Shopify /cart/ID:1, Woo ?add-to-cart=ID)
  price: numeric("price", { precision: 12, scale: 2 }),
  currency: text("currency").notNull().default("RON"),
  inStock: boolean("in_stock").notNull().default(true),
  brand: text("brand"),
  category: text("category"),
  imageUrl: text("image_url"),
  gtin: text("gtin"),
  mpn: text("mpn"), // codul producătorului / SKU, cum îl caută clienții
  description: text("description"),
  delivery: text("delivery"), // ex. „1-2 zile lucrătoare · transport 20 RON”, din feed
  popularityRank: integer("popularity_rank"), // 1 = cel mai vândut (de la platformă sau din feed); null = necunoscut
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("products_project_ext_idx").on(t.projectId, t.externalId),
  index("products_project_idx").on(t.projectId),
  index("products_project_popularity_idx").on(t.projectId, t.popularityRank),
]);

/**
 * Vizibilitatea pe produs, calculată în worker din răspunsurile AI deja salvate (ultimele 30 de zile).
 * Un rând = un produs care a apărut cel puțin o dată. Pagina doar citește, cu paginare.
 */
export const productAiStats = pgTable("product_ai_stats", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  appearances: integer("appearances").notNull(), // în câte răspunsuri apare
  prompts: integer("prompts").notNull(), // la câte întrebări diferite
  providers: jsonb("providers").$type<Record<string, number>>().notNull(),
  avgPosition: numeric("avg_position", { precision: 5, scale: 1 }).notNull(),
  bestPosition: integer("best_position").notNull(),
  withStore: integer("with_store").notNull(), // răspunsuri care numesc și magazinul sau citează pagina produsului
  statedPrice: numeric("stated_price", { precision: 12, scale: 2 }), // ultimul preț spus de un AI
  statedProvider: text("stated_provider"),
  priceWrong: boolean("price_wrong").notNull().default(false),
  wrongPrices: jsonb("wrong_prices").$type<{ provider: string; price: number; runId?: string }[]>().notNull(),
  examples: jsonb("examples").$type<ProductExample[]>().notNull(),
  lastSeen: date("last_seen").notNull(),
}, (t) => [
  primaryKey({ columns: [t.projectId, t.productId] }),
  index("product_ai_stats_rank_idx").on(t.projectId, t.appearances),
  index("product_ai_stats_product_idx").on(t.productId), // ștergerea unui produs la sincronizare
]);

export const competitors = pgTable("competitors", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  suggested: boolean("suggested").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("competitors_project_domain_idx").on(t.projectId, t.domain)]);

// Concurenții scoși de client: nu-i mai adăugăm automat (până îi adaugă el din nou).
export const competitorDismissals = pgTable("competitor_dismissals", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
  createdAt: createdAt(),
}, (t) => [primaryKey({ columns: [t.projectId, t.domain] })]);

export const prompts = pgTable("prompts", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  category: text("category"),
  intent: text("intent").notNull().default("general"), // produs | cod | categorie | brand | general (vechi: comparatie, cumparare)
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }), // produsul căutat, pentru „apare sau nu”
  language: text("language").notNull().default("ro"),
  active: boolean("active").notNull().default(true),
  suggested: boolean("suggested").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [index("prompts_project_idx").on(t.projectId)]);

// ── Motorul AI ─────────────────────────────────────────────────────────────
// O rulare = o întrebare pusă unui AI într-o zi. Se partajează între proiecte
// când întrebarea e identică (cheia: query_hash + provider + run_date).
export const runs = pgTable("runs", {
  id: id(),
  queryHash: text("query_hash").notNull(),
  query: text("query").notNull(),
  language: text("language").notNull().default("ro"),
  provider: text("provider").notNull(), // chatgpt | gemini | perplexity | claude
  model: text("model"),
  mode: text("mode").notNull(), // live | demo
  answer: text("answer").notNull(),
  sources: jsonb("sources").$type<{ url: string; title?: string }[]>().notNull().default([]),
  mentions: jsonb("mentions").$type<Mention[]>().notNull().default([]),
  costUsd: numeric("cost_usd", { precision: 10, scale: 5 }).notNull().default("0"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  latencyMs: integer("latency_ms"),
  runDate: date("run_date").notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("runs_unique_daily_idx").on(t.queryHash, t.provider, t.runDate),
  index("runs_date_idx").on(t.runDate),
]);

export type Mention = {
  domain: string;
  name?: string;
  position: number;      // 1 = primul menționat
  productTitle?: string;
  statedPrice?: number;  // prețul spus de AI, dacă există
  /** Ce spune AI-ul despre magazin (laude, critici, pe aspecte); extras din text, fără apel AI. */
  opinions?: Opinion[];
};

// Legătura dintre întrebările unui proiect și rulări (pentru costuri pe client)
export const promptRuns = pgTable("prompt_runs", {
  promptId: uuid("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.promptId, t.runId] })]);

// ── Audit, acțiuni, alerte, rapoarte ───────────────────────────────────────
export const audits = pgTable("audits", {
  id: id(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  domain: text("domain").notNull(),
  email: text("email"),
  marketingConsent: boolean("marketing_consent").notNull().default(false), // acord pentru emailuri cu sfaturi, separat de trimiterea raportului
  status: text("status").notNull().default("pending"), // pending | done | error
  score: integer("score"),
  result: jsonb("result"),
  createdAt: createdAt(),
}, (t) => [index("audits_domain_idx").on(t.domain)]);

export const actions = pgTable("actions", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  key: text("key").notNull(), // identificator stabil, ex. "robots:GPTBot"
  title: text("title").notNull(),
  why: text("why").notNull(),
  howTo: text("how_to"),
  fixKind: text("fix_kind"), // robots | llms | jsonld | content | source | price
  impact: text("impact").notNull().default("mediu"), // mare | mediu | mic
  effort: text("effort").notNull().default("mic"),
  status: text("status").notNull().default("noua"), // noua | in_lucru | rezolvata | ignorata
  baselineVisibility: integer("baseline_visibility"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("actions_project_key_idx").on(t.projectId, t.key)]);

export const alerts = pgTable("alerts", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  severity: text("severity").notNull().default("info"), // info | warn | bad | good
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("alerts_project_idx").on(t.projectId)]);

export const dailyStats = pgTable("daily_stats", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  provider: text("provider").notNull(), // "all" pentru total
  visibility: integer("visibility").notNull(), // % întrebări în care apari
  avgPosition: numeric("avg_position", { precision: 5, scale: 2 }),
  shareOfVoice: integer("share_of_voice").notNull(),
  score: integer("score").notNull(),
}, (t) => [primaryKey({ columns: [t.projectId, t.day, t.provider] })]);

export const reports = pgTable("reports", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  sentTo: text("sent_to"),
  createdAt: createdAt(),
});

// ── Partea cumpărătorului ──────────────────────────────────────────────────
export const searches = pgTable("searches", {
  id: id(),
  query: text("query").notNull(),
  parsed: jsonb("parsed"),
  resultCount: integer("result_count").notNull().default(0),
  createdAt: createdAt(),
});

export const clicks = pgTable("clicks", {
  id: id(),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  searchId: uuid("search_id"),
  createdAt: createdAt(),
});

// ── Coada de joburi (Postgres, SKIP LOCKED) ────────────────────────────────
export const jobs = pgTable("jobs", {
  id: id(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull().default({}),
  status: text("status").notNull().default("queued"), // queued | running | done | failed
  attempts: integer("attempts").notNull().default(0),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  createdAt: createdAt(),
}, (t) => [index("jobs_pick_idx").on(t.status, t.runAt)]);


// ── Faza 2: vânzări, roboți, cumpărători ───────────────────────────────────
/** Evenimente din codul de urmărire Echo pus pe site-ul magazinului: vizite din AI și comenzi. */
export const events = pgTable("events", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),            // visit | order
  source: text("source").notNull(),        // chatgpt | perplexity | gemini | claude | copilot | echo | alt_ai
  sessionId: text("session_id"),
  clickId: uuid("click_id"),               // click din căutarea Echo → comision
  url: text("url"),
  orderId: text("order_id"),
  value: numeric("value", { precision: 12, scale: 2 }),
  currency: text("currency"),
  createdAt: createdAt(),
}, (t) => [index("events_project_idx").on(t.projectId, t.createdAt), uniqueIndex("events_order_idx").on(t.projectId, t.kind, t.orderId)]);

/** Vizitele roboților AI pe site (din codul de urmărire pe server sau din jurnalele încărcate). */
export const botVisits = pgTable("bot_visits", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  bot: text("bot").notNull(),
  path: text("path").notNull(),
  status: integer("status").notNull().default(200),
  hits: integer("hits").notNull().default(1),
}, (t) => [primaryKey({ columns: [t.projectId, t.day, t.bot, t.path, t.status] })]);

/** Contul de cumpărător: produse urmărite (alertă de preț sau stoc) și liste. */
export const watches = pgTable("watches", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  list: text("list").notNull().default("Favorite"),
  targetPrice: numeric("target_price", { precision: 12, scale: 2 }),
  notifyStock: boolean("notify_stock").notNull().default(true),
  lastPrice: numeric("last_price", { precision: 12, scale: 2 }),
  lastInStock: boolean("last_in_stock"),
  lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("watches_user_product_idx").on(t.userId, t.productId)]);

export const notifications = pgTable("notifications", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  url: text("url"),
  read: boolean("read").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index("notifications_user_idx").on(t.userId)]);

// ── Faza 3: feed, încredere, agenți, platformă ─────────────────────────────
/** Reguli de feed „dacă… atunci…”, aplicate în ordinea priorității. */
export const feedRules = pgTable("feed_rules", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  conditions: jsonb("conditions").$type<FeedCondition[]>().notNull().default([]),
  actions: jsonb("actions").$type<FeedAction[]>().notNull().default([]),
  channels: jsonb("channels").$type<string[]>().notNull().default([]), // gol = toate
  priority: integer("priority").notNull().default(100),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});
export type FeedCondition = { field: string; op: "eq" | "neq" | "contains" | "lt" | "gt" | "empty" | "not_empty"; value?: string };
export type FeedAction = { type: "set" | "prefix" | "suffix" | "exclude" | "label"; field?: string; value?: string };

/** Ieșirile de feed: un URL secret per canal, actualizat automat. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export type FeedOutputSettings = {
  returnPolicyUrl?: string; returnWindowDays?: number; privacyPolicyUrl?: string; termsUrl?: string;
  // găsite automat pe site (folosite când magazinul n-a scris altă adresă)
  detected?: { returnPolicyUrl?: string; privacyPolicyUrl?: string; termsUrl?: string }; detectedAt?: string;
};
/** Ce a ieșit la ultima generare: produse incluse, excluse și câmpurile lipsă (pentru avertismentele din panou). */
export type FeedFileStats = { total: number; included: number; excluded: Record<string, number>; missing: Record<string, number> };

export const feedOutputs = pgTable("feed_outputs", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(), // google | meta | tiktok | openai | compari | arukereso | emag | glami
  token: text("token").notNull().unique(),
  active: boolean("active").notNull().default(true),
  settings: jsonb("settings").$type<FeedOutputSettings>(), // date cerute de canal care nu sunt în catalog (ex. politica de retur pentru OpenAI)
  // Fișierul gata generat de worker (comprimat gzip). Adresa publică îl servește așa cum e, fără calcul la cerere.
  file: bytea("file"),
  fileType: text("file_type"),
  itemCount: integer("item_count"),
  stats: jsonb("stats").$type<FeedFileStats>(),
  stamp: text("stamp"), // amprenta datelor din care s-a generat (produse, reguli, titluri, setări): aceeași amprentă = nu regenerăm
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("feed_outputs_project_channel_idx").on(t.projectId, t.channel)]);

/**
 * Reparații de produs propuse (titlu, descriere, GTIN, marcă, categorie), fiecare cu un scor de încredere.
 * Se aplică doar în feed-ul Echo, după aprobare (de mână sau automat peste pragul magazinului), și se pot anula.
 * Un singur rând pe produs și câmp: o propunere nouă îl actualizează doar dacă datele produsului s-au schimbat (input_hash).
 */
export const productEdits = pgTable("product_edits", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  field: text("field").notNull(), // title | description | brand | gtin | category
  value: text("value").notNull(),
  previous: text("previous"),
  source: text("source").notNull().default("ai"), // ai | regula | manual
  status: text("status").notNull().default("propus"), // propus | aprobat | respins
  confidence: integer("confidence").notNull().default(50), // 0–100, calculat de Echo (nu declarat de AI)
  reason: text("reason"), // de ce propunem, pe scurt, pentru om
  inputHash: text("input_hash"), // amprenta datelor produsului din care a ieșit propunerea
  auto: boolean("auto").notNull().default(false), // aprobat automat, peste pragul magazinului
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("product_edits_product_idx").on(t.productId),
  uniqueIndex("product_edits_product_field_idx").on(t.productId, t.field),
  index("product_edits_project_status_idx").on(t.projectId, t.status, t.field),
]);

/**
 * Apeluri AI care nu sunt întrebări de vizibilitate (ex. propunerile de titluri și descrieri):
 * costul și tokenii lor intră în bugetul lunar al magazinului, la fel ca rulările.
 */
export const aiTasks = pgTable("ai_tasks", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // fixes
  provider: text("provider").notNull(),
  model: text("model"),
  items: integer("items").notNull().default(0),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 10, scale: 5 }).notNull().default("0"),
  error: text("error"),
  createdAt: createdAt(),
}, (t) => [index("ai_tasks_project_idx").on(t.projectId, t.createdAt)]);

/** Recenzii verificate: doar de la comenzi reale urmărite. */
export const reviews = pgTable("reviews", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  rating: integer("rating"),
  text: text("text"),
  authorName: text("author_name"),
  status: text("status").notNull().default("cerut"), // cerut | publicat | ascuns
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("reviews_project_order_idx").on(t.projectId, t.orderId)]);

/** Agent Gate: comenzi venite de la agenți AI și decizia luată. */
export const agentOrders = pgTable("agent_orders", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  agent: text("agent").notNull(),
  verified: boolean("verified").notNull().default(false),
  orderRef: text("order_ref"),
  paymentMethod: text("payment_method").notNull(), // card | ramburs | transfer
  value: numeric("value", { precision: 12, scale: 2 }),
  risk: integer("risk").notNull().default(0),
  decision: text("decision").notNull(), // accepta | confirma_sms | verificare | respinge
  reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
}, (t) => [index("agent_orders_project_idx").on(t.projectId, t.createdAt)]);

/** API public și webhook-uri. */
export const apiKeys = pgTable("api_keys", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: createdAt(),
});
export const webhooks = pgTable("webhooks", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  events: jsonb("events").$type<string[]>().notNull().default([]),
  secret: text("secret").notNull(), // criptat, pentru semnătura HMAC
  active: boolean("active").notNull().default(true),
  lastStatus: integer("last_status"),
  createdAt: createdAt(),
});

/** Apeluri MCP (statistici: ce întreabă agenții). */
export const mcpCalls = pgTable("mcp_calls", {
  id: id(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  tool: text("tool").notNull(),
  query: text("query"),
  client: text("client"),
  createdAt: createdAt(),
}, (t) => [index("mcp_calls_project_idx").on(t.projectId, t.createdAt)]);

/**
 * Registrul de magazine: orice magazin pe care l-am văzut (audit gratuit, menționat de un AI, client),
 * revendicat sau nu. Păstrăm ultimele date verificate ca să nu le căutăm din nou de fiecare dată.
 * Datele sunt despre firme (date publice de pe site), nu despre persoane.
 */
export const stores = pgTable("stores", {
  id: id(),
  domain: text("domain").notNull(),
  pathPrefix: text("path_prefix").notNull().default(""),
  name: text("name"),
  country: text("country"),               // RO | HU, dedus din domeniu sau limbă
  platform: text("platform"),
  facts: jsonb("facts"),                  // ultimele fapte verificate (CUI, retur, ANPC, certificări…)
  auditScore: integer("audit_score"),
  lastAuditId: uuid("last_audit_id"),
  lastAuditAt: timestamp("last_audit_at", { withTimezone: true }),
  lastAuditOk: boolean("last_audit_ok"),
  factsCheckedAt: timestamp("facts_checked_at", { withTimezone: true }),
  auditCount: integer("audit_count").notNull().default(0),
  auditRequests: integer("audit_requests").notNull().default(0), // de câte ori a cerut cineva auditul gratuit
  source: text("source").notNull().default("audit"), // audit | ai | client
  claimedProjectId: uuid("claimed_project_id").references(() => projects.id, { onDelete: "set null" }),
  firstSeenAt: createdAt(),
}, (t) => [uniqueIndex("stores_domain_path_idx").on(t.domain, t.pathPrefix)]);

CREATE TABLE "product_ai_stats" (
	"project_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"appearances" integer NOT NULL,
	"prompts" integer NOT NULL,
	"providers" jsonb NOT NULL,
	"avg_position" numeric(5, 1) NOT NULL,
	"best_position" integer NOT NULL,
	"with_store" integer NOT NULL,
	"stated_price" numeric(12, 2),
	"stated_provider" text,
	"price_wrong" boolean DEFAULT false NOT NULL,
	"wrong_prices" jsonb NOT NULL,
	"examples" jsonb NOT NULL,
	"last_seen" date NOT NULL,
	CONSTRAINT "product_ai_stats_project_id_product_id_pk" PRIMARY KEY("project_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "product_ai_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "product_ai_answers" integer;--> statement-breakpoint
ALTER TABLE "product_ai_stats" ADD CONSTRAINT "product_ai_stats_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_ai_stats" ADD CONSTRAINT "product_ai_stats_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_ai_stats_rank_idx" ON "product_ai_stats" USING btree ("project_id","appearances");--> statement-breakpoint
CREATE INDEX "product_ai_stats_product_idx" ON "product_ai_stats" USING btree ("product_id");
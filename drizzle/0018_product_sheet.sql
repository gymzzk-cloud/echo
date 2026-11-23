CREATE TABLE "product_page_checks" (
	"project_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"url" text NOT NULL,
	"http_status" integer NOT NULL,
	"bot_blocked" boolean DEFAULT false NOT NULL,
	"found" text DEFAULT '' NOT NULL,
	"source" text,
	"fields" jsonb,
	"description_words" integer,
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_page_checks_project_id_product_id_pk" PRIMARY KEY("project_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "product_page_checks" ADD CONSTRAINT "product_page_checks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_page_checks" ADD CONSTRAINT "product_page_checks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_page_checks_product_idx" ON "product_page_checks" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_gtin_idx" ON "products" USING btree ("gtin");--> statement-breakpoint
CREATE INDEX "products_project_mpn_idx" ON "products" USING btree ("project_id","mpn");
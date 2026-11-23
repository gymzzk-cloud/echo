CREATE TABLE "panel_snapshots" (
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"stamp" text NOT NULL,
	"data" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "panel_snapshots_project_id_key_pk" PRIMARY KEY("project_id","key")
);
--> statement-breakpoint
ALTER TABLE "panel_snapshots" ADD CONSTRAINT "panel_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_project_stock_rank_idx" ON "products" USING btree ("project_id","in_stock" DESC NULLS LAST,"popularity_rank");
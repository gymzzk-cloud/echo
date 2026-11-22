CREATE TABLE "ai_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"items" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 5) DEFAULT '0' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_edits" ADD COLUMN "project_id" uuid;--> statement-breakpoint
UPDATE "product_edits" e SET "project_id" = p."project_id" FROM "products" p WHERE p."id" = e."product_id";--> statement-breakpoint
DELETE FROM "product_edits" WHERE "project_id" IS NULL;--> statement-breakpoint
DELETE FROM "product_edits" e USING "product_edits" o WHERE e."product_id" = o."product_id" AND e."field" = o."field" AND e."id" <> o."id"
  AND (CASE e."status" WHEN 'aprobat' THEN 2 WHEN 'propus' THEN 1 ELSE 0 END, e."created_at") < (CASE o."status" WHEN 'aprobat' THEN 2 WHEN 'propus' THEN 1 ELSE 0 END, o."created_at");--> statement-breakpoint
ALTER TABLE "product_edits" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_edits" ADD COLUMN "confidence" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_edits" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "product_edits" ADD COLUMN "input_hash" text;--> statement-breakpoint
ALTER TABLE "product_edits" ADD COLUMN "auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_edits" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "fix_auto_threshold" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "fixes_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_tasks_project_idx" ON "ai_tasks" USING btree ("project_id","created_at");--> statement-breakpoint
ALTER TABLE "product_edits" ADD CONSTRAINT "product_edits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_edits_product_field_idx" ON "product_edits" USING btree ("product_id","field");--> statement-breakpoint
CREATE INDEX "product_edits_project_status_idx" ON "product_edits" USING btree ("project_id","status","field");
ALTER TABLE "products" ADD COLUMN "focus" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "focus_config" jsonb;--> statement-breakpoint
CREATE INDEX "products_project_focus_idx" ON "products" USING btree ("project_id","focus");
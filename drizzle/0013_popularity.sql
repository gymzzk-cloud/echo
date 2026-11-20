ALTER TABLE "products" ADD COLUMN "popularity_rank" integer;--> statement-breakpoint
CREATE INDEX "products_project_popularity_idx" ON "products" USING btree ("project_id","popularity_rank");
ALTER TABLE "product_ai_stats" ADD COLUMN "stated_run_id" text;--> statement-breakpoint
-- Prețul spus de AI se citește acum doar de pe rândul cu magazinul: recalculăm la următoarea programare a workerului.
UPDATE "projects" SET "product_ai_at" = NULL;

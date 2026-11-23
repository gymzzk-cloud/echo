ALTER TABLE "product_ai_stats" ADD COLUMN IF NOT EXISTS "real_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_ai_stats" ADD COLUMN IF NOT EXISTS "real_source" text;--> statement-breakpoint
ALTER TABLE "product_ai_stats" ADD COLUMN IF NOT EXISTS "site_checked_at" timestamp with time zone;--> statement-breakpoint
-- Prețul spus de AI se compară și cu prețul de pe pagina produsului: recalculăm (și citim paginile produselor cu preț spus).
UPDATE "projects" SET "product_ai_at" = NULL;

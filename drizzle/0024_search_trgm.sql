-- Căutările din panou (cod, cod producător, nume) folosesc indexuri trigram în loc să citească tot catalogul.
-- Doar adăugări: nimic nu se șterge sau se rescrie.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_title_trgm_idx" ON "products" USING gin (unaccent_lower("title") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_title_ci_trgm_idx" ON "products" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_mpn_trgm_idx" ON "products" USING gin (lower("mpn") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_ext_trgm_idx" ON "products" USING gin (lower("external_id") gin_trgm_ops);--> statement-breakpoint
-- Starea lucrărilor (JobWatcher, la 4 s): doar joburile active ale unui magazin, fără să citim tot istoricul.
CREATE INDEX IF NOT EXISTS "jobs_active_project_idx" ON "jobs" ((payload->>'projectId')) WHERE status IN ('queued','running');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_created_idx" ON "jobs" ("created_at");

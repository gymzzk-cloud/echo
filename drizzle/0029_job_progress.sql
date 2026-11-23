ALTER TABLE "jobs" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "progress" jsonb;
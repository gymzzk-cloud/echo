ALTER TABLE "connections" ADD COLUMN "next_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "last_modified" text;
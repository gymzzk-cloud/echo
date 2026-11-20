ALTER TABLE "feed_outputs" ADD COLUMN "settings" jsonb;--> statement-breakpoint
ALTER TABLE "feed_outputs" ADD COLUMN "file" "bytea";--> statement-breakpoint
ALTER TABLE "feed_outputs" ADD COLUMN "file_type" text;--> statement-breakpoint
ALTER TABLE "feed_outputs" ADD COLUMN "item_count" integer;--> statement-breakpoint
ALTER TABLE "feed_outputs" ADD COLUMN "stats" jsonb;--> statement-breakpoint
ALTER TABLE "feed_outputs" ADD COLUMN "stamp" text;--> statement-breakpoint
ALTER TABLE "feed_outputs" ADD COLUMN "generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feed_outputs" ADD COLUMN "last_error" text;
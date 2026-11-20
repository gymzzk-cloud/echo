ALTER TABLE "connections" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "last_modified" text;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "content_hash" text;
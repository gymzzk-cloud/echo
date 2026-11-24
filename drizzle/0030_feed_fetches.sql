CREATE TABLE "feed_fetches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feed_output_id" uuid NOT NULL,
	"bot" text NOT NULL,
	"status" integer NOT NULL,
	"outcome" text NOT NULL,
	"bytes" integer,
	"duration_ms" integer,
	"compressed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feed_fetches" ADD CONSTRAINT "feed_fetches_feed_output_id_feed_outputs_id_fk" FOREIGN KEY ("feed_output_id") REFERENCES "public"."feed_outputs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feed_fetches_output_at_idx" ON "feed_fetches" USING btree ("feed_output_id","created_at");
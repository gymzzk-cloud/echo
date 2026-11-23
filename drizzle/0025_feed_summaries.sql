CREATE TABLE "feed_summaries" (
	"project_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"stamp" text NOT NULL,
	"data" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_summaries_project_id_channel_pk" PRIMARY KEY("project_id","channel")
);
--> statement-breakpoint
ALTER TABLE "feed_summaries" ADD CONSTRAINT "feed_summaries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" text NOT NULL,
	"path_prefix" text DEFAULT '' NOT NULL,
	"name" text,
	"country" text,
	"platform" text,
	"facts" jsonb,
	"audit_score" integer,
	"last_audit_id" uuid,
	"last_audit_at" timestamp with time zone,
	"last_audit_ok" boolean,
	"facts_checked_at" timestamp with time zone,
	"audit_count" integer DEFAULT 0 NOT NULL,
	"audit_requests" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'audit' NOT NULL,
	"claimed_project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_claimed_project_id_projects_id_fk" FOREIGN KEY ("claimed_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stores_domain_path_idx" ON "stores" USING btree ("domain","path_prefix");
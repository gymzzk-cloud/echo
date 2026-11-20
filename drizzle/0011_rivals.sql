CREATE TABLE "competitor_dismissals" (
	"project_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competitor_dismissals_project_id_domain_pk" PRIMARY KEY("project_id","domain")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "rivals_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "competitor_dismissals" ADD CONSTRAINT "competitor_dismissals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
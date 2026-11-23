CREATE TABLE "product_details" (
	"project_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"description" text,
	"fetched_at" timestamp with time zone,
	CONSTRAINT "product_details_project_id_external_id_pk" PRIMARY KEY("project_id","external_id")
);
--> statement-breakpoint
ALTER TABLE "product_details" ADD CONSTRAINT "product_details_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_details_pending_idx" ON "product_details" USING btree ("project_id","fetched_at");--> statement-breakpoint
-- O sincronizare nouă: descrierile lipsă din listă se citesc apoi din pagina de detaliu a API-ului; entitățile HTML se decodează.
UPDATE "connections" SET "next_sync_at" = now(), "content_hash" = NULL, "etag" = NULL, "last_modified" = NULL WHERE "kind" <> 'upload';

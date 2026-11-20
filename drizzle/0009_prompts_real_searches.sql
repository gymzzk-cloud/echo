ALTER TABLE "products" ADD COLUMN "mpn" text;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Câmpul nou (mpn) se completează la următoarea sincronizare; fără hash vechi, catalogul se rescrie o dată.
UPDATE "connections" SET "content_hash" = NULL;
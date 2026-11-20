CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION unaccent_lower(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, $1)) $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS products_title_search_idx ON products (unaccent_lower(title) text_pattern_ops);

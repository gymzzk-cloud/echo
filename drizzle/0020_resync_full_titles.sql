-- Date, nu schemă: titlul produsului se ia acum complet (titlu + subtitlu, ca pe site), iar descrierea lungă rămâne descriere.
-- Cerem o sincronizare nouă a cataloagelor (hash-ul vechi nu mai e valabil); reparațiile se recalculează după ea.
UPDATE "connections" SET "next_sync_at" = now(), "content_hash" = NULL, "etag" = NULL, "last_modified" = NULL WHERE "kind" <> 'upload';

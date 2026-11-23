-- Date, nu schemă: dimensiunile ambalajului și valorile zero nu mai intră în descrierea produsului.
-- O sincronizare nouă a cataloagelor; reparațiile AI scrise pe datele vechi se recalculează după ea.
UPDATE "connections" SET "next_sync_at" = now(), "content_hash" = NULL, "etag" = NULL, "last_modified" = NULL WHERE "kind" <> 'upload';

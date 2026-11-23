-- Potrivirea pe produs e mai strictă și salvează dovada fiecărei apariții: recalculăm la următoarea programare a workerului (10 min).
UPDATE "projects" SET "product_ai_at" = NULL;

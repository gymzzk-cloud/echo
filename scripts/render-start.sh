#!/usr/bin/env bash
# Pornire pe Render (un singur serviciu web, plan gratuit):
# 1) aplică migrările, 2) creează contul demo doar dacă baza e goală,
# 3) pornește workerul în fundal, 4) pornește Next.js pe portul dat de Render.
set -u
npx tsx scripts/reset-db.ts || exit 1
npx tsx src/db/migrate.ts || exit 1
npx tsx src/db/needs-seed.ts
if [ $? -eq 10 ]; then
  if [ "${SEED_MODE:-demo}" = "real" ]; then
    echo "Baza e goală: creez profilul real (fără date inventate)."
    npx tsx src/db/seed-real.ts || echo "Seed real eșuat (continui pornirea)."
  else
    echo "Baza e goală: rulez seed-ul demo."
    ALLOW_DEMO_AI=1 npx tsx src/db/seed.ts || echo "Seed eșuat (continui pornirea)."
  fi
fi
if [ "${RUN_WORKER:-1}" = "1" ]; then
  npx tsx --conditions=react-server src/worker/index.ts &
fi
exec npx next start -p "${PORT:-10000}"

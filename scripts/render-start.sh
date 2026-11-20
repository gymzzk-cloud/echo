#!/usr/bin/env bash
# Pornire pe Render (un singur serviciu web, plan gratuit):
# 1) aplică migrările, 2) creează contul demo doar dacă baza e goală,
# 3) pornește workerul în fundal, 4) pornește Next.js pe portul dat de Render.
set -u
npx tsx src/db/migrate.ts || exit 1
npx tsx src/db/needs-seed.ts
if [ $? -eq 10 ]; then
  echo "Baza e goală: rulez seed-ul demo."
  npx tsx src/db/seed.ts || echo "Seed eșuat (continui pornirea)."
fi
if [ "${RUN_WORKER:-1}" = "1" ]; then
  npx tsx src/worker/index.ts &
fi
exec npx next start -p "${PORT:-10000}"

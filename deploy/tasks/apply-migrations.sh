#!/usr/bin/env bash
set -euo pipefail
DIR=$(ls -d /mnt/f/*/redesign-v2-fresh/supabase/migrations)
# Применяем по возрастанию имени; оба дневных префикса этапа задач.
for f in $(ls "$DIR"/20260601_*.sql "$DIR"/20260602_*.sql 2>/dev/null | sort); do
  echo "== applying $(basename "$f") =="
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"
done
echo "MIGRATIONS_DONE"

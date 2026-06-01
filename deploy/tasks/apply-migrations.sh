#!/usr/bin/env bash
set -euo pipefail
DIR=$(ls -d /mnt/f/*/redesign-v2-fresh/supabase/migrations)
for f in "$DIR"/20260601_*.sql; do
  echo "== applying $(basename "$f") =="
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"
done
echo "MIGRATIONS_DONE"

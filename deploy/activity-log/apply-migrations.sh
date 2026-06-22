#!/usr/bin/env bash
# Постоянное применение миграций №10 «История действий» к живой БД.
# Запуск (фаза деплоя, по слову «деплой»):
#   wsl -d Ubuntu -u root -- bash -c 'bash /mnt/f/*/redesign-v2-fresh/deploy/activity-log/apply-migrations.sh'
set -euo pipefail
DIR=$(ls -d /mnt/f/*/redesign-v2-fresh/supabase/migrations)
for f in $(ls "$DIR"/20260622_*.sql 2>/dev/null | sort); do
  echo "== applying $(basename "$f") =="
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"
done
echo "MIGRATIONS_DONE"

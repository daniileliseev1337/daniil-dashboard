#!/usr/bin/env bash
# Применение миграции Ф2 (вход по username, вариант А) к живой БД (фаза деплоя, по слову «деплой»).
# Запуск: wsl -d Ubuntu -u root -- bash -c 'bash /mnt/f/*/redesign-v2-fresh/deploy/username/apply-migrations.sh'
set -euo pipefail
DIR=$(ls -d /mnt/f/*/redesign-v2-fresh/supabase/migrations)
for f in $(ls "$DIR"/20260625_0002_username.sql 2>/dev/null | sort); do
  echo "== applying $(basename "$f") =="
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"
done
echo "MIGRATIONS_DONE"

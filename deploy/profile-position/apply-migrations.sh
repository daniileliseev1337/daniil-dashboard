#!/usr/bin/env bash
# Применение миграции «должность профиля» (profiles.position) к живой БД.
# Фаза деплоя, по слову «деплой». Колонка nullable, add if not exists — идемпотентно.
# Запуск: wsl -d Ubuntu -u root -- bash -c 'bash /mnt/f/*/redesign-v2-fresh/deploy/profile-position/apply-migrations.sh'
set -euo pipefail
DIR=$(ls -d /mnt/f/*/redesign-v2-fresh/supabase/migrations)
for f in $(ls "$DIR"/20260623_0001_profile_position.sql 2>/dev/null | sort); do
  echo "== applying $(basename "$f") =="
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"
done
echo "MIGRATIONS_DONE"

#!/usr/bin/env bash
# Транзакционный E2E №10 «История действий»: применяет миграции + verify-activity.sql в BEGIN…ROLLBACK
# (прод не меняется; create-or-replace идемпотентны — работает и до, и после постоянного применения).
# Запуск: wsl -d Ubuntu -u root -- bash -c 'bash /mnt/f/*/redesign-v2-fresh/deploy/activity-log/verify-activity.sh'
set -euo pipefail
MIG=$(ls -d /mnt/f/*/redesign-v2-fresh/supabase/migrations)
VDIR=$(ls -d /mnt/f/*/redesign-v2-fresh/deploy/activity-log)
( echo "BEGIN;"
  for f in "$MIG"/20260622_*.sql; do cat "$f"; echo; done
  cat "$VDIR/verify-activity.sql"
  echo "ROLLBACK;"
) | docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 2>&1 | tee /tmp/activity_verify.log
grep -q ACTIVITY_OK /tmp/activity_verify.log && echo "VERIFY_PASS" || { echo "VERIFY_FAIL"; exit 1; }

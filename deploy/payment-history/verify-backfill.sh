#!/usr/bin/env bash
# Сверка: paid_amount == SUM(платежей) для всех проектов (после backfill); общее число платежей.
set -euo pipefail
docker exec -i supabase-db psql -U postgres -d postgres <<'SQL'
\echo == MISMATCH (ожидаем 0) ==
select count(*) as mismatch from public.projects p
where coalesce(p.paid_amount,0) <> coalesce((select sum(amount) from public.project_payments where project_id=p.id),0);
\echo == TOTAL_PAYMENTS ==
select count(*) as total_payments from public.project_payments;
\echo == PROJECTS_WITH_PAID ==
select count(*) as projects_with_paid from public.projects where coalesce(paid_amount,0) > 0;
SQL

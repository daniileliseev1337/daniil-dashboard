-- Этап 6.4b: backfill версии №1 approved для существующих задач с непустым description.
-- Idempotent: только для задач без единой версии.
INSERT INTO public.task_tz_versions
  (task_id, version_no, content, status, proposed_by, resolved_by, created_at, resolved_at)
SELECT
  t.id, 1, t.description, 'approved', t.author_id, t.author_id, t.created_at, t.created_at
FROM public.project_tasks t
WHERE btrim(COALESCE(t.description, '')) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.task_tz_versions v WHERE v.task_id = t.id);

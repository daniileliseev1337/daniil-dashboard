-- Этап 6.4b: видимость задачи для дочерних таблиц/RPC.
-- Предикат 1-в-1 повторяет SELECT-политику project_tasks (20260601_0002 строки 7-10).
CREATE OR REPLACE FUNCTION public.can_access_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_tasks t
    WHERE t.id = p_task_id
      AND (
        (t.project_id IS NOT NULL AND public.can_access_project_comments(t.project_id))
        OR (t.project_id IS NULL AND (t.author_id = auth.uid() OR t.assigned_to = auth.uid() OR public.is_admin()))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_task(uuid) TO authenticated;

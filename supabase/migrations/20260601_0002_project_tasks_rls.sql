-- idempotent: пересоздать политики при повторном применении
DROP POLICY IF EXISTS tasks_select ON public.project_tasks;
DROP POLICY IF EXISTS tasks_insert ON public.project_tasks;
DROP POLICY IF EXISTS tasks_update ON public.project_tasks;
DROP POLICY IF EXISTS tasks_delete ON public.project_tasks;

CREATE POLICY tasks_select ON public.project_tasks FOR SELECT USING (
  (project_id IS NOT NULL AND public.can_access_project_comments(project_id))
  OR (project_id IS NULL AND (author_id = auth.uid() OR assigned_to = auth.uid() OR public.is_admin()))
);

CREATE POLICY tasks_insert ON public.project_tasks FOR INSERT WITH CHECK (
  public.is_approved()
  AND author_id = auth.uid()
  AND (project_id IS NULL OR public.can_access_project_comments(project_id))
);

CREATE POLICY tasks_update ON public.project_tasks FOR UPDATE
USING (
  author_id = auth.uid() OR assigned_to = auth.uid() OR public.is_admin()
  OR (project_id IS NOT NULL AND public.is_project_editor(project_id))
)
WITH CHECK (
  (author_id = auth.uid() OR assigned_to = auth.uid() OR public.is_admin()
   OR (project_id IS NOT NULL AND public.is_project_editor(project_id)))
  AND (project_id IS NULL OR public.can_access_project_comments(project_id))
);

CREATE POLICY tasks_delete ON public.project_tasks FOR DELETE USING (
  author_id = auth.uid() OR public.is_admin()
  OR (project_id IS NOT NULL AND public.is_project_owner(project_id))
);

-- Этап 6.4b: RPC комментариев и смены статуса задачи.

-- 1) get_task_comments: лента + имя автора + флаги, сортировка по created_at.
CREATE OR REPLACE FUNCTION public.get_task_comments(p_task_id uuid)
RETURNS TABLE (
  id uuid, task_id uuid, author_id uuid, author_name text,
  body text, is_question boolean, resolved boolean,
  resolved_by uuid, resolved_by_name text,
  resolved_at timestamptz, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT public.can_access_task(p_task_id) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;
  RETURN QUERY
  SELECT c.id, c.task_id, c.author_id, COALESCE(pa.name, pa.email, 'Пользователь'),
         c.body, c.is_question, c.resolved,
         c.resolved_by, COALESCE(pr.name, pr.email),
         c.resolved_at, c.created_at
  FROM public.task_comments c
  LEFT JOIN public.profiles pa ON pa.id = c.author_id
  LEFT JOIN public.profiles pr ON pr.id = c.resolved_by
  WHERE c.task_id = p_task_id
  ORDER BY c.created_at;
END $$;

GRANT EXECUTE ON FUNCTION public.get_task_comments(uuid) TO authenticated;

-- 2) resolve_question: закрыть/переоткрыть вопрос. Только для is_question.
--    Право: автор задачи, исполнитель или admin.
CREATE OR REPLACE FUNCTION public.resolve_question(p_comment_id uuid, p_resolved boolean)
RETURNS public.task_comments
LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE
  c        public.task_comments%ROWTYPE;
  t        public.project_tasks%ROWTYPE;
  v_caller uuid := auth.uid();
  v_row    public.task_comments%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.task_comments WHERE id = p_comment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'comment_not_found'; END IF;
  IF NOT c.is_question THEN RAISE EXCEPTION 'not_a_question'; END IF;

  SELECT * INTO t FROM public.project_tasks WHERE id = c.task_id;
  IF NOT public.can_access_task(c.task_id) THEN RAISE EXCEPTION 'access_denied'; END IF;

  IF NOT (t.author_id = v_caller OR t.assigned_to = v_caller OR public.is_admin()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.task_comments
     SET resolved    = p_resolved,
         resolved_by = CASE WHEN p_resolved THEN v_caller ELSE NULL END,
         resolved_at = CASE WHEN p_resolved THEN now()    ELSE NULL END
   WHERE id = p_comment_id
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.resolve_question(uuid, boolean) TO authenticated;

-- 3) set_task_status: смена статуса задачи. Переход в 'Готово' — ТОЛЬКО автор.
--    Прочие переходы — сторонам задачи / редактору проекта / админу (как UPDATE-политика 6.4a).
CREATE OR REPLACE FUNCTION public.set_task_status(p_task_id uuid, p_status text)
RETURNS public.project_tasks
LANGUAGE plpgsql VOLATILE SECURITY DEFINER AS $$
DECLARE
  t        public.project_tasks%ROWTYPE;
  v_caller uuid := auth.uid();
  v_row    public.project_tasks%ROWTYPE;
BEGIN
  IF p_status NOT IN ('Новая','В работе','На проверке','Готово','Отменена') THEN
    RAISE EXCEPTION 'bad_status';
  END IF;

  SELECT * INTO t FROM public.project_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'task_not_found'; END IF;
  IF NOT public.can_access_task(p_task_id) THEN RAISE EXCEPTION 'access_denied'; END IF;

  -- общее право на смену статуса = как UPDATE-политика project_tasks (6.4a)
  IF NOT (t.author_id = v_caller OR t.assigned_to = v_caller OR public.is_admin()
          OR (t.project_id IS NOT NULL AND public.is_project_editor(t.project_id))) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- переход в 'Готово' — только автор задачи
  IF p_status = 'Готово' AND t.author_id <> v_caller THEN
    RAISE EXCEPTION 'only_author_can_complete';
  END IF;

  UPDATE public.project_tasks SET status = p_status WHERE id = p_task_id
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.set_task_status(uuid, text) TO authenticated;

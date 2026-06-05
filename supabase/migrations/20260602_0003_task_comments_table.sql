-- Этап 6.4b: обсуждение задачи (гибрид лента/вопросы).
CREATE TABLE IF NOT EXISTS public.task_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES public.profiles(id),
  body        text NOT NULL,
  is_question boolean NOT NULL DEFAULT false,
  resolved    boolean NOT NULL DEFAULT false,
  resolved_by uuid REFERENCES public.profiles(id),
  resolved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task    ON public.task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_open_q  ON public.task_comments(task_id, is_question, resolved);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

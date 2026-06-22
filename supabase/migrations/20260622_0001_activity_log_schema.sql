-- 20260622_0001: фиксируем activity_log + log_activity в репо (были только в живой БД — техдолг),
-- расширяем колонками project_id/is_financial и добавляем хелпер log_activity_ext.

-- Таблица (как в живой БД; IF NOT EXISTS — не тронет существующую, но делает среду воспроизводимой).
create table if not exists public.activity_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,
  action       text not null,
  target_id    uuid,
  target_email text,
  details      jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_activity_log_created_at on public.activity_log (created_at desc);

alter table public.activity_log enable row level security;
drop policy if exists activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log
  for select to authenticated using (public.is_admin());
-- INSERT-политики НЕТ: пишется только через SECURITY DEFINER (log_activity / log_activity_ext).

-- Существующая log_activity (4 арг.) — фиксируем в репо БЕЗ изменений сигнатуры.
create or replace function public.log_activity(
  p_action text, p_target_id uuid default null, p_target_email text default null, p_details jsonb default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor_id uuid; v_actor_email text; v_log_id uuid;
begin
  v_actor_id := auth.uid();
  select email into v_actor_email from public.profiles where id = v_actor_id;
  insert into public.activity_log (actor_id, actor_email, action, target_id, target_email, details)
  values (v_actor_id, v_actor_email, p_action, p_target_id, p_target_email, p_details)
  returning id into v_log_id;
  return v_log_id;
end; $$;

-- Новые колонки.
alter table public.activity_log
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists is_financial boolean not null default false;

create index if not exists idx_activity_log_project_created
  on public.activity_log (project_id, created_at desc) where project_id is not null;

-- Расширенный хелпер: пишет project_id/is_financial, единая actor-логика.
create or replace function public.log_activity_ext(
  p_action text, p_project_id uuid, p_is_financial boolean,
  p_target_id uuid default null, p_target_email text default null, p_details jsonb default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid; v_email text; v_id uuid;
begin
  v_actor := auth.uid();
  select email into v_email from public.profiles where id = v_actor;
  insert into public.activity_log
    (actor_id, actor_email, action, project_id, is_financial, target_id, target_email, details)
  values
    (v_actor, v_email, p_action, p_project_id, coalesce(p_is_financial,false), p_target_id, p_target_email, p_details)
  returning id into v_id;
  return v_id;
end; $$;

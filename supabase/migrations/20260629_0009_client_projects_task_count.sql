-- 20260629_0009: индикатор задач + visibility в клиентской проекции (§6).
-- drop нужен: меняется тип возврата (добавлены visibility, open_task_count).
drop function if exists public.get_my_client_projects();
create or replace function public.get_my_client_projects()
returns table(id uuid, name text, stage text, start_date date, deadline date,
              contract_sum numeric, paid_amount numeric, executor text,
              visibility text, open_task_count int)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select p.id, p.name, p.stage, p.start_date, p.deadline,
         p.contract_sum, p.paid_amount, p.executor, p.visibility,
         (select count(*)::int from public.project_tasks t
          where t.project_id = p.id and t.status not in ('Готово','Отменена')) as open_task_count
  from public.projects p
  join public.clients c on c.id = p.client_id
  where c.user_id = auth.uid()
  order by p.created_at desc;
$$;

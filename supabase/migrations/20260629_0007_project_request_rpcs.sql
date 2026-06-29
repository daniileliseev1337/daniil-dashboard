-- 20260629_0007: RPC жизненного цикла заявки (§5.3).

-- create_project_request: заказчик создаёт заявку; валидирует executor; уведомляет сотрудников.
create or replace function public.create_project_request(
  p_name text, p_description text, p_deadline date, p_mode text,
  p_assignment_mode text, p_desired_executor_id uuid default null, p_client_id uuid default null
) returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_client uuid;
  v_req uuid;
begin
  if not public.am_i_client() then raise exception 'not_client'; end if;
  if p_mode not in ('quick','detailed') then raise exception 'bad_mode'; end if;
  if p_assignment_mode not in ('marketplace','assignee') then raise exception 'bad_assignment_mode'; end if;

  -- client_id: переданный (если принадлежит заказчику) или единственная запись заказчика
  v_client := coalesce(
    (select c.id from public.clients c where c.id = p_client_id and c.user_id = auth.uid()),
    (select c.id from public.clients c where c.user_id = auth.uid() order by c.created_at limit 1)
  );
  if v_client is null then raise exception 'no_client_record'; end if;

  -- assignee: исполнитель обязателен и должен быть в списке доступных
  if p_assignment_mode = 'assignee' then
    if p_desired_executor_id is null
       or not exists (select 1 from public.list_available_executors() e where e.id = p_desired_executor_id) then
      raise exception 'invalid_executor';
    end if;
  end if;

  insert into public.project_requests
    (client_id, created_by, name, description, desired_deadline, mode, assignment_mode, desired_executor_id)
  values (v_client, auth.uid(), p_name, p_description, p_deadline, p_mode, p_assignment_mode,
          case when p_assignment_mode='assignee' then p_desired_executor_id else null end)
  returning id into v_req;

  -- in-app уведомление сотрудникам. Схема notifications: user_id/type/title/body/url (все NOT NULL).
  insert into public.notifications (user_id, type, title, body, url)
  select ur.user_id, 'project_request', 'Новая заявка от заказчика', p_name, '/requests'
  from public.user_roles ur where ur.role = 'employee';

  return v_req;
end $$;
grant execute on function public.create_project_request(text,text,date,text,text,uuid,uuid) to authenticated;

-- accept_project_request: сотрудник материализует проект из заявки (один клик).
create or replace function public.accept_project_request(p_request_id uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  r public.project_requests%ROWTYPE;
  v_pid uuid;
  v_exec_name text;
begin
  if not (public.is_employee() or public.is_admin()) then raise exception 'forbidden'; end if;
  select * into r from public.project_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if r.status <> 'Новая' then raise exception 'already_processed'; end if;

  if r.assignment_mode = 'marketplace' then
    insert into public.projects (owner_id, client_id, name, stage, visibility)
    values (auth.uid(), r.client_id, r.name, 'Поиск исполнителя', 'marketplace')
    returning id into v_pid;
  else
    -- assignee: проект + исполнитель в команду и executors (паттерн take_project, но НЕ вызов).
    insert into public.projects (owner_id, client_id, name, stage, visibility)
    values (auth.uid(), r.client_id, r.name, 'В работе', 'team')
    returning id into v_pid;

    select coalesce(nullif(name,''), email) into v_exec_name
    from public.profiles where id = r.desired_executor_id;

    update public.projects
    set executors = jsonb_build_array(jsonb_build_object('name', coalesce(v_exec_name,''),
                                                         'userId', r.desired_executor_id::text)),
        executor  = coalesce(v_exec_name,'')
    where id = v_pid;

    insert into public.project_members (project_id, user_id, role)
    values (v_pid, r.desired_executor_id, 'editor')
    on conflict (project_id, user_id) do update set role = 'editor';
  end if;

  update public.project_requests
  set status = 'Принята', accepted_project_id = v_pid where id = p_request_id;

  -- уведомить заказчика
  insert into public.notifications (user_id, type, title, body, url)
  values (r.created_by, 'project_request', 'Заявка принята', r.name, '/orders');

  return v_pid;
end $$;
grant execute on function public.accept_project_request(uuid) to authenticated;

-- reject_project_request
create or replace function public.reject_project_request(p_request_id uuid, p_reason text default null)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare r public.project_requests%ROWTYPE;
begin
  if not (public.is_employee() or public.is_admin()) then raise exception 'forbidden'; end if;
  select * into r from public.project_requests where id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if r.status <> 'Новая' then raise exception 'already_processed'; end if;
  update public.project_requests set status = 'Отклонена' where id = p_request_id;
  insert into public.notifications (user_id, type, title, body, url)
  values (r.created_by, 'project_request', 'Заявка отклонена', coalesce(p_reason, r.name), '/orders');
end $$;
grant execute on function public.reject_project_request(uuid, text) to authenticated;

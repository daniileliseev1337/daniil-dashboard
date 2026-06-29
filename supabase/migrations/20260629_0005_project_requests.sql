-- 20260629_0005: заявки на проекты от заказчика (§5.1/5.2).
create table if not exists public.project_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  created_by uuid not null references public.profiles(id),
  name text not null,
  description text,
  desired_deadline date,
  mode text not null default 'quick' check (mode in ('quick','detailed')),
  assignment_mode text not null default 'marketplace' check (assignment_mode in ('marketplace','assignee')),
  desired_executor_id uuid references public.profiles(id),
  status text not null default 'Новая' check (status in ('Новая','Принята','Отклонена')),
  accepted_project_id uuid references public.projects(id),
  created_at timestamptz not null default now()
);

alter table public.project_requests enable row level security;

-- Хелпер (m-2): заказчик НЕ видит свою запись clients под RLS (clients_select = owner/admin),
-- поэтому проверку владения client_id выносим в SECURITY DEFINER (как am_i_client).
create or replace function public.is_my_client_record(p_client_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from public.clients where id = p_client_id and user_id = auth.uid());
$$;
grant execute on function public.is_my_client_record(uuid) to authenticated;

-- SELECT: создатель, сотрудник (is_employee), админ.
drop policy if exists "preq_select" on public.project_requests;
create policy "preq_select" on public.project_requests for select to authenticated
  using (created_by = auth.uid() or public.is_employee() or public.is_admin());

-- INSERT: заказчик создаёт от своего имени, client_id принадлежит ему (через SECURITY DEFINER хелпер).
drop policy if exists "preq_insert" on public.project_requests;
create policy "preq_insert" on public.project_requests for insert to authenticated
  with check (
    public.am_i_client()
    and created_by = auth.uid()
    and public.is_my_client_record(client_id)
  );

-- UPDATE/DELETE: только через RPC (SECURITY DEFINER) или админ.
drop policy if exists "preq_update_admin" on public.project_requests;
create policy "preq_update_admin" on public.project_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "preq_delete_admin" on public.project_requests;
create policy "preq_delete_admin" on public.project_requests for delete to authenticated
  using (public.is_admin());

create index if not exists idx_preq_created_by on public.project_requests(created_by);
create index if not exists idx_preq_status on public.project_requests(status);

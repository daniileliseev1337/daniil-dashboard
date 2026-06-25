-- 20260625_0001: Система ролей, Фаза 1 — таблица user_roles (мультироль) + has_role + RPC + backfill.
-- admin НЕ трогаем: остаётся profiles.role='admin' / is_admin() (~24 места в коде целы).
-- Роли: employee (сотрудник) / client (заказчик) / visitor (посетитель). Спек: docs/superpowers/specs/2026-06-25-roles-system-design.md

-- 1. Таблица ролей. Мультироль = несколько строк на user_id.
create table if not exists public.user_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('employee','client','visitor')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index if not exists idx_user_roles_user on public.user_roles(user_id);

alter table public.user_roles enable row level security;

-- Читать: свои роли — сам пользователь; все роли — админ. Мутации — ТОЛЬКО через SECURITY DEFINER RPC
-- (insert/update/delete policy НЕ создаём → прямые мутации под RLS запрещены).
drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
  for select using (user_id = auth.uid() or public.is_admin());

-- 2. Хелпер: есть ли у пользователя роль (для RLS смежных таблиц и проверок).
create or replace function public.has_role(p_uid uuid, p_role text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.user_roles where user_id = p_uid and role = p_role);
$$;
grant execute on function public.has_role(uuid, text) to authenticated;

-- 3. Роли текущего пользователя (для фронта — определить вид/переключатель).
create or replace function public.get_my_roles()
returns table (role text)
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.user_roles where user_id = auth.uid();
$$;
grant execute on function public.get_my_roles() to authenticated;

-- 4. Назначить набор ролей пользователю (админ). Полная замена набора. p_roles — массив ролей.
create or replace function public.set_user_roles(p_user_id uuid, p_roles text[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if exists (select 1 from unnest(p_roles) r where r not in ('employee','client','visitor')) then
    raise exception 'bad_role';
  end if;
  delete from public.user_roles where user_id = p_user_id;
  insert into public.user_roles (user_id, role)
    select p_user_id, r from unnest(p_roles) r;
end; $$;
grant execute on function public.set_user_roles(uuid, text[]) to authenticated;

-- 5. Backfill существующих аккаунтов:
--    - все approved профили (вкл. admin) → employee (рабочий вид сохраняется);
--    - привязанные заказчики (clients.user_id) → дополнительно client.
insert into public.user_roles (user_id, role)
  select p.id, 'employee' from public.profiles p
  where coalesce(p.approved, false) = true
  on conflict do nothing;

insert into public.user_roles (user_id, role)
  select distinct c.user_id, 'client' from public.clients c
  where c.user_id is not null
  on conflict do nothing;

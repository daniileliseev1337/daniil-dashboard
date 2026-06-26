-- 20260625_0002: Ф2 — вход по username без почты (вариант А, мягкий).
-- Спек: docs/superpowers/specs/2026-06-25-roles-system-design.md §4.
-- Суть: новый юзер регистрируется по username; под капотом синтетический email
--   <username>@klimat.local для Supabase-auth (GoTrue требует email). Существующие
--   email-аккаунты сохраняют email-вход (их username = NULL).
--
-- ВАЖНО (контекст БД): функции public.handle_new_user() и public.admin_list_users()
--   живут только в живой БД (baseline до миграций) — их тела в репозитории НЕТ.
--   Поэтому НЕ переписываем handle_new_user(), а добавляем ВТОРОЙ триггер
--   on_auth_user_created_meta, который срабатывает ПОСЛЕ on_auth_user_created
--   (лексикографически позже → строка profiles уже создана) и дописывает
--   username/name из метаданных signUp. Ноль риска регрессии существующей функции.

-- 1. Колонка логина. Существующие строки → NULL (вход по email сохраняется).
alter table public.profiles add column if not exists username text;

-- 2. Уникальность логина, регистронезависимая, только для непустых значений.
--    (множественные NULL у email-аккаунтов конфликтов не дают — partial index.)
create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username))
  where username is not null;

-- 3. Заполнение username/name из метаданных signUp (options.data).
--    SECURITY DEFINER → UPDATE обходит RLS profiles. Идемпотентно по факту:
--    coalesce не перетирает уже выставленные значения.
create or replace function public.handle_new_user_meta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles
     set username = coalesce(new.raw_user_meta_data->>'username', username),
         name     = coalesce(nullif(new.raw_user_meta_data->>'name', ''), name)
   where id = new.id;
  return new;
end;
$$;

-- 4. Триггер. Имя сортируется ПОСЛЕ on_auth_user_created (prefix-правило),
--    значит handle_new_user() уже вставил строку profiles к моменту этого UPDATE.
drop trigger if exists on_auth_user_created_meta on auth.users;
create trigger on_auth_user_created_meta
  after insert on auth.users
  for each row execute function public.handle_new_user_meta();

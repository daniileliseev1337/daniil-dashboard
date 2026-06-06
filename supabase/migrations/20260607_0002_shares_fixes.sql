-- Фиксы ревью к фиче «доли оплаты»:
-- I1: атомарная замена долей (delete+insert в одной транзакции) — устраняет потерю данных при сбое insert.
-- I2: participant_label — кэш отображаемого имени участника (для user/client доли имя иначе теряется при перезагрузке).

-- I2: кэш отображаемого имени (не «адрес» участника — CHECK не затрагивает).
alter table public.project_shares add column if not exists participant_label text;

-- I1: атомарный replace-all долей проекта. SECURITY INVOKER → RLS project_shares_write
-- (владелец проекта) сохраняется; плюс явная проверка владельца для понятной ошибки.
create or replace function public.set_project_shares(p_project_id uuid, p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.projects where id = p_project_id and owner_id = auth.uid()
  ) then
    raise exception 'not_project_owner';
  end if;

  delete from public.project_shares where project_id = p_project_id;

  insert into public.project_shares
    (project_id, participant_user_id, participant_client_id, participant_name,
     participant_label, share_kind, share_value)
  select
    p_project_id,
    nullif(r->>'participant_user_id', '')::uuid,
    nullif(r->>'participant_client_id', '')::uuid,
    nullif(r->>'participant_name', ''),
    nullif(r->>'participant_label', ''),
    r->>'share_kind',
    (r->>'share_value')::numeric
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r;
end;
$$;

grant execute on function public.set_project_shares(uuid, jsonb) to authenticated;

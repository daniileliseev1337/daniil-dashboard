-- Атомарный replace-all платежей проекта (delete + insert в одной транзакции), как set_project_shares.
-- Гейт: только владелец проекта. Триггер пересчитает paid_amount.

create or replace function public.set_project_payments(p_project_id uuid, p_rows jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.projects where id = p_project_id and owner_id = auth.uid()) then
    raise exception 'not project owner';
  end if;
  delete from public.project_payments where project_id = p_project_id;
  insert into public.project_payments (project_id, amount, paid_on, note, created_by)
  select p_project_id,
         (r->>'amount')::numeric,
         (r->>'paid_on')::date,
         nullif(r->>'note', ''),
         auth.uid()
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  where (r->>'amount') is not null
    and (r->>'amount')::numeric > 0
    and (r->>'paid_on') is not null;
end; $$;

grant execute on function public.set_project_payments(uuid, jsonb) to authenticated;

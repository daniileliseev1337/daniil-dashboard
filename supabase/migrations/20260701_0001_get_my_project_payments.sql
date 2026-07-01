-- 20260701_0001: история платежей заказчику (§1-безопасная проекция).
-- Заказчику видны платежи ТОЛЬКО его проектов; без себестоимости/долей/чужого.
create or replace function public.get_my_project_payments()
returns table(project_id uuid, project_name text, paid_on date, amount numeric)
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select pp.project_id, p.name, pp.paid_on, pp.amount
  from public.project_payments pp
  join public.projects p on p.id = pp.project_id
  join public.clients   c on c.id = p.client_id
  where c.user_id = auth.uid()
  order by pp.paid_on desc;
$$;
grant execute on function public.get_my_project_payments() to authenticated;

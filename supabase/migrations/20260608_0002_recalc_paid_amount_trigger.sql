-- paid_amount = SUM(project_payments.amount) — поддерживается триггером.
-- Источник правды по paid_amount — платежи; форма проекта это поле больше не пишет.

create or replace function public.recalc_project_paid_amount()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare pid uuid;
begin
  pid := coalesce(new.project_id, old.project_id);
  update public.projects
     set paid_amount = (select coalesce(sum(amount), 0) from public.project_payments where project_id = pid)
   where id = pid;
  -- UPDATE мог сменить project_id — пересчитать и прежний проект
  if (tg_op = 'UPDATE' and new.project_id is distinct from old.project_id) then
    update public.projects
       set paid_amount = (select coalesce(sum(amount), 0) from public.project_payments where project_id = old.project_id)
     where id = old.project_id;
  end if;
  return null;
end; $$;

drop trigger if exists trg_recalc_paid_amount on public.project_payments;
create trigger trg_recalc_paid_amount
after insert or update or delete on public.project_payments
for each row execute function public.recalc_project_paid_amount();

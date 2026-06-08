-- Backfill: для проектов с уже введённой оплатой создаём один стартовый платёж.
-- Дата = сегодня (дата переноса) — решение владельца. Идемпотентно (not exists).
-- Триггер пересчитает paid_amount в то же значение (потерь нет).

insert into public.project_payments (project_id, amount, paid_on, note, created_by)
select p.id, p.paid_amount, current_date, 'Перенос из paid_amount', p.owner_id
from public.projects p
where p.paid_amount > 0
  and not exists (select 1 from public.project_payments pp where pp.project_id = p.id);

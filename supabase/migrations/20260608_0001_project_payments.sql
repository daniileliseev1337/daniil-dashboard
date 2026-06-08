-- История платежей по проектам. Спек: docs/superpowers/specs/2026-06-08-payment-history-design.md
-- Платёж — в счёт договора (распределяется пропорционально долям). paid_amount = SUM(amount) через триггер.

create table if not exists public.project_payments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  amount      numeric not null check (amount > 0),
  paid_on     date not null,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) default auth.uid()
);

create index if not exists project_payments_project_id_idx on public.project_payments(project_id);

alter table public.project_payments enable row level security;

-- SELECT/WRITE: только владелец проекта. Участник суммы договора и чужие платежи не видит —
-- его проекция остаётся через get_my_shares (агрегат по paid_amount).
drop policy if exists project_payments_select on public.project_payments;
create policy project_payments_select on public.project_payments
for select using (
  exists (select 1 from public.projects p
          where p.id = project_payments.project_id and p.owner_id = auth.uid())
);

drop policy if exists project_payments_write on public.project_payments;
create policy project_payments_write on public.project_payments
for all using (
  exists (select 1 from public.projects p
          where p.id = project_payments.project_id and p.owner_id = auth.uid())
) with check (
  exists (select 1 from public.projects p
          where p.id = project_payments.project_id and p.owner_id = auth.uid())
);

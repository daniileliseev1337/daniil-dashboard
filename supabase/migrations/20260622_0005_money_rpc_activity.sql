-- 20260622_0005: финанс-аудит payments/shares внутри RPC (replace-all → diff, без шума на пустом сохранении).

-- payments: SECURITY DEFINER (как было). diff набора по (amount, paid_on).
create or replace function public.set_project_payments(p_project_id uuid, p_rows jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old jsonb; v_new jsonb; r record;
begin
  if not exists (select 1 from public.projects where id = p_project_id and owner_id = auth.uid()) then
    raise exception 'not project owner';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('amount', amount::text, 'paid_on', paid_on::text)), '[]'::jsonb)
    into v_old from public.project_payments where project_id = p_project_id;
  delete from public.project_payments where project_id = p_project_id;
  insert into public.project_payments (project_id, amount, paid_on, note, created_by)
  select p_project_id, (je->>'amount')::numeric, (je->>'paid_on')::date, nullif(je->>'note',''), auth.uid()
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) je
  where (je->>'amount') is not null and (je->>'amount')::numeric > 0 and (je->>'paid_on') is not null;
  select coalesce(jsonb_agg(jsonb_build_object('amount', amount::text, 'paid_on', paid_on::text)), '[]'::jsonb)
    into v_new from public.project_payments where project_id = p_project_id;
  -- added = new \ old
  for r in
    select e.value as v from jsonb_array_elements(v_new) e
    except all
    select e.value as v from jsonb_array_elements(v_old) e
  loop
    perform public.log_activity_ext('payment_added', p_project_id, true, null, null, r.v);
  end loop;
  -- removed = old \ new
  for r in
    select e.value as v from jsonb_array_elements(v_old) e
    except all
    select e.value as v from jsonb_array_elements(v_new) e
  loop
    perform public.log_activity_ext('payment_removed', p_project_id, true, null, null, r.v);
  end loop;
end; $$;
grant execute on function public.set_project_payments(uuid, jsonb) to authenticated;

-- shares: SECURITY INVOKER (как было) — запись лога через DEFINER-хелпер. diff по ключу участника.
create or replace function public.set_project_shares(p_project_id uuid, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare r record;
begin
  if not exists (select 1 from public.projects where id = p_project_id and owner_id = auth.uid()) then
    raise exception 'not_project_owner';
  end if;
  drop table if exists _old_shares;
  create temp table _old_shares on commit drop as
    select participant_user_id, participant_client_id, participant_name, participant_label, share_kind, share_value
    from public.project_shares where project_id = p_project_id;

  delete from public.project_shares where project_id = p_project_id;
  insert into public.project_shares
    (project_id, participant_user_id, participant_client_id, participant_name, participant_label, share_kind, share_value)
  select p_project_id,
    nullif(je->>'participant_user_id','')::uuid, nullif(je->>'participant_client_id','')::uuid,
    nullif(je->>'participant_name',''), nullif(je->>'participant_label',''),
    je->>'share_kind', (je->>'share_value')::numeric
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as je;

  -- added: участник появился (ключ = coalesce user/client/name)
  for r in
    select n.participant_label as label, n.share_kind, n.share_value
    from public.project_shares n
    where n.project_id = p_project_id and not exists (
      select 1 from _old_shares o where
        coalesce(o.participant_user_id::text,o.participant_client_id::text,o.participant_name)
      = coalesce(n.participant_user_id::text,n.participant_client_id::text,n.participant_name))
  loop
    perform public.log_activity_ext('share_added', p_project_id, true, null, null,
      jsonb_build_object('label', r.label, 'kind', r.share_kind, 'value', r.share_value));
  end loop;
  -- removed: участник исчез
  for r in
    select o.participant_label as label, o.share_kind, o.share_value
    from _old_shares o where not exists (
      select 1 from public.project_shares n where n.project_id = p_project_id and
        coalesce(n.participant_user_id::text,n.participant_client_id::text,n.participant_name)
      = coalesce(o.participant_user_id::text,o.participant_client_id::text,o.participant_name))
  loop
    perform public.log_activity_ext('share_removed', p_project_id, true, null, null,
      jsonb_build_object('label', r.label, 'kind', r.share_kind, 'value', r.share_value));
  end loop;
  -- changed: тот же участник, но kind/value отличается
  for r in
    select n.participant_label as label, o.share_kind as okind, o.share_value as oval,
           n.share_kind as nkind, n.share_value as nval
    from public.project_shares n join _old_shares o on
        coalesce(n.participant_user_id::text,n.participant_client_id::text,n.participant_name)
      = coalesce(o.participant_user_id::text,o.participant_client_id::text,o.participant_name)
    where n.project_id = p_project_id
      and (n.share_kind is distinct from o.share_kind or n.share_value is distinct from o.share_value)
  loop
    perform public.log_activity_ext('share_changed', p_project_id, true, null, null,
      jsonb_build_object('label', r.label, 'from_kind', r.okind, 'from_value', r.oval,
                         'to_kind', r.nkind, 'to_value', r.nval));
  end loop;
end; $$;
grant execute on function public.set_project_shares(uuid, jsonb) to authenticated;

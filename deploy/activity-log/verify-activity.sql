-- E2E-проверки №10 «История действий». Запускается verify-activity.sh внутри BEGIN…ROLLBACK
-- (миграции подаются перед этим файлом; прод не меняется).
select set_config('request.jwt.claims',
  json_build_object('sub',(select id::text from public.profiles where approved order by created_at limit 1),
                    'role','authenticated')::text, true);
insert into public.projects(owner_id,name,visibility,stage,contract_sum)
  values ((select id from public.profiles where approved order by created_at limit 1),
          'AUDIT_VERIFY','team','В работе',100000);
update public.projects set stage='Оплачен'     where name='AUDIT_VERIFY';   -- нефинанс
update public.projects set contract_sum=150000 where name='AUDIT_VERIFY';   -- финанс
update public.projects set paid_amount=999     where name='AUDIT_VERIFY';   -- производное → НЕ логируется
insert into public.project_members(project_id,user_id,role)
  values ((select id from public.projects where name='AUDIT_VERIFY'),
          (select id from public.profiles where approved order by created_at offset 1 limit 1),'editor');
select public.set_project_payments((select id from public.projects where name='AUDIT_VERIFY'),
  '[{"amount":50000,"paid_on":"2026-06-22"}]'::jsonb);
select public.set_project_payments((select id from public.projects where name='AUDIT_VERIFY'),
  '[{"amount":50000,"paid_on":"2026-06-22"}]'::jsonb);  -- повтор того же: без шума
select public.set_project_shares((select id from public.projects where name='AUDIT_VERIFY'),
  jsonb_build_array(jsonb_build_object('participant_user_id',
    (select id::text from public.profiles where approved order by created_at offset 1 limit 1),
    'share_kind','percent','share_value',30)));

do $$
declare v_pid uuid; a_id text; b_id text;
  v_paid_logged int; v_pay int; a_total int; a_fin int; b_fin int; b_nonfin int; c_total int; v_policy int;
begin
  select id into v_pid from public.projects where name='AUDIT_VERIFY';
  select id::text into a_id from public.profiles where approved order by created_at limit 1;
  select id::text into b_id from public.profiles where approved order by created_at offset 1 limit 1;

  select count(*) into v_paid_logged from public.activity_log
    where project_id=v_pid and details ? 'to' and (details->>'to')='999';
  select count(*) into v_pay from public.activity_log where project_id=v_pid and action='payment_added';

  perform set_config('request.jwt.claims', json_build_object('sub',a_id,'role','authenticated')::text, true);
  select count(*) into a_total from public.get_project_activity(v_pid,200);
  select count(*) filter (where is_financial) into a_fin from public.get_project_activity(v_pid,200);

  perform set_config('request.jwt.claims', json_build_object('sub',b_id,'role','authenticated')::text, true);
  select count(*) filter (where is_financial)     into b_fin    from public.get_project_activity(v_pid,200);
  select count(*) filter (where not is_financial) into b_nonfin from public.get_project_activity(v_pid,200);

  perform set_config('request.jwt.claims', json_build_object('sub',gen_random_uuid()::text,'role','authenticated')::text, true);
  select count(*) into c_total from public.get_project_activity(v_pid,200);

  select count(*) into v_policy from pg_policies
    where schemaname='public' and tablename='activity_log' and policyname='activity_log_select';

  if v_paid_logged <> 0 then raise exception 'FAIL: paid_amount logged (must not)'; end if;
  if v_pay <> 1 then raise exception 'FAIL: payment noise, payment_added=% (expected 1)', v_pay; end if;
  if a_fin < 1 or a_total < 3 then raise exception 'FAIL: owner view a_fin=% a_total=%', a_fin, a_total; end if;
  if b_fin <> 0 then raise exception 'FAIL: member sees financial b_fin=%', b_fin; end if;
  if b_nonfin < 1 then raise exception 'FAIL: member sees no non-financial'; end if;
  if c_total <> 0 then raise exception 'FAIL: outsider sees % events', c_total; end if;
  if v_policy <> 1 then raise exception 'FAIL: admin-журнал policy activity_log_select missing'; end if;
  raise notice 'ACTIVITY_OK paid_logged=% pay=% a_total=% a_fin=% b_fin=% b_nonfin=% c=% policy=%',
    v_paid_logged,v_pay,a_total,a_fin,b_fin,b_nonfin,c_total,v_policy;
end $$;

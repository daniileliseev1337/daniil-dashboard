-- 20260622_0003: аудит команды проекта.
create or replace function public.trg_log_member_activity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text;
begin
  if tg_op = 'INSERT' then
    select email into v_email from public.profiles where id = new.user_id;
    perform public.log_activity_ext('member_added', new.project_id, false, new.user_id, v_email,
      jsonb_build_object('role', new.role));
    return new;
  elsif tg_op = 'DELETE' then
    select email into v_email from public.profiles where id = old.user_id;
    perform public.log_activity_ext('member_removed', old.project_id, false, old.user_id, v_email,
      jsonb_build_object('role', old.role));
    return old;
  else
    if new.role is distinct from old.role then
      select email into v_email from public.profiles where id = new.user_id;
      perform public.log_activity_ext('member_role_changed', new.project_id, false, new.user_id, v_email,
        jsonb_build_object('from', old.role, 'to', new.role));
    end if;
    return new;
  end if;
end; $$;

drop trigger if exists trg_members_activity on public.project_members;
create trigger trg_members_activity
  after insert or update or delete on public.project_members
  for each row execute function public.trg_log_member_activity();

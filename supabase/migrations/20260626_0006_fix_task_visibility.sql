-- 20260626_0006: ФИКС рассинхрона видимости задач.
-- can_access_project_comments отстал от projects_select (redesign 20260611_0002):
-- задачи/комментарии team-проектов видели ВСЕ approved, хотя сам проект в списке — только участникам.
-- Приводим функцию ТОЧНО к модели projects_select: team → только участники (is_project_member).
create or replace function public.can_access_project_comments(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.projects
    where id = p_project_id
      and (
        owner_id = auth.uid()
        or public.is_admin()
        or (visibility = 'team' and public.is_project_member(p_project_id))
        or (visibility = 'marketplace' and public.is_approved())
      )
  );
$$;

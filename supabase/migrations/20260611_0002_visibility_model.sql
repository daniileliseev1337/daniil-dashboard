-- Переработка модели видимости проектов. Спек: docs/superpowers/specs/2026-06-11-visibility-model-redesign.md
-- Личный → только владелец (+ админ тайно). Командный → владелец + назначенная команда.
-- Маркетплейс → все одобренные. Убрано: безусловный member-доступ, team=все одобренные, мёртвый selected.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
for select using (
  owner_id = auth.uid()
  or public.is_admin()
  or (visibility = 'team' and public.is_project_member(id))
  or (visibility = 'marketplace' and public.is_approved())
);

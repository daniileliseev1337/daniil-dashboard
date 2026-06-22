-- 20260619_0003_editor_shares_payments.sql
-- Баг: участник проекта с ролью editor (проект чужого владельца) при сохранении формы
-- получал ошибку not_project_owner, и часть данных не сохранялась (доли/платежи), хотя
-- поля самого проекта (название/договор/стадия) проходили. Причина: доли и платежи жёстко
-- гейтятся на owner_id=auth.uid() в RPC И в RLS, а projects UPDATE пускает editor.
-- set_project_shares вызывается при КАЖДОМ сохранении (replace-all) → editor всегда видел ошибку.
--
-- Решение: editor (и admin) могут видеть и менять доли/платежи как владелец.
-- owner → (owner OR is_project_editor OR is_admin). viewer НЕ затрагивается.
-- select тоже расширен — иначе editor загрузил бы пустые доли/платежи и replace-all их стёр.

-- ── RPC: расширяем owner-гейт ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_project_shares(p_project_id uuid, p_rows jsonb)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not (public.is_project_owner(p_project_id) or public.is_project_editor(p_project_id) or public.is_admin()) then
    raise exception 'not_project_owner';
  end if;

  delete from public.project_shares where project_id = p_project_id;

  insert into public.project_shares
    (project_id, participant_user_id, participant_client_id, participant_name,
     participant_label, share_kind, share_value)
  select
    p_project_id,
    nullif(r->>'participant_user_id', '')::uuid,
    nullif(r->>'participant_client_id', '')::uuid,
    nullif(r->>'participant_name', ''),
    nullif(r->>'participant_label', ''),
    r->>'share_kind',
    (r->>'share_value')::numeric
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_project_payments(p_project_id uuid, p_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not (public.is_project_owner(p_project_id) or public.is_project_editor(p_project_id) or public.is_admin()) then
    raise exception 'not_project_owner';
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
end;
$function$;

-- ── RLS: editor и admin видят и меняют доли/платежи как владелец ──────────────
DROP POLICY IF EXISTS project_shares_select ON public.project_shares;
CREATE POLICY project_shares_select ON public.project_shares FOR SELECT
  USING (public.is_project_owner(project_id) OR participant_user_id = auth.uid()
         OR public.is_project_editor(project_id) OR public.is_admin());

DROP POLICY IF EXISTS project_shares_write ON public.project_shares;
CREATE POLICY project_shares_write ON public.project_shares FOR ALL
  USING      (public.is_project_owner(project_id) OR public.is_project_editor(project_id) OR public.is_admin())
  WITH CHECK (public.is_project_owner(project_id) OR public.is_project_editor(project_id) OR public.is_admin());

DROP POLICY IF EXISTS project_payments_select ON public.project_payments;
CREATE POLICY project_payments_select ON public.project_payments FOR SELECT
  USING (public.is_project_owner(project_id) OR public.is_project_editor(project_id) OR public.is_admin());

DROP POLICY IF EXISTS project_payments_write ON public.project_payments;
CREATE POLICY project_payments_write ON public.project_payments FOR ALL
  USING      (public.is_project_owner(project_id) OR public.is_project_editor(project_id) OR public.is_admin())
  WITH CHECK (public.is_project_owner(project_id) OR public.is_project_editor(project_id) OR public.is_admin());

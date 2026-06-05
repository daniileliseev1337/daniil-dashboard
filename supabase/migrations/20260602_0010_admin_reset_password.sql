-- 20260602_0010_admin_reset_password.sql
-- Auth A+ (этап онбординга):
--   (1) Восстановить триггер создания профиля on_auth_user_created на auth.users.
--       Функция public.handle_new_user() существует (SECURITY DEFINER), но сам триггер
--       отсутствует — потерян при миграции БД с облака (этап 6.2; триггеры auth-схемы
--       не переносятся pg_dump'ом). Без него signUp не создаёт профиль → вход ломается.
--   (2) admin_reset_password(p_user_id, p_new_password) — сброс пароля пользователя
--       администратором (UX: админ задаёт пароль вручную). Без SMTP.
-- Идемпотентна: DROP TRIGGER IF EXISTS + CREATE OR REPLACE.

-- ── (1) Триггер онбординга ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── (2) Админ-сброс пароля ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reset_password(p_user_id uuid, p_new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
  v_target_email text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin can reset passwords';
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;

  SELECT email INTO v_target_email FROM public.profiles WHERE id = p_user_id;
  IF v_target_email IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- bcrypt ($2a$, cost 10 — как у GoTrue по умолчанию); GoTrue читает любой валидный bcrypt
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
      updated_at = now()
  WHERE id = p_user_id;

  -- В журнал — только факт сброса, без пароля
  PERFORM public.log_activity('password_reset_by_admin', p_user_id, v_target_email, NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_password(uuid, text) TO authenticated;

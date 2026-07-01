# Admin создаёт пользователя — Design

**Дата:** 2026-07-01. **Ветка:** `feature/admin-create-user`.

## Goal

Дать администратору возможность **завести пользователя напрямую** (email + пароль + имя + роль,
сразу approved) и выдать ему логин/пароль. Закрывает два кейса: (1) онбординг реальных людей без
цепочки сам409регистрация→запрос роли→апрув; (2) быстрый тест-аккаунт (напр. client-only для §1-E2E
вкладок заказчика).

## Context

Self-hosted дашборд (React+Vite монолит `src/App.jsx`, self-hosted Supabase, WSL2-Docker; VPS —
форвардер, публичный `https://193-124-130-236.sslip.io`). Существует:
- `AdminPage` (админ-панель) + RPC: `admin_list_users`, `admin_update_user`, `admin_delete_user`,
  `admin_reset_password`, `admin_system_stats`, `set_user_roles`, `set_client_user`.
- Роли: таблица `user_roles(user_id, role∈{employee,client,visitor})`; мутации через SECURITY DEFINER
  RPC `set_user_roles` (admin-гейт). `profiles.approved` — гейт входа. Легаси `profiles.role∈{regular,admin}`
  (admin НЕ трогаем).
- Триггер `on_auth_user_created → handle_new_user()` создаёт `profiles` при вставке в `auth.users`.
- Прецедент записи в auth-схему: `admin_reset_password` (SECURITY DEFINER, `is_admin()`,
  `extensions.crypt(pw, gen_salt('bf',10))`, `log_activity`).
- Edge Functions уже есть (`web-push`, `nextcloud`, `telegram-notify`) + паттерн деплоя
  (`deploy/*/deploy-edge-function.sh`, код в `/srv/supabase-src/docker/volumes/functions/<name>/`).

Чего НЕТ: admin-создания пользователя (текущий вход — только сам409регистрация GoTrue `/signup`).

## Requirements

Админ на форме задаёт и получает результат:
- **email** (уникальный; дубликат → ошибка).
- **пароль** — вручную, **≥8 символов** (как `admin_reset_password`). Не генерируется. Не хранится
  в открытом виде и не логируется.
- **имя** (`profiles.name`).
- **роль** — РОВНО ОДНА: `client` (Заказчик) или `employee` (Сотрудник). Мультироль/гибрид/смена —
  потом через существующий `set_user_roles`.
- новый юзер сразу **`approved=true`** (создаёт админ осознанно), `email_confirm=true` (без SMTP).
- гейт **`is_admin()`** обязателен.
- **аудит**: `log_activity('user_created_by_admin', <new_user_id>, <email>, …)` — без пароля.

## Architecture (подход: Edge Function + GoTrue admin API)

Три юнита, каждый с одной ответственностью:

### 1. Edge Function `admin-create-user`
Deno/TS, по образцу существующих функций. Вход: JWT вызывающего (Authorization) + body
`{email, password, name, role}`.
- **Проверка админа:** под JWT вызывающего убедиться, что он admin (вызов `is_admin` / чтение
  `profiles.role` под его токеном). Не админ → 403.
- **Создание:** `POST {SUPABASE_URL}/auth/v1/admin/users` с `service_role` →
  `{email, password, email_confirm:true}`. GoTrue сам создаёт согласованные `auth.users`+`auth.identities`
  (устраняет version-fragile ручной INSERT). Дубликат/слабый пароль → GoTrue-ошибка → проброс.
- **Финализация:** вызвать RPC `admin_finalize_new_user(user_id, role, name)` **под JWT админа**
  (авторизация остаётся в БД-слое).
- **Ответ:** `{ ok:true, user_id, email }` или `{ ok:false, stage, message, user_id? }`.

### 2. RPC `admin_finalize_new_user(p_user_id uuid, p_role text, p_name text)`
`language plpgsql SECURITY DEFINER SET search_path=public,pg_temp`, гейт `is_admin()`.
- валидация роли (`client|employee`);
- `update profiles set approved=true, name=p_name where id=p_user_id`;
- `delete from user_roles where user_id=p_user_id; insert (p_user_id, p_role)` (единственная роль);
- `log_activity('user_created_by_admin', p_user_id, <email>, null)`.
`grant execute … to authenticated`.

### 3. UI — секция «Создать пользователя» в `AdminPage`
Форма: email / имя / пароль (≥8, с показать/скрыть) / роль (select Заказчик·Сотрудник) → кнопка
«Создать». Submit → `supabase.functions.invoke('admin-create-user', {body})`. Успех → тост
«Пользователь создан — выдай логин: <email> и заданный пароль». Ошибка → тост с сообщением.
Реюз premium-dark стилей формы; без нового оформления.

## Data flow

Форма (JWT админа) → `functions.invoke('admin-create-user')` → [admin-check] → GoTrue admin create →
`admin_finalize_new_user` → `{ok,user_id,email}` → UI показывает логин (пароль — введённый админом).

## Security

- `is_admin()` проверяется ДВАЖДЫ: в функции (под JWT вызывающего) и в RPC.
- Пароль ≥8; никогда не логируется/не возвращается; аудит без пароля.
- `service_role` — только внутри edge-runtime (не на фронт).
- `email_confirm:true` — вход без SMTP (self-hosted).
- Уникальность email — GoTrue enforced; коллизия → внятная ошибка, юзер не создаётся.

## Error handling (в т.ч. частичный сбой)

- Валидация входа (пустой/битый email, пароль <8, роль вне {client,employee}) → 400 ДО GoTrue.
- Дубликат email / отказ GoTrue → `{ok:false, stage:'create', message}`; ничего не создано.
- **Частичный сбой** (GoTrue создал юзера, но `admin_finalize_new_user` упал): вернуть
  `{ok:false, stage:'finalize', user_id, message}` — НЕ молчать. Админ доводит через существующую
  админку (`admin_update_user` approved + `set_user_roles`), либо удаляет `admin_delete_user`.
  (Авто-rollback созданного auth-юзера — вне первой версии; помечаем как явный warning.)

## Testing / Verification

- **Юнит (vitest):** чистая валидация входа (email-формат, длина пароля, допустимая роль) вынесена
  в маленький модуль (напр. `src/lib/userCreateValidation.js`) — без React/сети.
- **E2E verify-скрипт** `deploy/admin-create-user/verify.sh` (по образцу `verify-*.sh`): под JWT
  тест-админа вызвать функцию → создать юзера → проверить: `auth.users` есть, `profiles.approved=true`,
  `user_roles=[role]`, аудит-запись есть, **логин работает** (`POST /auth/v1/token?grant_type=password`
  возвращает токен). Затем **cleanup** (`admin_delete_user` / прямое удаление auth.users каскадом).
  Печатает `ADMIN_CREATE_USER_OK`.
- Именно этот verify + сама фича затем разблокируют §1-E2E вкладок заказчика (создать client-only,
  залинковать `set_client_user`, засеять проект, playwright-прогон, cleanup).

## Out of scope (YAGNI)

- Линковка `clients`-записи к юзеру (чтобы заказчик видел проекты) — существующий `set_client_user`.
- Мультироль/гибрид при создании и смена ролей — существующий `set_user_roles`.
- Генерация пароля, инвайт-ссылки, bulk-создание, авто-rollback частичного сбоя.

## Environment notes (грабли из сессии 2026-07-01)

- Деплой edge-функции: код в `/srv/supabase-src/docker/volumes/functions/admin-create-user/`,
  сброс кэша `docker restart supabase-edge-functions` (см. `deploy/*/deploy-edge-function.sh`).
- WSL/psql/скрипты: **drvfs-глоб `/mnt/f/*` + кириллица нестабильны** → передавать файлы через
  `Get-Content -Raw \| wsl bash -c 'tr -d "\r" > /tmp/x; …'` (stdin, минуя /mnt/f; strip CRLF).
- Живая БД/секреты/деплой — **гейт владельца** (явное адресное «го» на каждый необратимо-наружный шаг).
- git на F: — `-c core.fsyncMethod=writeout-only` + ретрай; push — обход прокси.

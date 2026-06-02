# Удаление модуля trading из daniil-dashboard v3.0. Дизайн

> Дата: 2026-06-02. Статус: согласован с владельцем, выполняется.
> Отдельное направление (не часть 6.4b). Trading — легаси из v2.0, отдельный
> продукт, к dashboard-задачам отношения не имеет. Порядок работ:
> мобилка (готово) → **trading** → 6.4b.

## 1. Цель

Полностью убрать торговый модуль из рабочего приложения: фронт (вкладка + код)
и БД (таблицы/функции/RLS) в локальном self-hosted Supabase. Облако-резерв НЕ
трогаем (там trading остаётся как бэкап). Перед удалением — дамп локальных
trading-данных в файл.

## 2. Разведка (что есть)

**Фронт** — модуль изолирован, перекрёстных зависимостей нет:
- `src/trading/` — 6 файлов: `TradingSection.jsx`, `DashboardView.jsx`,
  `SignalsView.jsx`, `SettingsView.jsx`, `api.js`, `realtime.js`.
- `src/App.jsx` — 4 точки: импорт `TradingSection` (строка ~3); `const canTrade`
  (~6332); пункт TABS `{ id:"trading", ... }` (~6340); рендер
  `{tab==="trading" && canTrade && <TradingSection/>}` (~6598).

**БД** (локальный Supabase) — 11 таблиц, все FK замкнуты внутри trading-кластера
(на `projects`/`profiles` не ссылаются; извне на них никто не ссылается):
`trading_audit_log`, `trading_candles`, `trading_instruments`,
`trading_news_classified`, `trading_news_raw`, `trading_orders`,
`trading_positions`, `trading_signals`, `trading_strategies`,
`trading_system_state`, `trading_watchlist`.
- Функции: `is_trading_admin()`, `trading_orders_touch_updated()` — обе только в
  trading-контексте (вне trading не используются).
- RLS: 11 политик `*_admin_all` (снимутся каскадно с таблицами).
- В `supabase_realtime` trading-таблиц **нет**. Edge Functions trading **нет**.
- Данные: signals 861, orders 44, positions 11, instruments/watchlist 12,
  strategies 3, system_state 1 (остальные пустые).

## 3. Что НЕ трогаем

- `TrendingUp`/`TrendingDown` из lucide-react — используются в финансовой
  аналитике (не trading).
- `profiles.role` значение `'trading_admin'` — оставляем (никому не присвоено:
  в данных только `admin`×1, `user`×3; безвредно).
- `.trading-spin` в `src/index.css` — CSS-класс без побочных эффектов, оставляем.
- Общие утилиты (`fmt`, supabase client), `recharts`, env — общие, не трогаем.
- Облако-резерв Supabase — не трогаем (бэкап).

## 4. Порядок выполнения

1. **Бэкап** (выполнен): `pg_dump -t 'public.trading_*'` →
   `F:\trading-backup-2026-06-02.sql` (239 КБ, 11 CREATE + 11 COPY). Вне git.
2. **Фронт**: удалить `src/trading/` целиком; снять 4 точки в `App.jsx`.
3. **Миграция БД**: `supabase/migrations/20260602_0001_drop_trading.sql` —
   `DROP TABLE IF EXISTS ... CASCADE` (11 таблиц) + `DROP FUNCTION IF EXISTS`
   (2 функции). Idempotent. Применение — `docker exec -i supabase-db psql`.
4. **Сборка** `npm run build` + **деплой** `deploy/nextcloud/deploy-web.sh`.

## 5. Критерии приёмки

1. `src/trading/` отсутствует; в `App.jsx` нет упоминаний trading/TradingSection/canTrade.
2. `npm run build` зелёный (нет битых импортов).
3. Вкладка Trading исчезла из UI; остальные вкладки работают.
4. В БД нет таблиц `trading_*` и функций `is_trading_admin`/`trading_orders_touch_updated`
   (проверка `pg_tables`/`pg_proc`); прочие таблицы (projects, profiles, project_tasks…)
   не затронуты.
5. Сайт отдаётся 200, deployed asset свежий.
6. Дамп-файл сохранён на диске (возможность восстановления).

## 6. Откат

Восстановление из `F:\trading-backup-2026-06-02.sql`
(`psql < trading-backup-2026-06-02.sql`) + revert коммита фронта.

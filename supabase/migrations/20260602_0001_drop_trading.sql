-- Удаление модуля trading (легаси v2.0). Бэкап снят: F:\trading-backup-2026-06-02.sql
-- CASCADE снимает внутрикластерные FK и RLS-политики автоматически.
-- Idempotent: IF EXISTS — повторное применение не упадёт.
-- Спек: docs/superpowers/specs/2026-06-02-remove-trading-module-design.md

DROP TABLE IF EXISTS
  public.trading_news_classified,
  public.trading_orders,
  public.trading_positions,
  public.trading_signals,
  public.trading_watchlist,
  public.trading_candles,
  public.trading_news_raw,
  public.trading_strategies,
  public.trading_system_state,
  public.trading_audit_log,
  public.trading_instruments
CASCADE;

DROP FUNCTION IF EXISTS public.is_trading_admin() CASCADE;
DROP FUNCTION IF EXISTS public.trading_orders_touch_updated() CASCADE;

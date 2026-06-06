-- Расширения для deadline-cron. pg_cron уже в shared_preload_libraries PG17,
-- pg_net установлен. cron.job для web-push-deadline добавляется ниже (Task 15).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- (Task 15) cron job web-push-deadline дописывается сюда после готовности
-- edge-функции web-push-notify — см. конец файла.

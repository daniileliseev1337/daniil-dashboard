# deploy/ — инфраструктура v3.0 (этап 6.1)

Конфигурация локального сервера. Запускается в Docker внутри **WSL2 (Ubuntu)**
на домашнем ПК.

## Состав

- `docker-compose.web.yml` — nginx, отдаёт фронт (сейчас — заглушка `web/`,
  на этапе 6.2 заменится на собранный React).
- `web/index.html` — страница-заглушка (health-страница).

## Где что лежит на сервере

| Что | Путь |
|---|---|
| Supabase (self-hosted, образы + `.env` с секретами) | `/srv/supabase-src/docker` (WSL, **не в git**) |
| Рабочая копия web-деплоя | `/srv/daniil-deploy` (WSL, копия этой папки) |
| Docker Engine | WSL2 Ubuntu, systemd, без Docker Desktop |
| Внешний доступ | cloudflared named tunnel (только :8080 web и :8000 Kong) |

## Безопасность

- Секреты Supabase (`/srv/supabase-src/docker/.env`) **никогда не коммитятся**.
- Порты публикуются только на `127.0.0.1`; наружу — исключительно через туннель.
- Studio и Postgres наружу не выводятся.

## Запуск web

```bash
# внутри WSL (Ubuntu)
cd /srv/daniil-deploy
docker compose -f docker-compose.web.yml up -d
```

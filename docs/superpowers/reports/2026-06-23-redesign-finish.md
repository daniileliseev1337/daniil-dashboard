# Отчёт: UI-редизайн дашборда — завершение (2026-06-23)

**Репо:** `F:\Сайт\redesign-v2-fresh`. **Прод:** https://193-124-130-236.sslip.io
**Статус:** дизайн закрыт полностью (Task 1–6 плана `docs/superpowers/plans/2026-06-23-dashboard-ui-redesign.md`), задеплоено и принято на проде.

## Что сделано в этой сессии (2 раунда)

### Раунд 1 — коммит `e0b7406`
- **`.kp-card`** (золотая слиток-рамка + spotlight + hover) на плоские карточки-сущности:
  карточка проекта (`Projects`), карточка клиента (`ClientsPage`), строки транзакций (`Finance`).
- **magnetic** (`MagneticButton`) на топ-CTA: «+ Новая задача», «+ Добавить запись», «+ Новый клиент»
  («+ Новый проект» уже был).
- **stagger** (`.kp-rise` + `animationDelay` по индексу) на списки проектов, клиентов, board-карточки задач.
- **должность профиля**: поле `position` в `profiles` (миграция `supabase/migrations/20260623_0001_profile_position.sql`,
  `add column if not exists`, идемпотентно) + поле в форме `ProfileModal` + превью в карточке профиля + сохранение.
  Apply-скрипт `deploy/profile-position/apply-migrations.sh`. Миграция применена к живой БД.

### Раунд 2 — коммит `b7bb419` (добивка Task 6 + Task 4 шаг 3)
- **list-вид Задач** (`TaskRowList`) → `.kp-card` + stagger.
- **Лента «История»/журнал активности** (`ActivityFeed`, во вкладке Admin → Журнал) → `.kp-card`.
- **Должность в шапке**: кнопка профиля в топбаре стала двухстрочной (имя + должность золотом, при заполненной `position`).

## Ключевое наблюдение
Формулировка handoff «применить kp-card к секциям Финансов/Аналитики» была неточной: секции этих экранов
и дашборд уже на компоненте `<Card>` (он богаче `.kp-card` — со spotlight, hover-glow и 3D-tilt). `.kp-card`
применялся только к реально плоским карточкам-сущностям и строкам списков. Дашборд уже имеет stagger через
framer-motion — туда `.kp-rise` не добавлялся.

## Верификация (приёмка на проде через playwright)
- Сборка зелёная оба раунда. Деплой: `deploy/nextcloud/deploy-web.sh` (build → dist → `/srv/daniil-deploy/web`).
- После сброса SW+caches и reload — **0 ошибок** в консоли (1 безобидный warning про deprecated apple-mobile-web-app-capable).
- Приняты визуально: Проекты, Заказчики, Финансы (транзакции), list-вид Задач, Журнал активности — все карточки
  в золотой слиток-рамке. Профиль: поле «Должность» в модалке на месте.
- **Должность сейчас пустая** (`position = null`) — впиши её в «Мой профиль» → «Должность» → «Сохранить»;
  тогда появится и вторая строка в кнопке профиля топбара.

## Грабли среды (подтвердились)
- App.jsx (~8.2k строк) править через `C:\temp\App.jsx` → `Copy-Item` на F: (F сбоит на fsync больших файлов).
  index.css правок не требовал (`.kp-card`/`.kp-rise` уже были в нём).
- git только Windows-сторона: `git -C <repo> -c "safe.directory=*" -c "core.fsyncMethod=writeout-only"`. Коммиты на main, без push.
- Миграции self-hosted Supabase: `wsl -d Ubuntu -u root -- bash -c '... apply-migrations.sh'` →
  внутри `docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < f.sql`. Применять ДО деплоя фронта.
- `deploy-web.sh` сам не билдит — только копирует `dist`; перед ним нужен `npm run build`. Прод-деплой — ТОЛЬКО по слову «деплой».
- PWA SW кэширует — после деплоя владельцу нужен сброс (инкогнито/переустановка PWA).

## Коммиты (main, НЕ запушены)
- `e0b7406` — kp-card/magnetic/stagger по экранам + должность профиля.
- `b7bb419` — kp-card на list-вид задач и ленту истории + должность в шапке.
- Локальный main впереди origin (ahead 11). Push не делался.

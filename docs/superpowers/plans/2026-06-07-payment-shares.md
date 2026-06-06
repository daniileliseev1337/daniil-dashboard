# Доли оплаты проекта — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Делить сумму договора проекта на доли между участниками (юзер/заказчик/внешний); на дашборде каждого учитывать только его долю; юзер-участник видит свою долю в своём дашборде; закрыть баг #8.

**Architecture:** Одна таблица-источник `public.project_shares` + RLS (владелец видит все доли проекта, участник — только свою) + `SECURITY DEFINER` RPC `get_my_shares()` для приватной проекции участнику. Деньги доли **вычисляются** в чистом модуле `src/lib/dashboardMetrics.js` (vitest), не дублируются. UI — секция «Доли» в форме проекта + блок «Мои доли» на дашборде (монолит `src/App.jsx`).

**Tech Stack:** self-hosted Supabase (PG17, RLS, plpgsql), React+Vite, vitest, чистый JS.

**Спецификация:** `docs/superpowers/specs/2026-06-07-payment-shares-design.md`

---

## Префлайт окружения (выполнить ОДИН раз перед Фазой 1)

Грабли среды (из памяти проекта — соблюдать строго):

- **git — ТОЛЬКО с Windows-стороны:** `git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* <cmd>`. НЕ через WSL (9p stale-кэш). Push — с обходом прокси: `$env:HTTPS_PROXY=""` + `git -c http.proxy="" push`. Коммиты завершать trailer `Co-Authored-By: Claude ...`.
- **БД/деплой — через WSL:** `wsl -d Ubuntu -u root -- bash /mnt/f/*/redesign-v2-fresh/deploy/.../<script>.sh`. Кириллицу в bash-аргументах через PowerShell→wsl НЕ передавать (бьёт кодировку) — только файлы-скрипты + глоб `/mnt/f/*/redesign-v2-fresh`.
- **vitest — через Bash tool (MSYS):** `cd /f/Сайт/redesign-v2-fresh && npm run test`. Если `node_modules` повреждён (`Cannot find module`/`normalizeScreens`) — сначала `npm install`.
- **Ветка:** работаем на `feature/payment-shares` (уже создана, спек закоммичен `e1165b1`).
- **Прод-деплой — только по явной команде владельца «деплой».** Этот план прод НЕ деплоит.

- [ ] **Префлайт-1: убедиться, что vitest зелёный на текущем коде**

Bash: `cd /f/Сайт/redesign-v2-fresh && npm run test 2>&1 | tail -20`
Ожидаемо: существующие 36 тестов PASS. Если модули не найдены — `npm install` затем повтор.

- [ ] **Префлайт-2: убедиться, что мы на нужной ветке**

PowerShell: `git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* branch --show-current`
Ожидаемо: `feature/payment-shares`

---

## File Structure

**Создаём:**
- `supabase/migrations/20260607_0001_project_shares.sql` — таблица + индексы + CHECK + RLS + RPC `get_my_shares` + grant.
- `deploy/payment-shares/apply-migrations.sh` — применить миграцию к локальной БД.
- `deploy/payment-shares/verify-shares-rls.sh` — проверка RLS/RPC под двумя юзерами.

**Модифицируем:**
- `src/lib/dashboardMetrics.js` — чистые функции долей (`shareToAmount`, `ownerShareAmount`, `proportionReceived`, `ownerReceived`, `mySharesTotals`) + расширить `receivables`.
- `src/lib/dashboardMetrics.test.js` — тесты для новых функций.
- `src/App.jsx` — адаптеры/загрузка долей, секция «Доли» в `ProjectForm`, блок «Мои доли» + KPI в `Dashboard`, индикатор на карточке, фикс бага #8.

**Принцип:** расчёты (тестируемая логика) живут в `dashboardMetrics.js`; `App.jsx` — только проводка данных и JSX.

---

## Фаза 1. База данных (таблица + RLS + RPC)

### Task 1: Миграция `project_shares`

**Files:**
- Create: `supabase/migrations/20260607_0001_project_shares.sql`

- [ ] **Step 1: Написать файл миграции**

Создать `supabase/migrations/20260607_0001_project_shares.sql` с содержимым:

```sql
-- Доли оплаты проекта (кластер #1/#2). Спек: docs/superpowers/specs/2026-06-07-payment-shares-design.md
-- Таблица долей: одна строка на участника-получателя доли. Владелец = остаток (строкой не хранится).

create table if not exists public.project_shares (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references public.projects(id) on delete cascade,
  -- полиморфный участник: ровно один «адрес» из трёх
  participant_user_id   uuid references auth.users(id),
  participant_client_id uuid references public.clients(id),
  participant_name      text,
  -- размер доли: гибко — % ИЛИ сумма
  share_kind            text    not null check (share_kind in ('percent','amount')),
  share_value           numeric not null check (share_value >= 0),
  note                  text,
  created_at            timestamptz not null default now(),
  constraint project_shares_one_participant check (
    (participant_user_id   is not null)::int
  + (participant_client_id is not null)::int
  + (participant_name      is not null)::int = 1
  )
);

create index if not exists project_shares_project_id_idx
  on public.project_shares(project_id);
create index if not exists project_shares_participant_user_idx
  on public.project_shares(participant_user_id) where participant_user_id is not null;

alter table public.project_shares enable row level security;

-- SELECT: владелец проекта (все доли своего проекта) ИЛИ сам участник (только свою строку)
drop policy if exists project_shares_select on public.project_shares;
create policy project_shares_select on public.project_shares
for select using (
  exists (select 1 from public.projects p
          where p.id = project_shares.project_id and p.owner_id = auth.uid())
  or participant_user_id = auth.uid()
);

-- INSERT/UPDATE/DELETE: только владелец проекта
drop policy if exists project_shares_write on public.project_shares;
create policy project_shares_write on public.project_shares
for all using (
  exists (select 1 from public.projects p
          where p.id = project_shares.project_id and p.owner_id = auth.uid())
) with check (
  exists (select 1 from public.projects p
          where p.id = project_shares.project_id and p.owner_id = auth.uid())
);

-- Приватная проекция доли участнику: только {название, моя доля, получено, остаток}.
create or replace function public.get_my_shares()
returns table (project_name text, my_amount numeric, my_received numeric, my_receivable numeric)
language sql
security definer
set search_path = public, pg_temp
as $$
  with mine as (
    select
      p.name as project_name,
      coalesce(p.contract_sum, 0) as contract_sum,
      coalesce(p.paid_amount, 0)  as paid_amount,
      case when s.share_kind = 'percent'
           then coalesce(p.contract_sum,0) * s.share_value / 100.0
           else s.share_value end as amount
    from public.project_shares s
    join public.projects p on p.id = s.project_id
    where s.participant_user_id = auth.uid()
      and p.owner_id <> auth.uid()
  )
  select
    project_name,
    amount as my_amount,
    case when contract_sum > 0 then paid_amount * amount / contract_sum else 0 end as my_received,
    amount - (case when contract_sum > 0 then paid_amount * amount / contract_sum else 0 end) as my_receivable
  from mine;
$$;

grant execute on function public.get_my_shares() to authenticated;

-- I-2 hardening (долг проекта): search_path уже задан выше через SET.
```

- [ ] **Step 2: Закоммитить миграцию (Windows-сторона)**

PowerShell:
```powershell
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add supabase/migrations/20260607_0001_project_shares.sql
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m @'
feat(payment-shares): миграция project_shares + RLS + get_my_shares RPC

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```
Ожидаемо: `1 file changed`.

### Task 2: Deploy-скрипты применения и проверки

**Files:**
- Create: `deploy/payment-shares/apply-migrations.sh`
- Create: `deploy/payment-shares/verify-shares-rls.sh`

- [ ] **Step 1: Написать `deploy/payment-shares/apply-migrations.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
DIR=$(ls -d /mnt/f/*/redesign-v2-fresh/supabase/migrations)
for f in $(ls "$DIR"/20260607_*.sql 2>/dev/null | sort); do
  echo "== applying $(basename "$f") =="
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"
done
echo "MIGRATIONS_DONE"
```

- [ ] **Step 2: Написать `deploy/payment-shares/verify-shares-rls.sh`**

Проверяет: владелец A создаёт проект + долю участнику B; B видит свою долю через `get_my_shares` (==1) и НЕ видит строку доли постороннего; B не может писать в `project_shares`; чужой C/anon не видит.

```bash
#!/usr/bin/env bash
# Проверка RLS project_shares + get_my_shares под двумя реальными пользователями.
set -euo pipefail
SUPA=/srv/supabase-src/docker
REST=http://localhost:8000/rest/v1
JWT_SECRET="$(grep '^JWT_SECRET=' "$SUPA/.env" | cut -d= -f2-)"
ANON="$(grep '^ANON_KEY=' "$SUPA/.env" | cut -d= -f2-)"

sign() {
  python3 - "$JWT_SECRET" "$1" <<'PY'
import hmac,hashlib,base64,json,sys,time
secret,uid=sys.argv[1],sys.argv[2]
b=lambda x: base64.urlsafe_b64encode(x).rstrip(b'=')
h=b(json.dumps({"alg":"HS256","typ":"JWT"}).encode()); n=int(time.time())
p=b(json.dumps({"sub":uid,"role":"authenticated","aud":"authenticated","iat":n,"exp":n+3600}).encode())
s=b(hmac.new(secret.encode(),h+b'.'+p,hashlib.sha256).digest())
print((h+b'.'+p+b'.'+s).decode())
PY
}

read -r A B <<EOF
$(docker exec -i supabase-db psql -U postgres -d postgres -At -F' ' -c \
"SELECT id FROM public.profiles WHERE approved=true ORDER BY created_at LIMIT 2;" | tr '\n' ' ')
EOF
echo "A=$A B=$B"
[ -n "$A" ] && [ -n "$B" ] || { echo "NEED_TWO_APPROVED_USERS"; exit 1; }
JA="$(sign "$A")"; JB="$(sign "$B")"

echo "== A создаёт проект =="
PID=$(curl -s -X POST "$REST/projects" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JA" -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"owner_id\":\"$A\",\"name\":\"RLS shares selftest\",\"contract_sum\":100000,\"paid_amount\":40000}" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d[0]["id"] if isinstance(d,list) and d else "")')
echo "project id=$PID"; [ -n "$PID" ] || { echo "INSERT PROJECT FAILED"; exit 1; }

echo "== A добавляет долю участнику B (30%) =="
SID=$(curl -s -X POST "$REST/project_shares" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JA" -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"project_id\":\"$PID\",\"participant_user_id\":\"$B\",\"share_kind\":\"percent\",\"share_value\":30}" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d[0]["id"] if isinstance(d,list) and d else "")')
echo "share id=$SID"; [ -n "$SID" ] || { echo "INSERT SHARE FAILED"; exit 1; }

echo "== B видит свою долю через get_my_shares (ожидаем 1 строку, my_amount=30000, my_received=12000) =="
MS=$(curl -s -X POST "$REST/rpc/get_my_shares" -H "apikey: $ANON" -H "Authorization: Bearer $JB" \
  -H "Content-Type: application/json" -d '{}')
echo "get_my_shares(B): $MS"
CNT=$(echo "$MS" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
AMT=$(echo "$MS" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['my_amount'] if d else '')")
RCV=$(echo "$MS" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d[0]['my_received'] if d else '')")
echo "B долей: $CNT (ожидаем 1), my_amount=$AMT (ожидаем 30000), my_received=$RCV (ожидаем 12000)"

echo "== B НЕ может писать в project_shares (ожидаем 4xx, НЕ 201) =="
WCODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$REST/project_shares" \
  -H "apikey: $ANON" -H "Authorization: Bearer $JB" -H "Content-Type: application/json" \
  -d "{\"project_id\":\"$PID\",\"participant_name\":\"hack\",\"share_kind\":\"percent\",\"share_value\":10}")
echo "B пишет долю: HTTP $WCODE (ожидаем 401/403/4xx)"

echo "== B НЕ видит строку доли напрямую как чужой проект (видит только где сам участник) =="
# B запрашивает все project_shares: RLS отдаст только строки, где participant_user_id=B
ROWS=$(curl -s "$REST/project_shares?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $JB" \
  | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
echo "B видит строк project_shares: $ROWS (ожидаем 1 — только свою)"

echo "== anon НЕ видит долей =="
AOUT=$(curl -s "$REST/project_shares?select=id" -H "apikey: $ANON" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d) if isinstance(d,list) else 'ERR')")
echo "anon видит долей: $AOUT (ожидаем 0)"

echo "== cleanup =="
curl -s -X DELETE "$REST/projects?id=eq.$PID" -H "apikey: $ANON" -H "Authorization: Bearer $JA" -o /dev/null -w "delete project: %{http_code}\n"
# доли удалятся каскадом

[ "$CNT" = "1" ] && [ "$AMT" = "30000" ] && [ "$RCV" = "12000" ] && [ "$ROWS" = "1" ] && [ "$AOUT" = "0" ] \
  && echo "SHARES_RLS_OK" || { echo "SHARES_RLS_FAIL"; exit 1; }
```

- [ ] **Step 3: Зафиксировать `*.sh` как LF и закоммитить**

`.gitattributes` уже содержит `*.sh text eol=lf` (из 6.4). Коммит (Windows-сторона):
```powershell
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add deploy/payment-shares/
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m @'
chore(payment-shares): deploy-скрипты apply-migrations + verify-shares-rls

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

### Task 3: Применить миграцию и проверить RLS на живой БД

- [ ] **Step 1: Применить миграцию**

PowerShell: `wsl -d Ubuntu -u root -- bash /mnt/f/*/redesign-v2-fresh/deploy/payment-shares/apply-migrations.sh`
Ожидаемо: `== applying 20260607_0001_project_shares.sql ==` … `MIGRATIONS_DONE`. Ошибок psql нет.

- [ ] **Step 2: Запустить verify-shares-rls**

PowerShell: `wsl -d Ubuntu -u root -- bash /mnt/f/*/redesign-v2-fresh/deploy/payment-shares/verify-shares-rls.sh`
Ожидаемо: последняя строка `SHARES_RLS_OK`; по ходу — `B долей: 1`, `my_amount=30000`, `my_received=12000`, `B пишет долю: HTTP 401/403`, `B видит строк: 1`, `anon видит: 0`.

Если `SHARES_RLS_FAIL` — НЕ продолжать; разобрать какой инвариант не сошёлся (политика SELECT/WRITE или формула RPC).

---

## Фаза 2. Расчёты долей (TDD, `dashboardMetrics.js`)

Все функции — чистые (без React/Supabase). Сначала тест (FAIL), потом реализация (PASS).
Запуск таргетно: `cd /f/Сайт/redesign-v2-fresh && npx vitest run src/lib/dashboardMetrics.test.js`.

### Task 4: `shareToAmount` — доля в рублях

**Files:**
- Modify: `src/lib/dashboardMetrics.test.js` (добавить тесты в конец)
- Modify: `src/lib/dashboardMetrics.js` (добавить функцию)

- [ ] **Step 1: Написать падающий тест**

Добавить в конец `src/lib/dashboardMetrics.test.js`:

```js
import {
  shareToAmount, ownerShareAmount, proportionReceived, ownerReceived, mySharesTotals,
} from './dashboardMetrics.js';

describe('shareToAmount', () => {
  it('percent: 30% от 100000 = 30000', () => {
    expect(shareToAmount({ shareKind: 'percent', shareValue: 30 }, 100000)).toBe(30000);
  });
  it('amount: фиксированная сумма возвращается как есть', () => {
    expect(shareToAmount({ shareKind: 'amount', shareValue: 40000 }, 100000)).toBe(40000);
  });
  it('percent от нулевого договора = 0', () => {
    expect(shareToAmount({ shareKind: 'percent', shareValue: 50 }, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Bash: `cd /f/Сайт/redesign-v2-fresh && npx vitest run src/lib/dashboardMetrics.test.js 2>&1 | tail -15`
Ожидаемо: FAIL — `shareToAmount is not a function` / не экспортирована.

- [ ] **Step 3: Реализовать**

Добавить в `src/lib/dashboardMetrics.js` (после `receivables`, перед `TASK_DONE`):

```js
// --- Доли оплаты (кластер #1/#2) ---
// Доля участника в рублях. share = { shareKind:'percent'|'amount', shareValue:number }.
export function shareToAmount(share, contractSum) {
  const v = Number(share.shareValue) || 0;
  if (share.shareKind === 'amount') return v;
  return (Number(contractSum) || 0) * v / 100;
}
```

- [ ] **Step 4: Запустить — убедиться, что прошёл**

Bash: `cd /f/Сайт/redesign-v2-fresh && npx vitest run src/lib/dashboardMetrics.test.js 2>&1 | tail -15`
Ожидаемо: 3 новых теста PASS.

### Task 5: `ownerShareAmount` — доля владельца = остаток

**Files:**
- Modify: `src/lib/dashboardMetrics.test.js`, `src/lib/dashboardMetrics.js`

- [ ] **Step 1: Тест (падающий)**

```js
describe('ownerShareAmount (остаток владельца)', () => {
  const p = { contractSum: 100000 };
  it('нет долей других → вся сумма договора', () => {
    expect(ownerShareAmount(p, [])).toBe(100000);
  });
  it('один участник 30% → остаток 70000', () => {
    expect(ownerShareAmount(p, [{ shareKind: 'percent', shareValue: 30 }])).toBe(70000);
  });
  it('смешанно % и сумма: 30% + 20000 → остаток 50000', () => {
    expect(ownerShareAmount(p, [
      { shareKind: 'percent', shareValue: 30 },
      { shareKind: 'amount', shareValue: 20000 },
    ])).toBe(50000);
  });
  it('перерасход долей > договора → остаток не уходит ниже 0', () => {
    expect(ownerShareAmount(p, [{ shareKind: 'amount', shareValue: 150000 }])).toBe(0);
  });
});
```

- [ ] **Step 2: Запустить — FAIL** (`ownerShareAmount is not a function`).

- [ ] **Step 3: Реализовать** (в `dashboardMetrics.js`, под `shareToAmount`):

```js
// Доля владельца по проекту = договор минус сумма долей других участников (не ниже 0).
export function ownerShareAmount(project, shares = []) {
  const contract = Number(project.contractSum) || 0;
  const others = shares.reduce((s, sh) => s + shareToAmount(sh, contract), 0);
  return Math.max(0, contract - others);
}
```

- [ ] **Step 4: Запустить — PASS** (4 новых теста).

### Task 6: `proportionReceived` — получено по доле (пропорция)

**Files:**
- Modify: `src/lib/dashboardMetrics.test.js`, `src/lib/dashboardMetrics.js`

- [ ] **Step 1: Тест (падающий)**

```js
describe('proportionReceived', () => {
  it('оплачено 40% договора → по доле 70000 получено 28000', () => {
    expect(proportionReceived(40000, 70000, 100000)).toBe(28000);
  });
  it('договор 0 → 0 (без деления на ноль)', () => {
    expect(proportionReceived(0, 50000, 0)).toBe(0);
  });
  it('полностью оплачено → получено = вся доля', () => {
    expect(proportionReceived(100000, 70000, 100000)).toBe(70000);
  });
});
```

- [ ] **Step 2: Запустить — FAIL.**

- [ ] **Step 3: Реализовать:**

```js
// Сколько из доли (amount) уже получено, пропорционально оплате договора.
export function proportionReceived(paidAmount, amount, contractSum) {
  const c = Number(contractSum) || 0;
  if (c <= 0) return 0;
  return (Number(paidAmount) || 0) * (Number(amount) || 0) / c;
}
```

- [ ] **Step 4: Запустить — PASS** (3 новых теста).

### Task 7: `ownerReceived` — KPI «Получено» владельца (по его долям в своих проектах)

**Files:**
- Modify: `src/lib/dashboardMetrics.test.js`, `src/lib/dashboardMetrics.js`

- [ ] **Step 1: Тест (падающий)**

```js
describe('ownerReceived', () => {
  const projects = [
    { id: 'p1', stage: 'В работе', contractSum: 100000, paidAmount: 40000 },
    { id: 'p2', stage: 'В работе', contractSum: 50000,  paidAmount: 50000 },
    { id: 'p3', stage: 'Архив',    contractSum: 80000,  paidAmount: 80000 },
  ];
  // p1: доля другого 30% → моя 70000, получено 40%*70000=28000
  // p2: без долей → моя 50000, получено 50000
  // p3: архив → исключён
  const sharesByProject = { p1: [{ shareKind: 'percent', shareValue: 30 }] };
  it('сумма полученного по моим долям, архив исключён', () => {
    expect(ownerReceived(projects, sharesByProject)).toBe(28000 + 50000);
  });
  it('без долей (старое поведение) = сумма paidAmount неархивных', () => {
    expect(ownerReceived(projects, {})).toBe(40000 + 50000);
  });
});
```

- [ ] **Step 2: Запустить — FAIL.**

- [ ] **Step 3: Реализовать:**

```js
// KPI «Получено» владельца: сумма полученного по ЕГО доле в своих проектах (архив исключён).
export function ownerReceived(projects, sharesByProject = {}) {
  let total = 0;
  for (const p of projects) {
    if (p.stage === 'Архив') continue;
    const amount = ownerShareAmount(p, sharesByProject[p.id] || []);
    total += proportionReceived(p.paidAmount, amount, p.contractSum);
  }
  return total;
}
```

- [ ] **Step 4: Запустить — PASS** (2 новых теста).

### Task 8: Расширить `receivables` — дебиторка по моей доле

**Files:**
- Modify: `src/lib/dashboardMetrics.test.js`, `src/lib/dashboardMetrics.js`

- [ ] **Step 1: Тест (падающий) — добавить новый describe**

```js
describe('receivables с долями', () => {
  const projects = [
    { id: 'p1', name: 'A', stage: 'В работе', contractSum: 100000, paidAmount: 40000 },
  ];
  it('доля другого 30% → моя 70000, получено 28000, остаток 42000', () => {
    const r = receivables(projects, { p1: [{ shareKind: 'percent', shareValue: 30 }] });
    expect(r.total).toBe(42000);
    expect(r.items[0]).toEqual({ id: 'p1', name: 'A', remaining: 42000 });
  });
  it('обратная совместимость: без 2-го аргумента = договор − оплачено', () => {
    const r = receivables(projects);
    expect(r.total).toBe(60000); // 100000 - 40000
  });
});
```

- [ ] **Step 2: Запустить — FAIL** (старый `receivables` вернёт 60000 в первом тесте).

- [ ] **Step 3: Заменить `receivables`** в `src/lib/dashboardMetrics.js:141-150` на:

```js
export function receivables(projects, sharesByProject = {}) {
  const items = [];
  for (const p of projects) {
    if (p.stage === 'Архив') continue;
    const amount = ownerShareAmount(p, sharesByProject[p.id] || []);
    const received = proportionReceived(p.paidAmount, amount, p.contractSum);
    const remaining = amount - received;
    if (remaining > 0) items.push({ id: p.id, name: p.name, remaining });
  }
  items.sort((a, b) => b.remaining - a.remaining);
  return { total: items.reduce((s, x) => s + x.remaining, 0), items };
}
```

> Примечание: `ownerShareAmount`/`proportionReceived` объявлены ниже в файле — порядок объявления функций при `export function` не важен (hoisting), но для читаемости можно поднять блок «Доли» выше `receivables`. Если поднимаете — перенесите весь блок (Tasks 4-6) единым куском.

- [ ] **Step 4: Запустить — PASS.** Также прогнать ВЕСЬ файл: `npx vitest run src/lib/dashboardMetrics.test.js` — старые 36 + новые тесты зелёные (обратная совместимость `receivables(projects)` цела).

### Task 9: `mySharesTotals` — агрегат моих долей в чужих проектах

**Files:**
- Modify: `src/lib/dashboardMetrics.test.js`, `src/lib/dashboardMetrics.js`

- [ ] **Step 1: Тест (падающий)**

```js
describe('mySharesTotals', () => {
  it('суммирует my_received и my_receivable из get_my_shares', () => {
    const myShares = [
      { projectName: 'X', myAmount: 30000, myReceived: 12000, myReceivable: 18000 },
      { projectName: 'Y', myAmount: 50000, myReceived: 50000, myReceivable: 0 },
    ];
    expect(mySharesTotals(myShares)).toEqual({ received: 62000, receivable: 18000 });
  });
  it('пустой список → нули', () => {
    expect(mySharesTotals([])).toEqual({ received: 0, receivable: 0 });
  });
});
```

- [ ] **Step 2: Запустить — FAIL.**

- [ ] **Step 3: Реализовать:**

```js
// Итоги по моим долям в чужих проектах (вход — результат get_my_shares, уже в camelCase).
export function mySharesTotals(myShares = []) {
  let received = 0, receivable = 0;
  for (const s of myShares) {
    received += Number(s.myReceived) || 0;
    receivable += Number(s.myReceivable) || 0;
  }
  return { received, receivable };
}
```

- [ ] **Step 4: Запустить — PASS.**

- [ ] **Step 5: Закоммитить Фазу 2 (Windows-сторона)**

```powershell
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add src/lib/dashboardMetrics.js src/lib/dashboardMetrics.test.js
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m @'
feat(payment-shares): расчёты долей в dashboardMetrics + vitest

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Фаза 3. UI (`src/App.jsx`)

> UI монолита не покрыт юнит-тестами (проект тестирует только `lib`). Проверка UI-задач — `npm run build` (зелёная сборка) + ручная сверка по чек-листам. Деплой на прод — отдельно, по команде «деплой».

### Task 10: Адаптеры и загрузка долей

**Files:**
- Modify: `src/App.jsx` (рядом с `projectDbToJs` ~111; `fetchProjects` ~291; оба `Promise.all` 6569 и 6621)

- [ ] **Step 1: Добавить адаптер `shareDbToJs` и загрузчики** (рядом с `txDbToJs` ~256, после него):

```js
function shareDbToJs(row) {
  return {
    id:                row.id,
    projectId:         row.project_id,
    participantUserId: row.participant_user_id || null,
    participantClientId: row.participant_client_id || null,
    participantName:   row.participant_name || "",
    shareKind:         row.share_kind === "amount" ? "amount" : "percent",
    shareValue:        row.share_value != null ? Number(row.share_value) : 0,
    note:              row.note || "",
  };
}

// Доли всех проектов владельца (RLS вернёт только доступные). Группируем по projectId.
async function fetchProjectShares(client) {
  const { data, error } = await client.from("project_shares").select("*");
  if (error) throw error;
  const byProject = {};
  for (const row of data || []) {
    const s = shareDbToJs(row);
    (byProject[s.projectId] = byProject[s.projectId] || []).push(s);
  }
  return byProject; // { [projectId]: [share, ...] }
}

// Мои доли в чужих проектах (приватная проекция через RPC).
async function getMyShares(client) {
  const { data, error } = await client.rpc("get_my_shares");
  if (error) throw error;
  return (data || []).map(r => ({
    projectName:  r.project_name,
    myAmount:     Number(r.my_amount) || 0,
    myReceived:   Number(r.my_received) || 0,
    myReceivable: Number(r.my_receivable) || 0,
  }));
}
```

- [ ] **Step 2: Добавить state** (рядом с `const [projects, setProjects]` / `const [txs, setTxs]` в `App`):

```js
const [sharesByProject, setSharesByProject] = useState({});
const [myShares, setMyShares] = useState([]);
```

- [ ] **Step 3: Догрузить в ОБА `Promise.all`** (6569 и 6621). В каждом расширить деструктуризацию и setState:

```js
const [p, t, cl, tk, sh, ms] = await Promise.all([
  fetchProjects(supabase),
  fetchTransactions(supabase),
  fetchClients(supabase).catch(() => []),
  fetchTasks(supabase, { assignedTo: prof.id }).catch(() => []),
  fetchProjectShares(supabase).catch(() => ({})),
  getMyShares(supabase).catch(() => []),
]);
setProjects(p);
setTxs(t);
setClients(cl);
setTasks(tk);
setSharesByProject(sh);
setMyShares(ms);
setPhase("ready");
```

- [ ] **Step 4: Сбросить на SIGNED_OUT** (там же, где сбрасываются projects/txs/tasks): добавить `setSharesByProject({}); setMyShares([]);`.

- [ ] **Step 5: Прокинуть в `Dashboard`** (вызов `<Dashboard ... />`): добавить пропсы `sharesByProject={sharesByProject}` и `myShares={myShares}`. В `Projects` (карточки) — `sharesByProject={sharesByProject}`.

- [ ] **Step 6: Сборка** Bash: `cd /f/Сайт/redesign-v2-fresh && npm run build 2>&1 | tail -8` — зелёная (нет «Unexpected end of file»).

### Task 11: Секция «Доли участников» в `ProjectForm`

**Files:**
- Modify: `src/App.jsx` (`ProjectForm` 1486-1982; state ~1499; вставка секции после поля оплаты ~1656; сохранение проекта)

**Контекст:** форма уже умеет autocomplete юзеров (`searchApprovedUsers`, паттерн `execQuery`/`selectExecUser` 1600-1629) и выбор клиента (`ClientSelector`). Доли редактирует только владелец.

- [ ] **Step 1: Инициализировать state долей**. В объекте инициализации формы (~1499) добавить:

```js
shares: (initial?.shares || []).map(s => ({
  participantUserId: s.participantUserId || null,
  participantClientId: s.participantClientId || null,
  participantName: s.participantName || "",
  label: s.participantName || s._label || "",  // отображаемое имя
  shareKind: s.shareKind || "percent",
  shareValue: s.shareValue ?? "",
})),
```

(При открытии формы существующего проекта доли подаются в `initial.shares` из `sharesByProject[project.id]` — обеспечить в месте, где открывается форма редактирования: передать `shares: sharesByProject[p.id] || []` в `initial`. Имя участника-юзера/клиента для `label` подтянуть из уже загруженных списков по id, иначе показать «участник».)

- [ ] **Step 2: Хелперы управления долями** (внутри `ProjectForm`, рядом с `selectExecUser`):

```js
const addShare = (part) => setF(p => ({ ...p, shares: [...p.shares, {
  participantUserId: part.userId || null,
  participantClientId: part.clientId || null,
  participantName: part.name && !part.userId && !part.clientId ? part.name : "",
  label: part.name || "участник",
  shareKind: "percent", shareValue: "",
}] }));
const updateShare = (i, patch) => setF(p => ({ ...p, shares: p.shares.map((s, j) => j === i ? { ...s, ...patch } : s) }));
const removeShare = (i) => setF(p => ({ ...p, shares: p.shares.filter((_, j) => j !== i) }));
```

- [ ] **Step 3: JSX секции** — вставить ПОСЛЕ блока поля «Оплачено» (после строки ~1656), используя паттерн золотистой секции (как «Контакты заказчика» 1658-1703). Внутри:
  - заголовок «Доли участников»;
  - список `f.shares.map((s, i) => ...)`: имя (`s.label`), `<StyledInput type="number">` на `s.shareValue` (`updateShare(i,{shareValue:e.target.value})`), переключатель `%`/`₽` (две кнопки или `<StyledSelect>` на `s.shareKind`), кнопка удаления (`removeShare(i)`);
  - три кнопки добавления участника: «Юзер» (открывает inline-autocomplete по `searchApprovedUsers` → `addShare({userId:u.id,name:u.name||u.email})`), «Заказчик» (если `f.clientId` — `addShare({clientId:f.clientId,name:f.client})`, иначе autocomplete `searchClientsByQuery`), «Внешний» (текстовый ввод имени → `addShare({name})`);
  - индикатор остатка: вычислить `othersSum = f.shares.reduce((acc,s)=> acc + (s.shareKind==='amount'? Number(s.shareValue)||0 : (Number(f.contractSum)||0)*(Number(s.shareValue)||0)/100), 0)` и показать «Твоя доля (остаток): {fmt(Math.max(0,(Number(f.contractSum)||0)-othersSum))}». Если `othersSum > contractSum` — предупреждение красным.

> Реализуй JSX в стиле существующих секций формы (inline-стили, `StyledInput`/`StyledSelect`, иконки lucide). Autocomplete юзера — копия паттерна исполнителя (`execQuery`/`execResults`/`selectExecUser`, 1540-1629), но результат идёт в `addShare`, а не в `executor`.

- [ ] **Step 4: Сохранение долей (replace-all)** — в обработчике сабмита формы, ПОСЛЕ успешного `insert/update` проекта (когда известен `projectId`):

```js
// синхронизация долей: удалить все прежние, вставить текущие непустые
await supabase.from("project_shares").delete().eq("project_id", projectId);
const rows = (f.shares || [])
  .filter(s => (Number(s.shareValue) || 0) > 0 && (s.participantUserId || s.participantClientId || s.participantName))
  .map(s => ({
    project_id: projectId,
    participant_user_id: s.participantUserId || null,
    participant_client_id: s.participantClientId || null,
    participant_name: (!s.participantUserId && !s.participantClientId) ? (s.participantName || s.label || null) : null,
    share_kind: s.shareKind === "amount" ? "amount" : "percent",
    share_value: Number(s.shareValue) || 0,
  }));
if (rows.length) {
  const { error: shErr } = await supabase.from("project_shares").insert(rows);
  if (shErr) throw shErr;
}
```

После сохранения — обновить `sharesByProject` (refetch `fetchProjectShares` или локально слить). Проще: после сабмита в родителе вызвать повторную загрузку долей (как делается refetch проектов).

- [ ] **Step 5: Баг #8 — автозаполнение paid при стадии «Оплачен»**. В обработчике селекта стадии (1640) заменить `onChange={e => s("stage", e.target.value)}` на:

```js
onChange={e => {
  const v = e.target.value;
  setF(p => {
    const next = { ...p, stage: v };
    if (v === "Оплачен") {
      const c = Number(p.contractSum) || 0, paid = Number(p.paidAmount) || 0;
      if (c > 0 && paid < c) next.paidAmount = c;  // подтянуть, поле остаётся редактируемым
    }
    return next;
  });
}}
```

- [ ] **Step 6: Сборка** Bash: `cd /f/Сайт/redesign-v2-fresh && npm run build 2>&1 | tail -8` — зелёная.

- [ ] **Step 7: Закоммитить** (Windows-сторона):
```powershell
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add src/App.jsx
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m @'
feat(payment-shares): секция долей в ProjectForm + загрузка + фикс бага #8

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

### Task 12: Дашборд — KPI «Получено» по моей доле + блок «Мои доли»

**Files:**
- Modify: `src/App.jsx` (`Dashboard` 2130-2275; импорт из dashboardMetrics стр. 5; KPI 2192; зона «Финансы» ~2215)

- [ ] **Step 1: Расширить импорт** (стр. 5):

```js
import { receivables, myTasks, ownerReceived, mySharesTotals } from "./lib/dashboardMetrics";
```

- [ ] **Step 2: Принять новые пропсы** в `Dashboard({ projects, txs, tasks, onDrillStage })` → добавить `sharesByProject = {}, myShares = []`.

- [ ] **Step 3: Пересчитать «Получено» и дебиторку** (в теле `Dashboard`, рядом с `const debt = receivables(projects)` ~2147):

```js
const sharesTot = mySharesTotals(myShares);
const myReceived = ownerReceived(projects, sharesByProject) + sharesTot.received;
const debt = receivables(projects, sharesByProject);
const debtTotal = debt.total + sharesTot.receivable;
```

- [ ] **Step 4: Обновить KPI «Получено»** (2192). Значение `totalPaid` → `myReceived`; `sub` остатка → `debtTotal`:

```jsx
<KpiCard label="Получено" value={myReceived} Icon={BadgeCheck} color="#6ee7a8" format={fmt}
  sub={`жду: ${fmt(debtTotal)}`} />
```

(Удалить/не использовать прежний `const totalPaid = portfolio.reduce(...)` если он больше нигде не нужен; если используется ещё где-то — оставить, но KPI берёт `myReceived`.)

- [ ] **Step 5: Блок «Мои доли в проектах»** — добавить в зону «💰 Финансы» (после `<ReceivablesCard data={debt} />` ~2237) новый компонент. Объявить рядом с `ReceivablesCard` (2040-2060) по тому же паттерну:

```jsx
function MySharesCard({ shares }) {
  if (!shares || !shares.length) return null;
  const totalReceived = shares.reduce((s, x) => s + (x.myReceived || 0), 0);
  const top = [...shares].sort((a, b) => b.myReceivable - a.myReceivable).slice(0, 5);
  return (
    <div style={CARD_STYLE /* как у ReceivablesCard */}>
      <SectionTitle icon={<Wallet size={13} />}>Мои доли в проектах</SectionTitle>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ color: "#6b6b67", fontSize: 12 }}>получено по долям</span>
        <span style={{ color: "#6ee7a8", fontSize: 14, fontWeight: 700 }}>{fmt(totalReceived)}</span>
      </div>
      {top.map((it, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
          <span style={{ color: "#cfcfca" }}>{it.projectName}</span>
          <span style={{ color: "#e8c860" }}>{fmt(it.myReceived)} / {fmt(it.myAmount)}</span>
        </div>
      ))}
    </div>
  );
}
```
И рендер: `<MySharesCard shares={myShares} />` в гриде зоны «Финансы». (Стиль карточки скопировать из `ReceivablesCard` — `CARD_STYLE` подставить реальный объект-стиль из соседней карточки.)

- [ ] **Step 6: Прокинуть пропсы Dashboard** в `App` (если не сделано в Task 10 Step 5): `<Dashboard ... sharesByProject={sharesByProject} myShares={myShares} />`.

- [ ] **Step 7: Сборка** — `npm run build` зелёная.

- [ ] **Step 8: Закоммитить** (Windows-сторона):
```powershell
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add src/App.jsx
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m @'
feat(payment-shares): дашборд — Получено по моей доле + блок «Мои доли»

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

### Task 13: Индикатор доли на карточке проекта

**Files:**
- Modify: `src/App.jsx` (карточка проекта 2363-2509, блок финансов 2400-2414; компонент должен получать `sharesByProject`)

- [ ] **Step 1: Прокинуть доли в карточку**. Компонент списка `Projects` принял `sharesByProject` (Task 10 Step 5) — передать в карточку проекта `shares={sharesByProject[p.id] || []}`.

- [ ] **Step 2: Добавить индикатор** после progress-bar (после ~2414):

```jsx
{shares.length > 0 && (() => {
  const contract = Number(p.contractSum) || 0;
  const others = shares.reduce((acc, s) => acc + (s.shareKind === 'amount'
    ? Number(s.shareValue) || 0
    : contract * (Number(s.shareValue) || 0) / 100), 0);
  const mine = Math.max(0, contract - others);
  const pct = contract > 0 ? Math.round(mine / contract * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 11, color: "#6b6b67" }}>
      <Users size={12} />
      <span>Моя доля: <span style={{ color: "#e8c860" }}>{fmt(mine)} ({pct}%)</span></span>
    </div>
  );
})()}
```
(Импортировать `Users` из lucide-react, если ещё не импортирован.)

- [ ] **Step 3: Сборка** — `npm run build` зелёная.

- [ ] **Step 4: Закоммитить** (Windows-сторона):
```powershell
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add src/App.jsx
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m @'
feat(payment-shares): индикатор «Моя доля» на карточке проекта

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Фаза 4. Верификация

### Task 14: Полный прогон тестов и сборки

- [ ] **Step 1: vitest целиком** Bash: `cd /f/Сайт/redesign-v2-fresh && npm run test 2>&1 | tail -20`
Ожидаемо: ВСЕ тесты PASS (36 старых + новые из Tasks 4-9). Обратная совместимость `receivables(projects)` подтверждена тестом Task 8.

- [ ] **Step 2: Сборка** Bash: `cd /f/Сайт/redesign-v2-fresh && npm run build 2>&1 | tail -8`
Ожидаемо: зелёная, без ошибок.

- [ ] **Step 3: Повторить verify-shares-rls** (на случай регрессий БД):
PowerShell: `wsl -d Ubuntu -u root -- bash /mnt/f/*/redesign-v2-fresh/deploy/payment-shares/verify-shares-rls.sh`
Ожидаемо: `SHARES_RLS_OK`.

### Task 15: Чек-лист ручной проверки (для владельца, «в работе»)

Не автоматизируется — собрать для владельца перед/после деплоя:

- [ ] Создать проект, договор 100000, добавить долю: юзер-участник 30%, внешний «Подрядчик» 20000 ₽ → индикатор «Твоя доля (остаток)» показывает 50000.
- [ ] На дашборде владельца KPI «Получено» и дебиторка считают **мою** долю (не полную сумму).
- [ ] Войти вторым аккаунтом (участник) → на его дашборде блок «Мои доли в проектах» показывает название проекта + его долю + получено; заказчик/полная сумма/чужие доли не видны.
- [ ] Баг #8: поставить проекту стадию «Оплачен» → `paid` подтянулся к сумме договора → проект ушёл из дебиторки.
- [ ] Карточка проекта показывает «Моя доля: N ₽ (M%)» при наличии долей; без долей — индикатора нет (как раньше).

### Task 16: Финальный ревью и подготовка к merge

- [ ] **Step 1: Code-review** изменений ветки (correctness + reuse) — через `/code-review` или ревьюер. Особое внимание: формула получено-пропорции совпадает в SQL (`get_my_shares`) и JS (`proportionReceived`); replace-all долей не теряет данные при ошибке (insert после delete — при сбое insert доли пропадут: рассмотреть транзакцию/порядок).
- [ ] **Step 2: Merge** `feature/payment-shares` → `main` — **по явному согласию владельца**. Merge-коммит с trailer (субагентские коммиты из WSL могли быть без него — см. долг проекта). Push с обходом прокси.
- [ ] **Step 3: Деплой на прод** — **только по команде «деплой»**: `npm run build` → `wsl -d Ubuntu -u root -- bash -c "bash /mnt/f/*/redesign-v2-fresh/deploy/nextcloud/deploy-web.sh"`. После деплоя — холодный перезапуск PWA (липкий SW-кэш ≠ сбой сервера).

---

## Self-review (заполнить после написания плана)

- **Покрытие спека:** Секции 1-6 спека → Фазы 1-4 плана. Модель/RLS/RPC → Фаза 1; расчёты+#8 → Фаза 2 (+ #8 UI в Task 11) ; UI → Фаза 3; миграция (чистый DDL, без backfill) → Task 1; тесты → Фаза 4.
- **Плейсхолдеры:** SQL и JS приведены целиком; JSX-секции формы/карточки описаны структурно со стилевым паттерном-источником (монолит inline-стилей не воспроизводится дословно — указаны точные места и образцы).
- **Согласованность имён:** `shareToAmount`/`ownerShareAmount`/`proportionReceived`/`ownerReceived`/`mySharesTotals`/`receivables(projects, sharesByProject)` — едины в тестах, реализации и App.jsx; `get_my_shares` поля `my_amount/my_received/my_receivable` ↔ camelCase `myAmount/myReceived/myReceivable` в `getMyShares`.
```


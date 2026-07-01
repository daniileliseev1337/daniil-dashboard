# Модель доступа заказчика «3.0» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать заказчику 4 полноценные вкладки (Дашборд/Проекты/Задачи/Финансы) со СВОИМИ данными вместо одной вкладки-портала, не нарушая инвариант приватности §1.

**Architecture:** Данные заказчика идут только через SECURITY DEFINER-проекции (`get_my_client_projects` уже есть; добавляем `get_my_project_payments`). Фронт — подход C: тонкие заказчичьи контейнеры-вкладки на проекциях + реюз презентационных кусков без чувствительных пропсов. `TABS` в `clientView` расширяется с 1 до 4 вкладок; рендер заказчичьих вкладок изолирован от сотрудничьих компонентов (которые тянут txs/доли фирмы).

**Tech Stack:** React + Vite (монолит `src/App.jsx`), self-hosted Supabase (Postgres, RPC/RLS), vitest (чистые расчёты).

## Global Constraints

- **§1 приватность (жёстко):** данные заказчика ТОЛЬКО через SECURITY DEFINER-проекции; заказчичьи компоненты НЕ вызывают прямой `supabase.from('projects'/'project_payments'/'transactions').select()`. Ни `owner_id`, ни `notes`, ни доли (`project_shares`), ни себестоимость, ни чужие проекты не попадают в проекцию.
- Все новые RPC: `security definer stable set search_path = public, pg_temp` + `grant execute ... to authenticated`.
- Стиль UI — существующий premium-dark (реюз стилей карточек/модалок; без нового «синего» оформления).
- Чистые расчёты — отдельный модуль без React/Supabase, покрыт vitest.
- **git на `F:`** сбоит на fsync: коммитить `git -c core.fsyncMethod=writeout-only` с ретраем 3-10 раз; работать git с Windows-стороны, push с обходом прокси. **Деплой на прод — только по явному слову владельца.**
- Ветка: `feature/client-access-model` (от `main`).

---

### Task 1: БД — проекция `get_my_project_payments` + verify-rls

**Files:**
- Create: `supabase/migrations/20260701_0001_get_my_project_payments.sql`
- Create: `deploy/verify-client-payments-rls.sh`

**Interfaces:**
- Produces: RPC `get_my_project_payments()` → rows `{project_id uuid, project_name text, paid_on date, amount numeric}`, только для проектов, где `clients.user_id = auth.uid()`.

- [ ] **Step 1: Написать миграцию**

`supabase/migrations/20260701_0001_get_my_project_payments.sql`:
```sql
-- 20260701_0001: история платежей заказчику (§1-безопасная проекция).
-- Заказчику видны платежи ТОЛЬКО его проектов; без себестоимости/долей/чужого.
create or replace function public.get_my_project_payments()
returns table(project_id uuid, project_name text, paid_on date, amount numeric)
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select pp.project_id, p.name, pp.paid_on, pp.amount
  from public.project_payments pp
  join public.projects p on p.id = pp.project_id
  join public.clients   c on c.id = p.client_id
  where c.user_id = auth.uid()
  order by pp.paid_on desc;
$$;
grant execute on function public.get_my_project_payments() to authenticated;
```

- [ ] **Step 2: Применить к живой БД**

Применить тем же способом, что и предыдущие миграции проекта (`20260630_*`): файл-скрипт через WSL, `psql` к контейнеру self-hosted БД (см. существующий `deploy/tasks/apply-migrations.sh` / как применялись последние миграции). Inline-psql со скобками через PowerShell→wsl бьётся — только файл-скрипт.
Expected: `CREATE FUNCTION`, `GRANT`.

- [ ] **Step 3: verify-rls скрипт**

`deploy/verify-client-payments-rls.sh` — по образцу `deploy/.../verify-shares-rls.sh`: под JWT тестового заказчика вызвать `get_my_project_payments()`, проверить: возвращаются только платежи его проекта; платёж чужого проекта отсутствует. Печатает `CLIENT_PAYMENTS_RLS_OK` при успехе.

- [ ] **Step 4: Прогнать verify**

Run: `bash deploy/verify-client-payments-rls.sh`
Expected: `CLIENT_PAYMENTS_RLS_OK`.

- [ ] **Step 5: Commit**

```bash
git -c core.fsyncMethod=writeout-only add supabase/migrations/20260701_0001_get_my_project_payments.sql deploy/verify-client-payments-rls.sh
git -c core.fsyncMethod=writeout-only commit -m "feat(db): get_my_project_payments — история платежей заказчику (§1)"
```

---

### Task 2: Чистые расчёты `clientMetrics.js` (TDD)

**Files:**
- Create: `src/lib/clientMetrics.js`
- Test: `src/lib/clientMetrics.test.js`

**Interfaces:**
- Consumes: проекты вида `{id,name,stage,deadline,contract_sum,paid_amount,open_task_count}` (из `get_my_client_projects`); задачи `{id,title,status,project_id}`; платежи `{project_id,project_name,paid_on,amount}`.
- ⚠ **Type-consistency (сверить в Task 3/5):** проекция отдаёт `snake_case` (`contract_sum`/`paid_amount`/`open_task_count`), а сотрудничий код в `App.jsx` (напр. `:7461`) оперирует `camelCase` (`contractSum`/`paidAmount`). Проверить, НЕ мапит ли `fetchMyClientProjects` результат в camelCase; `clientMetrics` и заказчичьи компоненты должны использовать ТУ ЖЕ форму, что реально приходит из обёртки. Если обёртка мапит — либо не мапить для заказчика, либо привести ключи в `clientMetrics` к фактической форме (и обновить тесты).
- Produces:
  - `clientTotals(projects)` → `{activeCount, totalContract, totalPaid, totalRemaining, openTasks}`
  - `attentionTasks(tasks)` → массив задач со `status === 'На проверке'`
  - `paymentsByProject(payments)` → `{ [project_id]: {name, items:[{paid_on,amount}], total} }`
  - `projectRemaining(project)` → `Number` = `contract_sum - paid_amount` (не ниже 0)

- [ ] **Step 1: Написать падающие тесты**

`src/lib/clientMetrics.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { clientTotals, attentionTasks, paymentsByProject, projectRemaining } from './clientMetrics.js';

const projects = [
  { id:'a', name:'A', stage:'В работе', contract_sum:100, paid_amount:40, open_task_count:2 },
  { id:'b', name:'B', stage:'Оплачен',  contract_sum:50,  paid_amount:50, open_task_count:0 },
];
const tasks = [
  { id:'t1', title:'x', status:'В работе',   project_id:'a' },
  { id:'t2', title:'y', status:'На проверке', project_id:'a' },
];
const payments = [
  { project_id:'a', project_name:'A', paid_on:'2026-06-01', amount:40 },
  { project_id:'b', project_name:'B', paid_on:'2026-05-01', amount:50 },
];

describe('clientMetrics', () => {
  it('clientTotals: активные без Оплачен/Архив, суммы, открытые задачи', () => {
    expect(clientTotals(projects)).toEqual({
      activeCount:1, totalContract:150, totalPaid:90, totalRemaining:60, openTasks:2,
    });
  });
  it('projectRemaining: договор минус оплачено, не ниже нуля', () => {
    expect(projectRemaining({ contract_sum:100, paid_amount:40 })).toBe(60);
    expect(projectRemaining({ contract_sum:30,  paid_amount:50 })).toBe(0);
  });
  it('attentionTasks: только На проверке', () => {
    expect(attentionTasks(tasks).map(t => t.id)).toEqual(['t2']);
  });
  it('paymentsByProject: группировка + total', () => {
    const g = paymentsByProject(payments);
    expect(g['a'].total).toBe(40);
    expect(g['a'].items).toHaveLength(1);
    expect(g['b'].name).toBe('B');
  });
});
```

- [ ] **Step 2: Прогнать — упадут**

Run: `npm run test -- clientMetrics`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализация**

`src/lib/clientMetrics.js`:
```js
// Чистые расчёты для вкладок заказчика. Вход — данные из безопасных проекций
// (get_my_client_projects / get_my_project_payments / get_tasks). Без React/Supabase.
const CLOSED_STAGES = ['Оплачен', 'Архив'];

export function projectRemaining(p) {
  return Math.max(0, (+p.contract_sum || 0) - (+p.paid_amount || 0));
}

export function clientTotals(projects = []) {
  return projects.reduce((acc, p) => {
    const closed = CLOSED_STAGES.includes(p.stage);
    acc.totalContract += (+p.contract_sum || 0);
    acc.totalPaid     += (+p.paid_amount  || 0);
    acc.totalRemaining += projectRemaining(p);
    acc.openTasks     += (+p.open_task_count || 0);
    if (!closed) acc.activeCount += 1;
    return acc;
  }, { activeCount:0, totalContract:0, totalPaid:0, totalRemaining:0, openTasks:0 });
}

export function attentionTasks(tasks = []) {
  return tasks.filter(t => t.status === 'На проверке');
}

export function paymentsByProject(payments = []) {
  const out = {};
  for (const pay of payments) {
    const k = pay.project_id;
    if (!out[k]) out[k] = { name: pay.project_name, items: [], total: 0 };
    out[k].items.push({ paid_on: pay.paid_on, amount: +pay.amount || 0 });
    out[k].total += (+pay.amount || 0);
  }
  return out;
}
```

- [ ] **Step 4: Прогнать — пройдут**

Run: `npm run test -- clientMetrics`
Expected: PASS (4 теста).

- [ ] **Step 5: Commit**

```bash
git -c core.fsyncMethod=writeout-only add src/lib/clientMetrics.js src/lib/clientMetrics.test.js
git -c core.fsyncMethod=writeout-only commit -m "feat(client): clientMetrics — чистые агрегаты вкладок заказчика (vitest)"
```

---

### Task 3: Data-обёртка `fetchMyProjectPayments` + загрузка в bootstrap заказчика

**Files:**
- Modify: `src/App.jsx` (рядом с `fetchMyClientProjects` — добавить обёртку; в bootstrap `clientView` — грузить платежи в новый state)

**Interfaces:**
- Consumes: RPC `get_my_project_payments` (Task 1); существующая `fetchMyClientProjects`.
- Produces: `fetchMyProjectPayments(supabase)` → массив `{project_id,project_name,paid_on,amount}`; state `clientPayments`.

- [ ] **Step 1: Найти определение `fetchMyClientProjects`**

Run: grep `fetchMyClientProjects` в `src/App.jsx` — рядом добавить обёртку тем же паттерном (`supabase.rpc('get_my_project_payments')`, вернуть `data ?? []`).

- [ ] **Step 2: Добавить обёртку + state**

Обёртка (рядом с `fetchMyClientProjects`):
```js
async function fetchMyProjectPayments(supabase) {
  const { data, error } = await supabase.rpc('get_my_project_payments');
  if (error) throw error;
  return data ?? [];
}
```
State рядом с `const [clientProjects, setClientProjects] = useState([]);` (`App.jsx:8846`):
```js
const [clientPayments, setClientPayments] = useState([]);
```

- [ ] **Step 3: Грузить в bootstrap заказчика**

Там, где при заказчике грузится `fetchMyClientProjects` (bootstrap/`viewMode` переключение), догрузить платежи:
```js
setClientPayments(await fetchMyProjectPayments(supabase));
```
(в тот же `try`, где `setClientProjects(await fetchMyClientProjects(supabase))`).

- [ ] **Step 4: Проверка сборки**

Run: `npm run build`
Expected: зелёная сборка.

- [ ] **Step 5: Commit**

```bash
git -c core.fsyncMethod=writeout-only add src/App.jsx
git -c core.fsyncMethod=writeout-only commit -m "feat(client): загрузка истории платежей заказчика в bootstrap"
```

---

### Task 4: `TABS` clientView → 4 вкладки + изолированный рендер (каркас)

**Files:**
- Modify: `src/App.jsx:9144-9145` (TABS clientView), рендер-ветка по `effectiveTab` при `clientView`, переключатель вида `:9260` (client → `dashboard`).

**Interfaces:**
- Consumes: `clientView`, `effectiveTab`, состояния `clientProjects`, `clientPayments`, `tasks`.
- Produces: при `clientView` вкладки `dashboard|projects|tasks|finance` рендерят заказчичьи компоненты (Task 5-8), НЕ сотрудничьи. Заглушки на этом шаге.

- [ ] **Step 1: Расширить TABS clientView**

Заменить (`App.jsx:9145`):
```js
    ? [{ id: "myorders", label: "Мои заказы", Icon: Package }]
```
на:
```js
    ? [
        { id: "dashboard", label: "Дашборд", Icon: LayoutDashboard },
        { id: "projects",  label: "Проекты",  Icon: FolderKanban },
        { id: "tasks",     label: "Задачи",   Icon: ListTodo },
        { id: "finance",   label: "Финансы",  Icon: Receipt },
      ]
```
Переключатель вида (`:9260`): `setTab(m === "client" ? "dashboard" : "dashboard")` — при входе в client-режим открывать `dashboard`.

- [ ] **Step 2: Изолированный рендер заказчика**

В зоне рендера вкладок добавить ветку ПЕРЕД сотрудничьими рендерами:
```jsx
{clientView ? (
  <>
    {effectiveTab === "dashboard" && <ClientDashboard projects={clientProjects} payments={clientPayments} tasks={tasks} onOpenTask={(id)=>setTab("tasks")} />}
    {effectiveTab === "projects" && <ClientProjects orders={clientProjects} client={supabase} profile={profile} showToast={showToast} onChanged={async()=>{ setClientProjects(await fetchMyClientProjects(supabase)); }} />}
    {effectiveTab === "tasks"    && <ClientTasks projects={clientProjects} client={supabase} profile={profile} showToast={showToast} />}
    {effectiveTab === "finance"  && <ClientFinance projects={clientProjects} payments={clientPayments} />}
  </>
) : (
  /* существующие сотрудничьи рендеры */
)}
```
На этом шаге компоненты — временные заглушки (`const ClientDashboard = () => <div>Дашборд</div>` и т.д.), чтобы каркас собрался. `ClientOrdersPage` пока оставить импортированным (удаление — в Task 5).

- [ ] **Step 3: Сборка + ручная проверка каркаса**

Run: `npm run build` → зелёно. Локально под заказчиком — видны 4 вкладки, переход между ними не падает.

- [ ] **Step 4: Commit**

```bash
git -c core.fsyncMethod=writeout-only add src/App.jsx
git -c core.fsyncMethod=writeout-only commit -m "feat(client): 4 вкладки заказчика + изолированный рендер (каркас-заглушки)"
```

---

### Task 5: `ClientProjects` (вкладка «Проекты»)

**Files:**
- Create: `src/components/client/ClientProjects.jsx` (вынести/адаптировать текущий `ClientOrdersPage`)
- Modify: `src/App.jsx` (импорт, замена заглушки; убрать мёртвый `myorders`/`ClientOrdersPage` если больше не используется)

**Interfaces:**
- Consumes: `orders` (= `clientProjects` из `get_my_client_projects`), `client` (supabase), `profile`, `showToast`, `onChanged`.
- Produces: `<ClientProjects>` — карточки проектов заказчика (стадия, дедлайн, счётчик задач, договор/оплачено/остаток через `projectRemaining`), кнопка «Создать проект» (существующий `create_project_request`-флоу из `ClientOrdersPage`), открытие проекта → его задачи.

- [ ] **Step 1: Прочитать текущий `ClientOrdersPage`** (grep в `App.jsx`/`src`) — понять разметку карточек и флоу «Создать проект».
- [ ] **Step 2: Создать `ClientProjects.jsx`** на его основе: те же данные/флоу, добавить строку «Остаток: {projectRemaining(p)}»; реюз стилей карточек. НЕ добавлять прямых `from()`.
- [ ] **Step 3: Подключить** в `App.jsx` (импорт + замена заглушки Task 4). Удалить ветку `myorders`/`ClientOrdersPage`, если она больше нигде не нужна.
- [ ] **Step 4: Сборка + ручная проверка** — вкладка «Проекты» показывает заказы, «Создать проект» открывает заявку.
- [ ] **Step 5: Commit** `feat(client): вкладка Проекты (ClientProjects)`.

---

### Task 6: `ClientTasks` (вкладка «Задачи»)

**Files:**
- Create: `src/components/client/ClientTasks.jsx`
- Modify: `src/App.jsx` (замена заглушки)

**Interfaces:**
- Consumes: `projects` (clientProjects), `client`, `profile`, `showToast`. Задачи заказчика — через существующий доступ (`get_tasks` / RLS `client_task_tz_access`). **Свериться (спека §8):** как выбрать задачи ВСЕХ проектов заказчика — вызвать `get_tasks(p_project_id => null)` и проверить, что возвращаются только доступные (его проектов), либо звать по каждому `project_id` из `projects`.
- Produces: список/доска задач по заказам; открытие задачи → ТЗ + комментарии (реюз существующих компонентов задачи); приёмка на «На проверке» → `client_set_task_status` (Принять/Вернуть — уже в портале).

- [ ] **Step 1: Прочитать текущий блок задач портала** (в `ClientOrdersPage`/модалке задачи) — приёмка `client_set_task_status`.
- [ ] **Step 2: Создать `ClientTasks.jsx`** — список задач по проектам заказчика + открытие (реюз модалки задачи, если она изолирована; иначе перенести нужные куски), кнопки Принять/Вернуть.
- [ ] **Step 3: Подключить** (замена заглушки).
- [ ] **Step 4: Сборка + ручная проверка** — задачи видны, приёмка работает.
- [ ] **Step 5: Commit** `feat(client): вкладка Задачи (ClientTasks)`.

---

### Task 7: `ClientFinance` (вкладка «Финансы»)

**Files:**
- Create: `src/components/client/ClientFinance.jsx`
- Modify: `src/App.jsx` (замена заглушки)

**Interfaces:**
- Consumes: `projects` (clientProjects), `payments` (clientPayments); `clientMetrics` (`projectRemaining`, `paymentsByProject`).
- Produces: по каждому заказу — договор / оплачено / остаток + история платежей (`paymentsByProject`); суммарные оплачено/остаток. Без себестоимости/долей.

- [ ] **Step 1: Создать `ClientFinance.jsx`**:
```jsx
import { projectRemaining, paymentsByProject } from '../../lib/clientMetrics.js';
export default function ClientFinance({ projects = [], payments = [] }) {
  const byProj = paymentsByProject(payments);
  // на проект: p.contract_sum, p.paid_amount, projectRemaining(p), byProj[p.id]?.items
  // реюз стилей карточек/таблиц; НИКАКИХ from()/долей/себестоимости
}
```
(Разметку оформить в premium-dark, реюз строки платежа/таблицы.)
- [ ] **Step 2: Подключить** (замена заглушки).
- [ ] **Step 3: Сборка + ручная проверка** — суммы совпадают с проекцией; истории платежей показаны.
- [ ] **Step 4: Commit** `feat(client): вкладка Финансы (ClientFinance)`.

---

### Task 8: `ClientDashboard` (вкладка «Дашборд»)

**Files:**
- Create: `src/components/client/ClientDashboard.jsx`
- Modify: `src/App.jsx` (замена заглушки)

**Interfaces:**
- Consumes: `projects` (clientProjects), `payments` (clientPayments), `tasks`; `clientMetrics` (`clientTotals`, `attentionTasks`).
- Produces: KPI-плашки (`clientTotals`: активные заказы, всего оплачено, остаток, открытые задачи) + ближайший дедлайн + блок «Требует внимания» (`attentionTasks` → клик ведёт на вкладку Задачи через `onOpenTask`).

- [ ] **Step 1: Создать `ClientDashboard.jsx`** — KPI из `clientTotals(projects)`; «Требует внимания» из `attentionTasks(tasks)`; ближайший дедлайн — min(deadline) активных. Реюз стилей KPI-плашек.
- [ ] **Step 2: Подключить** (замена заглушки).
- [ ] **Step 3: Сборка + ручная проверка** — KPI совпадают с Финансами/Проектами; «Требует внимания» кликается.
- [ ] **Step 4: Commit** `feat(client): вкладка Дашборд (ClientDashboard)`.

---

### Task 9: E2E под чистым заказчиком + регресс сотрудника

**Files:** нет новых (проверка).

- [ ] **Step 1: Создать тестовый аккаунт** `client` без `employee` (спека §8, «Задача 0») + привязать к записи `clients` с ≥1 проектом и платежами.
- [ ] **Step 2: E2E под заказчиком** — 4 вкладки открываются; данные ТОЛЬКО его; **нигде** нет себестоимости/долей/чужих проектов (проверить DevTools Network: заказчик не дёргает прямой `from('projects')`/`transactions`); приёмка задачи и «Создать проект» работают.
- [ ] **Step 3: Регресс** — сотрудник и гибрид (employee-режим) видят прежний полный набор вкладок без изменений; переключатель вида работает.
- [ ] **Step 4: Финальный ревью diff** `main..HEAD` (отдельный ревьюер, см. subagent-driven-development).
- [ ] **Step 5:** Итоговый коммит-метка / готовность к merge (merge и деплой — по явному слову владельца).

---

## Заметки по среде (грабли проекта)

- git на `F:` — `-c core.fsyncMethod=writeout-only` + ретрай; работать с Windows-стороны; push с обходом прокси (`$env:HTTPS_PROXY=""` + `git -c http.proxy=""`).
- Применение миграций / bash к WSL — файлом-скриптом (кириллица/`$()` в inline через PowerShell→wsl бьётся).
- Preview PWA кэширует старый билд — для итеративной проверки `npm run preview -- --port <новый> --strictPort`.
- Деплой на прод (`sslip.io`) — только по явной команде владельца.

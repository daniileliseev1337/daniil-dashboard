# D «Роль заказчика» — Фаза 1 (ядро) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Заказчик, чей аккаунт привязан к записи в справочнике «Заказчики», входит и видит раздел
«Мои заказы» — свои проекты (стадия/сроки/договор/оплачено), без долей и внутренних заметок.

**Architecture:** Привязка `clients.user_id` → аккаунт (роль не взаимоисключающая). Доступ заказчика к
проектам — через SECURITY DEFINER RPC-проекцию `get_my_client_projects` (приватные колонки `notes`/доли НЕ
отдаются; заказчику НЕ даём RLS-доступ к строке `projects`). Привязка — через RPC `set_client_user` (гейт
владельца записи/админа). Раздел «Мои заказы» — новый таб, виден если `am_i_client()`.

**Tech Stack:** PostgreSQL (plpgsql, SECURITY DEFINER RPC), Supabase self-hosted, React (src/App.jsx монолит), Vite.

**Спек:** `docs/superpowers/specs/2026-06-22-client-role-design.md` (фаза 1 из §9).

## Global Constraints

- Все SECURITY DEFINER функции: `set search_path = public, pg_temp` (verbatim).
- **Роль НЕ вводим** — `profiles.role` остаётся `admin/user`; заказчик = обычный аккаунт + привязка `clients.user_id`.
- Заказчику НЕ давать RLS-select на `projects` (приватные колонки `notes`, доли через джойн) — только RPC-проекция.
- Проекция `get_my_client_projects` отдаёт ТОЛЬКО: `id, name, stage, start_date, deadline, contract_sum,
  paid_amount, executor`. БЕЗ `notes`, `owner_id`, `project_shares`.
- Привязка пишется ТОЛЬКО через `set_client_user` (гейт владельца записи/админа), НЕ через обычный update `clients`.
- **Среда:** БД-деплой через `docker exec -i supabase-db psql` (кириллица в пути → подавать через stdin/глоб,
  не в аргумент); git с Windows-стороны (`-c safe.directory=* -c core.fsyncMethod=writeout-only`, ретраи);
  миграции тестировать транзакционно `(echo BEGIN; cat миграция; cat assert; echo ROLLBACK) | psql` через
  `wsl bash -c` с глобом `/mnt/f/*/...`; эмуляция юзеров `set_config('request.jwt.claims', json_build_object(
  'sub',uid,'role','authenticated')::text, true)`; `\i` в контейнере НЕ работает (cat в pipe).
  **Применение к живой БД и web-деплой — только по явному слову «деплой».**

## File Structure

**Создаём:**
- `supabase/migrations/20260622_0007_client_role_phase1.sql` — `clients.user_id` + `is_project_client` +
  `am_i_client` + `get_my_client_projects` + `set_client_user`.
- `deploy/client-role/verify-phase1.sql` + `verify-phase1.sh` — транзакционный E2E.
- `deploy/client-role/apply-migrations.sh` — постоянное применение (фаза деплоя).

**Модифицируем `src/App.jsx`:**
- `clientDbToJs` (≈234) — `userId: row.user_id || null`.
- data-обёртки рядом с `fetchClients`/`searchApprovedUsers` (≈524–609): `fetchMyClientProjects`, `amIClient`, `setClientUser`.
- `ClientsPage` (≈6692) — кнопка «Привязать аккаунт» + autocomplete + показ привязки.
- App: state `clientProjects`/`hasClientRole`, загрузка в обоих `Promise.all` (≈8021, ≈8082), `TABS` (≈8205) +
  «Мои заказы», рендер `{tab==="myorders" && <ClientOrdersPage .../>}`.
- Новый компонент `ClientOrdersPage` (module-scope в App.jsx).

---

## Task 1: БД Фазы 1 (привязка + проекция + гейт)

**Files:**
- Create: `supabase/migrations/20260622_0007_client_role_phase1.sql`

**Interfaces:**
- Produces: `clients.user_id`; `is_project_client(uuid)→bool`; `am_i_client()→bool`;
  `get_my_client_projects()→table(id,name,stage,start_date,deadline,contract_sum,paid_amount,executor)`;
  `set_client_user(p_client_id uuid, p_user_id uuid)→void`.

- [ ] **Step 1: Написать миграцию**

```sql
-- 20260622_0007: D роль заказчика, Фаза 1 — привязка аккаунта + просмотр своих проектов.

-- 1. Привязка аккаунта к записи заказчика.
alter table public.clients
  add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists idx_clients_user_id on public.clients(user_id) where user_id is not null;

-- 2. Хелпер: вызывающий привязан как заказчик этого проекта (для RLS фазы 2 и проверок).
create or replace function public.is_project_client(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.projects p
    join public.clients c on c.id = p.client_id
    where p.id = p_project_id and c.user_id = auth.uid()
  );
$$;
grant execute on function public.is_project_client(uuid) to authenticated;

-- 3. Привязан ли вызывающий хотя бы к одной записи-заказчику (для таба «Мои заказы»).
create or replace function public.am_i_client()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.clients where user_id = auth.uid());
$$;
grant execute on function public.am_i_client() to authenticated;

-- 4. Проекты-заказы вызывающего — БЕЗОПАСНАЯ проекция (без notes, долей, owner_id).
create or replace function public.get_my_client_projects()
returns table (
  id uuid, name text, stage text, start_date date, deadline date,
  contract_sum numeric, paid_amount numeric, executor text
)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.name, p.stage, p.start_date, p.deadline,
         p.contract_sum, p.paid_amount, p.executor
  from public.projects p
  join public.clients c on c.id = p.client_id
  where c.user_id = auth.uid()
  order by p.created_at desc;
$$;
grant execute on function public.get_my_client_projects() to authenticated;

-- 5. Привязка аккаунта к записи (гейт: владелец записи или админ). p_user_id NULL = отвязать.
create or replace function public.set_client_user(p_client_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.clients
    where id = p_client_id and (owner_id = auth.uid() or public.is_admin())
  ) then
    raise exception 'not_client_owner';
  end if;
  update public.clients set user_id = p_user_id where id = p_client_id;
end; $$;
grant execute on function public.set_client_user(uuid, uuid) to authenticated;
```

- [ ] **Step 2: Транзакционный тест** — создать `deploy/client-role/verify-phase1.sql`:

```sql
-- E2E фаза 1. A=сотрудник-владелец записи, B=заказчик-аккаунт, C=посторонний.
select set_config('request.jwt.claims',
  json_build_object('sub',(select id::text from public.profiles where approved order by created_at limit 1),
                    'role','authenticated')::text, true);
insert into public.clients(owner_id,name)
  values ((select id from public.profiles where approved order by created_at limit 1),'CR_VERIFY_CLIENT');
insert into public.projects(owner_id,name,visibility,stage,contract_sum,paid_amount,notes,client_id)
  values ((select id from public.profiles where approved order by created_at limit 1),
          'CR_VERIFY_PROJ','private','В работе',200000,50000,'внутренняя заметка',
          (select id from public.clients where name='CR_VERIFY_CLIENT'));
select public.set_client_user(
  (select id from public.clients where name='CR_VERIFY_CLIENT'),
  (select id from public.profiles where approved order by created_at offset 1 limit 1));

do $$
declare a_id text; b_id text; v_amA bool; v_amB bool; v_cnt int; v_paid numeric; v_cprojs int;
begin
  select id::text into a_id from public.profiles where approved order by created_at limit 1;
  select id::text into b_id from public.profiles where approved order by created_at offset 1 limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub',b_id,'role','authenticated')::text, true);
  select public.am_i_client() into v_amB;
  select count(*), max(paid_amount) into v_cnt, v_paid from public.get_my_client_projects();

  perform set_config('request.jwt.claims', json_build_object('sub',a_id,'role','authenticated')::text, true);
  select public.am_i_client() into v_amA;

  perform set_config('request.jwt.claims', json_build_object('sub',gen_random_uuid()::text,'role','authenticated')::text, true);
  select count(*) into v_cprojs from public.get_my_client_projects();

  if not v_amB then raise exception 'FAIL: заказчик B am_i_client=false'; end if;
  if v_cnt < 1 then raise exception 'FAIL: B не видит свой заказ (cnt=%)', v_cnt; end if;
  if v_paid <> 50000 then raise exception 'FAIL: проекция paid_amount=% (ожид 50000)', v_paid; end if;
  if v_amA then raise exception 'FAIL: сотрудник A ошибочно am_i_client=true'; end if;
  if v_cprojs <> 0 then raise exception 'FAIL: посторонний видит % заказов', v_cprojs; end if;
  raise notice 'CLIENT_ROLE_OK amB=% cnt=% paid=% amA=% c=%', v_amB,v_cnt,v_paid,v_amA,v_cprojs;
end $$;

do $$
declare ok bool := false;
begin
  perform set_config('request.jwt.claims', json_build_object('sub',gen_random_uuid()::text,'role','authenticated')::text, true);
  begin
    perform public.set_client_user((select id from public.clients where name='CR_VERIFY_CLIENT'), null);
  exception when others then ok := true;  -- ожидаем not_client_owner
  end;
  if not ok then raise exception 'FAIL: посторонний смог set_client_user'; end if;
  raise notice 'SET_CLIENT_USER_GATE_OK';
end $$;
```

- [ ] **Step 3: Создать `verify-phase1.sh`** (миграция в транзакции + verify-phase1.sql + ROLLBACK):

```bash
#!/usr/bin/env bash
set -euo pipefail
MIG=$(ls -d /mnt/f/*/redesign-v2-fresh/supabase/migrations)
VDIR=$(ls -d /mnt/f/*/redesign-v2-fresh/deploy/client-role)
( echo "BEGIN;"
  cat "$MIG"/20260622_0007_client_role_phase1.sql; echo
  cat "$VDIR/verify-phase1.sql"
  echo "ROLLBACK;"
) | docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 2>&1 | tee /tmp/cr_verify.log
grep -q CLIENT_ROLE_OK /tmp/cr_verify.log && grep -q SET_CLIENT_USER_GATE_OK /tmp/cr_verify.log \
  && echo "VERIFY_PASS" || { echo "VERIFY_FAIL"; exit 1; }
```

- [ ] **Step 4: Запустить** `wsl -d Ubuntu -u root -- bash -c 'bash /mnt/f/*/redesign-v2-fresh/deploy/client-role/verify-phase1.sh'`
Expected: `CLIENT_ROLE_OK …`, `SET_CLIENT_USER_GATE_OK`, `VERIFY_PASS` (всё в ROLLBACK — прод не изменён).

- [ ] **Step 5: Создать `apply-migrations.sh`** (для фазы деплоя):

```bash
#!/usr/bin/env bash
set -euo pipefail
DIR=$(ls -d /mnt/f/*/redesign-v2-fresh/supabase/migrations)
for f in $(ls "$DIR"/20260622_0007_*.sql 2>/dev/null | sort); do
  echo "== applying $(basename "$f") =="
  docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f"
done
echo "MIGRATIONS_DONE"
```

- [ ] **Step 6: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* -c core.fsyncMethod=writeout-only add supabase/migrations/20260622_0007_client_role_phase1.sql deploy/client-role/
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* -c core.fsyncMethod=writeout-only commit -m "feat(client-role): БД фаза 1 (привязка + проекция заказов + гейт)"
```

---

## Task 2: Фронт data-слой

**Files:**
- Modify: `src/App.jsx` — `clientDbToJs` (≈234); новые обёртки рядом с `searchApprovedUsers` (≈609).

**Interfaces:**
- Consumes: RPC из Task 1.
- Produces: `client.userId` в JS-объекте заказчика; `fetchMyClientProjects(client)→[{id,name,stage,startDate,
  deadline,contractSum,paidAmount,executor}]`; `amIClient(client)→bool`; `setClientUser(client,clientId,userId)`.

- [ ] **Step 1: `clientDbToJs` — добавить userId**

В `clientDbToJs` (≈234) после строки `notes: row.notes || "",` добавить:

```js
    userId:      row.user_id || null,
```

- [ ] **Step 2: Добавить обёртки после `searchApprovedUsers` (≈609)**

```js
// D роль заказчика (фаза 1): проекты-заказы текущего пользователя (безопасная проекция).
async function fetchMyClientProjects(client) {
  const { data, error } = await client.rpc("get_my_client_projects");
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.id, name: r.name, stage: r.stage,
    startDate: r.start_date, deadline: r.deadline,
    contractSum: r.contract_sum, paidAmount: r.paid_amount, executor: r.executor,
  }));
}
async function amIClient(client) {
  const { data, error } = await client.rpc("am_i_client");
  if (error) return false;
  return !!data;
}
async function setClientUser(client, clientId, userId) {
  const { error } = await client.rpc("set_client_user", { p_client_id: clientId, p_user_id: userId });
  if (error) throw error;
}
```

- [ ] **Step 3: Сборка** `wsl -d Ubuntu -u root -- bash -c "cd /mnt/f/*/redesign-v2-fresh && npm run build 2>&1 | tail -5"` → зелёная.

- [ ] **Step 4: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* -c core.fsyncMethod=writeout-only add src/App.jsx
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* -c core.fsyncMethod=writeout-only commit -m "feat(client-role): data-слой (userId, fetchMyClientProjects, amIClient, setClientUser)"
```

---

## Task 3: UI привязки аккаунта на ClientsPage

**Files:**
- Modify: `src/App.jsx` — `ClientsPage` (≈6692): в модалке редактирования заказчика блок привязки.

**Interfaces:**
- Consumes: `setClientUser`, `searchApprovedUsers`, `client.userId` (Task 2 / существующее).
- Produces: UI «Привязать/отвязать аккаунт» в модалке заказчика.

- [ ] **Step 1: Найти рендер модалки заказчика**

Grep внутри `ClientsPage` (≈6692+) место модалки редактирования (`<Modal` + поля имя/телефон/категория) и имя
state редактируемой записи (предположительно `modal`). Опорный якорь — `saveClient` и поля `Field`.

- [ ] **Step 2: State и хендлеры привязки в ClientsPage**

После `const [saving, setSaving] = useState(false);` (≈6698):

```js
  // D роль заказчика: привязка аккаунта к записи
  const [linkFor, setLinkFor] = useState(null);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState([]);
  useEffect(() => {
    if (!client || !linkQuery.trim()) { setLinkResults([]); return; }
    const t = setTimeout(async () => {
      try { setLinkResults(await searchApprovedUsers(client, linkQuery)); } catch { setLinkResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [linkQuery]); // eslint-disable-line
  const doLink = async (cl, user) => {
    try {
      await setClientUser(client, cl.id, user ? user.id : null);
      setClients(prev => prev.map(x => x.id === cl.id ? { ...x, userId: user ? user.id : null } : x));
      showToast(user ? "Аккаунт привязан" : "Аккаунт отвязан");
      setLinkFor(null); setLinkQuery(""); setLinkResults([]);
    } catch (e) { showToast("Ошибка: " + (e.message || ""), "error"); }
  };
```

- [ ] **Step 3: Блок привязки в модалке заказчика**

В рендере модалки (после полей контактов, перед кнопками), только для существующей записи (`modal?.id`):

```jsx
{modal?.id && (
<Field label="Доступ заказчика (аккаунт)">
  {modal?.userId ? (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <span style={{ fontSize:13, color:"#6ee7a8" }}>✓ аккаунт привязан</span>
      <button type="button" className={BTN.ghost} onClick={() => doLink(modal, null)}>Отвязать</button>
    </div>
  ) : linkFor?.id === modal?.id ? (
    <div>
      <StyledInput value={linkQuery} onChange={e => setLinkQuery(e.target.value)}
        placeholder="Поиск пользователя по имени/email…" autoFocus />
      {linkResults.length > 0 && (
        <div style={{ marginTop:6, border:"1px solid #2a2a2e", borderRadius:8, overflow:"hidden" }}>
          {linkResults.map(u => (
            <button key={u.id} type="button" onClick={() => doLink(modal, u)} style={{
              display:"block", width:"100%", textAlign:"left", padding:"8px 12px",
              background:"transparent", border:"none", color:"#fafaf7", cursor:"pointer", fontSize:13 }}>
              {u.name || u.email} <span style={{ color:"#6b6b67" }}>· {u.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  ) : (
    <button type="button" className={BTN.ghost} onClick={() => { setLinkFor(modal); setLinkQuery(""); }}>
      Привязать аккаунт
    </button>
  )}
</Field>
)}
```

(`modal` — фактическое имя state редактируемой записи в ClientsPage; если иное — подставить.)

- [ ] **Step 4: Сборка** → зелёная (проверить, что `useEffect`/`StyledInput`/`BTN`/`Field`/`setClients` в scope ClientsPage).

- [ ] **Step 5: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* -c core.fsyncMethod=writeout-only add src/App.jsx
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* -c core.fsyncMethod=writeout-only commit -m "feat(client-role): UI привязки аккаунта к заказчику на ClientsPage"
```

---

## Task 4: Раздел «Мои заказы»

**Files:**
- Modify: `src/App.jsx` — App state + оба `Promise.all` (≈8021, ≈8082) + `TABS` (≈8205) + рендер таба; новый
  компонент `ClientOrdersPage` (module-scope).

**Interfaces:**
- Consumes: `fetchMyClientProjects`, `amIClient` (Task 2).
- Produces: таб `myorders` (виден при `hasClientRole`) + `ClientOrdersPage`.

- [ ] **Step 1: State в App**

Рядом с `const [clients, setClients] = useState(...)` добавить:

```js
  const [clientProjects, setClientProjects] = useState([]);
  const [hasClientRole, setHasClientRole]   = useState(false);
```

- [ ] **Step 2: Загрузка в ОБОИХ Promise.all (≈8021 и ≈8082)**

В каждый блок добавить два промиса в массив и присвоение. Для блока ≈8021:

```js
            const [p, t, cl, tk, sh, ms, pb, cp, icr] = await Promise.all([
              fetchProjects(supabase).catch(() => []),
              fetchTransactions(supabase).catch(() => []),
              fetchClients(supabase).catch(() => []),
              fetchTasks(supabase, { assignedTo: prof.id }).catch(() => []),
              fetchProjectShares(supabase).catch(() => ({})),
              getMyShares(supabase).catch(() => []),
              fetchMyPayments(supabase).catch(() => ({})),
              fetchMyClientProjects(supabase).catch(() => []),
              amIClient(supabase).catch(() => false),
            ]);
            setProjects(p); setTxs(t); setClients(cl); setTasks(tk);
            setSharesByProject(sh); setMyShares(ms); setPaymentsByProject(pb);
            setClientProjects(cp); setHasClientRole(icr);
```

(Для блока ≈8082 — те же два промиса добавить в массив и `setClientProjects(cp); setHasClientRole(icr);`
после существующих `set*`; сохранить прежние присвоения как есть.)

- [ ] **Step 3: TABS + условный таб (≈8205)**

В массив `TABS` после `{ id: "clients", … }` добавить:

```js
    ...(hasClientRole ? [{ id: "myorders", label: "Мои заказы", Icon: Package }] : []),
```

(`Package` уже импортирован из lucide-react.)

- [ ] **Step 4: Рендер таба**

Рядом с `{tab === "clients" && <ClientsPage … />}` (≈8477) добавить:

```jsx
            {tab === "myorders" && <ClientOrdersPage orders={clientProjects} />}
```

- [ ] **Step 5: Компонент `ClientOrdersPage` (module-scope)**

Добавить рядом с другими page-компонентами:

```jsx
function ClientOrdersPage({ orders }) {
  if (!orders?.length) return <Empty text="Заказов пока нет" />;
  const money = n => (Number(n) || 0).toLocaleString("ru-RU");
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {orders.map(o => (
        <div key={o.id} style={{ padding:"14px 16px", borderRadius:12, background:"#141414",
          border:"1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <span style={{ fontSize:15, fontWeight:600, color:"#fafaf7" }}>{o.name}</span>
            <span style={{ fontSize:12, padding:"3px 10px", borderRadius:20,
              background:"rgba(212,175,55,0.15)", color:"#d4af37" }}>{o.stage}</span>
          </div>
          <div style={{ display:"flex", gap:18, flexWrap:"wrap", marginTop:10, fontSize:13, color:"#a8a8a3" }}>
            <span>Договор: <b style={{ color:"#fafaf7" }}>{money(o.contractSum)} ₽</b></span>
            <span>Оплачено: <b style={{ color:"#6ee7a8" }}>{money(o.paidAmount)} ₽</b></span>
            <span>Остаток: <b style={{ color:"#f3d77b" }}>{money((o.contractSum||0)-(o.paidAmount||0))} ₽</b></span>
          </div>
          <div style={{ display:"flex", gap:18, flexWrap:"wrap", marginTop:6, fontSize:12, color:"#6b6b67" }}>
            {o.deadline && <span>Срок: {o.deadline}</span>}
            {o.executor && <span>Исполнитель: {o.executor}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Сборка** → зелёная.

- [ ] **Step 7: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* -c core.fsyncMethod=writeout-only add src/App.jsx
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* -c core.fsyncMethod=writeout-only commit -m "feat(client-role): раздел «Мои заказы» (таб + ClientOrdersPage + загрузка)"
```

---

## Фаза деплоя (ТОЛЬКО по слову «деплой»)

1. `apply-migrations.sh` → `MIGRATIONS_DONE`.
2. `verify-phase1.sh` на применённой БД → `VERIFY_PASS`.
3. `npm run build` → `deploy/nextcloud/deploy-web.sh`.
4. merge `feature/client-role` → `main` (ff), push origin (обход прокси).
5. Сброс PWA-кэша. **Живая проверка:** привязать реального заказчика на ClientsPage → заказчик входит →
   видит таб «Мои заказы» → видит свой проект (договор/оплачено), НЕ видит чужие/доли/заметки.

## Self-Review

**Spec coverage (фаза 1):** §4 `clients.user_id`+`is_project_client` → Task 1; §5 `get_my_client_projects`+
раздел «Мои заказы» → Task 1 (RPC) + Task 4 (UI); §7 онбординг привязки `set_client_user`+UI → Task 1 + Task 3;
критерий видимости таба `am_i_client` → Task 1 + Task 4. Фазы 2–3 — вне этого плана (по решению владельца).
**Placeholder scan:** код миграции/обёрток/компонента полный; UI-интеграция в ClientsPage — по якорю (имя state
`modal` уточнить на месте), novel-код приведён целиком. **Type consistency:** RPC-имена ↔ JS-обёртки совпадают
(`get_my_client_projects`↔`fetchMyClientProjects`, `am_i_client`↔`amIClient`, `set_client_user`↔`setClientUser`);
проекция-поля едины (Task 1 returns table ↔ Task 2 map ↔ Task 4 ClientOrdersPage).

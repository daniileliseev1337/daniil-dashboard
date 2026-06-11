# Редизайн вкладки «Задачи» — заход №1 (доска B + список + модалка + workflow) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Привести вкладку «Задачи» к теме сайта (доска-канбан стиля B — главный вид), добавить
workflow-кнопки статусов по ролям и переверстать список; фото-отчёты — заход №2, отдельный план.

**Architecture:** Всё в монолите `src/App.jsx` (паттерн проекта — компоненты локальные); чистая
логика срока/внимания — новый модуль `src/lib/taskUi.js` (TDD, vitest, аналог dashboardMetrics.js).
Одна мелкая миграция (`get_tasks` + `has_open_question`) и однострочный override в edge
`web-push-notify` (customText для task_status). Серверные правила статусов не меняются.

**Tech Stack:** React (inline-стили + точечный Tailwind в className), Supabase JS (RPC),
vitest, PostgreSQL (plpgsql).

**Спек:** `docs/superpowers/specs/2026-06-11-tasksview-redesign-design.md`

**⚠ Грабли среды (контроллеру, НЕ субагентам):** git ТОЛЬКО Windows-сторона
(`git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* -c core.fsyncMethod=writeout-only`,
ретраи 3–10 раз); Edit на F: может вернуть EIO — правка применяется, проверять Read; vitest
гонять из корня репо. Миграцию к живой БД и деплой edge НЕ применять без слова «деплой» —
в этом плане только файлы.

---

## Карта файлов

- **Create:** `src/lib/taskUi.js` — чистые функции светофора срока и сводки «требуют внимания».
- **Create:** `src/lib/taskUi.test.js` — vitest.
- **Create:** `supabase/migrations/20260611_0003_get_tasks_open_question.sql` — `has_open_question`.
- **Modify:** `src/App.jsx`:
  - `TASK_STATUS_BADGE` (~197) → `TASK_STATUS_META` (цвета темы);
  - `taskDbToJs` (~172) — поле `hasOpenQuestion`;
  - `notifyTask` (~717) — опциональный `extra` (customText);
  - `TaskModal` (~3672) — рестайл + workflow-кнопки + убрать селект статуса;
  - `TasksBoard` (~4065) — переписать (стиль B, правила DnD, «+ задача»);
  - `TasksView` (~4104) — шапка, фильтры, сортировка, список строками-карточками;
  - новые локальные компоненты: `TaskCardBoard`, `TaskRowList`, `TaskWorkflowButton` (рядом с TasksView).
- **Modify:** `deploy/web-push/functions/web-push-notify/index.ts` — customText override в ветке task_status.

Все новые компоненты — внутри App.jsx (паттерн проекта: под-виджеты дашборда тоже локальные).
`UserAvatar` (App.jsx ~4915) переиспользуется как есть.

---

### Task 1: `src/lib/taskUi.js` — чистая логика (TDD)

**Files:**
- Create: `src/lib/taskUi.js`
- Test: `src/lib/taskUi.test.js`

- [ ] **Step 1: Написать падающий тест**

`src/lib/taskUi.test.js`:

```js
import { describe, it, expect } from "vitest";
import { dueState, dueSuffix, tasksAttention, PRIORITY_ORDER, DUE_COLORS } from "./taskUi.js";

const T = "2026-06-11"; // «сегодня» всегда передаётся снаружи — функции чистые

describe("dueState", () => {
  it("нет срока -> none", () => expect(dueState(null, T)).toEqual({ level: "none", days: null }));
  it("пустая строка -> none", () => expect(dueState("", T)).toEqual({ level: "none", days: null }));
  it("кривая дата -> none", () => expect(dueState("oops", T).level).toBe("none"));
  it("вчера -> overdue, days=-1", () => expect(dueState("2026-06-10", T)).toEqual({ level: "overdue", days: -1 }));
  it("сегодня -> soon, days=0", () => expect(dueState("2026-06-11", T)).toEqual({ level: "soon", days: 0 }));
  it("через 3 дня -> soon (порог включительно)", () => expect(dueState("2026-06-14", T).level).toBe("soon"));
  it("через 4 дня -> ok", () => expect(dueState("2026-06-15", T).level).toBe("ok"));
  it("кастомный порог", () => expect(dueState("2026-06-15", T, 7).level).toBe("soon"));
});

describe("dueSuffix", () => {
  it("null -> ''", () => expect(dueSuffix(null)).toBe(""));
  it("0 -> сегодня", () => expect(dueSuffix(0)).toBe("сегодня"));
  it("2 -> через 2 дн", () => expect(dueSuffix(2)).toBe("через 2 дн"));
  it("-2 -> −2 дн (компактно, как в мокапе B)", () => expect(dueSuffix(-2)).toBe("−2 дн"));
});

describe("PRIORITY_ORDER / DUE_COLORS", () => {
  it("Высокий раньше Обычного раньше Низкого", () => {
    expect(PRIORITY_ORDER["Высокий"]).toBeLessThan(PRIORITY_ORDER["Обычный"]);
    expect(PRIORITY_ORDER["Обычный"]).toBeLessThan(PRIORITY_ORDER["Низкий"]);
  });
  it("все уровни имеют цвет", () => {
    for (const k of ["none", "ok", "soon", "overdue"]) expect(DUE_COLORS[k]).toMatch(/^#/);
  });
});

describe("tasksAttention", () => {
  const mk = (o) => ({ status: "В работе", dueDate: null, hasOpenQuestion: false, ...o });
  it("просроченная активная считается", () => expect(tasksAttention([mk({ dueDate: "2026-06-01" })], T)).toBe(1));
  it("открытый вопрос считается", () => expect(tasksAttention([mk({ hasOpenQuestion: true })], T)).toBe(1));
  it("Готово/Отменена не считаются", () =>
    expect(tasksAttention([mk({ status: "Готово", dueDate: "2026-06-01" }), mk({ status: "Отменена", hasOpenQuestion: true })], T)).toBe(0));
  it("две причины в одной задаче = 1", () => expect(tasksAttention([mk({ dueDate: "2026-06-01", hasOpenQuestion: true })], T)).toBe(1));
  it("пустой список = 0", () => expect(tasksAttention([], T)).toBe(0));
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run (из корня репо): `npm run test -- run src/lib/taskUi.test.js`
Expected: FAIL — `Cannot find module './taskUi.js'`.

- [ ] **Step 3: Минимальная реализация**

`src/lib/taskUi.js`:

```js
// Чистая логика вкладки «Задачи» (без React/Supabase) — светофор срока и сводка.
// «Сегодня» всегда передаётся параметром (тестируемость, как в dashboardMetrics.js).

export const DUE_SOON_DAYS = 3; // порог «жёлтого» (≤ N дней до срока)

export const DUE_COLORS = {
  none: "#62646b",     // срока нет
  ok: "#6ee7a8",       // времени достаточно
  soon: "#e8c860",     // ≤ DUE_SOON_DAYS дней
  overdue: "#f8a3a3",  // просрочено
};

export const PRIORITY_ORDER = { "Высокий": 0, "Обычный": 1, "Низкий": 2 };

// dueDate/today — строки 'YYYY-MM-DD'. Возврат: { level, days } (days < 0 = просрочено).
export function dueState(dueDate, today, soonDays = DUE_SOON_DAYS) {
  if (!dueDate) return { level: "none", days: null };
  const d = Date.parse(dueDate + "T00:00:00Z");
  const t = Date.parse(today + "T00:00:00Z");
  if (Number.isNaN(d) || Number.isNaN(t)) return { level: "none", days: null };
  const days = Math.round((d - t) / 86400000);
  if (days < 0) return { level: "overdue", days };
  if (days <= soonDays) return { level: "soon", days };
  return { level: "ok", days };
}

// Человеческий хвост к дате: 'сегодня' / 'через 2 дн' / '−2 дн' (минус — U+2212, как в мокапе).
export function dueSuffix(days) {
  if (days == null) return "";
  if (days === 0) return "сегодня";
  if (days < 0) return `−${-days} дн`;
  return `через ${days} дн`;
}

// Сводка шапки: активные задачи, просроченные ИЛИ с открытым вопросом.
export function tasksAttention(tasks, today) {
  return tasks.filter(t =>
    t.status !== "Готово" && t.status !== "Отменена" &&
    (dueState(t.dueDate, today).level === "overdue" || !!t.hasOpenQuestion)
  ).length;
}
```

- [ ] **Step 4: Прогнать — зелёный**

Run: `npm run test -- run src/lib/taskUi.test.js`
Expected: PASS (все тесты). Затем полный прогон `npm run test -- run` — существующие 76+ тестов целы.

- [ ] **Step 5: Commit**

```bash
git add src/lib/taskUi.js src/lib/taskUi.test.js
git commit -m "feat(tasks): taskUi.js — светофор срока и сводка внимания (TDD)"
```

---

### Task 2: миграция `get_tasks` + `has_open_question` + адаптер фронта

**Files:**
- Create: `supabase/migrations/20260611_0003_get_tasks_open_question.sql`
- Modify: `src/App.jsx` — `taskDbToJs` (~172), realtime-merge в `TasksView` (~4164)

- [ ] **Step 1: Файл миграции**

```sql
-- has_open_question для карточек доски (плашка «есть вопрос»).
-- У RETURNS TABLE меняется состав колонок -> CREATE OR REPLACE не сработает, нужен DROP.
-- Индекс idx_task_comments_open_q (task_id, is_question, resolved) уже существует (20260602_0003).
DROP FUNCTION IF EXISTS public.get_tasks(uuid, text, uuid);

CREATE FUNCTION public.get_tasks(
  p_project_id  uuid DEFAULT NULL,
  p_status      text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, project_id uuid, project_name text,
  author_id uuid, author_name text,
  assigned_to uuid, assignee_name text,
  title text, description text, status text, priority text,
  due_date date, sort_order int,
  created_at timestamptz, updated_at timestamptz,
  has_open_question boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp   -- I-2 hardening: новые SECURITY DEFINER — всегда с search_path
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.project_id, pr.name,
         t.author_id, COALESCE(pa.name, pa.email, 'Пользователь'),
         t.assigned_to, COALESCE(pas.name, pas.email),
         t.title, t.description, t.status, t.priority,
         t.due_date, t.sort_order, t.created_at, t.updated_at,
         EXISTS (SELECT 1 FROM public.task_comments c
                 WHERE c.task_id = t.id AND c.is_question AND NOT c.resolved)
  FROM public.project_tasks t
  LEFT JOIN public.projects pr  ON pr.id  = t.project_id
  LEFT JOIN public.profiles pa  ON pa.id  = t.author_id
  LEFT JOIN public.profiles pas ON pas.id = t.assigned_to
  WHERE
    (
      (t.project_id IS NOT NULL AND public.can_access_project_comments(t.project_id))
      OR (t.project_id IS NULL AND (t.author_id = auth.uid() OR t.assigned_to = auth.uid() OR public.is_admin()))
    )
    AND (p_project_id  IS NULL OR t.project_id  = p_project_id)
    AND (p_status      IS NULL OR t.status      = p_status)
    AND (p_assigned_to IS NULL OR t.assigned_to = p_assigned_to)
  ORDER BY
    CASE t.status WHEN 'Новая' THEN 1 WHEN 'В работе' THEN 2
                  WHEN 'На проверке' THEN 3 WHEN 'Готово' THEN 4 ELSE 5 END,
    t.sort_order, t.created_at DESC;
END $$;

GRANT EXECUTE ON FUNCTION public.get_tasks(uuid, text, uuid) TO authenticated;
```

⚠ К живой БД НЕ применять в этой задаче (только файл; применение — на деплое по слову «деплой»).
До применения миграции фронт получает `has_open_question = undefined` → `false` — плашка просто
не показывается, ничего не ломается.

- [ ] **Step 2: `taskDbToJs` — новое поле**

В `src/App.jsx` (~172), в `return` функции `taskDbToJs` после строки
`dueDate: r.due_date, sortOrder: r.sort_order ?? 0,` добавить:

```js
    hasOpenQuestion: r.has_open_question ?? false,
```

- [ ] **Step 3: realtime-merge — сохранить флаг**

В `TasksView` (~4164) realtime-payload не несёт ни `*_name`, ни `has_open_question`.
В выражении `merged` добавить сохранение флага из текущего состояния:

```js
          const merged = existing
            ? { ...mapped, projectName: mapped.projectName ?? existing.projectName, assigneeName: mapped.assigneeName ?? existing.assigneeName, authorName: mapped.authorName ?? existing.authorName, hasOpenQuestion: existing.hasOpenQuestion }
            : mapped;
```

(Флаг может протухнуть до ближайшего reload — приемлемо, refetch идёт при каждом
открытии/закрытии модалки и смене фильтров.)

- [ ] **Step 4: Проверка сборки**

Run: `npm run build`
Expected: зелёная сборка.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260611_0003_get_tasks_open_question.sql src/App.jsx
git commit -m "feat(tasks): get_tasks +has_open_question (миграция-файл) + адаптер фронта"
```

---

### Task 3: `TASK_STATUS_META`, `notifyTask(extra)`, шапка/фильтры/сортировка TasksView

**Files:**
- Modify: `src/App.jsx` — константы (~195-200), `notifyTask` (~717), `TasksView` (~4104-4228)

- [ ] **Step 1: Константы статусов в цветах темы**

Заменить блок `TASK_STATUS_BADGE` (~197-200) на:

```js
// Цвета статусов задач — согласованы со STAGE_META сайта (зол./бирюза/зел.).
const TASK_STATUS_META = {
  "Новая":       { color: "#93c5fd" },
  "В работе":    { color: "#d4af37" },
  "На проверке": { color: "#2dd4bf" },
  "Готово":      { color: "#6ee7a8" },
  "Отменена":    { color: "#62646b" },
};
const TASK_PRIORITY_META = {
  "Высокий": { bg: "#f8a3a31f", color: "#f8a3a3", label: "🔴 Высокий" },
  "Обычный": { bg: "#d4af371f", color: "#e8c860", label: "Обычный" },
  "Низкий":  { bg: "rgba(255,255,255,0.06)", color: "#9b9ca4", label: "Низкий" },
};
```

`TASK_STATUS_BADGE` удалить; единственные потребители (`badge` в TasksView/TasksBoard)
переписываются в Task 4-5 — на момент коммита Task 3 строку `const badge = ...` (~4179)
и проп `badge={badge}` (~4205) удалить, в `<table>`-ветке временно заменить
`badge(t.status)` на инлайн `style={{ background: (TASK_STATUS_META[t.status]||{}).color }}`
(таблица всё равно умирает в Task 5).

- [ ] **Step 2: `notifyTask` — опциональный extra**

Заменить (~717-721) на:

```js
async function notifyTask(client, type, taskId, initiatorId, extra = {}) {
  try {
    await client.functions.invoke("web-push-notify", { body: { type, taskId, initiatorId, ...extra } });
  } catch (e) { console.warn("task notify failed:", e); }
}
```

(Все существующие вызовы совместимы — extra по умолчанию пуст.)

- [ ] **Step 3: Шапка, фильтры и состояние сортировки TasksView**

В `TasksView`: добавить состояния после `const [onlyMine, setOnlyMine] = useState(false);`:

```js
  const [fPriority, setFPriority] = useState("");
  const [sortBy, setSortBy] = useState("due"); // 'due' | 'priority' | 'created'
```

`reload`: статус-фильтр участвует только в списке (на доске колонки сами разделяют):

```js
      const list = await fetchTasks(client, {
        projectId: fProject || null,
        status: view === "list" ? (fStatus || null) : null,
        assignedTo: onlyMine ? profile.id : null,
      });
```

и в deps `useCallback` добавить `view`.

Заменить JSX от `<div className="flex items-center justify-between mb-4">` до конца блока
фильтров (`</div>` после чекбокса «только мои», ~4183-4203) на:

```jsx
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em" }}>Задачи</h2>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "#62646b" }}>
            {activeCount} активных{attentionCount > 0 ? ` · ${attentionCount} требуют внимания` : ""}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "inline-flex", background: "#141414", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 3, gap: 2 }}>
            {[["board", "▦ Доска"], ["list", "≣ Список"]].map(([v, l]) => (
              <button key={v} onClick={() => setView(v)} style={{
                border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "6px 14px", borderRadius: 7,
                background: view === v ? "#d4af37" : "transparent", color: view === v ? "#0a0a0a" : "#9b9ca4",
              }}>{l}</button>
            ))}
          </div>
          <button onClick={() => setEditing({ status: "Новая", priority: "Обычный" })} className={BTN.primary}>+ Новая задача</button>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <StyledSelect value={fProject} onChange={e => setFProject(e.target.value)} style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}>
          <option value="">Все проекты</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </StyledSelect>
        {view === "list" && (
          <StyledSelect value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}>
            <option value="">Все статусы</option>
            {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </StyledSelect>
        )}
        <StyledSelect value={fPriority} onChange={e => setFPriority(e.target.value)} style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}>
          <option value="">Любой приоритет</option>
          {TASK_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </StyledSelect>
        {view === "list" && (
          <StyledSelect value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}>
            <option value="due">Сортировка: по сроку</option>
            <option value="priority">Сортировка: по приоритету</option>
            <option value="created">Сортировка: по дате постановки</option>
          </StyledSelect>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9b9ca4" }}>
          <input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} style={{ accentColor: "#d4af37" }} /> только мои
        </label>
      </div>
```

Перед `return` добавить вычисления (импорт `tasksAttention` из `./lib/taskUi.js` —
в общий блок импортов App.jsx; `todayStr` уже есть):

```js
  const today = todayStr();
  const shown = tasks.filter(t => !fPriority || t.priority === fPriority);
  const activeCount = shown.filter(t => t.status !== "Готово" && t.status !== "Отменена").length;
  const attentionCount = tasksAttention(shown, today);
```

(Доска и список в Task 4-5 рендерят `shown`, а не `tasks`.)

- [ ] **Step 4: Сборка**

Run: `npm run build` → зелёная. (Таблица-список пока старая — это ок, умрёт в Task 5.)

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(tasks): шапка/фильтры/сортировка TasksView в теме сайта + TASK_STATUS_META + notifyTask extra"
```

---

### Task 4: `TaskCardBoard` + переписать `TasksBoard` (стиль B)

**Files:**
- Modify: `src/App.jsx` — заменить `TasksBoard` (~4065-4102), новый компонент перед ним

- [ ] **Step 1: Компонент карточки**

Вставить перед `TasksBoard`:

```jsx
// Карточка задачи на доске — стиль B (мокап 2026-06-11). UserAvatar — общий компонент сайта.
function TaskCardBoard({ t, onOpen, draggable, onDragStart }) {
  const today = todayStr();
  const due = dueState(t.dueDate, today);
  const pm = TASK_PRIORITY_META[t.priority] || TASK_PRIORITY_META["Обычный"];
  const done = t.status === "Готово";
  return (
    <div draggable={draggable} onDragStart={onDragStart} onClick={() => onOpen(t)}
      style={{
        background: "#141414", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 13,
        padding: 14, marginBottom: 11, cursor: "pointer", opacity: done ? 0.72 : 1,
      }}>
      <div style={{ marginBottom: 9 }}>
        <span style={{
          fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em",
          padding: "3px 9px", borderRadius: 20, background: pm.bg, color: pm.color,
        }}>{pm.label}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35, color: "#f5f5f2" }}>{t.title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12, color: "#9b9ca4" }}>
        {t.projectName ? <>📁 {t.projectName}</> : <>👤 Личная задача</>}
      </div>
      {t.hasOpenQuestion && (
        <div style={{
          marginTop: 10, fontSize: 11, color: "#e8c860", background: "#e8c8601a",
          border: "1px solid #e8c86033", borderRadius: 7, padding: "5px 9px",
        }}>💬 Есть вопрос</div>
      )}
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "12px 0" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <UserAvatar name={t.assigneeName} size={26} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "#cfd0d4", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {t.assigneeName || "— не назначен"}
          </div>
          <div style={{ fontSize: 10, color: "#55565c" }}>
            автор: {t.authorName || "—"} · {fmtD((t.createdAt || "").slice(0, 10))}
          </div>
        </div>
        <span style={{
          marginLeft: "auto", fontSize: 11.5, whiteSpace: "nowrap",
          color: DUE_COLORS[due.level], fontWeight: due.level === "overdue" ? 700 : 400,
        }}>
          {t.dueDate ? `📅 ${fmtD(t.dueDate)}${due.days !== null && !done ? ` · ${dueSuffix(due.days)}` : ""}` : "—"}
        </span>
      </div>
    </div>
  );
}
```

Импорт в общий блок импортов App.jsx: `import { dueState, dueSuffix, DUE_COLORS, PRIORITY_ORDER, tasksAttention } from "./lib/taskUi.js";`
(один импорт на все задачи плана — добавить недостающие имена, если Task 3 уже добавил часть).

- [ ] **Step 2: Переписать `TasksBoard`**

Заменить целиком (~4065-4102; проп `badge` убран):

```jsx
function TasksBoard({ tasks, onOpen, onReload, client, profile, showToast }) {
  // колонки доски — без «Отменена» (намеренно; отменённые видны фильтром в списке)
  const cols = ["Новая", "В работе", "На проверке", "Готово"];
  const [dragId, setDragId] = useState(null);
  const move = async (taskId, toStatus) => {
    const t = tasks.find(x => x.id === taskId);
    if (!t || t.status === toStatus) return;
    // клиентское правило workflow: в «Готово» — только автор (или админ); сервер тоже проверит
    if (toStatus === "Готово" && t.authorId !== profile.id && profile.role !== "admin") {
      showToast("В «Готово» переводит только автор задачи", "error"); return;
    }
    try {
      await setTaskStatus(client, taskId, toStatus);
      await notifyTask(client, "task_status", taskId, profile.id);
      onReload();
    } catch (e) {
      const m = e.message || "";
      if (m.includes("only_author_can_complete")) showToast("В «Готово» переводит только автор задачи", "error");
      else showToast("Ошибка смены статуса: " + m, "error");
      onReload();
    }
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(230px, 1fr))", gap: 14, alignItems: "start", overflowX: "auto" }}>
      {cols.map(col => {
        const meta = TASK_STATUS_META[col];
        const colTasks = tasks.filter(t => t.status === col);
        return (
          <div key={col} onDragOver={e => e.preventDefault()}
               onDrop={() => { if (dragId) move(dragId, col); setDragId(null); }}
               style={{ border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", background: meta.color + "14" }}>
              <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: meta.color }}>{col}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, borderRadius: 20, padding: "1px 9px", background: "rgba(0,0,0,0.3)", color: meta.color }}>{colTasks.length}</span>
            </div>
            <div style={{ padding: 12, background: "rgba(255,255,255,0.012)" }}>
              {colTasks.map(t => (
                <TaskCardBoard key={t.id} t={t} onOpen={onOpen}
                  draggable onDragStart={() => setDragId(t.id)} />
              ))}
              <button onClick={() => onOpen({ status: col, priority: "Обычный" })} style={{
                width: "100%", textAlign: "center", background: "transparent",
                border: "1px dashed rgba(255,255,255,0.10)", color: "#62646b",
                borderRadius: 9, padding: 9, fontSize: 12, cursor: "pointer",
              }}>+ задача</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

В JSX TasksView вызов доски станет:
`<TasksBoard tasks={shown} onOpen={setEditing} onReload={reload} client={client} profile={profile} showToast={showToast} />`

- [ ] **Step 3: Сборка**

Run: `npm run build` → зелёная.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(tasks): доска в стиле B — TaskCardBoard + правила DnD + «+ задача» в колонках"
```

---

### Task 5: `TaskRowList` — список строками-карточками + сортировка

**Files:**
- Modify: `src/App.jsx` — заменить `<table>`-ветку в TasksView (~4206-4222), компонент перед TasksView

- [ ] **Step 1: Компонент строки**

Вставить перед `TasksView`:

```jsx
// Строка списка задач — те же данные, что на карточке доски, в одну плотную строку.
function TaskRowList({ t, onOpen }) {
  const today = todayStr();
  const due = dueState(t.dueDate, today);
  const sm = TASK_STATUS_META[t.status] || { color: "#62646b" };
  const pm = TASK_PRIORITY_META[t.priority] || TASK_PRIORITY_META["Обычный"];
  return (
    <div onClick={() => onOpen(t)} style={{
      display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      background: "#141414", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12,
      padding: "10px 14px", marginBottom: 8, cursor: "pointer",
    }}>
      <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: sm.color + "1f", color: sm.color, whiteSpace: "nowrap" }}>{t.status}</span>
      <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: pm.bg, color: pm.color, whiteSpace: "nowrap" }}>{pm.label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: "#f5f5f2", flex: 1, minWidth: 160 }}>{t.title}</span>
      <span style={{ fontSize: 12, color: "#9b9ca4", whiteSpace: "nowrap" }}>{t.projectName ? `📁 ${t.projectName}` : "👤 личная"}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#cfd0d4", whiteSpace: "nowrap" }}>
        <UserAvatar name={t.assigneeName} size={20} />{t.assigneeName || "—"}
      </span>
      <span style={{ fontSize: 11, color: "#55565c", whiteSpace: "nowrap" }}>от {fmtD((t.createdAt || "").slice(0, 10))}</span>
      <span style={{ fontSize: 11.5, color: DUE_COLORS[due.level], fontWeight: due.level === "overdue" ? 700 : 400, whiteSpace: "nowrap", minWidth: 90, textAlign: "right" }}>
        {t.dueDate ? `📅 ${fmtD(t.dueDate)}${due.days !== null ? ` · ${dueSuffix(due.days)}` : ""}` : "—"}
      </span>
      {t.hasOpenQuestion && <span title="есть открытый вопрос" style={{ color: "#e8c860", fontSize: 13 }}>💬</span>}
    </div>
  );
}
```

- [ ] **Step 2: Сортировка + рендер списка**

В TasksView перед `return` (после вычисления `shown` из Task 3):

```js
  const listShown = (() => {
    let arr = shown;
    if (view === "list" && !fStatus) arr = arr.filter(t => t.status !== "Отменена");
    const today2 = today;
    return arr.slice().sort((a, b) => {
      if (sortBy === "priority") return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
      if (sortBy === "created") return (b.createdAt || "").localeCompare(a.createdAt || "");
      // 'due': просроченные сверху, потом ближайшие; без срока — вниз
      const da = dueState(a.dueDate, today2).days, db = dueState(b.dueDate, today2).days;
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
  })();
```

Заменить `<table>`-ветку (от `<div className="overflow-x-auto"...` до закрывающего `</div>`
включительно, ~4206-4222) на:

```jsx
       <div>
         {listShown.map(t => <TaskRowList key={t.id} t={t} onOpen={setEditing} />)}
         {!listShown.length && <div style={{ color: "#62646b", padding: "24px 0", textAlign: "center" }}>Задач нет</div>}
       </div>}
```

- [ ] **Step 3: Сборка + полный vitest**

Run: `npm run build` и `npm run test -- run`
Expected: оба зелёные.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(tasks): список строками-карточками + сортировка (срок/приоритет/дата)"
```

---

### Task 6: `TaskWorkflowButton` + рестайл TaskModal + убрать селект статуса

**Files:**
- Modify: `src/App.jsx` — компонент перед TaskModal; правки внутри TaskModal (~3672-4063)

- [ ] **Step 1: Компонент workflow-кнопок**

Вставить перед `TaskModal`:

```jsx
// Контекстные кнопки workflow статусов (по таблице ролей спека).
// «Есть замечания» — обязательный текст -> комментарий в обсуждение + возврат «В работе».
function TaskWorkflowButton({ task, client, profile, showToast, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [revising, setRevising] = useState(false);
  const [revText, setRevText] = useState("");
  if (!task.id) return null;
  const isAuthor = task.authorId === profile.id || profile.role === "admin";
  const isAssignee = task.assignedTo === profile.id || profile.role === "admin";
  const selfTask = task.authorId === task.assignedTo;

  const go = async (toStatus, extra) => {
    setBusy(true);
    try {
      await setTaskStatus(client, task.id, toStatus);
      await notifyTask(client, "task_status", task.id, profile.id, extra);
      onChanged();
    } catch (e) {
      const m = e.message || "";
      if (m.includes("only_author_can_complete")) showToast("В «Готово» переводит только автор задачи", "error");
      else showToast("Ошибка: " + m, "error");
    } finally { setBusy(false); }
  };

  const sendRevision = async () => {
    if (!revText.trim()) { showToast("Опишите замечания — поле обязательно", "error"); return; }
    setBusy(true);
    try {
      await insertTaskComment(client, task.id, "📋 Замечания по проверке:\n" + revText.trim(), false);
      await setTaskStatus(client, task.id, "В работе");
      await notifyTask(client, "task_status", task.id, profile.id,
        { customText: `↩ Проверено, есть замечания по задаче «${task.title}» — смотри ТЗ и обсуждение` });
      setRevising(false); setRevText("");
      onChanged();
    } catch (e) { showToast("Ошибка: " + (e.message || ""), "error"); }
    finally { setBusy(false); }
  };

  const big = (label, onClick, color = "#d4af37", text = "#0a0a0a") => (
    <button onClick={onClick} disabled={busy} style={{
      flex: 1, padding: "12px 16px", borderRadius: 12, border: "none", cursor: "pointer",
      background: color, color: text, fontSize: 14, fontWeight: 700,
    }}>{busy ? "…" : label}</button>
  );

  if (revising) return (
    <div style={{ marginTop: 12 }}>
      <Label>Замечания по проверке (обязательно)</Label>
      <StyledTextarea rows={3} value={revText} onChange={e => setRevText(e.target.value)}
        placeholder="Что не так и что доработать…" />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {big("Отправить замечания — вернуть в работу", sendRevision, "#e8c860")}
        <button onClick={() => { setRevising(false); setRevText(""); }} className={BTN.ghost}>Отмена</button>
      </div>
    </div>
  );

  let buttons = null;
  if (task.status === "Новая" && isAssignee) {
    buttons = big("▶ Взять в работу", () => go("В работе"));
  } else if (task.status === "В работе" && isAssignee) {
    buttons = (
      <>
        {big("📤 Отправить на проверку", () => go("На проверке"))}
        {selfTask && isAuthor && big("✓ Завершить", () => go("Готово"), "#6ee7a8")}
      </>
    );
  } else if (task.status === "На проверке" && isAuthor) {
    buttons = (
      <>
        {big("✓ Принять — завершено", () => go("Готово"), "#6ee7a8")}
        {big("↩ Есть замечания", () => setRevising(true), "#e8c860")}
      </>
    );
  }
  if (!buttons) return null;
  return <div style={{ display: "flex", gap: 8, marginTop: 12 }}>{buttons}</div>;
}
```

- [ ] **Step 2: Интеграция в TaskModal**

a) **Убрать селект статуса** (~3989-3991: `<select ... form.status ...>`) — удалить.
`form.status` остаётся в state ТОЛЬКО как значение для создания (createTask) — из формы
редактирования статус больше не сохраняется: в `save()` удалить блок
`const statusChanged = ...`, ветку `if (statusChanged) { ... setTaskStatus ... }` и
`if (statusChanged) await notifyTask(...)` (строки ~3833, 3843-3849, 3851).

b) **Убрать старую кнопку** «Принять в работу» (~4055) и функцию `accept` (~3864-3870) —
их заменяет TaskWorkflowButton.

c) **Шапка модалки**: заменить `<h3 ...>{isNew ? "Новая задача" : "Задача"}</h3>` (~3875) на:

```jsx
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{isNew ? "Новая задача" : form.title || "Задача"}</h3>
            {!isNew && (() => { const sm = TASK_STATUS_META[task.status] || { color: "#62646b" }; return (
              <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: sm.color + "1f", color: sm.color }}>{task.status}</span>
            ); })()}
            {!isNew && (() => { const pm = TASK_PRIORITY_META[task.priority] || TASK_PRIORITY_META["Обычный"]; return (
              <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: pm.bg, color: pm.color }}>{pm.label}</span>
            ); })()}
          </div>
          {!isNew && (() => { const due = dueState(task.dueDate, todayStr()); return (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#9b9ca4" }}>
              {task.projectName ? `📁 ${task.projectName}` : "👤 личная"} · исполнитель: {task.assigneeName || "—"} · автор: {task.authorName || "—"} · поставлена {fmtD((task.createdAt || "").slice(0, 10))}
              {task.dueDate && <> · срок <span style={{ color: DUE_COLORS[due.level], fontWeight: 600 }}>{fmtD(task.dueDate)} ({dueSuffix(due.days)})</span></>}
            </p>
          ); })()}
        </div>
```

d) **Workflow-кнопка** — сразу после шапки (до поля «Заголовок»):

```jsx
        {!isNew && <TaskWorkflowButton task={task} client={client} profile={profile}
                     showToast={showToast} onChanged={onSaved} />}
```

e) **«Отменить задачу»** — в нижний ряд кнопок (~4051-4058), рядом с «Удалить»
(автор или админ, для незакрытых):

```jsx
            {!isNew && (task.authorId === profile.id || profile.role === "admin") &&
             task.status !== "Готово" && task.status !== "Отменена" && (
              <button onClick={async () => {
                try { await setTaskStatus(client, task.id, "Отменена");
                      await notifyTask(client, "task_status", task.id, profile.id); onSaved(); }
                catch (e) { showToast("Ошибка: " + (e.message || ""), "error"); }
              }} className={BTN.ghost}>Отменить задачу</button>
            )}
```

- [ ] **Step 3: Рестайл оболочки модалки**

Замены (точечные, структуру 6.4b не трогать):

| Было (className) | Стало (style) |
|---|---|
| внешний `className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"` | `style={{ position:"fixed", inset:0, zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16, background:"rgba(2,8,23,0.92)", backdropFilter:"blur(6px)" }}` |
| панель `className="bg-zinc-900 rounded-lg p-5 w-[min(560px,92vw)]"` | `style={{ background:"#141414", border:"1px solid rgba(255,255,255,0.06)", borderRadius:20, padding:24, width:"min(620px,92vw)", maxHeight:"90vh", overflowY:"auto", boxShadow:"0 25px 60px rgba(0,0,0,.6)" }}` |
| `input className="w-full bg-zinc-800 rounded px-3 py-2 mb-2"` (заголовок) | `<StyledInput style={{ marginBottom: 8 }} …>` |
| `textarea className="w-full bg-zinc-800 rounded px-3 py-2 mb-2"` (описание isNew) | `<StyledTextarea rows={4} style={{ marginBottom: 8 }} …>` |
| селекты проекта/приоритета `className="bg-zinc-800 rounded px-2 py-2"` | `<StyledSelect …>` |
| `input type="date" className="bg-zinc-800 rounded px-2 py-2"` | `<StyledInput type="date" …>` |
| кнопки «Отмена»/«Сохранить» `className="px-3 py-1.5 rounded bg-zinc-700"` / `bg-amber-500…` | `className={BTN.ghost}` / `className={BTN.primary}` |
| autocomplete исполнителя: контейнер `bg-zinc-800`, dropdown `bg-zinc-800 border-white/10` | контейнер `style={{ ...BASE_INPUT, display:"flex", alignItems:"center", gap:8 }}`; input → `<StyledInput …>`; dropdown `style={{ position:"absolute", left:0, right:0, zIndex:50, marginTop:4, background:"#141414", border:"1px solid rgba(255,255,255,0.10)", borderRadius:8, overflow:"hidden" }}`, пункт — `style={{ padding:"8px 12px", cursor:"pointer", fontSize:13 }}` + hover через `onMouseEnter/Leave` не городить — оставить `className="hover:bg-zinc-700"` допустимо ЗАМЕНИТЬ на `hover:bg-white/5` |
| блоки ТЗ/обсуждения `bg-zinc-800 rounded px-3 py-2` (просмотр ТЗ, textarea ТЗ, textarea комментария) | `background:"#0a0b11", border:"1px solid rgba(255,255,255,0.10)", borderRadius:8, padding:"10px 12px"` (или StyledTextarea для редакторов) |
| кнопки «Предложить изменение»/«Отправить» `bg-amber-500 text-black` | `className={BTN.primary}` (компактно: добавить `style={{ padding:"8px 12px" }}` при необходимости) |
| «Принять»/«Отклонить» pending-версии `bg-emerald-600`/`bg-red-600` | `style={{ background:"#6ee7a8", color:"#0a0a0a", border:"none", borderRadius:8, padding:"6px 12px", fontWeight:700, cursor:"pointer" }}` / то же с `background:"#f8a3a3"` |

Остальные мелкие `text-*`/`opacity-*` классы внутри истории ТЗ и обсуждения можно
оставить (Tailwind в className проекту разрешён — правило: НЕ-zinc и не цветные фоны).
Критерий приёмки: в TaskModal/TasksView/TasksBoard не остаётся классов `zinc`, `amber-500`,
`emerald-600`, `red-600`, `sky-600` (проверка: `grep -n "zinc\|amber-5\|emerald-6\|red-6\|sky-6" src/App.jsx`
в диапазоне строк задач — допустимы вхождения в других компонентах).

- [ ] **Step 4: Сборка + vitest**

Run: `npm run build` и `npm run test -- run`
Expected: зелёные. Особо проверить сборкой JSX-теги после правок шапки (грабля: Edit внутри
JSX легко теряет закрывающий тег — ловится build).

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat(tasks): workflow-кнопки по ролям + рестайл TaskModal, селект статуса заменён кнопками"
```

---

### Task 7: edge customText + финальный прогон

**Files:**
- Modify: `deploy/web-push/functions/web-push-notify/index.ts` (~159-161)

- [ ] **Step 1: customText override в ветке task_status**

Заменить:

```ts
      } else if (type === "task_status") {
        base = baseIds([task.author_id, task.assigned_to], initiator);
        body = `🔄 Задача «${task.title}» → ${task.status}`;
```

на:

```ts
      } else if (type === "task_status") {
        base = baseIds([task.author_id, task.assigned_to], initiator);
        body = (b.customText as string) || `🔄 Задача «${task.title}» → ${task.status}`;
```

⚠ Деплой edge (`deploy/nextcloud/deploy-edge-function.sh` + restart) — ТОЛЬКО на деплое
по слову «деплой», в этой задаче только файл в репо.

- [ ] **Step 2: Финальная верификация захода**

Run: `npm run test -- run` → все зелёные (старые 76+ и новые taskUi).
Run: `npm run build` → зелёная.
Run: `git -C "F:\Сайт\redesign-v2-fresh" diff --stat main` — изменены только заявленные файлы.

- [ ] **Step 3: Commit**

```bash
git add deploy/web-push/functions/web-push-notify/index.ts
git commit -m "feat(tasks): edge task_status — customText override для «есть замечания»"
```

---

## Чек-лист деплоя (отдельным шагом, по явному слову «деплой» владельца)

1. `npm run build` (свежий бандл).
2. Миграция: `docker exec -i supabase-db psql < supabase/migrations/20260611_0003_get_tasks_open_question.sql` (через wsl, файл-скрипт — как в прошлых деплоях).
3. Edge: `deploy/nextcloud/deploy-edge-function.sh web-push-notify` + `docker restart supabase-edge-functions`; smoke `{ok:true}`.
4. Веб: `wsl bash /mnt/f/*/redesign-v2-fresh/deploy/nextcloud/deploy-web.sh`.
5. Push main → origin (fsync writeout-only + обход прокси).
6. Владельцу: жёсткий сброс кэша PWA.

## Вне плана (заход №2 — отдельный план)

Фото-отчёты (`task_photos` + Nextcloud edge actions + UI вложений) — по спеку, после
живой проверки захода №1. Мобильная адаптация вкладки — отдельный проход.

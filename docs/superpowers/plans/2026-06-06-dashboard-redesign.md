# Переработка дашборда (этап 6.5) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить дашборд в живой сводный экран с зонами по смыслу, селектором периода, дебиторкой, расходами по категориям, накопительным балансом, моими задачами и drill-down — без изменений БД.

**Architecture:** Чистые расчёты выносятся в новый модуль `src/lib/dashboardMetrics.js` и покрываются vitest-тестами (TDD). UI-компонент `Dashboard` (в `src/App.jsx`) переписывается на каркас «Зоны по смыслу» и потребляет эти расчёты. Задачи (`project_tasks`) подгружаются на верхний уровень `App` существующей `fetchTasks` и прокидываются в `Dashboard`. Drill-down переключает вкладку «Проекты» с начальным фильтром стадии. Спек: `docs/superpowers/specs/2026-06-06-dashboard-redesign-design.md`.

**Tech Stack:** React 18, Vite 5, recharts 2 (PieChart/BarChart/LineChart — уже импортированы), framer-motion, lucide-react. Тесты — vitest (добавляется в Task 1). Все данные уже грузятся под RLS; новых RPC/миграций нет.

**Среда (грабли проекта — важно для всех команд):**
- Все команды (`npm`, `git`) запускать из **PowerShell на Windows**, рабочая папка `F:\Сайт\redesign-v2-fresh`.
- git **только** с Windows-стороны: `git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* <cmd>` (НЕ через WSL).
- Работаем в ветке `feature/6.5-dashboard` (уже создана, спек закоммичен `5dfd677`). Push не делаем без явной просьбы владельца.

---

## File Structure

- **Create** `src/lib/dashboardMetrics.js` — чистые функции расчётов (период, баланс, дебиторка, расходы по категориям, временные ряды, мои задачи). Без импортов React/Supabase. Аналог существующего `src/lib/lineDiff.js`.
- **Create** `src/lib/dashboardMetrics.test.js` — vitest-тесты модуля расчётов.
- **Modify** `package.json` — добавить devDep `vitest` + скрипты `test`/`test:watch`.
- **Modify** `vite.config.js` — `defineConfig` из `vitest/config` + `test`-секция (environment `node`).
- **Modify** `src/App.jsx`:
  - Верхний уровень `App` (~6713–6828): состояние `tasks`, загрузка в двух местах (`Promise.all` ~6753 и ~6802), сброс на `SIGNED_OUT` (~6789), проп навигации `pendingStageFilter`.
  - Вызов `Dashboard` (~7183): новые пропы `tasks`, `profile`, `onDrillStage`.
  - Компонент `Dashboard` (~2047–2278): полная переработка раскладки + новые виджеты, удаление блока «Финансы месяца».
  - Компонент `Projects` (~2283): новый проп `initialStageFilter`.

Новые под-виджеты Dashboard оформляются **локальными функциями-компонентами в `App.jsx`** рядом с `Dashboard` — следуя существующему паттерну (`KpiCard`, `Card`, `Empty` уже локальные в `App.jsx`). Это держит правки сфокусированными в одном файле.

---

## Task 1: Установить и настроить Vitest

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Create: `src/lib/dashboardMetrics.test.js`
- Create: `src/lib/dashboardMetrics.js`

- [ ] **Step 1: Установить vitest**

Run (PowerShell, в корне репо):
```
npm install -D vitest@^2
```
Expected: добавляется `vitest` в `devDependencies`, обновляется `package-lock.json`, без ошибок.

- [ ] **Step 2: Добавить скрипты в package.json**

В `package.json` секцию `scripts` привести к виду:
```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 3: Включить vitest в vite.config.js**

Заменить строку импорта и добавить `test`-секцию (VitePWA-плагин НЕ трогаем):
```js
/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: null,
      manifest: false,
      injectManifest: { swSrc: 'src/sw.js', swDest: 'dist/sw.js' },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
```

- [ ] **Step 4: Написать первый падающий тест (periodRange)**

Create `src/lib/dashboardMetrics.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { periodRange, prevPeriodRange } from './dashboardMetrics.js';

const NOW = new Date('2026-06-06T12:00:00');

describe('periodRange', () => {
  it('месяц = текущий календарный месяц', () => {
    expect(periodRange('month', NOW)).toEqual({ from: '2026-06-01', to: '2026-07-01' });
  });
  it('квартал = текущий квартал (Q2 для июня)', () => {
    expect(periodRange('quarter', NOW)).toEqual({ from: '2026-04-01', to: '2026-07-01' });
  });
  it('год = текущий календарный год', () => {
    expect(periodRange('year', NOW)).toEqual({ from: '2026-01-01', to: '2027-01-01' });
  });
  it('всё = признак all + широкие границы', () => {
    expect(periodRange('all', NOW)).toEqual({ from: '0000-01-01', to: '9999-12-31', all: true });
  });
});

describe('prevPeriodRange', () => {
  it('предыдущий месяц', () => {
    expect(prevPeriodRange('month', NOW)).toEqual({ from: '2026-05-01', to: '2026-06-01' });
  });
  it('предыдущий год', () => {
    expect(prevPeriodRange('year', NOW)).toEqual({ from: '2025-01-01', to: '2026-01-01' });
  });
  it('для "всё" предыдущего периода нет', () => {
    expect(prevPeriodRange('all', NOW)).toBeNull();
  });
});
```

- [ ] **Step 5: Запустить — убедиться, что падает**

Run: `npm run test`
Expected: FAIL — `Failed to resolve import "./dashboardMetrics.js"` или `periodRange is not a function`.

- [ ] **Step 6: Реализовать periodRange / prevPeriodRange**

Create `src/lib/dashboardMetrics.js`:
```js
// Чистые расчёты для дашборда (этап 6.5). Без React/Supabase — только данные.
// Транзакция: { date:'YYYY-MM-DD', type:'income'|'expense', amount:number, category }
// Проект: { id, name, stage, contractSum, paidAmount, ... }
// Задача: { assignedTo, status, dueDate:'YYYY-MM-DD'|null, title, ... }

const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`; // m,d — 1-индексные

// Границы периода [from, to) в строках 'YYYY-MM-DD'. now — для детерминизма в тестах.
export function periodRange(period, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-индекс
  if (period === 'month') {
    const ny = m === 11 ? y + 1 : y, nm = m === 11 ? 0 : m + 1;
    return { from: ymd(y, m + 1, 1), to: ymd(ny, nm + 1, 1) };
  }
  if (period === 'quarter') {
    const qStart = Math.floor(m / 3) * 3;       // 0,3,6,9
    const ny = qStart + 3 > 11 ? y + 1 : y;
    const nm = (qStart + 3) % 12;
    return { from: ymd(y, qStart + 1, 1), to: ymd(ny, nm + 1, 1) };
  }
  if (period === 'year') {
    return { from: ymd(y, 1, 1), to: ymd(y + 1, 1, 1) };
  }
  return { from: '0000-01-01', to: '9999-12-31', all: true };
}

// Предыдущий аналогичный период (для тренда). null для 'all'.
export function prevPeriodRange(period, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === 'month') {
    const py = m === 0 ? y - 1 : y, pm = m === 0 ? 11 : m - 1;
    return { from: ymd(py, pm + 1, 1), to: ymd(y, m + 1, 1) };
  }
  if (period === 'quarter') {
    const qStart = Math.floor(m / 3) * 3;
    const pStart = qStart - 3;
    const py = pStart < 0 ? y - 1 : y;
    const pm = (pStart + 12) % 12;
    return { from: ymd(py, pm + 1, 1), to: ymd(y, qStart + 1, 1) };
  }
  if (period === 'year') {
    return { from: ymd(y - 1, 1, 1), to: ymd(y, 1, 1) };
  }
  return null;
}
```

- [ ] **Step 7: Запустить — убедиться, что проходит**

Run: `npm run test`
Expected: PASS (8 тестов в двух describe).

- [ ] **Step 8: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add package.json package-lock.json vite.config.js src/lib/dashboardMetrics.js src/lib/dashboardMetrics.test.js
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m "test(6.5): vitest + расчёты периода (periodRange/prevPeriodRange)"
```

---

## Task 2: Баланс за период и тренд

**Files:**
- Modify: `src/lib/dashboardMetrics.js`
- Modify: `src/lib/dashboardMetrics.test.js`

- [ ] **Step 1: Дописать тесты (inPeriod, periodBalance, trendDir)**

Добавить в `src/lib/dashboardMetrics.test.js`:
```js
import { inPeriod, periodBalance, trendDir } from './dashboardMetrics.js';

const TXS = [
  { date: '2026-06-10', type: 'income',  amount: 100 },
  { date: '2026-06-15', type: 'expense', amount: 30 },
  { date: '2026-05-01', type: 'income',  amount: 999 }, // вне июня
];

describe('inPeriod', () => {
  const r = { from: '2026-06-01', to: '2026-07-01' };
  it('включает дату внутри [from,to)', () => expect(inPeriod('2026-06-10', r)).toBe(true));
  it('исключает дату до from', () => expect(inPeriod('2026-05-31', r)).toBe(false));
  it('исключает дату == to (правая граница открыта)', () => expect(inPeriod('2026-07-01', r)).toBe(false));
  it('для all включает всё', () => expect(inPeriod('1999-01-01', { from:'0000-01-01', to:'9999-12-31', all:true })).toBe(true));
});

describe('periodBalance', () => {
  it('считает доход/расход/баланс за период', () => {
    expect(periodBalance(TXS, { from: '2026-06-01', to: '2026-07-01' }))
      .toEqual({ income: 100, expense: 30, balance: 70 });
  });
});

describe('trendDir', () => {
  it('up когда текущий больше прошлого', () => expect(trendDir(70, 50)).toBe('up'));
  it('down когда текущий меньше прошлого', () => expect(trendDir(40, 50)).toBe('down'));
  it('null когда прошлый период недоступен', () => expect(trendDir(70, null)).toBeNull());
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test`
Expected: FAIL — `inPeriod is not a function`.

- [ ] **Step 3: Реализовать**

Добавить в `src/lib/dashboardMetrics.js`:
```js
export function inPeriod(dateStr, range) {
  if (!dateStr) return false;
  if (range.all) return true;
  return dateStr >= range.from && dateStr < range.to;
}

export function periodBalance(txs, range) {
  let income = 0, expense = 0;
  for (const t of txs) {
    if (!inPeriod(t.date, range)) continue;
    const a = Number(t.amount) || 0;
    if (t.type === 'income') income += a; else expense += a;
  }
  return { income, expense, balance: income - expense };
}

export function trendDir(cur, prev) {
  if (prev == null) return null;
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return null;
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npm run test`
Expected: PASS (все тесты, включая Task 1).

- [ ] **Step 5: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add src/lib/dashboardMetrics.js src/lib/dashboardMetrics.test.js
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m "test(6.5): periodBalance + inPeriod + trendDir"
```

---

## Task 3: Временные ряды (бар доходы/расходы + накопительный баланс)

**Files:**
- Modify: `src/lib/dashboardMetrics.js`
- Modify: `src/lib/dashboardMetrics.test.js`

- [ ] **Step 1: Дописать тесты (granularityFor, financeSeries)**

Добавить в `src/lib/dashboardMetrics.test.js`:
```js
import { granularityFor, financeSeries } from './dashboardMetrics.js';

describe('granularityFor', () => {
  it('месяц → по дням', () => expect(granularityFor('month')).toBe('day'));
  it('квартал → по неделям', () => expect(granularityFor('quarter')).toBe('week'));
  it('год → по месяцам', () => expect(granularityFor('year')).toBe('month'));
  it('всё → по месяцам', () => expect(granularityFor('all')).toBe('month'));
});

describe('financeSeries (год, помесячно)', () => {
  const txs = [
    { date: '2026-01-15', type: 'income',  amount: 100 },
    { date: '2026-01-20', type: 'expense', amount: 40 },
    { date: '2026-03-05', type: 'income',  amount: 60 },
  ];
  const range = { from: '2026-01-01', to: '2027-01-01' };
  const series = financeSeries(txs, range, 'month');
  it('даёт 12 месячных точек', () => expect(series.length).toBe(12));
  it('январь: inc=100, exp=40', () => {
    expect(series[0].inc).toBe(100);
    expect(series[0].exp).toBe(40);
  });
  it('накопительный баланс растёт корректно', () => {
    expect(series[0].cumBalance).toBe(60);   // 100-40
    expect(series[2].cumBalance).toBe(120);  // +60 в марте, февраль пустой
  });
});

describe('financeSeries (all — границы из данных)', () => {
  const txs = [
    { date: '2025-11-10', type: 'income', amount: 10 },
    { date: '2026-02-10', type: 'income', amount: 20 },
  ];
  const series = financeSeries(txs, { from:'0000-01-01', to:'9999-12-31', all:true }, 'month');
  it('не генерирует тысячи бакетов, охватывает только данные', () => {
    expect(series.length).toBe(4); // ноя, дек, янв, фев
    expect(series[series.length - 1].cumBalance).toBe(30);
  });
  it('пустые txs → пустой ряд', () => {
    expect(financeSeries([], { from:'0000-01-01', to:'9999-12-31', all:true }, 'month')).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test`
Expected: FAIL — `granularityFor is not a function`.

- [ ] **Step 3: Реализовать**

Добавить в `src/lib/dashboardMetrics.js`:
```js
export function granularityFor(period) {
  if (period === 'month') return 'day';
  if (period === 'quarter') return 'week';
  return 'month'; // year, all
}

const MONTHS_SHORT = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

function bucketLabel(d, gran) {
  if (gran === 'month') return MONTHS_SHORT[d.getMonth()];
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`; // day, week
}

// Временной ряд по бакетам. Для all границы берём из самих txs (min..max),
// иначе генерация от 0000 года породила бы миллионы бакетов.
export function financeSeries(txs, range, granularity) {
  let startStr = range.from, endStr = range.to;
  if (range.all) {
    if (!txs.length) return [];
    const dates = txs.map(t => t.date).filter(Boolean).sort();
    startStr = dates[0].slice(0, 8) + '01';            // первое число месяца первой транзакции
    const last = new Date(dates[dates.length - 1] + 'T00:00:00');
    last.setMonth(last.getMonth() + 1); last.setDate(1); // первое число следующего месяца после последней
    endStr = ymd(last.getFullYear(), last.getMonth() + 1, 1);
  }
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  const buckets = [];
  let cur = new Date(start);
  while (cur < end) {
    let next = new Date(cur);
    if (granularity === 'day') next.setDate(next.getDate() + 1);
    else if (granularity === 'week') next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    if (next > end) next = new Date(end);
    buckets.push({ start: new Date(cur), end: new Date(next), label: bucketLabel(cur, granularity), inc: 0, exp: 0 });
    cur = next;
  }
  for (const t of txs) {
    if (!t.date) continue;
    const d = new Date(t.date + 'T00:00:00');
    if (d < start || d >= end) continue;
    const b = buckets.find(b => d >= b.start && d < b.end);
    if (!b) continue;
    const a = Number(t.amount) || 0;
    if (t.type === 'income') b.inc += a; else b.exp += a;
  }
  let cum = 0;
  return buckets.map(b => { cum += b.inc - b.exp; return { label: b.label, inc: b.inc, exp: b.exp, cumBalance: cum }; });
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add src/lib/dashboardMetrics.js src/lib/dashboardMetrics.test.js
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m "test(6.5): financeSeries (бар + накопительный баланс) с обработкой all"
```

---

## Task 4: Расходы по категориям

**Files:**
- Modify: `src/lib/dashboardMetrics.js`
- Modify: `src/lib/dashboardMetrics.test.js`

- [ ] **Step 1: Дописать тесты (expenseByCategory)**

Добавить в `src/lib/dashboardMetrics.test.js`:
```js
import { expenseByCategory } from './dashboardMetrics.js';

describe('expenseByCategory', () => {
  const range = { from: '2026-06-01', to: '2026-07-01' };
  const txs = [
    { date: '2026-06-02', type: 'expense', amount: 50, category: 'Жильё / аренда' },
    { date: '2026-06-03', type: 'expense', amount: 20, category: 'Транспорт' },
    { date: '2026-06-04', type: 'expense', amount: 30, category: 'Жильё / аренда' },
    { date: '2026-06-05', type: 'income',  amount: 999, category: 'Проектирование' }, // не расход
    { date: '2026-05-31', type: 'expense', amount: 999, category: 'Транспорт' },       // вне периода
  ];
  it('группирует расходы по категориям и сортирует по убыванию', () => {
    expect(expenseByCategory(txs, range)).toEqual([
      { name: 'Жильё / аренда', value: 80 },
      { name: 'Транспорт', value: 20 },
    ]);
  });
  it('сворачивает хвост в «Прочее» при превышении maxSlices', () => {
    const many = ['A','B','C','D','E','F','G'].map((c, i) => ({
      date: '2026-06-10', type: 'expense', amount: (7 - i), category: c,
    }));
    const res = expenseByCategory(many, range, 6);
    expect(res.length).toBe(6);
    expect(res[5]).toEqual({ name: 'Прочее', value: 1 }); // последняя категория G свёрнута
  });
  it('пустой результат при отсутствии расходов', () => {
    expect(expenseByCategory([], range)).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test`
Expected: FAIL — `expenseByCategory is not a function`.

- [ ] **Step 3: Реализовать**

Добавить в `src/lib/dashboardMetrics.js`:
```js
export function expenseByCategory(txs, range, maxSlices = 6) {
  const map = new Map();
  for (const t of txs) {
    if (t.type !== 'expense' || !inPeriod(t.date, range)) continue;
    const cat = t.category || 'Прочие расходы';
    map.set(cat, (map.get(cat) || 0) + (Number(t.amount) || 0));
  }
  const sorted = [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  if (sorted.length <= maxSlices) return sorted;
  const head = sorted.slice(0, maxSlices - 1);
  const tail = sorted.slice(maxSlices - 1);
  const other = tail.reduce((s, x) => s + x.value, 0);
  return [...head, { name: 'Прочее', value: other }];
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add src/lib/dashboardMetrics.js src/lib/dashboardMetrics.test.js
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m "test(6.5): expenseByCategory с топ-N + Прочее"
```

---

## Task 5: Дебиторка

**Files:**
- Modify: `src/lib/dashboardMetrics.js`
- Modify: `src/lib/dashboardMetrics.test.js`

- [ ] **Step 1: Дописать тесты (receivables)**

Добавить в `src/lib/dashboardMetrics.test.js`:
```js
import { receivables } from './dashboardMetrics.js';

describe('receivables', () => {
  const projects = [
    { id: 1, name: 'A', stage: 'В работе',  contractSum: 1000, paidAmount: 400 }, // 600
    { id: 2, name: 'B', stage: 'Архив',     contractSum: 500,  paidAmount: 0 },   // архив — исключить
    { id: 3, name: 'C', stage: 'Оплачен',   contractSum: 200,  paidAmount: 200 }, // 0 — исключить
    { id: 4, name: 'D', stage: 'Договор подписан', contractSum: 300, paidAmount: 50 }, // 250
  ];
  const r = receivables(projects);
  it('итог = сумма остатков по не-архивным с остатком > 0', () => expect(r.total).toBe(850));
  it('items отсортированы по убыванию остатка', () => {
    expect(r.items).toEqual([
      { id: 1, name: 'A', remaining: 600 },
      { id: 4, name: 'D', remaining: 250 },
    ]);
  });
  it('пустой портфель → нули', () => expect(receivables([])).toEqual({ total: 0, items: [] }));
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test`
Expected: FAIL — `receivables is not a function`.

- [ ] **Step 3: Реализовать**

Добавить в `src/lib/dashboardMetrics.js`:
```js
export function receivables(projects) {
  const items = [];
  for (const p of projects) {
    if (p.stage === 'Архив') continue;
    const remaining = (Number(p.contractSum) || 0) - (Number(p.paidAmount) || 0);
    if (remaining > 0) items.push({ id: p.id, name: p.name, remaining });
  }
  items.sort((a, b) => b.remaining - a.remaining);
  return { total: items.reduce((s, x) => s + x.remaining, 0), items };
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add src/lib/dashboardMetrics.js src/lib/dashboardMetrics.test.js
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m "test(6.5): receivables (дебиторка)"
```

---

## Task 6: Мои задачи

**Files:**
- Modify: `src/lib/dashboardMetrics.js`
- Modify: `src/lib/dashboardMetrics.test.js`

- [ ] **Step 1: Дописать тесты (myTasks)**

Добавить в `src/lib/dashboardMetrics.test.js`:
```js
import { myTasks } from './dashboardMetrics.js';

describe('myTasks', () => {
  const today = '2026-06-06';
  const tasks = [
    { id: 1, status: 'В работе',   dueDate: '2026-06-01', title: 'просрочена' },
    { id: 2, status: 'Готово',     dueDate: '2026-06-01', title: 'готова — исключить' },
    { id: 3, status: 'Новая',      dueDate: '2026-06-06', title: 'сегодня' },
    { id: 4, status: 'На проверке',dueDate: '2026-06-20', title: 'будущая — не в блоке' },
    { id: 5, status: 'Отменена',   dueDate: '2026-06-01', title: 'отменена — исключить' },
    { id: 6, status: 'Новая',      dueDate: null,         title: 'без срока — не в блоке' },
  ];
  const r = myTasks(tasks, today);
  it('просроченные — активные с dueDate < today', () => {
    expect(r.overdue.map(t => t.id)).toEqual([1]);
  });
  it('сегодняшние — активные с dueDate == today', () => {
    expect(r.today.map(t => t.id)).toEqual([3]);
  });
  it('счётчики', () => expect(r.counts).toEqual({ overdue: 1, today: 1 }));
  it('исключает Готово/Отменена/будущие/без срока из обоих списков', () => {
    const ids = [...r.overdue, ...r.today].map(t => t.id);
    expect(ids).not.toContain(2);
    expect(ids).not.toContain(4);
    expect(ids).not.toContain(5);
    expect(ids).not.toContain(6);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `npm run test`
Expected: FAIL — `myTasks is not a function`.

- [ ] **Step 3: Реализовать**

Добавить в `src/lib/dashboardMetrics.js`:
```js
const TASK_DONE = ['Готово', 'Отменена'];

// tasks предполагаются уже «моими» (загружены с фильтром assignedTo на сервере).
export function myTasks(tasks, today) {
  const active = tasks.filter(t => !TASK_DONE.includes(t.status) && t.dueDate);
  const overdue = active.filter(t => t.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const todayList = active.filter(t => t.dueDate === today);
  return { overdue, today: todayList, counts: { overdue: overdue.length, today: todayList.length } };
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `npm run test`
Expected: PASS (весь файл — все функции зелёные).

- [ ] **Step 5: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add src/lib/dashboardMetrics.js src/lib/dashboardMetrics.test.js
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m "test(6.5): myTasks (мои задачи: просрочено/сегодня)"
```

---

## Task 7: Загрузка задач на верхний уровень App

**Files:**
- Modify: `src/App.jsx` (состояние и загрузка `tasks`)

- [ ] **Step 1: Добавить состояние `tasks`**

Рядом с `const [txs, setTxs] = useState([]);` (~6714) добавить:
```jsx
  const [tasks, setTasks] = useState([]);
```

- [ ] **Step 2: Грузить задачи в первом месте (проверка сессии, ~6753)**

Заменить блок `Promise.all` в начальной проверке сессии на:
```jsx
            const [p, t, cl, tk] = await Promise.all([
              fetchProjects(supabase),
              fetchTransactions(supabase),
              fetchClients(supabase).catch(() => []),
              fetchTasks(supabase, { assignedTo: prof.id }).catch(() => []),
            ]);
            setProjects(p);
            setTxs(t);
            setClients(cl);
            setTasks(tk);
```

- [ ] **Step 3: Грузить задачи во втором месте (handleAuthenticated, ~6802)**

Заменить блок `Promise.all` в `handleAuthenticated` на:
```jsx
      const [p, t, cl, tk] = await Promise.all([
        fetchProjects(supabase),
        fetchTransactions(supabase),
        fetchClients(supabase).catch(() => []),
        fetchTasks(supabase, { assignedTo: prof.id }).catch(() => []),
      ]);
      setProjects(p);
      setTxs(t);
      setClients(cl);
      setTasks(tk);
```

- [ ] **Step 4: Сбрасывать задачи при выходе (SIGNED_OUT, ~6789)**

В обработчике `SIGNED_OUT` добавить рядом с `setTxs([]);`:
```jsx
        setTasks([]);
```

- [ ] **Step 5: Проверить сборку**

Run: `npm run build`
Expected: зелёная сборка без ошибок (задачи грузятся, но пока не используются — это нормально).

- [ ] **Step 6: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add src/App.jsx
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m "feat(6.5): загрузка моих задач на верхний уровень App"
```

---

## Task 8: Drill-down — проп начального фильтра в Projects + навигация в App

**Files:**
- Modify: `src/App.jsx` (`Projects` сигнатура ~2283; вызов `<Projects>`; состояние `pendingStageFilter`)

- [ ] **Step 1: Принять начальный фильтр в Projects**

В `function Projects({ ... })` (~2283) добавить проп `initialStageFilter` и использовать его как начальное значение:
```jsx
function Projects({ projects, setProjects, clients, client, profile, ownerId, showToast, initialStageFilter = "Активные" }) {
  const [modal, setModal]             = useState(null);
  const [stageFilter, setStageFilter] = useState(initialStageFilter);
```

- [ ] **Step 2: Добавить состояние навигации в App**

Рядом с `const [tab, setTab] = useState("dashboard");` (~6712) добавить:
```jsx
  const [pendingStageFilter, setPendingStageFilter] = useState("Активные");
```

- [ ] **Step 3: Прокинуть фильтр в вызов Projects**

Найти строку `{tab === "projects" && <Projects` и добавить проп `initialStageFilter={pendingStageFilter}` в этот вызов. Поскольку `Projects` рендерится только при `tab === "projects"`, он монтируется заново при каждом переходе — начальный фильтр применяется при drill-down.

- [ ] **Step 4: Проверить сборку**

Run: `npm run build`
Expected: зелёная сборка.

- [ ] **Step 5: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add src/App.jsx
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m "feat(6.5): Projects принимает начальный фильтр стадии (для drill-down)"
```

---

## Task 9: Под-виджеты Dashboard (новые карточки)

**Files:**
- Modify: `src/App.jsx` (новые локальные компоненты перед `function Dashboard`, ~2046)

Добавляем четыре новых под-компонента рядом с `Dashboard` (используют существующие `Card`, `SectionTitle`, `Empty`, `fmt`, `fmtD` и recharts-импорты). НЕ подключаем их в DOM в этой задаче — только определяем; интеграция в Task 10.

- [ ] **Step 1: Виджет «Дебиторка»**

Перед `function Dashboard` добавить:
```jsx
function ReceivablesCard({ data }) {
  const top = data.items.slice(0, 5);
  const rest = data.items.length - top.length;
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <SectionTitle icon={<Wallet size={13} />}>Дебиторка · жду оплат</SectionTitle>
        <span style={{ color: "#e8c860", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(data.total)}</span>
      </div>
      {top.length === 0
        ? <p style={{ color: "#62646b", fontSize: 13, margin: 0 }}>Все оплаты получены</p>
        : top.map(it => (
          <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ color: "#cdced4", fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
            <span style={{ color: "#e8c860", fontSize: 12, flexShrink: 0, marginLeft: 8, fontVariantNumeric: "tabular-nums" }}>{fmt(it.remaining)}</span>
          </div>
        ))}
      {rest > 0 && <p style={{ color: "#62646b", fontSize: 11, margin: "8px 0 0" }}>и ещё {rest}</p>}
    </Card>
  );
}
```

- [ ] **Step 2: Виджет «Расходы по категориям»**

```jsx
const EXP_COLORS = ["#d4af37", "#93c5fd", "#f8a3a3", "#6ee7a8", "#b794f6", "#6b6b67"];
function ExpenseByCategoryCard({ data, tt }) {
  return (
    <Card>
      <SectionTitle icon={<BarChart3 size={13} />}>Расходы по категориям</SectionTitle>
      {data.length > 0
        ? <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={56} outerRadius={84} dataKey="value" nameKey="name" paddingAngle={3}>
                {data.map((e, i) => <Cell key={i} fill={EXP_COLORS[i % EXP_COLORS.length]} stroke="transparent" />)}
              </Pie>
              <Tooltip contentStyle={tt} itemStyle={{ color: "#fafaf7" }} formatter={(v, n) => [fmt(v), n]} />
              <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ fontSize: 10, color: "#9b9ca4" }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        : <Empty text="Нет расходов за период" />}
    </Card>
  );
}
```

- [ ] **Step 3: Виджет «Накопительный баланс»**

```jsx
function CashflowCard({ series, tt }) {
  const has = series.length > 0;
  return (
    <Card>
      <SectionTitle icon={<TrendingUp size={13} />}>Накопительный баланс</SectionTitle>
      {has
        ? <ResponsiveContainer width="100%" height={210}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#62646b", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#62646b", fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}к` : v} />
              <Tooltip contentStyle={tt} itemStyle={{ color: "#fafaf7" }} formatter={v => [fmt(v), "Баланс"]} />
              <Line type="monotone" dataKey="cumBalance" stroke="#6ee7a8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        : <Empty text="Нет данных за период" />}
    </Card>
  );
}
```

- [ ] **Step 4: Виджет «Мои задачи»**

```jsx
function MyTasksCard({ data }) {
  const rows = [...data.overdue, ...data.today];
  return (
    <Card>
      <SectionTitle icon={<AlertTriangle size={13} />}>
        Мои задачи · просрочено {data.counts.overdue} · сегодня {data.counts.today}
      </SectionTitle>
      {rows.length === 0
        ? <p style={{ color: "#62646b", fontSize: 13, margin: 0 }}>Нет горящих задач</p>
        : rows.map(t => {
          const od = t.dueDate < todayStr();
          return (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <span style={{ color: od ? "#f8a3a3" : "#f7f8f8", fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
              <span style={{ color: "#62646b", fontSize: 11, flexShrink: 0, marginLeft: 8 }}>{fmtD(t.dueDate)}</span>
            </div>
          );
        })}
    </Card>
  );
}
```

- [ ] **Step 5: Проверить сборку**

Run: `npm run build`
Expected: зелёная сборка (компоненты определены, но ещё не используются — Vite не ругается на неиспользуемые функции).

- [ ] **Step 6: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add src/App.jsx
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m "feat(6.5): под-виджеты дашборда (дебиторка, расходы по категориям, cashflow, мои задачи)"
```

---

## Task 10: Переработка компонента Dashboard (зоны + период + интеграция)

**Files:**
- Modify: `src/App.jsx` (`function Dashboard`, ~2047–2278 — полная замена тела)

- [ ] **Step 1: Добавить импорт расчётов и заменить расчётную часть Dashboard**

Сначала добавить импорт после строки 4 (`src/App.jsx`, блок lib-импортов):
```jsx
import { periodRange, prevPeriodRange, granularityFor, periodBalance, trendDir, financeSeries, expenseByCategory, receivables, myTasks } from "./lib/dashboardMetrics";
```

Затем заменить всё тело `function Dashboard({ projects, txs }) { ... }` (от строки `function Dashboard` до закрывающей `}` компонента, ~2278). Новая сигнатура и расчёты (UI-разметка — в следующем шаге; здесь — «голова» функции до `return`):
```jsx
function Dashboard({ projects, txs, tasks, profile, onDrillStage }) {
  const [period, setPeriod] = useState("month");
  const range = periodRange(period);
  const prevRange = prevPeriodRange(period);
  const gran = granularityFor(period);

  const active = projects.filter(p => !["Оплачен", "Архив"].includes(p.stage));
  const portfolio = projects.filter(p => p.stage !== "Архив");
  const totalContract = portfolio.reduce((s, p) => s + (+p.contractSum || 0), 0);
  const totalPaid = portfolio.reduce((s, p) => s + (+p.paidAmount || 0), 0);

  const bal = periodBalance(txs, range);
  const prevBal = prevRange ? periodBalance(txs, prevRange).balance : null;
  const balanceTrend = trendDir(bal.balance, prevBal);

  const series = financeSeries(txs, range, gran);
  const expCats = expenseByCategory(txs, range);
  const debt = receivables(projects);
  const myT = myTasks(tasks || [], todayStr());

  const stageData = PROJECT_STAGES.slice(0, -1)
    .map(s => ({ name: s, value: projects.filter(p => p.stage === s).length, fill: STAGE_META[s].color }))
    .filter(d => d.value > 0);

  const todayS = todayStr();
  const overdue = active.filter(p => p.deadline && p.deadline < todayS && p.stage !== "Сдан заказчику");
  const upcoming = active.filter(p => p.deadline && p.deadline >= todayS)
    .sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 4);

  const tt = {
    background: "#1c1c1a", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10,
    fontSize: 12, color: "#f7f8f8", boxShadow: "0 12px 28px rgba(0,0,0,0.5)", padding: "8px 12px",
  };

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.06 } } };
  const itemVariants = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } } };

  const PERIODS = [["month", "Месяц"], ["quarter", "Квартал"], ["year", "Год"], ["all", "Всё"]];
```

- [ ] **Step 2: Заменить `return (...)` Dashboard на новую раскладку зон**

```jsx
  return (
    <motion.div style={{ display: "flex", flexDirection: "column", gap: 16 }} variants={containerVariants} initial="hidden" animate="visible">

      {/* Шапка с период-селектором */}
      <motion.div variants={itemVariants} style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ display: "flex", gap: 4, background: "#1c1c1a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 3 }}>
          {PERIODS.map(([key, label]) => (
            <button key={key} onClick={() => setPeriod(key)} style={{
              border: "none", cursor: "pointer", fontSize: 12, padding: "5px 12px", borderRadius: 7,
              background: period === key ? "#d4af37" : "transparent",
              color: period === key ? "#121214" : "#9b9ca4",
              fontWeight: period === key ? 600 : 400,
            }}>{label}</button>
          ))}
        </div>
      </motion.div>

      {/* KPI ×4 */}
      <motion.div variants={itemVariants} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div onClick={() => onDrillStage && onDrillStage("Активные")} style={{ cursor: onDrillStage ? "pointer" : "default" }}>
          <KpiCard label="Активных проектов" value={active.length} Icon={FolderKanban} color="#d4af37" sub={`всего: ${projects.length}`} />
        </div>
        <KpiCard label="Портфель" value={totalContract} Icon={Briefcase} color="#d4af37" format={fmt} />
        <KpiCard label="Получено" value={totalPaid} Icon={BadgeCheck} color="#6ee7a8" format={fmt} sub={`осталось: ${fmt(totalContract - totalPaid)}`} />
        <KpiCard label="Баланс за период" value={bal.balance} Icon={Wallet} color={bal.balance >= 0 ? "#6ee7a8" : "#f8a3a3"} format={fmt} sub={`доходы ${fmt(bal.income)}`} trend={balanceTrend} />
      </motion.div>

      {/* ЗОНА: Требует внимания */}
      <motion.div variants={itemVariants}>
        <p style={ZONE_TITLE("#f8a3a3")}>⚠ Требует внимания</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <Card>
            <SectionTitle icon={<AlertTriangle size={13} />}>Просроченные дедлайны проектов</SectionTitle>
            {overdue.length === 0
              ? <p style={{ color: "#62646b", fontSize: 13, margin: 0 }}>Всё в срок</p>
              : overdue.map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ color: "#f8a3a3", fontSize: 13, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ color: "#62646b", fontSize: 11, flexShrink: 0, marginLeft: 8 }}>{fmtD(p.deadline)}</span>
                </div>
              ))}
          </Card>
          <MyTasksCard data={myT} />
        </div>
      </motion.div>

      {/* ЗОНА: Финансы */}
      <motion.div variants={itemVariants}>
        <p style={ZONE_TITLE("#e8c860")}>💰 Финансы · за выбранный период</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
          <Card>
            <SectionTitle icon={<TrendingUp size={13} />}>Доходы и расходы</SectionTitle>
            {series.some(m => m.inc > 0 || m.exp > 0)
              ? <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={series} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#62646b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#62646b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}к` : v} />
                    <Tooltip contentStyle={tt} itemStyle={{ color: "#fafaf7" }} formatter={(v, n) => [fmt(v), n === "inc" ? "Доходы" : "Расходы"]} />
                    <Bar dataKey="inc" name="inc" fill="#d4af37" radius={[5, 5, 0, 0]} />
                    <Bar dataKey="exp" name="exp" fill="#f8a3a3" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              : <Empty text="Нет финансовых записей за период" />}
          </Card>
          <CashflowCard series={series} tt={tt} />
          <ExpenseByCategoryCard data={expCats} tt={tt} />
        </div>
        <ReceivablesCard data={debt} />
      </motion.div>

      {/* ЗОНА: Проекты */}
      <motion.div variants={itemVariants}>
        <p style={ZONE_TITLE("#93c5fd")}>📁 Проекты</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <Card>
            <SectionTitle icon={<BarChart3 size={13} />}>Проекты по стадиям</SectionTitle>
            {stageData.length > 0
              ? <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={stageData} cx="50%" cy="50%" innerRadius={56} outerRadius={84} dataKey="value" paddingAngle={3}
                      onClick={(e) => onDrillStage && e && e.name && onDrillStage(e.name)} style={{ cursor: onDrillStage ? "pointer" : "default" }}>
                      {stageData.map((e, i) => <Cell key={i} fill={e.fill} stroke="transparent" />)}
                    </Pie>
                    <Tooltip contentStyle={tt} itemStyle={{ color: "#fafaf7" }} formatter={(v, n) => [`${v} проектов`, n]} />
                    <Legend iconType="circle" iconSize={8} formatter={v => <span style={{ fontSize: 10, color: "#9b9ca4" }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              : <Empty text="Добавь первый проект" />}
          </Card>
          <Card>
            <SectionTitle icon={<Calendar size={13} />}>Ближайшие дедлайны</SectionTitle>
            {upcoming.length === 0
              ? <p style={{ color: "#62646b", fontSize: 13, margin: 0 }}>Нет запланированных дедлайнов</p>
              : upcoming.map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ color: "#f7f8f8", fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ color: "#e8c860", fontSize: 11, flexShrink: 0, marginLeft: 8 }}>{fmtD(p.deadline)}</span>
                </div>
              ))}
          </Card>
        </div>
      </motion.div>

    </motion.div>
  );
}

// Заголовок зоны дашборда
const ZONE_TITLE = (color) => ({
  fontSize: 11, fontWeight: 600, color, letterSpacing: "0.08em",
  margin: "0 0 10px", textTransform: "uppercase",
});
```

Этот блок **полностью заменяет** старое тело `Dashboard`, включая старый блок «Финансы текущего месяца» (он удаляется).

- [ ] **Step 3: Обновить вызов `<Dashboard>` (~7183)**

Заменить:
```jsx
            {tab === "dashboard" && <Dashboard projects={projects} txs={txs} clients={clients} profile={profile} />}
```
на:
```jsx
            {tab === "dashboard" && <Dashboard projects={projects} txs={txs} tasks={tasks} profile={profile} onDrillStage={(stage) => { setPendingStageFilter(stage); setTab("projects"); }} />}
```

- [ ] **Step 4: Проверить сборку**

Run: `npm run build`
Expected: зелёная сборка. Если ошибка `Unexpected end of file` — проверить парность тегов в JSX (известная грабля при правке JSX).

- [ ] **Step 5: Прогнать тесты (регрессия расчётов)**

Run: `npm run test`
Expected: PASS — все тесты dashboardMetrics зелёные.

- [ ] **Step 6: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add src/App.jsx
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m "feat(6.5): переработка Dashboard — зоны, период, дебиторка, задачи, drill-down"
```

---

## Task 11: Финальная верификация и ручная проверка

**Files:** нет правок кода (только проверки; мелкие фиксы — при необходимости отдельными коммитами).

- [ ] **Step 1: Полная проверка сборки и тестов**

Run: `npm run test`
Expected: PASS (все функции расчётов).
Run: `npm run build`
Expected: зелёная сборка, ассет `dist/assets/index-*.js` создан.

- [ ] **Step 2: Локальный прогон (опционально, по желанию владельца)**

Run: `npm run preview`
Открыть локальный URL, проверить по чек-листу критериев приёмки (см. ниже).

- [ ] **Step 3: Чек-лист критериев приёмки (из спека, ручная проверка)**

Пройти и отметить:
- [ ] Период-пилюли переключают только финансовую зону + KPI-баланс; дедлайны/задачи/пирог/дебиторка стабильны.
- [ ] Дебиторка = Σ остатков по не-архивным с остатком > 0; список отсортирован по убыванию.
- [ ] Расходы по категориям соответствуют данным `txs` за период.
- [ ] Накопительный баланс отражает кумулятивную сумму.
- [ ] «Мои задачи» приходят, делятся на просрочено/сегодня; счётчики верны.
- [ ] Drill-down: клик по KPI «Активных» → «Проекты» с фильтром «Активные»; клик по сектору пирога → «Проекты» с этой стадией.
- [ ] Мобильная раскладка (DevTools ≤640px): зоны и карточки стекаются, ничего не уезжает за край.
- [ ] Старого блока «Финансы месяца» нет; дублирования метрик нет.

- [ ] **Step 4: Деплой на прод (по явному согласию владельца)**

> ВАЖНО: деплой — внешнее действие, выполнять только после явного «деплой».

Run (PowerShell): `npm run build`
Затем: `wsl -d Ubuntu -u root -- bash /mnt/f/*/redesign-v2-fresh/deploy/nextcloud/deploy-web.sh`
Проверить публичный адрес с **внешнего устройства** (hairpin с самой машины даёт 000). iOS PWA — холодный перезапуск после деплоя.

- [ ] **Step 5: Финальный коммит-заметка (если были мелкие фиксы)**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* add -A
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* commit -m "chore(6.5): фиксы по итогам ручной проверки"
```

- [ ] **Step 6: Merge feature/6.5-dashboard → main (по явному согласию владельца)**

Не выполнять автоматически. Когда владелец подтвердит — слить ветку в main (merge-коммит) и при необходимости запушить с обходом прокси (`$env:HTTPS_PROXY=""` + `git -c http.proxy=""`).

---

## Заметки по реализации

- **Иконки** (`FolderKanban`, `Briefcase`, `BadgeCheck`, `Wallet`, `BarChart3`, `TrendingUp`, `AlertTriangle`, `Calendar`) уже импортированы из `lucide-react` (используются в текущем Dashboard).
- **recharts** (`ResponsiveContainer`, `PieChart`, `Pie`, `Cell`, `BarChart`, `Bar`, `LineChart`, `Line`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`) уже импортированы (App.jsx:28–31).
- **`fmt`** — существующий хелпер форматирования валюты в `App.jsx` (используется в текущем Dashboard).
- **Drill-down по пирогу:** recharts `Pie onClick` отдаёт объект сектора с полем `name` (имя стадии). Если в конкретной версии recharts payload отличается — взять стадию из `e?.name ?? e?.payload?.name`.
- **Инлайн-стили + media-queries не работают** — мобильную адаптацию держим на `repeat(auto-fit, minmax(...))` (уже так) и `useIsMobile` при необходимости; CSS media в `style` не использовать.
- **Гранулярность** — при бедных данных ряд может быть «рваным»; это приемлемо. Не усложнять преждевременно.

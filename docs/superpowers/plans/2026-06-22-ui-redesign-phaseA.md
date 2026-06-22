# UI-редизайн — Фаза A (фундамент) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans / subagent-driven-development.
> Steps use checkbox (`- [ ]`) syntax.

**Goal:** Поднять визуальную базу до premium-dark: золотой aurora + dotted-grid фон, frosted-glass шапка,
hover-glow карточек, дисциплина reduced-motion — преимущественно через глобальный `index.css`, минимум правок монолита.

**Architecture:** Фундамент кладём в `src/index.css` (фон через `body::before/::after`, keyframes, reduced-motion,
классы hover-glow) — это НЕ трогает App.jsx. Точечная правка App.jsx — только frosted-glass на главную sticky-шапку.

**Tech Stack:** React+Vite, глобальный CSS (`src/index.css`), framer-motion (есть), Geist (есть).

**Спек:** `docs/superpowers/specs/2026-06-22-ui-redesign-premium-dark-design.md` (Фаза A из §10).

## Global Constraints

- **Уже в `index.css`:** переменные палитры (`--gold #d4af37`, `--bg-base #0a0a0a`, статусы), `.glass-card`,
  `.gold-card`, keyframes `shimmer/fade-in/modal-enter/gold-pulse`, готовый `.skeleton`, золотой скроллбар.
  НЕ дублировать — переиспользовать переменные.
- **Aurora — ТОЛЬКО золотое** (решение владельца), приглушённое (`opacity ≤ .12`).
- **Motion-дисциплина:** `prefers-reduced-motion` отключает декор; только `transform/opacity`; blur ограниченно.
- **Среда:** App.jsx правим через C-копию (Write на C → `Copy-Item C→F` ретраи) — диск F: сбоит на fsync;
  `index.css` небольшой — Write на F: с ретраями ОК. git с Windows-стороны. Применение/деплой — по слову «деплой».

## File Structure

- Modify: `src/index.css` — фон (dotted+золотое aurora+виньетка) + `@keyframes aurora-drift` + `prefers-reduced-motion`
  блок + `.kp-hover-glow` класс + `#root` z-index.
- Modify: `src/App.jsx` — frosted-glass на главную sticky-шапку (≈8348 обёртка / top-bar внутри).

---

## Task A1: Глобальный фон + motion-дисциплина (index.css)

**Files:**
- Modify: `src/index.css` (добавить в конец файла, после `.spring-press`).

**Interfaces:**
- Produces: золотой aurora + dotted-grid фон (глобально, под всем контентом); класс `.kp-hover-glow`;
  reduced-motion гейт. App.jsx не трогается.

- [ ] **Step 1: Добавить в конец `src/index.css`**

```css
/* ──────────────────────────────────────────────────────────────────────────
   PREMIUM-DARK РЕДИЗАЙН (2026-06-22): фон + motion-дисциплина
   ────────────────────────────────────────────────────────────────────────── */

/* Контент над фоновыми слоями */
#root { position: relative; z-index: 1; }

/* Dotted-grid — тонкая точечная сетка по всему фону */
body::before {
  content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 22px 22px;
}

/* Золотое aurora-свечение (только золото, приглушённое, медленный дрейф) */
body::after {
  content: ""; position: fixed; z-index: 0; pointer-events: none;
  width: 540px; height: 540px; top: -150px; left: -110px; border-radius: 50%;
  background: var(--gold); filter: blur(120px); opacity: 0.10;
  animation: aurora-drift 26s ease-in-out infinite;
}
@keyframes aurora-drift {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(90px, 70px); }
}

/* Карточка с премиальным hover: подъём + золотистая слоёная тень */
.kp-hover-glow {
  transition: transform 0.18s cubic-bezier(.2,.7,.3,1), box-shadow 0.18s, border-color 0.18s;
}
.kp-hover-glow:hover {
  transform: translateY(-4px);
  border-color: var(--border-gold);
  box-shadow: 0 16px 40px rgba(0,0,0,0.5), 0 0 28px -6px var(--gold-glow);
}

/* Motion-дисциплина: уважать prefers-reduced-motion (отключить декор-анимации) */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
  .kp-hover-glow:hover { transform: none; }
}
```

- [ ] **Step 2: Build**

Run: `wsl -d Ubuntu -u root -- bash -c "cd /mnt/f/*/redesign-v2-fresh && npm run build 2>&1 | tail -4"`
Expected: зелёная сборка.

- [ ] **Step 3: Визуальная проверка (headless Edge скриншот текущего прод-кода + локально)**

Поскольку прод ещё на старом бандле, проверка визуала — после деплоя. На этапе разработки достаточно build-зелёного
(CSS не ломает сборку). Финальная визуальная сверка — скриншотом после применения (Edge headless на собранный dist
или на проде после деплоя).

- [ ] **Step 4: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* -c core.fsyncMethod=writeout-only add src/index.css
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* -c core.fsyncMethod=writeout-only commit -m "feat(ui): глобальный фон (золотое aurora + dotted) + hover-glow + reduced-motion"
```

---

## Task A2: Frosted-glass sticky-шапка (App.jsx)

**Files:**
- Modify: `src/App.jsx` — главная sticky-шапка (≈8348 обёртка `position:sticky,top:0,zIndex:50` + top-bar внутри).

**Interfaces:**
- Consumes: ничего нового.
- Produces: остеклённая шапка (backdrop-blur + полупрозрачный фон + saturation).

ВАЖНО (грабля из NotificationBell.jsx): `backdrop-filter` на sticky-шапке создаёт stacking context — панель
уведомлений УЖЕ вынесена в `createPortal(document.body)`, поэтому не пострадает. После правки ОБЯЗАТЕЛЬНО
проверить: панель колокольчика открывается поверх шапки (десктоп + мобильный).

- [ ] **Step 1: Найти фон главной top-bar**

Прочитать App.jsx ≈8343-8420 (шапка после `position:"sticky",top:0,zIndex:50`): top-bar имеет фон (вероятно
`#1c1c1a`/`var(--bg-higher)`). Это место остекляем.

- [ ] **Step 2: Применить frosted-glass** (правка через C-копию)

Заменить непрозрачный фон top-bar на:
```js
background: "rgba(20,20,20,0.72)",
backdropFilter: "blur(14px) saturate(1.4)",
WebkitBackdropFilter: "blur(14px) saturate(1.4)",
borderBottom: "1px solid var(--border-subtle)",
```
(сохранить существующие `position/top/zIndex/padding/display`; заменить только `background` + добавить blur/border).

- [ ] **Step 3: Build** → зелёная.

- [ ] **Step 4: Проверить панель уведомлений** (после деплоя/preview): колокольчик → панель поверх шапки, не
  обрезается (десктоп + моб). Если backdrop-filter сломал наслоение — повысить z-index панели или оставить шапку
  без blur (fallback: полупрозрачный фон без backdrop-filter).

- [ ] **Step 5: Commit**

```
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* -c core.fsyncMethod=writeout-only add src/App.jsx
git -C "F:\Сайт\redesign-v2-fresh" -c safe.directory=* -c core.fsyncMethod=writeout-only commit -m "feat(ui): frosted-glass sticky-шапка"
```

---

## Фаза деплоя (по слову «деплой»)

`npm run build` → `deploy/nextcloud/deploy-web.sh` → merge `feature/ui-redesign`→main → push → сброс PWA-кэша.
Визуальная сверка: золотое aurora-свечение + dotted фон + остеклённая шапка; reduced-motion (DevTools) гасит дрейф.
**NB:** фазы B (SpotlightCard/CountUp/MagneticButton/Reveal) и C (Cmd+K) — отдельные планы, бОльшая часть «вау».

## Self-Review

**Spec coverage (Фаза A):** §5 фон (dotted+золотое aurora+виньетка→aurora покрывает; виньетку опустил как YAGNI,
dotted+aurora достаточно) → A1; §6 frosted-шапка + слоёные тени (hover-glow класс) → A1+A2; §3 reduced-motion → A1.
Skeleton — УЖЕ есть в index.css (`.skeleton`), отдельная задача не нужна. theme.js JS-токены — перенесены в Фазу B
(там их используют компоненты). **Placeholder scan:** A1 код полный; A2 frosted-стиль полный, точная вставка по
якорю (фон top-bar) на реализации. **Consistency:** переиспользуются существующие переменные `--gold/--gold-glow/
--border-gold/--bg-higher`; класс `.kp-hover-glow` единый.

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, FolderKanban, Wallet, BarChart3,
  Plus, Pencil, Trash2, X, Check, Calendar, AlertTriangle,
  CheckCircle2, Clock, FileText, Package, LogOut,
  FolderInput, Cloud, User, Users, Hourglass, Inbox,
  ChevronRight, Eye, Sparkles, TrendingUp, TrendingDown,
  ScissorsLineDashed, ArrowDownToLine, Search, Filter,
  CircleAlert, Coffee, ShoppingCart, Pill, Music,
  Briefcase, Receipt, BadgeCheck, Loader2, Mail,
  Phone, Send, ExternalLink,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LineChart, Line,
  ResponsiveContainer
} from "recharts";

// ════════════════════════════════════════════════════════════════════════════
// SUPABASE: ПОДКЛЮЧЕНИЕ
// ════════════════════════════════════════════════════════════════════════════
// В обычном веб-приложении (в отличие от артефактов Claude) библиотека
// Supabase подключается как стандартный npm-пакет — мы импортируем функцию
// createClient вверху файла, и сразу создаём один клиент на всё приложение.
// Никаких CDN-загрузок, никаких сетевых ограничений песочницы.
//
// Адрес проекта и ключ берутся из переменных окружения. Они задаются
// один раз на стороне Vercel в разделе Environment Variables, и Vite
// автоматически подставляет их в код во время сборки.
// ----------------------------------------------------------------------------
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // Если переменные не заданы — не имеет смысла пытаться запустить
  // приложение. Лучше сразу бросить понятную ошибку, чем разбираться
  // с непонятными "Load failed" в работе.
  throw new Error(
    "Не заданы переменные окружения VITE_SUPABASE_URL и VITE_SUPABASE_KEY. " +
    "Проверь файл .env (локально) или Environment Variables на Vercel."
  );
}

// Один клиент на всё приложение (singleton). Supabase сам кеширует токен
// авторизации в localStorage и автоматически продлевает его перед истечением.
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// ════════════════════════════════════════════════════════════════════════════
// CONSTANTS — справочники проекта
// ════════════════════════════════════════════════════════════════════════════
const PROJECT_STAGES = [
  "Переговоры","КП выслано","Договор подписан",
  "В работе","Сдан заказчику","Оплачен","Архив"
];
const PROJECT_TYPES = [
  "ОВиК","Слаботочка","BIM","Исполнительная документация",
  "Электрика","ВК","Прочее"
];
const INCOME_CATS = [
  "Зарплата К-7","Проектирование","Исполнительная документация",
  "Консультация","Прочий доход"
];
const EXPENSE_CATS = [
  "Жильё / аренда","Транспорт","Такси","Питание","Кофе",
  "Здоровье / аптека","Обучение / курсы","ПО и инструменты",
  "Связь","Развлечения","Кредит / займы","Табак",
  "Римма","Родители","Прочие расходы"
];

const STAGE_META = {
  "Переговоры":       { color:"#6b6b67", progress:10  },
  "КП выслано":       { color:"#93c5fd", progress:25  },
  "Договор подписан": { color:"#d4af37", progress:40  },
  "В работе":         { color:"#d4af37", progress:65  },
  "Сдан заказчику":   { color:"#6ee7a8", progress:85  },
  "Оплачен":          { color:"#6ee7a8", progress:100 },
  "Архив":            { color:"#1c1c1a", progress:100 },
};

const PALETTE = ["#d4af37","#d4af37","#f59e0b","#6ee7a8","#f8a3a3","#8b5cf6","#ec4899","#f97316"];

// Старые ключи window.storage — для попытки автоматического переноса данных
// из предыдущей версии артефакта на этапе миграции
const LEGACY_KEY_PROJECTS = "dash2_projects";
const LEGACY_KEY_TXS      = "dash2_txs";

// ════════════════════════════════════════════════════════════════════════════
// UTILS — мелкие хелперы
// ════════════════════════════════════════════════════════════════════════════
const fmt      = n  => new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(+n||0);
const fmtD     = d  => d ? new Date(d+"T00:00:00").toLocaleDateString("ru-RU") : "—";
const todayStr = () => new Date().toISOString().slice(0,10);

// ════════════════════════════════════════════════════════════════════════════
// FIELD MAPPING — переводчик между БД (snake_case) и JS UI (camelCase)
// ════════════════════════════════════════════════════════════════════════════
// Принцип: компоненты UI продолжают работать с теми же именами полей, что и
// раньше (contractSum, paidAmount, startDate). База использует snake_case
// согласно SQL-конвенции. Эти функции — переходные адаптеры между мирами.
// ----------------------------------------------------------------------------

function projectDbToJs(row) {
  return {
    id:             row.id,
    name:           row.name || "",
    client:         row.client || "",
    executor:       row.executor || "",
    type:           row.type || "ОВиК",
    stage:          row.stage || "Переговоры",
    startDate:      row.start_date || "",
    deadline:       row.deadline || "",
    contractSum:    row.contract_sum != null ? Number(row.contract_sum) : 0,
    paidAmount:     row.paid_amount  != null ? Number(row.paid_amount)  : 0,
    notes:          row.notes || "",
    visibility:     row.visibility || "private",
    ownerId:        row.owner_id,
    // Новые поля v1.2 — ссылки на материалы и контакты заказчика
    // links хранится в БД как JSONB-массив объектов вида [{title, url}, ...]
    links:          Array.isArray(row.links) ? row.links : [],
    clientPhone:    row.client_phone || "",
    clientEmail:    row.client_email || "",
    clientTelegram: row.client_telegram || "",
  };
}

function projectJsToDb(p, ownerId) {
  // Возвращаем только поля для записи в БД — без id (его генерирует БД при insert)
  return {
    name:             p.name || "Без названия",
    client:           p.client || null,
    executor:         p.executor || null,
    type:             p.type || null,
    stage:            p.stage || "Переговоры",
    start_date:       p.startDate || null,
    deadline:         p.deadline || null,
    contract_sum:     parseFloat(p.contractSum) || 0,
    paid_amount:      parseFloat(p.paidAmount)  || 0,
    notes:            p.notes || null,
    visibility:       p.visibility || "private",
    owner_id:         ownerId,
    // Новые поля v1.2. Фильтруем links — оставляем только записи с непустым URL,
    // и нормализуем к строгой структуре {title, url}.
    links: (Array.isArray(p.links) ? p.links : [])
      .filter(l => l && l.url && l.url.trim())
      .map(l => ({
        title: (l.title || "").trim() || "Ссылка",
        url:   l.url.trim(),
      })),
    client_phone:     p.clientPhone ? p.clientPhone.trim() : null,
    client_email:     p.clientEmail ? p.clientEmail.trim() : null,
    client_telegram:  p.clientTelegram ? p.clientTelegram.trim().replace(/^@/, "") : null,
  };
}

function txDbToJs(row) {
  return {
    id:          row.id,
    date:        row.date,
    type:        row.type,
    category:    row.category,
    amount:      Number(row.amount) || 0,
    description: row.description || "",
    ownerId:     row.owner_id,
  };
}

function txJsToDb(t, ownerId) {
  return {
    date:        t.date || todayStr(),
    type:        t.type === "income" ? "income" : "expense",
    category:    t.category || "Прочие расходы",
    amount:      parseFloat(t.amount) || 0,
    description: t.description || null,
    owner_id:    ownerId,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// DATA OPERATIONS — обёртки над Supabase API
// ════════════════════════════════════════════════════════════════════════════
// Все запросы к БД централизованы здесь. Если Supabase когда-то изменит API
// или мы захотим заменить бэкенд — менять придётся только этот блок.
// ----------------------------------------------------------------------------

async function fetchProjects(client) {
  const { data, error } = await client
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(projectDbToJs);
}

async function fetchTransactions(client) {
  const { data, error } = await client
    .from("transactions")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw error;
  return (data || []).map(txDbToJs);
}

async function insertProject(client, project, ownerId) {
  const dbObj = projectJsToDb(project, ownerId);
  const { data, error } = await client
    .from("projects")
    .insert(dbObj)
    .select()
    .single();
  if (error) throw error;
  return projectDbToJs(data);
}

async function updateProject(client, id, project, ownerId) {
  const dbObj = projectJsToDb(project, ownerId);
  const { data, error } = await client
    .from("projects")
    .update(dbObj)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return projectDbToJs(data);
}

async function deleteProjectDb(client, id) {
  const { error } = await client.from("projects").delete().eq("id", id);
  if (error) throw error;
}

async function insertTransaction(client, tx, ownerId) {
  const dbObj = txJsToDb(tx, ownerId);
  const { data, error } = await client
    .from("transactions")
    .insert(dbObj)
    .select()
    .single();
  if (error) throw error;
  return txDbToJs(data);
}

async function insertTransactionsBulk(client, txs, ownerId) {
  // Для импорта банковских выписок и миграции — пакетная вставка
  if (!txs.length) return [];
  const dbRows = txs.map(t => txJsToDb(t, ownerId));
  const { data, error } = await client
    .from("transactions")
    .insert(dbRows)
    .select();
  if (error) throw error;
  return (data || []).map(txDbToJs);
}

async function insertProjectsBulk(client, projects, ownerId) {
  if (!projects.length) return [];
  const dbRows = projects.map(p => projectJsToDb(p, ownerId));
  const { data, error } = await client
    .from("projects")
    .insert(dbRows)
    .select();
  if (error) throw error;
  return (data || []).map(projectDbToJs);
}

async function updateTransaction(client, id, tx, ownerId) {
  const dbObj = txJsToDb(tx, ownerId);
  const { data, error } = await client
    .from("transactions")
    .update(dbObj)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return txDbToJs(data);
}

async function deleteTransactionDb(client, id) {
  const { error } = await client.from("transactions").delete().eq("id", id);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════════════════
// AUTH — обёртки над supabase.auth и проверка профиля
// ════════════════════════════════════════════════════════════════════════════

async function fetchProfile(client, userId) {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

async function signInWithPassword(client, email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signUpWithPassword(client, email, password) {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function signOut(client) {
  await client.auth.signOut();
}

// Перевод стандартных ошибок Supabase в дружелюбные русские сообщения
function translateAuthError(err) {
  const msg = (err?.message || "").toLowerCase();
  if (msg.includes("invalid login credentials"))     return "Неверный email или пароль";
  if (msg.includes("email not confirmed"))           return "Email не подтверждён — проверь почту";
  if (msg.includes("user already registered"))       return "Пользователь с таким email уже существует";
  if (msg.includes("password should be at least"))   return "Пароль слишком короткий (минимум 6 символов)";
  if (msg.includes("invalid email"))                 return "Неверный формат email";
  if (msg.includes("rate limit"))                    return "Слишком много попыток. Подожди минуту";
  if (msg.includes("network") || msg.includes("fetch")) return "Нет связи с сервером. Проверь интернет";
  return err?.message || "Произошла ошибка";
}

// ════════════════════════════════════════════════════════════════════════════
// STYLED INPUTS — обновлённые под новую цветовую палитру Linear-стиля
// ════════════════════════════════════════════════════════════════════════════
// Используем инлайн-стили, потому что Tailwind не перебивает -webkit-text-fill-color.
// Это свойство — единственный надёжный способ сделать текст белым в iOS Safari.
const BASE_INPUT = {
  background: "#0a0b11",
  color: "#f7f8f8",
  WebkitTextFillColor: "#f7f8f8",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  width: "100%",
  outline: "none",
  boxSizing: "border-box",
  colorScheme: "dark",
  transition: "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
  fontFamily: "inherit",
};

function StyledInput(props) {
  const [focused, setFocused] = useState(false);
  const { style = {}, ...rest } = props;
  return (
    <input
      {...rest}
      style={{
        ...BASE_INPUT,
        border: `1px solid ${focused ? "#d4af37" : "rgba(255,255,255,0.10)"}`,
        boxShadow: focused ? "0 0 0 3px rgba(212,175,55,0.18)" : "none",
        ...style,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}
function StyledSelect(props) {
  const [focused, setFocused] = useState(false);
  const { style = {}, ...rest } = props;
  return (
    <select
      {...rest}
      style={{
        ...BASE_INPUT,
        border: `1px solid ${focused ? "#d4af37" : "rgba(255,255,255,0.10)"}`,
        boxShadow: focused ? "0 0 0 3px rgba(212,175,55,0.18)" : "none",
        appearance: "none",
        cursor: "pointer",
        ...style,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}
function StyledTextarea(props) {
  const [focused, setFocused] = useState(false);
  const { style = {}, ...rest } = props;
  return (
    <textarea
      {...rest}
      style={{
        ...BASE_INPUT,
        border: `1px solid ${focused ? "#d4af37" : "rgba(255,255,255,0.10)"}`,
        boxShadow: focused ? "0 0 0 3px rgba(212,175,55,0.18)" : "none",
        resize: "vertical",
        ...style,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ANIMATED NUMBER — компонент плавно прокручивающихся цифр
// ════════════════════════════════════════════════════════════════════════════
// Принимает целевое значение и опциональную функцию форматирования.
// При первом монтировании или при изменении значения плавно анимирует
// от текущего отображаемого значения к новому за 700ms с easing-кривой
// easeOutCubic (быстрое начало, плавное замедление к концу).
//
// Это создаёт эффект "живых данных" — когда страница загружается,
// цифры не появляются мгновенно, а быстро прокручиваются от нуля
// до своего реального значения, как табло на бирже. Эффект занимает
// доли секунды, но создаёт ощущение пульсирующего инструмента.
function AnimatedNumber({ value, format, duration = 700 }) {
  const [display, setDisplay] = useState(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const startValue = prevValue.current;
    const endValue = Number(value) || 0;
    if (startValue === endValue) return;

    const startTime = Date.now();
    let rafId;
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      // easeOutCubic — быстрое начало, плавное замедление к концу
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(startValue + (endValue - startValue) * eased);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        prevValue.current = endValue;
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, duration]);

  return <>{format ? format(display) : Math.round(display)}</>;
}

// ════════════════════════════════════════════════════════════════════════════
// PRIMITIVE UI — базовые строительные блоки в новой эстетике
// ════════════════════════════════════════════════════════════════════════════
const BTN = {
  primary: "px-4 py-2 rounded-lg bg-[#d4af37] hover:bg-[#e8c860] text-[#0a0a0a] text-sm font-semibold transition-all duration-200 active:scale-[0.98]",
  ghost: "px-4 py-2 rounded-lg border border-white/10 text-[#9b9ca4] hover:text-white hover:border-white/20 text-sm font-medium transition-all duration-200 active:scale-[0.98]",
  danger: "px-2 py-1 rounded text-[#62646b] hover:text-[#f8a3a3] text-sm transition-colors duration-200",
  edit: "px-2 py-1 rounded text-[#62646b] hover:text-[#d4af37] text-sm transition-colors duration-200",
};

function Label({ children }) {
  return (
    <p style={{
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: "0.10em",
      color: "#62646b",
      marginBottom: 6,
      fontWeight: 600,
      margin: "0 0 6px 0",
    }}>{children}</p>
  );
}

function Field({ label, children, style = {} }) {
  return <div style={{ marginBottom: 14, ...style }}><Label>{label}</Label>{children}</div>;
}

// Базовая карточка — фон чуть светлее основного, тонкая граница, скруглённые углы
function Card({ children, style = {}, glass = false }) {
  if (glass) {
    return (
      <div
        className="glass-card"
        style={{ borderRadius: 14, padding: 18, ...style }}
      >
        {children}
      </div>
    );
  }
  return (
    <div style={{
      background: "#141414",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 14,
      padding: 18,
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ children, icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      {icon && <span style={{ color: "#62646b", display: "flex" }}>{icon}</span>}
      <p style={{
        fontSize: 11,
        fontWeight: 600,
        color: "#9b9ca4",
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        margin: 0,
      }}>{children}</p>
    </div>
  );
}

// Чип-фильтр — нажимная пилюля с активным состоянием в акцентном цвете
function Chip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        background: active ? "rgba(212,175,55,0.15)" : "rgba(255,255,255,0.04)",
        color: active ? "#e8c860" : "#9b9ca4",
        border: `1px solid ${active ? "rgba(212,175,55,0.30)" : "rgba(255,255,255,0.06)"}`,
        transition: "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        fontFamily: "inherit",
      }}
    >{label}</button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TOAST — уведомления с иконкой и пружинистой анимацией появления
// ────────────────────────────────────────────────────────────────────────────
function Toast({ visible, text, type = "success" }) {
  const config = {
    success: { color: "#6ee7a8", bg: "rgba(110,231,168,0.12)", border: "rgba(110,231,168,0.30)", Icon: CheckCircle2 },
    error:   { color: "#f8a3a3", bg: "rgba(248,163,163,0.12)",  border: "rgba(248,163,163,0.30)",  Icon: CircleAlert },
    info:    { color: "#d4af37", bg: "rgba(212,175,55,0.12)", border: "rgba(212,175,55,0.30)", Icon: Sparkles },
  };
  const { color, bg, border, Icon } = config[type] || config.success;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 200,
            background: "#1c1c1a",
            border: `1px solid ${border}`,
            color: "#f7f8f8",
            borderRadius: 12,
            padding: "10px 16px",
            fontSize: 13,
            fontWeight: 500,
            boxShadow: "0 16px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)",
            display: "flex", alignItems: "center", gap: 10,
            maxWidth: "calc(100vw - 48px)",
            backdropFilter: "blur(8px)",
          }}
        >
          <span style={{ background: bg, padding: 4, borderRadius: 6, display: "flex", color }}>
            <Icon size={14} strokeWidth={2.4} />
          </span>
          <span>{text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MODAL — модальное окно с анимацией масштабирования и затемнением фона
// ────────────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, maxWidth = 480, icon }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        style={{
          position: "fixed", inset: 0, zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16,
          background: "rgba(8,9,15,0.80)",
          backdropFilter: "blur(8px)",
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 4 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#1c1c1a",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 18,
            width: "100%",
            maxWidth,
            maxHeight: "90vh",
            overflowY: "auto",
            boxShadow: "0 24px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "16px 22px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {icon && <span style={{ color: "#e8c860", display: "flex" }}>{icon}</span>}
              <h3 style={{
                color: "#f7f8f8", fontWeight: 600, fontSize: 15, margin: 0,
                letterSpacing: "-0.01em",
              }}>{title}</h3>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "#9b9ca4",
                width: 30, height: 30,
                borderRadius: 8,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.18s",
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = "#f7f8f8"; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
              onMouseOut={(e) => { e.currentTarget.style.color = "#9b9ca4"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>
          <div style={{ padding: "20px 22px" }}>{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// KPI CARD — главная карточка показателя с эффектом стекла и анимацией числа
// ────────────────────────────────────────────────────────────────────────────
// Это самые важные элементы дашборда — четыре главные цифры на верху страницы.
// Поэтому они получают полную визуальную обработку: эффект стекла с лёгким
// размытием, мягкое свечение акцентным цветом по краю, иконка в подсвеченном
// квадрате слева, и плавная анимация числа при первом появлении.
function KpiCard({ label, value, sub, color = "#d4af37", Icon, format, trend }) {
  // Определяем формат отображения значения. Если передана функция format,
  // используем её. Если значение строка (например, "65%") — оставляем как есть.
  // Иначе округляем число до целого.
  const isString = typeof value === "string";

  return (
    <div className="glass-card" style={{ borderRadius: 14, padding: 16, position: "relative", overflow: "hidden" }}>
      {/* Тонкое цветное свечение в углу — акцент в цвет показателя */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -30, right: -30,
          width: 90, height: 90,
          background: `radial-gradient(circle, ${color}22 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "relative" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Label>{label}</Label>
          <div style={{
            fontSize: 18, fontWeight: 700,
            color: "#f7f8f8",
            marginTop: 6,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums",
          }}>
            {isString ? value : (
              format ? <AnimatedNumber value={value} format={format}/> : <AnimatedNumber value={value}/>
            )}
          </div>
          {sub && (
            <div style={{
              fontSize: 11, color: "#62646b", marginTop: 6,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              {trend === "up" && <TrendingUp size={11} style={{ color: "#6ee7a8" }}/>}
              {trend === "down" && <TrendingDown size={11} style={{ color: "#f8a3a3" }}/>}
              <span>{sub}</span>
            </div>
          )}
        </div>
        {Icon && (
          <div style={{
            background: `${color}1a`,
            border: `1px solid ${color}33`,
            padding: 8,
            borderRadius: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            flexShrink: 0,
          }}>
            <Icon size={16} strokeWidth={2} />
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// AUTH SCREEN — экран входа и регистрации
// ════════════════════════════════════════════════════════════════════════════
// Показывается до того как пользователь авторизовался. После входа
// проверяется флаг profile.approved — если false, выкидываем обратно сюда
// с соответствующим сообщением.
function AuthScreen({ onAuthenticated, onError }) {
  const [mode, setMode] = useState("signin");        // signin | signup | check_email
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError("Заполни email и пароль");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const client = supabase;
      if (mode === "signin") {
        const { user, session } = await signInWithPassword(client, email.trim(), password);
        if (!user || !session) throw new Error("Не удалось получить сессию");
        // Проверяем профиль и одобрение
        const profile = await fetchProfile(client, user.id);
        if (!profile.approved) {
          await signOut(client);
          throw new Error("Аккаунт ожидает одобрения администратором");
        }
        onAuthenticated(user, profile);
      } else {
        // Регистрация — Supabase отправит письмо для подтверждения
        await signUpWithPassword(client, email.trim(), password);
        setMode("check_email");
      }
    } catch (e) {
      setError(translateAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#f7f8f8",
      fontFamily: "'Geist Variable', system-ui, -apple-system, sans-serif",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Декоративный градиентный фон с эффектом размытия в углах */}
      <div aria-hidden style={{
        position: "absolute",
        top: -100, left: -100,
        width: 380, height: 380,
        background: "radial-gradient(circle, rgba(212,175,55,0.18) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      <div aria-hidden style={{
        position: "absolute",
        bottom: -100, right: -100,
        width: 380, height: 380,
        background: "radial-gradient(circle, rgba(212,175,55,0.10) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{ width: "100%", maxWidth: 380, position: "relative" }}
      >
        {/* Лого и подзаголовок */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            marginBottom: 8,
            background: "linear-gradient(135deg, #d4af37 0%, #e8c860 50%, #d4af37 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>ДАНИИЛ</div>
          <div style={{
            fontSize: 11,
            color: "#62646b",
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            fontWeight: 500,
          }}>
            Рабочий центр · Проекты · Финансы
          </div>
        </div>

        <div className="glass-card" style={{ borderRadius: 16, padding: 24 }}>
          {mode === "check_email" ? (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <div style={{
                width: 56, height: 56,
                borderRadius: 14,
                background: "rgba(212,175,55,0.15)",
                border: "1px solid rgba(212,175,55,0.30)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                color: "#e8c860",
              }}>
                <Mail size={28} strokeWidth={1.8} />
              </div>
              <div style={{
                fontSize: 17,
                fontWeight: 600,
                color: "#f7f8f8",
                marginBottom: 8,
                letterSpacing: "-0.02em",
              }}>
                Проверь почту
              </div>
              <p style={{ fontSize: 13, color: "#9b9ca4", marginBottom: 20, lineHeight: 1.55 }}>
                На <span style={{ color: "#e8c860", fontWeight: 500 }}>{email}</span> отправлено письмо
                с ссылкой для подтверждения. Перейди по ней, потом возвращайся
                и войди.
              </p>
              <button
                onClick={() => { setMode("signin"); setError(null); }}
                className={BTN.primary}
                style={{ width: "100%" }}
              >
                Назад ко входу
              </button>
            </div>
          ) : (
            <>
              <div style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#f7f8f8",
                marginBottom: 18,
                letterSpacing: "-0.01em",
              }}>
                {mode === "signin" ? "Вход в систему" : "Регистрация"}
              </div>

              <Field label="Email">
                <StyledInput
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>

              <Field label="Пароль">
                <StyledInput
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  onKeyDown={e => { if (e.key === "Enter") submit(); }}
                />
              </Field>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    background: "rgba(248,163,163,0.10)",
                    border: "1px solid rgba(248,163,163,0.30)",
                    color: "#f8a3a3",
                    padding: "9px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <CircleAlert size={14} strokeWidth={2.2} />
                  <span>{error}</span>
                </motion.div>
              )}

              <button
                onClick={submit}
                disabled={loading}
                className={BTN.primary}
                style={{
                  width: "100%",
                  opacity: loading ? 0.7 : 1,
                  marginBottom: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "10px 16px",
                }}
              >
                {loading
                  ? <><Loader2 size={14} className="animate-spin" strokeWidth={2.4} /> Подключаемся...</>
                  : (mode === "signin" ? "Войти" : "Зарегистрироваться")}
              </button>

              <div style={{ textAlign: "center", fontSize: 12, color: "#62646b" }}>
                {mode === "signin" ? (
                  <>Нет аккаунта?{" "}
                    <button
                      onClick={() => { setMode("signup"); setError(null); }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#e8c860",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 500,
                        padding: 0,
                        fontFamily: "inherit",
                      }}
                    >Зарегистрироваться</button>
                  </>
                ) : (
                  <>Уже есть аккаунт?{" "}
                    <button
                      onClick={() => { setMode("signin"); setError(null); }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#e8c860",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 500,
                        padding: 0,
                        fontFamily: "inherit",
                      }}
                    >Войти</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <p style={{
          textAlign: "center",
          fontSize: 10,
          color: "#3a3c44",
          marginTop: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}>
          <Cloud size={11} strokeWidth={2.2} />
          Данные хранятся в защищённой БД Supabase (Frankfurt)
        </p>
      </motion.div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PROJECT FORM
// ════════════════════════════════════════════════════════════════════════════
function ProjectForm({ initial, onSave, onClose, saving }) {
  const [f, setF] = useState(initial || {
    name: "", client: "", executor: "", type: "ОВиК", stage: "Переговоры",
    startDate: todayStr(), deadline: "", contractSum: "", paidAmount: "", notes: "",
    visibility: "private",
    // Новые поля v1.2 — список ссылок на материалы и контактные данные заказчика
    links: [],
    clientPhone: "", clientEmail: "", clientTelegram: "",
  });
  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  // Управление списком ссылок: добавление пустой записи, удаление по индексу,
  // редактирование отдельных полей конкретной записи
  const addLink = () => {
    setF(p => ({ ...p, links: [...(p.links || []), { title: "", url: "" }] }));
  };
  const removeLink = (idx) => {
    setF(p => ({ ...p, links: (p.links || []).filter((_, i) => i !== idx) }));
  };
  const updateLink = (idx, key, value) => {
    setF(p => ({
      ...p,
      links: (p.links || []).map((l, i) => i === idx ? { ...l, [key]: value } : l),
    }));
  };

  return (
    <div>
      <Field label="Название проекта">
        <StyledInput value={f.name} onChange={e => s("name", e.target.value)}
          placeholder="Н-р: ОВиК Жилой дом пер. Строителей" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div><Label>Заказчик / Клиент</Label>
          <StyledInput value={f.client} onChange={e => s("client", e.target.value)} /></div>
        <div><Label>Исполнитель</Label>
          <StyledInput value={f.executor} onChange={e => s("executor", e.target.value)}
            placeholder="Н-р: Даниил, Субподряд" /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <Label>Тип работ</Label>
          <StyledSelect value={f.type} onChange={e => s("type", e.target.value)}>
            {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
          </StyledSelect>
        </div>
        <div>
          <Label>Стадия</Label>
          <StyledSelect value={f.stage} onChange={e => s("stage", e.target.value)}>
            {PROJECT_STAGES.map(t => <option key={t}>{t}</option>)}
          </StyledSelect>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div><Label>Дата начала</Label>
          <StyledInput type="date" value={f.startDate} onChange={e => s("startDate", e.target.value)} /></div>
        <div><Label>Дедлайн</Label>
          <StyledInput type="date" value={f.deadline} onChange={e => s("deadline", e.target.value)} /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div><Label>Сумма договора (₽)</Label>
          <StyledInput type="number" value={f.contractSum} onChange={e => s("contractSum", e.target.value)} placeholder="0" /></div>
        <div><Label>Оплачено факт (₽)</Label>
          <StyledInput type="number" value={f.paidAmount} onChange={e => s("paidAmount", e.target.value)} placeholder="0" /></div>
      </div>

      {/* ═══ НОВАЯ СЕКЦИЯ: Контакты заказчика ═══ */}
      <div style={{
        marginTop: 18, marginBottom: 14,
        padding: "12px 14px",
        background: "rgba(212,175,55,0.04)",
        border: "1px solid rgba(212,175,55,0.12)",
        borderRadius: 10,
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 11, fontWeight: 600, color: "#d4af37",
          textTransform: "uppercase", letterSpacing: "0.10em",
          marginBottom: 12,
        }}>
          <User size={12} strokeWidth={2.4} />
          Контакты заказчика
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <Label>Телефон</Label>
            <StyledInput
              type="tel"
              value={f.clientPhone}
              onChange={e => s("clientPhone", e.target.value)}
              placeholder="+7 999 123-45-67"
            />
          </div>
          <div>
            <Label>Email</Label>
            <StyledInput
              type="email"
              value={f.clientEmail}
              onChange={e => s("clientEmail", e.target.value)}
              placeholder="client@example.com"
            />
          </div>
        </div>
        <div>
          <Label>Telegram (без @)</Label>
          <StyledInput
            value={f.clientTelegram}
            onChange={e => s("clientTelegram", e.target.value)}
            placeholder="username"
          />
        </div>
      </div>

      {/* ═══ НОВАЯ СЕКЦИЯ: Ссылки на материалы ═══ */}
      <div style={{
        marginBottom: 14,
        padding: "12px 14px",
        background: "rgba(212,175,55,0.04)",
        border: "1px solid rgba(212,175,55,0.12)",
        borderRadius: 10,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 10,
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11, fontWeight: 600, color: "#d4af37",
            textTransform: "uppercase", letterSpacing: "0.10em",
          }}>
            <FolderInput size={12} strokeWidth={2.4} />
            Ссылки на материалы
          </div>
          <button
            type="button"
            onClick={addLink}
            style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 7, cursor: "pointer", fontWeight: 500,
              background: "rgba(212,175,55,0.12)",
              border: "1px solid rgba(212,175,55,0.30)",
              color: "#d4af37",
              display: "flex", alignItems: "center", gap: 4,
              fontFamily: "inherit",
            }}
          >
            <Plus size={11} strokeWidth={2.4} /> Добавить
          </button>
        </div>
        {(f.links || []).length === 0 ? (
          <div style={{
            fontSize: 11, color: "#6b6b67", textAlign: "center",
            padding: "10px 0", fontStyle: "italic",
          }}>
            Yandex Disk, Google Drive, чертежи в облаке, переписки в Telegram...
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(f.links || []).map((link, idx) => (
              <div
                key={idx}
                style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 28px", gap: 6, alignItems: "center" }}
              >
                <StyledInput
                  value={link.title || ""}
                  onChange={e => updateLink(idx, "title", e.target.value)}
                  placeholder="Подпись"
                  style={{ fontSize: 12, padding: "6px 10px" }}
                />
                <StyledInput
                  value={link.url || ""}
                  onChange={e => updateLink(idx, "url", e.target.value)}
                  placeholder="https://..."
                  style={{ fontSize: 12, padding: "6px 10px" }}
                />
                <button
                  type="button"
                  onClick={() => removeLink(idx)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#6b6b67",
                    cursor: "pointer",
                    padding: 4,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "color 0.18s",
                  }}
                  onMouseOver={e => e.currentTarget.style.color = "#f8a3a3"}
                  onMouseOut={e => e.currentTarget.style.color = "#6b6b67"}
                  title="Удалить ссылку"
                >
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Field label="Видимость">
        <StyledSelect value={f.visibility} onChange={e => s("visibility", e.target.value)}>
          <option value="private">Личный (только я)</option>
          <option value="team">Командный (видят все одобренные)</option>
        </StyledSelect>
      </Field>
      <Field label="Примечания">
        <StyledTextarea rows={2} value={f.notes} onChange={e => s("notes", e.target.value)} />
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button onClick={onClose} className={BTN.ghost} style={{ flex: 1 }} disabled={saving}>Отмена</button>
        <button onClick={() => onSave(f)} className={BTN.primary} style={{ flex: 2, opacity: saving ? 0.6 : 1 }} disabled={saving}>
          {saving ? "Сохраняем..." : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TRANSACTION FORM
// ════════════════════════════════════════════════════════════════════════════
function TxForm({ initial, onSave, onClose, saving }) {
  const [f, setF] = useState(initial || {
    date:todayStr(),type:"income",category:"Проектирование",amount:"",description:""
  });
  const s = (k,v) => setF(p=>({...p,[k]:v}));
  const cats = f.type==="income" ? INCOME_CATS : EXPENSE_CATS;

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div><Label>Дата</Label>
          <StyledInput type="date" value={f.date} onChange={e=>s("date",e.target.value)}/></div>
        <div><Label>Тип</Label>
          <StyledSelect value={f.type} onChange={e=>{
            const v=e.target.value; s("type",v);
            s("category",v==="income"?INCOME_CATS[0]:EXPENSE_CATS[0]);
          }}>
            <option value="income">Доход</option>
            <option value="expense">Расход</option>
          </StyledSelect>
        </div>
      </div>
      <Field label="Категория">
        <StyledSelect value={f.category} onChange={e=>s("category",e.target.value)}>
          {cats.map(c=><option key={c}>{c}</option>)}
        </StyledSelect>
      </Field>
      <Field label="Сумма (₽)">
        <StyledInput type="number" value={f.amount} onChange={e=>s("amount",e.target.value)} placeholder="0"/>
      </Field>
      <Field label="Описание / комментарий">
        <StyledInput value={f.description} onChange={e=>s("description",e.target.value)}/>
      </Field>
      <div style={{display:"flex",gap:10,marginTop:4}}>
        <button onClick={onClose} className={BTN.ghost} style={{flex:1}} disabled={saving}>Отмена</button>
        <button onClick={()=>onSave(f)} className={BTN.primary} style={{flex:2,opacity:saving?0.6:1}} disabled={saving}>
          {saving?"Сохраняем...":"Сохранить"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DASHBOARD — главная страница с KPI и графиками
// ════════════════════════════════════════════════════════════════════════════
function Dashboard({ projects, txs }) {
  const active = projects.filter(p => !["Оплачен", "Архив"].includes(p.stage));
  const portfolio = projects.filter(p => p.stage !== "Архив");
  const totalContract = portfolio.reduce((s, p) => s + (+p.contractSum || 0), 0);
  const totalPaid = portfolio.reduce((s, p) => s + (+p.paidAmount || 0), 0);

  const now = new Date();
  const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const mTxs = txs.filter(t => t.date.startsWith(mk));
  const mIncome = mTxs.filter(t => t.type === "income").reduce((s, t) => s + (+t.amount || 0), 0);
  const mExpense = mTxs.filter(t => t.type === "expense").reduce((s, t) => s + (+t.amount || 0), 0);

  // Сравнение с прошлым месяцем для индикатора тренда
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMk = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const prevTxs = txs.filter(t => t.date.startsWith(prevMk));
  const prevIncome = prevTxs.filter(t => t.type === "income").reduce((s, t) => s + (+t.amount || 0), 0);
  const prevExpense = prevTxs.filter(t => t.type === "expense").reduce((s, t) => s + (+t.amount || 0), 0);
  const prevBalance = prevIncome - prevExpense;
  const curBalance = mIncome - mExpense;
  const balanceTrend = prevBalance === 0 ? null : (curBalance > prevBalance ? "up" : "down");

  const stageData = PROJECT_STAGES.slice(0, -1)
    .map(s => ({ name: s, value: projects.filter(p => p.stage === s).length, fill: STAGE_META[s].color }))
    .filter(d => d.value > 0);

  const months6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const inc = txs.filter(t => t.type === "income" && t.date.startsWith(k)).reduce((s, t) => s + (+t.amount || 0), 0);
    const exp = txs.filter(t => t.type === "expense" && t.date.startsWith(k)).reduce((s, t) => s + (+t.amount || 0), 0);
    return { label: d.toLocaleDateString("ru-RU", { month: "short" }), inc, exp };
  });

  const todayS = todayStr();
  const overdue = active.filter(p => p.deadline && p.deadline < todayS && p.stage !== "Сдан заказчику");
  const upcoming = active.filter(p => p.deadline && p.deadline >= todayS)
    .sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 4);

  // Тёмная стилизация для всплывающих подсказок графиков
  const tt = {
    background: "#1c1c1a",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 10,
    fontSize: 12,
    color: "#f7f8f8",
    boxShadow: "0 12px 28px rgba(0,0,0,0.5)",
    padding: "8px 12px",
  };

  // Каскадная анимация появления — каждый элемент появляется со своей задержкой
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
  };

  return (
    <motion.div
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Главные KPI — четыре стеклянные карточки */}
      <motion.div variants={itemVariants} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KpiCard
          label="Активных проектов"
          value={active.length}
          Icon={FolderKanban}
          color="#d4af37"
          sub={`всего: ${projects.length}`}
        />
        <KpiCard
          label="Портфель"
          value={totalContract}
          Icon={Briefcase}
          color="#d4af37"
          format={fmt}
        />
        <KpiCard
          label="Получено"
          value={totalPaid}
          Icon={BadgeCheck}
          color="#6ee7a8"
          format={fmt}
          sub={`осталось: ${fmt(totalContract - totalPaid)}`}
        />
        <KpiCard
          label="Баланс месяца"
          value={curBalance}
          Icon={Wallet}
          color={curBalance >= 0 ? "#6ee7a8" : "#f8a3a3"}
          format={fmt}
          sub={`доходы ${fmt(mIncome)}`}
          trend={balanceTrend}
        />
      </motion.div>

      {/* Два графика рядом */}
      <motion.div variants={itemVariants} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <SectionTitle icon={<BarChart3 size={13} />}>Проекты по стадиям</SectionTitle>
          {stageData.length > 0
            ? <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={stageData} cx="50%" cy="50%" innerRadius={56} outerRadius={84} dataKey="value" paddingAngle={3}>
                  {stageData.map((e, i) => <Cell key={i} fill={e.fill} stroke="transparent" />)}
                </Pie>
                <Tooltip contentStyle={tt} formatter={(v, n) => [`${v} проектов`, n]} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={v => <span style={{ fontSize: 10, color: "#9b9ca4" }}>{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
            : <Empty text="Добавь первый проект" />}
        </Card>
        <Card>
          <SectionTitle icon={<TrendingUp size={13} />}>Доходы и расходы — 6 мес.</SectionTitle>
          {months6.some(m => m.inc > 0 || m.exp > 0)
            ? <ResponsiveContainer width="100%" height={210}>
              <BarChart data={months6} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#62646b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#62646b", fontSize: 10 }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}к` : v} />
                <Tooltip contentStyle={tt} formatter={(v, n) => [fmt(v), n === "inc" ? "Доходы" : "Расходы"]} />
                <Bar dataKey="inc" name="inc" fill="#d4af37" radius={[5, 5, 0, 0]} />
                <Bar dataKey="exp" name="exp" fill="#f8a3a3" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            : <Empty text="Добавь первые финансовые записи" />}
        </Card>
      </motion.div>

      {/* Дедлайны: просроченные и предстоящие */}
      <motion.div variants={itemVariants} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <SectionTitle icon={<AlertTriangle size={13} />}>Просроченные дедлайны</SectionTitle>
          {overdue.length === 0
            ? <p style={{ color: "#62646b", fontSize: 13, margin: 0 }}>Всё в срок</p>
            : overdue.map(p => (
              <div key={p.id} style={{
                display: "flex", justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}>
                <span style={{
                  color: "#f8a3a3", fontSize: 13, fontWeight: 500, flex: 1,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{p.name}</span>
                <span style={{ color: "#62646b", fontSize: 11, flexShrink: 0, marginLeft: 8 }}>{fmtD(p.deadline)}</span>
              </div>
            ))}
        </Card>
        <Card>
          <SectionTitle icon={<Calendar size={13} />}>Ближайшие дедлайны</SectionTitle>
          {upcoming.length === 0
            ? <p style={{ color: "#62646b", fontSize: 13, margin: 0 }}>Нет запланированных дедлайнов</p>
            : upcoming.map(p => (
              <div key={p.id} style={{
                display: "flex", justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}>
                <span style={{
                  color: "#f7f8f8", fontSize: 13, flex: 1,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{p.name}</span>
                <span style={{ color: "#e8c860", fontSize: 11, flexShrink: 0, marginLeft: 8 }}>{fmtD(p.deadline)}</span>
              </div>
            ))}
        </Card>
      </motion.div>

      {/* Финансы текущего месяца с прогресс-баром */}
      <motion.div variants={itemVariants}>
        <Card>
          <SectionTitle icon={<Wallet size={13} />}>Финансы текущего месяца</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[
              { label: "Доходы", val: mIncome, color: "#e8c860" },
              { label: "Расходы", val: mExpense, color: "#f8a3a3" },
              { label: "Баланс", val: curBalance, color: curBalance >= 0 ? "#6ee7a8" : "#f8a3a3" },
            ].map(r => (
              <div key={r.label}>
                <Label>{r.label}</Label>
                <div style={{
                  fontSize: 18, fontWeight: 700,
                  color: r.color, marginTop: 6,
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                }}>{fmt(r.val)}</div>
              </div>
            ))}
          </div>
          {mIncome > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                fontSize: 11, color: "#62646b", marginBottom: 6,
              }}>
                <span>Расходы от доходов</span>
                <span>{Math.min(100, Math.round(mExpense / mIncome * 100))}%</span>
              </div>
              <div style={{
                height: 6, background: "rgba(255,255,255,0.06)",
                borderRadius: 3, overflow: "hidden",
              }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, mExpense / mIncome * 100)}%` }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                  style={{
                    height: "100%",
                    background: "linear-gradient(90deg, #d4af37, #e8c860)",
                    borderRadius: 3,
                  }}
                />
              </div>
            </div>
          )}
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PROJECTS — список + CRUD через Supabase
// ════════════════════════════════════════════════════════════════════════════
function Projects({ projects, setProjects, client, ownerId, showToast }) {
  const [modal, setModal]             = useState(null);
  const [stageFilter, setStageFilter] = useState("Все");
  const [confirmDel, setConfirmDel]   = useState(null);
  const [saving, setSaving]           = useState(false);

  const saveProject = async (form) => {
    setSaving(true);
    try {
      if (modal === "add") {
        const created = await insertProject(client, form, ownerId);
        setProjects(prev => [created, ...prev]);
        showToast("✓ Проект создан");
      } else {
        const updated = await updateProject(client, modal.id, form, ownerId);
        setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
        showToast("✓ Проект обновлён");
      }
      setModal(null);
    } catch (e) {
      showToast("Ошибка: " + (e.message || "не удалось сохранить"), "error");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (confirmDel !== id) { setConfirmDel(id); return; }
    try {
      await deleteProjectDb(client, id);
      setProjects(prev => prev.filter(p=>p.id!==id));
      showToast("Проект удалён");
    } catch (e) {
      showToast("Ошибка удаления: " + (e.message || ""), "error");
    } finally {
      setConfirmDel(null);
    }
  };

  const visible = stageFilter==="Все" ? projects : projects.filter(p=>p.stage===stageFilter);
  const todayS  = todayStr();

  return (
    <div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:20,alignItems:"center"}}>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,flex:1}}>
          {["Все",...PROJECT_STAGES].map(s=>(
            <Chip key={s}
              label={`${s}${s==="Все"?` (${projects.length})`:projects.filter(p=>p.stage===s).length>0?` (${projects.filter(p=>p.stage===s).length})`:""}`}
              active={stageFilter===s} onClick={()=>setStageFilter(s)}/>
          ))}
        </div>
        <button onClick={()=>setModal("add")} className={BTN.primary}>+ Новый проект</button>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {visible.length===0
          ? <Empty text={stageFilter==="Все"?"Нет проектов — нажми «Новый проект»":`Нет проектов со стадией «${stageFilter}»`}/>
          : visible.map(p=>{
            const meta = STAGE_META[p.stage]||{color:"#d4af37",progress:0};
            const isAwaitingPayment = p.stage==="Сдан заказчику";
            const isOverdue = p.deadline&&p.deadline<todayS&&!["Оплачен","Архив","Сдан заказчику"].includes(p.stage);
            const paid = +p.paidAmount||0;
            const contract = +p.contractSum||0;
            return (
              <div key={p.id} style={{background:"#141414",border:"1px solid #141414",borderRadius:16,padding:16}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{color:"white",fontWeight:700,fontSize:15}}>{p.name}</span>
                      <span style={{fontSize:11,padding:"2px 10px",borderRadius:20,fontWeight:600,
                        background:meta.color+"22",color:meta.color}}>{p.stage}</span>
                      {p.visibility==="team" && <span style={{fontSize:10,padding:"1px 6px",borderRadius:10,
                        background:"#d4af3722",color:"#d4af37",fontWeight:600}}>👥 команда</span>}
                      {isAwaitingPayment&&<span style={{fontSize:11,color:"#d4af37",fontWeight:600}}>⏳ Ожидает оплаты</span>}
                      {isOverdue&&<span style={{fontSize:11,color:"#f8a3a3",fontWeight:600}}>⚠ Просрочен</span>}
                    </div>
                    <div style={{fontSize:13,color:"#a8a8a3",marginBottom:10,display:"flex",flexWrap:"wrap",alignItems:"center",gap:"2px 0"}}>
                      {p.client&&<span>{p.client}</span>}
                      {p.client&&p.type&&<span style={{margin:"0 6px",color:"#1c1c1a"}}>·</span>}
                      <span style={{color:"#e8c860",fontWeight:600}}>{p.type}</span>
                      {p.executor&&<><span style={{margin:"0 6px",color:"#1c1c1a"}}>·</span>
                      <span style={{color:"#d4af37"}}>👤 {p.executor}</span></>}
                    </div>
                    <div style={{height:4,background:"#141414",borderRadius:2,overflow:"hidden",marginBottom:10}}>
                      <div style={{height:"100%",borderRadius:2,background:meta.color,
                        width:`${meta.progress}%`,transition:"width 0.5s"}}/>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:"4px 20px",fontSize:12}}>
                      {contract>0&&<span style={{color:"#a8a8a3"}}>Договор: <span style={{color:"#fafaf7",fontWeight:600}}>{fmt(contract)}</span></span>}
                      {paid>0&&<span style={{color:"#a8a8a3"}}>Оплачено: <span style={{color:"#6ee7a8",fontWeight:600}}>{fmt(paid)}</span></span>}
                      {contract>0&&paid>0&&<span style={{color:"#a8a8a3"}}>Остаток: <span style={{color:"#d4af37",fontWeight:600}}>{fmt(contract-paid)}</span></span>}
                      {p.deadline&&<span style={{color:"#a8a8a3"}}>Дедлайн: <span style={{color:isOverdue?"#f8a3a3":"#fafaf7",fontWeight:isOverdue?600:400}}>{fmtD(p.deadline)}</span></span>}
                    </div>
                    {contract>0&&paid>0&&(
                      <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
                        <div style={{flex:1,height:3,background:"#141414",borderRadius:2,overflow:"hidden"}}>
                          <div style={{height:"100%",background:"#6ee7a8",borderRadius:2,
                            width:`${Math.min(100,paid/contract*100)}%`}}/>
                        </div>
                        <span style={{fontSize:10,color:"#6b6b67"}}>{Math.round(paid/contract*100)}%</span>
                      </div>
                    )}
                    {/* ═══ КОНТАКТЫ ЗАКАЗЧИКА ═══
                        Показываются как маленькие кликабельные иконки. Каждая
                        открывает соответствующее приложение через спец-протокол:
                        tel: для звонка, mailto: для письма, t.me для Telegram. */}
                    {(p.clientPhone || p.clientEmail || p.clientTelegram) && (
                      <div style={{
                        display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10,
                      }}>
                        {p.clientPhone && (
                          <a
                            href={`tel:${p.clientPhone.replace(/\s+/g, "")}`}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              padding: "4px 10px", borderRadius: 6,
                              background: "rgba(212,175,55,0.06)",
                              border: "1px solid rgba(212,175,55,0.20)",
                              color: "#d4af37",
                              fontSize: 11, fontWeight: 500,
                              textDecoration: "none",
                              transition: "all 0.18s",
                            }}
                            onClick={e => e.stopPropagation()}
                            onMouseOver={e => {
                              e.currentTarget.style.background = "rgba(212,175,55,0.12)";
                              e.currentTarget.style.color = "#e8c860";
                            }}
                            onMouseOut={e => {
                              e.currentTarget.style.background = "rgba(212,175,55,0.06)";
                              e.currentTarget.style.color = "#d4af37";
                            }}
                            title={`Позвонить ${p.clientPhone}`}
                          >
                            <Phone size={11} strokeWidth={2.2} />
                            {p.clientPhone}
                          </a>
                        )}
                        {p.clientEmail && (
                          <a
                            href={`mailto:${p.clientEmail}`}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              padding: "4px 10px", borderRadius: 6,
                              background: "rgba(212,175,55,0.06)",
                              border: "1px solid rgba(212,175,55,0.20)",
                              color: "#d4af37",
                              fontSize: 11, fontWeight: 500,
                              textDecoration: "none",
                              transition: "all 0.18s",
                            }}
                            onClick={e => e.stopPropagation()}
                            onMouseOver={e => {
                              e.currentTarget.style.background = "rgba(212,175,55,0.12)";
                              e.currentTarget.style.color = "#e8c860";
                            }}
                            onMouseOut={e => {
                              e.currentTarget.style.background = "rgba(212,175,55,0.06)";
                              e.currentTarget.style.color = "#d4af37";
                            }}
                            title={`Написать на ${p.clientEmail}`}
                          >
                            <Mail size={11} strokeWidth={2.2} />
                            {p.clientEmail}
                          </a>
                        )}
                        {p.clientTelegram && (
                          <a
                            href={`https://t.me/${p.clientTelegram.replace(/^@/, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              padding: "4px 10px", borderRadius: 6,
                              background: "rgba(212,175,55,0.06)",
                              border: "1px solid rgba(212,175,55,0.20)",
                              color: "#d4af37",
                              fontSize: 11, fontWeight: 500,
                              textDecoration: "none",
                              transition: "all 0.18s",
                            }}
                            onClick={e => e.stopPropagation()}
                            onMouseOver={e => {
                              e.currentTarget.style.background = "rgba(212,175,55,0.12)";
                              e.currentTarget.style.color = "#e8c860";
                            }}
                            onMouseOut={e => {
                              e.currentTarget.style.background = "rgba(212,175,55,0.06)";
                              e.currentTarget.style.color = "#d4af37";
                            }}
                            title={`Открыть Telegram @${p.clientTelegram}`}
                          >
                            <Send size={11} strokeWidth={2.2} />
                            @{p.clientTelegram.replace(/^@/, "")}
                          </a>
                        )}
                      </div>
                    )}
                    {/* ═══ ССЫЛКИ НА МАТЕРИАЛЫ ═══
                        Кликабельные кнопки с подписями, открываются в новой вкладке.
                        Иконка облака маркирует их как внешние ссылки. */}
                    {Array.isArray(p.links) && p.links.length > 0 && (
                      <div style={{
                        display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8,
                      }}>
                        {p.links.map((link, idx) => (
                          <a
                            key={idx}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              padding: "4px 10px", borderRadius: 6,
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.10)",
                              color: "#a8a8a3",
                              fontSize: 11, fontWeight: 500,
                              textDecoration: "none",
                              transition: "all 0.18s",
                              maxWidth: 240,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            onClick={e => e.stopPropagation()}
                            onMouseOver={e => {
                              e.currentTarget.style.background = "rgba(212,175,55,0.10)";
                              e.currentTarget.style.borderColor = "rgba(212,175,55,0.30)";
                              e.currentTarget.style.color = "#d4af37";
                            }}
                            onMouseOut={e => {
                              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                              e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
                              e.currentTarget.style.color = "#a8a8a3";
                            }}
                            title={link.url}
                          >
                            <ExternalLink size={11} strokeWidth={2.2} />
                            {link.title || "Ссылка"}
                          </a>
                        ))}
                      </div>
                    )}
                    {p.notes&&<p style={{margin:"10px 0 0",fontSize:11,color:"#6b6b67",fontStyle:"italic"}}>{p.notes}</p>}
                  </div>
                  <div style={{display:"flex",gap:4,flexShrink:0}}>
                    <button onClick={()=>setModal(p)} className={BTN.edit}>✏️</button>
                    <button onClick={()=>{if(confirmDel===p.id){del(p.id);}else{setConfirmDel(p.id);}}}
                      style={{
                        padding:"4px 8px",borderRadius:6,border:"none",cursor:"pointer",
                        fontSize:12,fontWeight:700,transition:"all .15s",
                        background:confirmDel===p.id?"#f8a3a333":"transparent",
                        color:confirmDel===p.id?"#f8a3a3":"#6b6b67",
                      }}
                      onBlur={()=>setConfirmDel(null)}
                      title={confirmDel===p.id?"Нажми ещё раз чтобы удалить":"Удалить проект"}
                    >{confirmDel===p.id?"✓?":"🗑️"}</button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {modal&&(
        <Modal title={modal==="add"?"Новый проект":"Редактировать проект"} onClose={()=>!saving&&setModal(null)}>
          <ProjectForm initial={modal==="add"?null:modal} onSave={saveProject} onClose={()=>setModal(null)} saving={saving}/>
        </Modal>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CSV / PDF IMPORT — автокатегоризация и парсеры банков (без изменений)
// ════════════════════════════════════════════════════════════════════════════
const CAT_RULES = [
  { cat:"Такси", keys:[
    "yandex*4121*taxi","yandex*4121*uber","yandex*4111*go_transpo",
    "yandex7299*go_berizar","yandex*7299*go_berizar",
    "яндекс го","yandex go","yango","uber","bolt","такси","taxi",
    "ситимобил","maxim","indrive","indriver","яндекс такси","yandex taxi",
  ]},
  { cat:"Транспорт", keys:[
    "mos.transport","mostransport","mos. transport",
    "yandex*4111*troyka","troyka","тройка","strelkacard","strelka",
    "cppk","цппк","centralnaya ppk","ao centralnaya ppk",
    "petrovsko-razumov","petrovskorazumovskaya",
    "aeroexpress","аэроэкспресс","rzd","ржд",
    "tutu.ru","tutu ru","tpp_st_avtolajn",
    "метро","metro","мцд","трамвай","троллейбус","мосгортранс","автобус",
  ]},
  { cat:"Кофе", keys:[
    "onepricecoffe","cofix","po kofeyku","po kofejku","sp_kofejnya",
    "kofejnya","kofein","kote kafe","street coffee","_kofejnya",
    "b1 maypo","coffeeshop",
  ]},
  { cat:"Питание", keys:[
    "vernyj 1300","vernyj","верный",
    "pyaterochka","пятёрочка","пятерочка",
    "magnit","магнит","perekrestok","перекрёсток","перекресток",
    "vkusvill","вкусвилл","dixy","дикси","spar","спар","lenta","лента",
    "auchan","ашан","окей","okej","глобус","globus",
    "krasnoe&beloe","krasnoe beloe","красное белое",
    "winelab","produkty","продукты","mikromarket",
    "yandex*5411*lavka","yandex*5814*eda","lavka","лавка",
    "delivery club","самокат","сбермаркет","азбука вкуса",
    "суши","sushi","пицца","pizza","burger","бургер","burger king",
    "mcdonalds","kfc","вкусно","dodo","додо","шоколадница","якитория",
    "subway","ebidoebi","doner market","шаурма","giro","girogiros",
    "qsr 29098","gastrokolledzh","mealty","столовая","ресторан","кафе",
    "pekarnya","evo_pekarnya","хлеб","пекарня","sunduk","tapper",
    "fix price","fixprice","spar 329","fix price 8090","fixprice 8090",
    "od verkhnie kotly","verkhnie kotly","rest june","микромаркет",
    "pizzasushiwok","donermkt",
  ]},
  { cat:"Здоровье / аптека", keys:[
    "gorzdrav","горздрав","36,6","36.6","aptechnoe","аптека","apteka",
    "rigla","ригла","pharmacy","зоомагазин","chetyre lap","zoomagazin",
    "четыре лапы","antistress","ulybka radugi","улыбка радуги",
  ]},
  { cat:"Развлечения", keys:[
    "mori sinema","mori_sinema","синема","cinema","кино",
    "tslounge","lounge","duplet","бильярд","bowling","боулинг",
    "playerok","ggsel","pay4game","starsbus","onlypay",
    "ckassa","yp_kleekstore","onlypei","nrp","диалог восток",
  ]},
  { cat:"Кредит / займы", keys:[
    "погашение процентов","погашение основного долга",
    "погашение кредита","гашение долга",
  ]},
  { cat:"Табак", keys:[
    "evo_tabak","tabak 4","tabak","dym par","вейп","vape",
  ]},
  { cat:"ПО и инструменты", keys:[
    "yandex*5815*plus","yandex*5815","яндекс плюс","yandex plus",
    "кинопоиск","kinopoisk","okko","иви","яндекс музыка","яндекс 360",
    "google","apple","microsoft","adobe","jetbrains","notion","figma",
    "github","spotify","netflix","youtube premium","autodesk","revit",
    "telegram premium","discord nitro","chatgpt","openai","canva",
    "kaspersky","dr.web","vseinstrumenti","все инструменты",
  ]},
  { cat:"Связь", keys:[
    "yota_no3ds","yota","йота","мтс","мегафон","билайн",
    "tele2","теле2","ростелеком","beeline",
  ]},
  { cat:"Жильё / аренда", keys:[
    "жкх","квитанция","аренда","управляющая","тсж",
    "водоканал","мосэнерго","газпром","коммунал","еирц",
  ]},
  { cat:"Римма",    keys:["римма романовна","римма"] },
  { cat:"Родители", keys:["владимир васильевич е","елена александровна е","родители"] },
  { cat:"Прочий доход", keys:[
    "капитализация","начисление процентов","кэшбэк","cashback",
    "возврат средств","отмена оплаты","внесение наличных","входящий перевод",
  ]},
];

function guessCategory(description, type = "expense") {
  const d = (description||"").toLowerCase();
  for (const rule of CAT_RULES) {
    if (!rule.keys.length) continue;
    if (rule.keys.some(k => d.includes(k))) {
      if (rule.cat === "Прочий доход" && type === "expense") continue;
      return rule.cat;
    }
  }
  return type === "income" ? "Прочий доход" : "Прочие расходы";
}

function parseTinkoff(rows) {
  const result = [];
  for (const row of rows) {
    if (!row[0] || row[0]==="Дата операции") continue;
    const dateRaw = row[0];
    const parts = dateRaw.split(".");
    if (parts.length < 3) continue;
    const date = `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
    const amountRaw = (row[4]||"").replace(",",".").replace(/\s/g,"");
    const amount = parseFloat(amountRaw);
    if (isNaN(amount) || amount === 0) continue;
    const type    = amount < 0 ? "expense" : "income";
    const abs     = Math.abs(amount);
    const desc    = row[11] || row[8] || "";
    const bankCat = row[9] || "";
    result.push({ date, type, amount:abs, description:desc, bankCategory:bankCat });
  }
  return result;
}

function parseSber(rows) {
  const result = [];
  for (const row of rows) {
    if (!row[0] || row[0]==="Дата") continue;
    const dateRaw = row[0];
    let date = dateRaw;
    if (dateRaw.includes(".")) {
      const p = dateRaw.split(".");
      date = `${p[2]}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`;
    }
    const desc      = row[2]||"";
    const expRaw    = (row[3]||"").replace(",",".").replace(/\s/g,"");
    const incRaw    = (row[4]||"").replace(",",".").replace(/\s/g,"");
    const exp       = parseFloat(expRaw)||0;
    const inc       = parseFloat(incRaw)||0;
    if (exp > 0) result.push({ date, type:"expense", amount:exp, description:desc, bankCategory:"" });
    if (inc > 0) result.push({ date, type:"income",  amount:inc, description:desc, bankCategory:"" });
  }
  return result;
}

function parseAlfa(rows) {
  const result = [];
  for (const row of rows) {
    if (!row[0] || row[0]==="Дата") continue;
    const dateRaw = row[0];
    let date = dateRaw;
    if (dateRaw.includes(".")) {
      const p = dateRaw.split(".");
      date = p.length===3 ? `${p[2]}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}` : dateRaw;
    }
    const desc = row[1]||"";
    const raw  = (row[2]||"").replace(",",".").replace(/\s/g,"");
    const amt  = parseFloat(raw);
    if (isNaN(amt)||amt===0) continue;
    result.push({ date, type:amt<0?"expense":"income", amount:Math.abs(amt), description:desc, bankCategory:"" });
  }
  return result;
}

function parseYandex(rows) {
  const result = [];
  for (const row of rows) {
    if (!row[0] || /дата|date/i.test(row[0])) continue;
    const dateRaw = row[0].trim();
    let date = dateRaw;
    if (dateRaw.includes(".")) {
      const p = dateRaw.split(".");
      date = p.length===3
        ? `${p[2].slice(0,4)}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`
        : dateRaw;
    } else if (dateRaw.includes("T")) {
      date = dateRaw.slice(0,10);
    }
    let amount = 0, desc = "", bankCat = "";
    if (row.length >= 4) {
      desc    = row[1]||"";
      bankCat = row[2]||"";
      const raw = (row[3]||"").replace(/\s/g,"").replace(",",".");
      amount  = parseFloat(raw);
    }
    if (isNaN(amount) || amount===0) {
      desc   = row[1]||"";
      const raw = (row[2]||"").replace(/\s/g,"").replace(",",".");
      amount = parseFloat(raw);
      bankCat = "";
    }
    if (isNaN(amount) || amount===0) continue;
    const type = amount < 0 ? "expense" : "income";
    result.push({ date, type, amount:Math.abs(amount), description:desc, bankCategory:bankCat });
  }
  return result;
}

function detectBank(headers) {
  const h = headers.join(";").toLowerCase();
  if (h.includes("дата операции") && h.includes("mcc"))           return "tinkoff";
  if (h.includes("описание") && h.includes("расход") && h.includes("приход")) return "sber";
  if (h.includes("описание операции"))                             return "alfa";
  if (h.includes("яндекс") || h.includes("yandex"))               return "yandex";
  if (/дата|date/i.test(headers[0]) && headers.length >= 3)       return "yandex";
  return "unknown";
}

function parseCSV(text) {
  const sep    = text.includes(";") ? ";" : ",";
  const lines  = text.split(/\r?\n/).filter(l => l.trim());
  const rows   = lines.map(l => l.split(sep).map(c => c.replace(/^"|"$/g,"").trim()));
  if (rows.length < 2) return { bank:"unknown", items:[] };
  const bank   = detectBank(rows[0]);
  let items    = [];
  if      (bank === "tinkoff") items = parseTinkoff(rows.slice(1));
  else if (bank === "sber")    items = parseSber(rows.slice(1));
  else if (bank === "alfa")    items = parseAlfa(rows.slice(1));
  else if (bank === "yandex")  items = parseYandex(rows.slice(1));
  else                         items = parseYandex(rows.slice(1));
  return { bank, items };
}

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      res(window.pdfjsLib);
    };
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function parsePdfYandex(file) {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const allItems = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    const vp      = page.getViewport({ scale: 1 });
    for (const item of content.items) {
      const text = item.str.trim();
      if (!text) continue;
      allItems.push({
        text,
        x: Math.round(item.transform[4]),
        y: Math.round((vp.height - item.transform[5]) + (p - 1) * 10000),
      });
    }
  }

  allItems.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);

  const rows = [];
  let curRow = [], lastY = null;
  for (const item of allItems) {
    if (lastY === null || Math.abs(item.y - lastY) <= 8) {
      curRow.push(item);
      lastY = item.y;
    } else {
      if (curRow.length) rows.push([...curRow]);
      curRow = [item];
      lastY = item.y;
    }
  }
  if (curRow.length) rows.push(curRow);

  const SKIP_RE = /входящий остаток|исходящий остаток|итого списаний|итого зачислений|всего расходных|всего приходных|страница \d|продолжение|выписка по договору|номер счёта|описание операции|сумма в валюте|дата.*мск|с уважением|начальник|ао «яндекс банк»|ао «яндекс/i;
  const DATE_RE = /(\d{2}\.\d{2}\.\d{4})/;
  const AMT_RE_ALL = /([+–\-]\s*[\d\s]+,\d{2})\s*₽/g;

  const analyzed = rows.map(row => {
    const fullText = row.map(i => i.text).join(" ");
    const dateM     = fullText.match(DATE_RE);
    const amtAll    = [...fullText.matchAll(AMT_RE_ALL)];
    const lastAmt   = amtAll.length > 0 ? amtAll[amtAll.length - 1] : null;
    const minX      = Math.min(...row.map(i => i.x));
    return { fullText, dateM, lastAmt, minX, skip: SKIP_RE.test(fullText) };
  });

  const transactions = [];
  let i = 0;
  while (i < analyzed.length) {
    const ar = analyzed[i];
    if (ar.skip) { i++; continue; }

    if (ar.dateM && ar.lastAmt) {
      const dp = ar.dateM[1].split(".");
      const date = `${dp[2]}-${dp[1].padStart(2,"0")}-${dp[0].padStart(2,"0")}`;

      const amtStr = ar.lastAmt[1]
        .replace(/\s/g,"").replace(",",".").replace("–","-").replace("−","-");
      const amount = parseFloat(amtStr);
      if (isNaN(amount) || amount === 0) { i++; continue; }

      let desc = ar.fullText
        .replace(/\d{2}\.\d{2}\.\d{4}/g, "")
        .replace(/[+–\-]\s*[\d\s]+,\d{2}\s*₽/g, "")
        .replace(/в\s+\d{2}:\d{2}/g, "")
        .replace(/\*\d{4}/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();

      let j = i + 1;
      while (j < analyzed.length && j < i + 5) {
        const next = analyzed[j];
        if (next.skip || next.dateM || next.lastAmt) break;
        if (next.minX < 250) {
          desc = (desc + " " + next.fullText).replace(/\s{2,}/g," ").trim();
        }
        j++;
      }

      transactions.push({
        date,
        type:        amount < 0 ? "expense" : "income",
        amount:      Math.abs(amount),
        description: desc,
        bankCategory: "",
      });
    }
    i++;
  }
  return transactions;
}

// ════════════════════════════════════════════════════════════════════════════
// CSV IMPORT MODAL — без изменений в UI, только handleImport теперь bulk-insert
// ════════════════════════════════════════════════════════════════════════════
function CsvImportModal({ onClose, onImport }) {
  const [step, setStep]       = useState("upload");
  const [bank, setBank]       = useState("");
  const [parsed, setParsed]   = useState([]);
  const [edited, setEdited]   = useState([]);
  const [importing, setImporting] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const fileRef = useRef();

  const BANK_LABELS = { tinkoff:"Тинькофф", sber:"Сбербанк", alfa:"Альфа-банк", yandex:"Яндекс Пэй / Яндекс Банк", unknown:"Определяется..." };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
      setPdfLoading(true);
      try {
        const items = await parsePdfYandex(file);
        setBank("yandex");
        const enriched = items.map((item, i) => ({
          ...item, id:i,
          category:guessCategory(item.description, item.type),
          skip: /перевод между счетами одного клиента/i.test(item.description||""),
        }));
        setParsed(enriched);
        setEdited(enriched);
        setStep("preview");
      } catch(err) {
        console.error(err);
      } finally { setPdfLoading(false); }
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target.result;
      const { bank: b, items } = parseCSV(text);
      setBank(b);
      const enriched = items.map((item, i) => ({
        ...item, id:i,
        category:guessCategory(item.description, item.type),
        skip: /перевод между счетами одного клиента/i.test(item.description||""),
      }));
      setParsed(enriched);
      setEdited(enriched);
      setStep("preview");
    };
    reader.readAsText(file, "windows-1251");
  };

  const toggleSkip  = (id) => setEdited(e => e.map(r => r.id===id ? {...r, skip:!r.skip} : r));
  const changeCat   = (id, cat) => setEdited(e => e.map(r => r.id===id ? {...r, category:cat} : r));
  const changeType  = (id, type) => setEdited(e => e.map(r => r.id===id ? {...r, type} : r));
  const changeDesc  = (id, desc) => setEdited(e => e.map(r => r.id===id ? {...r, description:desc} : r));

  const cleanDesc = (raw) => {
    let s = (raw||"");
    s = s.replace(/^Оплата товаров и услуг\s+/i, "");
    s = s.replace(/^Оплата СБП QR\s*/i, "");
    s = s.replace(/^Оплата Сбер\s+[A-Za-zА-Яа-яЁё]+\s+/i, "");
    s = s.replace(/^Исходящий перевод СБП,?\s*/i, "");
    s = s.replace(/^Входящий перевод СБП,?\s*/i, "");
    s = s.replace(/^Перевод между счетами одного клиента\s*/i, "Внутренний перевод");
    s = s.replace(/^Погашение\s+/i, "Кредит: ");
    s = s.replace(/^Внесение наличных в банкомате\s*/i, "Пополнение наличными");
    s = s.replace(/^Возврат средств\s+/i, "Возврат: ");
    s = s.replace(/\+7[\d\s\-()+]{9,}/g, "");
    s = s.replace(/\d{2}\.\d{2}\.\d{4}/g, "");
    s = s.replace(/в\s+\d{2}:\d{2}/g, "");
    s = s.replace(/\*\d{4}/g, "");
    s = s.replace(/[–\-+]\s*[\d\s]+,\d{2}/g, "");
    s = s.replace(/,\s*(Сбербанк|ВТБ|Т-Банк|Т-банк|Альфа-Банк|МКБ|Wildberries \(Вайлдберриз Банк\)|Wildberries|Озон Банк|Россельхозбанк|Совкомбанк|Сбер)\s*$/i, "");
    s = s.replace(/[,;]\s*$/, "").replace(/\s{2,}/g, " ").trim();
    const words = s.split(" ").filter(w => w.length > 1);
    return words.slice(0, 6).join(" ") || (raw||"").trim();
  };

  const doImport = async () => {
    setImporting(true);
    try {
      const toAdd = edited.filter(r => !r.skip);
      await onImport(toAdd);
      setStep("done");
    } catch (e) {
      console.error("Ошибка импорта:", e);
    } finally {
      setImporting(false);
    }
  };

  const toImport = edited.filter(r => !r.skip);
  const cats     = [...INCOME_CATS, ...EXPENSE_CATS];

  return (
    <div style={{
      position:"fixed",inset:0,zIndex:100,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16,
      background:"rgba(2,8,23,0.92)",backdropFilter:"blur(6px)",
    }}>
      <div style={{
        background:"#141414",border:"1px solid #141414",borderRadius:20,
        width:"100%",maxWidth: step==="preview" ? 740 : 460,
        maxHeight:"90vh",overflowY:"auto",
        boxShadow:"0 25px 60px rgba(0,0,0,.6)",
      }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"16px 24px",borderBottom:"1px solid #141414",position:"sticky",top:0,
          background:"#141414",zIndex:1}}>
          <div>
            <h3 style={{color:"white",fontWeight:700,fontSize:16,margin:0}}>📂 Импорт из банка</h3>
            {step==="preview" && <p style={{fontSize:11,color:"#6b6b67",marginTop:2}}>
              Банк: <span style={{color:"#e8c860",fontWeight:600}}>{BANK_LABELS[bank]||bank}</span>
              {" · "}{parsed.length} операций найдено
            </p>}
          </div>
          <button onClick={onClose} style={{
            background:"#141414",border:"none",color:"#a8a8a3",
            width:32,height:32,borderRadius:8,cursor:"pointer",fontSize:18,
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>×</button>
        </div>

        <div style={{padding:"20px 24px"}}>
          {step==="upload" && (
            <div>
              <p style={{fontSize:13,color:"#a8a8a3",marginBottom:16,lineHeight:1.5}}>
                Загрузи файл выписки из банка. Поддерживаются CSV (Тинькофф, Сбер, Альфа, Яндекс)
                и PDF (Яндекс Банк). Все операции пройдут автокатегоризацию,
                и ты сможешь проверить и подправить категории перед импортом.
              </p>
              <input ref={fileRef} type="file" accept=".csv,.pdf" onChange={handleFile} style={{display:"none"}}/>
              <button onClick={()=>fileRef.current?.click()} disabled={pdfLoading} style={{
                width:"100%",padding:"32px 16px",borderRadius:14,
                background:"#141414",border:"2px dashed #1c1c1a",
                color:pdfLoading?"#6b6b67":"#fafaf7",fontSize:14,fontWeight:600,
                cursor:pdfLoading?"wait":"pointer",
              }}>
                {pdfLoading ? "Парсим PDF..." : "📁 Выбрать файл (.csv или .pdf)"}
              </button>
            </div>
          )}

          {step==="preview" && <>
            <div style={{
              display:"flex",gap:12,marginBottom:16,padding:"12px 16px",
              background:"#141414",borderRadius:12,flexWrap:"wrap"
            }}>
              {[
                {label:"Найдено",  val:parsed.length,             color:"#e8c860"},
                {label:"Импортируем", val:toImport.length,        color:"#6ee7a8"},
                {label:"Пропускаем", val:edited.filter(r=>r.skip).length, color:"#f59e0b"},
                {label:"Расходов", val:toImport.filter(r=>r.type==="expense").length, color:"#f8a3a3"},
                {label:"Доходов",  val:toImport.filter(r=>r.type==="income").length,  color:"#d4af37"},
              ].map(s=>(
                <div key={s.label} style={{textAlign:"center",minWidth:70}}>
                  <div style={{fontSize:10,color:"#6b6b67",fontWeight:700,textTransform:"uppercase",letterSpacing:".08em"}}>{s.label}</div>
                  <div style={{fontSize:18,fontWeight:900,color:s.color,marginTop:2}}>{s.val}</div>
                </div>
              ))}
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:11,color:"#6b6b67",fontWeight:600}}>
                Нажми на название чтобы отредактировать. ✂ — автоочистка длинного текста.
              </div>
              <button
                onClick={()=>setEdited(e=>e.map(r=>({...r,description:cleanDesc(r.description)})))}
                style={{
                  background:"#141414",border:"1px solid #2d3f55",borderRadius:8,
                  color:"#a8a8a3",fontSize:11,fontWeight:700,cursor:"pointer",
                  padding:"5px 12px",flexShrink:0,whiteSpace:"nowrap",
                }}>✂ Очистить все названия</button>
            </div>

            <div style={{border:"1px solid #141414",borderRadius:12,overflow:"hidden",marginBottom:16}}>
              <div style={{
                display:"grid",gridTemplateColumns:"90px 1fr 130px 90px 32px",gap:8,
                padding:"8px 12px",background:"#131d2e",
                fontSize:10,fontWeight:700,color:"#404040",textTransform:"uppercase",letterSpacing:".08em"
              }}>
                <span>Дата</span><span>Описание</span><span>Категория</span>
                <span style={{textAlign:"right"}}>Сумма</span><span></span>
              </div>
              <div style={{maxHeight:380,overflowY:"auto"}}>
                {edited.map(row=>(
                  <div key={row.id} style={{
                    display:"grid",gridTemplateColumns:"90px 1fr 130px 90px 32px",gap:8,
                    padding:"8px 12px",borderTop:"1px solid #141414",alignItems:"center",
                    opacity:row.skip?0.35:1,transition:"opacity .15s",
                    background:row.skip?"transparent":(row.type==="income"?"#d4af3708":"transparent"),
                  }}>
                    <span style={{fontSize:11,color:"#6b6b67",whiteSpace:"nowrap"}}>{fmtD(row.date)}</span>
                    <div style={{minWidth:0}}>
                      <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:3}}>
                        <input
                          value={row.description||""}
                          onChange={e=>changeDesc(row.id, e.target.value)}
                          style={{
                            flex:1,background:"#0a0a0a",border:"1px solid #141414",
                            borderRadius:6,padding:"3px 7px",fontSize:12,
                            color:"white",WebkitTextFillColor:"white",
                            outline:"none",minWidth:0,
                          }}
                          onFocus={e=>e.target.style.borderColor="#d4af37"}
                          onBlur={e=>e.target.style.borderColor="#141414"}
                        />
                        <button
                          onClick={()=>changeDesc(row.id, cleanDesc(row.description))}
                          style={{
                            background:"#141414",border:"none",borderRadius:5,
                            color:"#6b6b67",fontSize:11,cursor:"pointer",
                            padding:"3px 6px",flexShrink:0,fontWeight:700,
                          }}>✂</button>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        {["expense","income"].map(t=>(
                          <button key={t} onClick={()=>changeType(row.id,t)} style={{
                            padding:"1px 7px",borderRadius:6,border:"none",cursor:"pointer",fontSize:10,fontWeight:700,
                            background: row.type===t ? (t==="income"?"#d4af3722":"#f8a3a322") : "#141414",
                            color: row.type===t ? (t==="income"?"#d4af37":"#f8a3a3") : "#404040",
                          }}>{t==="income"?"Доход":"Расход"}</button>
                        ))}
                      </div>
                    </div>
                    <select
                      value={row.category}
                      onChange={e=>changeCat(row.id,e.target.value)}
                      style={{
                        background:"#131d2e",border:"1px solid #141414",borderRadius:6,
                        color:"white",WebkitTextFillColor:"white",fontSize:11,padding:"4px 6px",
                        width:"100%",colorScheme:"dark",
                      }}>
                      {cats.map(c=><option key={c}>{c}</option>)}
                    </select>
                    <div style={{
                      textAlign:"right",fontSize:12,fontWeight:700,
                      color:row.type==="income"?"#d4af37":"#f8a3a3",whiteSpace:"nowrap"
                    }}>
                      {row.type==="income"?"+":"−"}{Math.round(row.amount).toLocaleString("ru-RU")}
                    </div>
                    <button onClick={()=>toggleSkip(row.id)} style={{
                      background:"none",border:"none",cursor:"pointer",
                      color:row.skip?"#6ee7a8":"#404040",fontSize:16,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      transition:"color .15s",
                    }}>{row.skip?"↩":"×"}</button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setStep("upload")} style={{
                flex:1,padding:"12px",borderRadius:12,background:"#141414",border:"none",
                color:"#a8a8a3",fontSize:14,fontWeight:600,cursor:"pointer",
              }}>← Назад</button>
              <button onClick={doImport} disabled={importing||toImport.length===0} style={{
                flex:2,padding:"12px",borderRadius:12,background:"#d4af37",border:"none",
                color:"white",fontSize:14,fontWeight:700,cursor:"pointer",
                opacity:toImport.length===0?0.5:1,
              }}>
                {importing?"Импортируем в Supabase...": `✓ Импортировать ${toImport.length} операций`}
              </button>
            </div>
          </>}

          {step === "done" && (
            <div style={{textAlign:"center",padding:"32px 16px"}}>
              <div style={{fontSize:48,marginBottom:16}}>✅</div>
              <div style={{fontSize:18,fontWeight:800,color:"white",marginBottom:8}}>
                Импорт завершён!
              </div>
              <div style={{fontSize:13,color:"#6b6b67",marginBottom:24}}>
                {toImport.length} операций добавлены в финансы
              </div>
              <button onClick={onClose} style={{
                padding:"12px 32px",borderRadius:12,background:"#d4af37",border:"none",
                color:"white",fontSize:14,fontWeight:700,cursor:"pointer",
              }}>Отлично 👍</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FINANCE
// ════════════════════════════════════════════════════════════════════════════
function Finance({ txs, setTxs, client, ownerId, showToast }) {
  const [modal, setModal]           = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [monthF, setMonthF]         = useState(todayStr().slice(0,7));
  const [csvModal, setCsvModal]     = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [saving, setSaving]         = useState(false);

  const handleCsvImport = async (rows) => {
    // Bulk-вставка пакета транзакций в Supabase, потом обновляем локальный state
    const inserted = await insertTransactionsBulk(client, rows, ownerId);
    setTxs(prev => [...inserted, ...prev]);
    showToast(`✓ Импортировано ${inserted.length} транзакций`);
  };

  const saveTx = async (form) => {
    setSaving(true);
    try {
      if (modal === "add") {
        const created = await insertTransaction(client, form, ownerId);
        setTxs(prev => [created, ...prev]);
        showToast("✓ Запись добавлена");
      } else {
        const updated = await updateTransaction(client, modal.id, form, ownerId);
        setTxs(prev => prev.map(t => t.id === updated.id ? updated : t));
        showToast("✓ Запись обновлена");
      }
      setModal(null);
    } catch (e) {
      showToast("Ошибка: " + (e.message || ""), "error");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (confirmDel !== id) { setConfirmDel(id); return; }
    try {
      await deleteTransactionDb(client, id);
      setTxs(prev => prev.filter(t=>t.id!==id));
      showToast("Запись удалена");
    } catch (e) {
      showToast("Ошибка удаления: " + (e.message || ""), "error");
    } finally {
      setConfirmDel(null);
    }
  };

  const filtered = txs
    .filter(t=>typeFilter==="all"||t.type===typeFilter)
    .filter(t=>!monthF||t.date.startsWith(monthF))
    .sort((a,b)=>b.date.localeCompare(a.date));

  const inc = filtered.filter(t=>t.type==="income").reduce((s,t)=>s+(+t.amount||0),0);
  const exp = filtered.filter(t=>t.type==="expense").reduce((s,t)=>s+(+t.amount||0),0);

  const expByCat = EXPENSE_CATS
    .map(c=>({name:c,value:filtered.filter(t=>t.type==="expense"&&t.category===c).reduce((s,t)=>s+(+t.amount||0),0)}))
    .filter(d=>d.value>0);
  const incByCat = INCOME_CATS
    .map(c=>({name:c,value:filtered.filter(t=>t.type==="income"&&t.category===c).reduce((s,t)=>s+(+t.amount||0),0)}))
    .filter(d=>d.value>0);

  const tt = {background:"#141414",border:"1px solid #141414",borderRadius:8,fontSize:12,color:"white"};

  return (
    <div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16,alignItems:"center"}}>
        <div style={{display:"flex",gap:6}}>
          {[["all","Все"],["income","Доходы"],["expense","Расходы"]].map(([v,l])=>(
            <Chip key={v} label={l} active={typeFilter===v} onClick={()=>setTypeFilter(v)}/>
          ))}
        </div>
        <input type="month" value={monthF} onChange={e=>setMonthF(e.target.value)}
          style={{...BASE_INPUT,width:"auto",padding:"4px 12px",fontSize:13}}/>
        <button onClick={()=>setModal("add")} className={BTN.primary} style={{marginLeft:"auto"}}>
          + Добавить запись
        </button>
        <button onClick={()=>setCsvModal(true)} style={{
          fontSize:12,padding:"7px 12px",borderRadius:8,cursor:"pointer",fontWeight:600,
          background:"#6ee7a822",border:"1px solid #6ee7a844",color:"#6ee7a8",flexShrink:0,
        }}>
          📂 Импорт CSV
        </button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
        {[
          {label:"Доходы",val:inc,color:"#e8c860"},
          {label:"Расходы",val:exp,color:"#f8a3a3"},
          {label:"Баланс",val:inc-exp,color:inc>=exp?"#6ee7a8":"#f8a3a3"},
        ].map(r=>(
          <Card key={r.label} style={{textAlign:"center"}}>
            <Label>{r.label}</Label>
            <div style={{fontSize:16,fontWeight:900,color:r.color,marginTop:4}}>{fmt(r.val)}</div>
          </Card>
        ))}
      </div>

      {(incByCat.length>0||expByCat.length>0)&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
          {incByCat.length>0&&(
            <Card>
              <SectionTitle>Источники доходов</SectionTitle>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={incByCat} cx="50%" cy="50%" innerRadius={38} outerRadius={62} dataKey="value" paddingAngle={2}>
                    {incByCat.map((_,i)=><Cell key={i} fill={PALETTE[i%PALETTE.length]} stroke="transparent"/>)}
                  </Pie>
                  <Tooltip contentStyle={tt} formatter={(v,n)=>[fmt(v),n]}/>
                  <Legend iconType="circle" iconSize={7} formatter={v=><span style={{fontSize:10,color:"#a8a8a3"}}>{v}</span>}/>
                </PieChart>
              </ResponsiveContainer>
            </Card>
          )}
          {expByCat.length>0&&(
            <Card>
              <SectionTitle>Структура расходов</SectionTitle>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={expByCat} cx="50%" cy="50%" innerRadius={38} outerRadius={62} dataKey="value" paddingAngle={2}>
                    {expByCat.map((_,i)=><Cell key={i} fill={PALETTE[i%PALETTE.length]} stroke="transparent"/>)}
                  </Pie>
                  <Tooltip contentStyle={tt} formatter={(v,n)=>[fmt(v),n]}/>
                  <Legend iconType="circle" iconSize={7} formatter={v=><span style={{fontSize:10,color:"#a8a8a3"}}>{v}</span>}/>
                </PieChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtered.length===0
          ? <Empty text="Нет записей за выбранный период"/>
          : filtered.map(t=>(
            <div key={t.id} style={{
              background:"#141414",border:"1px solid #141414",borderRadius:12,
              padding:"12px 16px",display:"flex",alignItems:"center",gap:12,
            }}>
              <div style={{width:4,height:36,borderRadius:2,flexShrink:0,
                background:t.type==="income"?"#d4af37":"#f8a3a3"}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:"#fafaf7",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {t.description||t.category}
                </div>
                <div style={{fontSize:11,color:"#6b6b67",marginTop:2}}>{t.category} · {fmtD(t.date)}</div>
              </div>
              <div style={{fontWeight:700,fontSize:14,flexShrink:0,
                color:t.type==="income"?"#e8c860":"#f8a3a3"}}>
                {t.type==="income"?"+":"−"}{fmt(+t.amount)}
              </div>
              <button onClick={()=>setModal(t)} className={BTN.edit} style={{flexShrink:0}}>✏️</button>
              <button
                onClick={()=>{if(confirmDel===t.id){del(t.id);}else{setConfirmDel(t.id);}}}
                onBlur={()=>setConfirmDel(null)}
                title={confirmDel===t.id?"Нажми ещё раз — удалить":"Удалить запись"}
                style={{
                  padding:"4px 8px",borderRadius:6,border:"none",cursor:"pointer",
                  fontSize:12,fontWeight:700,flexShrink:0,transition:"all .15s",
                  background:confirmDel===t.id?"#f8a3a333":"transparent",
                  color:confirmDel===t.id?"#f8a3a3":"#6b6b67",
                }}
              >{confirmDel===t.id?"✓?":"🗑️"}</button>
            </div>
          ))}
      </div>

      {modal&&(
        <Modal
          title={modal==="add"?"Новая запись":"Редактировать запись"}
          onClose={()=>!saving&&setModal(null)}>
          <TxForm initial={modal==="add"?null:modal} onSave={saveTx} onClose={()=>setModal(null)} saving={saving}/>
        </Modal>
      )}
      {csvModal&&(
        <CsvImportModal
          onClose={()=>setCsvModal(false)}
          onImport={handleCsvImport}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS — без изменений
// ════════════════════════════════════════════════════════════════════════════
function Analytics({ projects, txs }) {
  const now = new Date();
  const byType = PROJECT_TYPES
    .map(type=>({
      name:type,
      count:projects.filter(p=>p.type===type).length,
      contract:projects.filter(p=>p.type===type).reduce((s,p)=>s+(+p.contractSum||0),0),
      paid:projects.filter(p=>p.type===type).reduce((s,p)=>s+(+p.paidAmount||0),0),
    }))
    .filter(d=>d.count>0);

  const months12 = Array.from({length:12},(_,i)=>{
    const d = new Date(now.getFullYear(),now.getMonth()-11+i,1);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const inc = txs.filter(t=>t.type==="income"&&t.date.startsWith(k)).reduce((s,t)=>s+(+t.amount||0),0);
    const exp = txs.filter(t=>t.type==="expense"&&t.date.startsWith(k)).reduce((s,t)=>s+(+t.amount||0),0);
    return {label:d.toLocaleDateString("ru-RU",{month:"short"}),balance:inc-exp};
  });

  const totalContract = projects.filter(p=>p.stage!=="Архив").reduce((s,p)=>s+(+p.contractSum||0),0);
  const totalPaid     = projects.filter(p=>p.stage!=="Архив").reduce((s,p)=>s+(+p.paidAmount||0),0);
  const payRate = totalContract>0 ? Math.round(totalPaid/totalContract*100) : 0;
  const tt = {background:"#141414",border:"1px solid #141414",borderRadius:8,fontSize:12,color:"white"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {[
          {label:"Всего проектов",       value:projects.length,                                  color:"#d4af37"},
          {label:"Завершено и оплачено", value:projects.filter(p=>p.stage==="Оплачен").length,  color:"#6ee7a8"},
          {label:"Оплачено от портфеля", value:`${payRate}%`,                                   color:"#f59e0b"},
        ].map(s=>(
          <Card key={s.label} style={{textAlign:"center"}}>
            <Label>{s.label}</Label>
            <div style={{fontSize:28,fontWeight:900,color:s.color,marginTop:4}}>{s.value}</div>
          </Card>
        ))}
      </div>

      {byType.length>0&&(
        <Card>
          <SectionTitle>Портфель по типам работ</SectionTitle>
          <ResponsiveContainer width="100%" height={Math.max(140,byType.length*46)}>
            <BarChart data={byType} layout="vertical" barSize={10}>
              <CartesianGrid strokeDasharray="3 3" stroke="#141414" horizontal={false}/>
              <XAxis type="number" tick={{fill:"#6b6b67",fontSize:10}} axisLine={false} tickLine={false}
                tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}к`:v}/>
              <YAxis type="category" dataKey="name" tick={{fill:"#a8a8a3",fontSize:11}} width={165} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={tt} formatter={(v,n)=>[fmt(v),n==="contract"?"Договор":"Оплачено"]}/>
              <Bar dataKey="contract" name="contract" fill="#d4af37" radius={[0,4,4,0]}/>
              <Bar dataKey="paid"     name="paid"     fill="#6ee7a8" radius={[0,4,4,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {months12.some(m=>m.balance!==0)&&(
        <Card>
          <SectionTitle>Баланс по месяцам — 12 мес.</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={months12}>
              <CartesianGrid strokeDasharray="3 3" stroke="#141414" vertical={false}/>
              <XAxis dataKey="label" tick={{fill:"#6b6b67",fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:"#6b6b67",fontSize:10}} axisLine={false} tickLine={false}
                tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}к`:v<=-1000?`-${Math.abs(v/1000).toFixed(0)}к`:v}/>
              <Tooltip contentStyle={tt} formatter={v=>[fmt(v),"Баланс"]}/>
              <Line type="monotone" dataKey="balance" stroke="#d4af37" strokeWidth={2.5} dot={false}/>
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card>
        <SectionTitle>Воронка стадий проектов</SectionTitle>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {PROJECT_STAGES.map(stage=>{
            const count = projects.filter(p=>p.stage===stage).length;
            const maxC  = Math.max(...PROJECT_STAGES.map(s=>projects.filter(p=>p.stage===s).length),1);
            const w = count>0 ? Math.max(6,Math.round(count/maxC*100)) : 0;
            return (
              <div key={stage} style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:160,textAlign:"right",fontSize:12,color:"#a8a8a3",fontWeight:500}}>{stage}</div>
                <div style={{flex:1,height:28,background:"#141414",borderRadius:8,overflow:"hidden"}}>
                  {w>0&&(
                    <div style={{height:"100%",borderRadius:8,display:"flex",alignItems:"center",
                      justifyContent:"flex-end",paddingRight:10,fontSize:12,fontWeight:700,color:"white",
                      width:`${w}%`,background:STAGE_META[stage]?.color||"#d4af37"}}>
                      {count}
                    </div>
                  )}
                </div>
                <div style={{width:20,textAlign:"center",fontSize:11,color:"#404040"}}>{count}</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 0",
      color: "#62646b",
    }}>
      <div style={{
        width: 48, height: 48,
        borderRadius: 12,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 12,
      }}>
        <Inbox size={22} strokeWidth={1.6} style={{ color: "#62646b" }} />
      </div>
      <p style={{ fontSize: 13, margin: 0, color: "#9b9ca4" }}>{text}</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// BACKUP / MIGRATION PANEL
// ════════════════════════════════════════════════════════════════════════════
// Модальное окно с тремя инструментами:
//   1. Экспорт текущих данных в JSON (надёжный — через textarea, не window.open)
//   2. Импорт из JSON-бэкапа (вставка в textarea)
//   3. Автоматический импорт из window.storage предыдущей версии артефакта
function BackupPanel({ projects, txs, client, ownerId, onImported, onClose, showToast }) {
  const [tab, setTab] = useState("export");        // export | import | legacy
  const [importJson, setImportJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [legacyData, setLegacyData] = useState(null);
  const [legacyChecked, setLegacyChecked] = useState(false);

  // При открытии вкладки legacy — сразу пробуем прочитать window.storage
  useEffect(() => {
    if (tab === "legacy" && !legacyChecked) {
      (async () => {
        try {
          const [pRes, tRes] = await Promise.all([
            window.storage?.get?.(LEGACY_KEY_PROJECTS),
            window.storage?.get?.(LEGACY_KEY_TXS),
          ]);
          const p = pRes ? JSON.parse(pRes.value) : [];
          const t = tRes ? JSON.parse(tRes.value) : [];
          setLegacyData({ projects: p || [], txs: t || [] });
        } catch (e) {
          setLegacyData({ projects: [], txs: [] });
        }
        setLegacyChecked(true);
      })();
    }
  }, [tab, legacyChecked]);

  const exportJson = JSON.stringify({
    version: 2,
    exportedAt: new Date().toISOString(),
    projects,
    txs,
  }, null, 2);

  const doImport = async (data) => {
    setBusy(true);
    try {
      // Валидация: data должна содержать массивы projects и txs
      if (!data || !Array.isArray(data.projects) || !Array.isArray(data.txs)) {
        throw new Error("Неверный формат бэкапа: ожидаются поля projects и txs");
      }
      const insertedP = await insertProjectsBulk(client, data.projects, ownerId);
      const insertedT = await insertTransactionsBulk(client, data.txs, ownerId);
      onImported(insertedP, insertedT);
      showToast(`✓ Импортировано: проектов ${insertedP.length}, транзакций ${insertedT.length}`);
      onClose();
    } catch (e) {
      showToast("Ошибка импорта: " + (e.message || ""), "error");
    } finally {
      setBusy(false);
    }
  };

  const importFromJsonText = async () => {
    try {
      const data = JSON.parse(importJson);
      await doImport(data);
    } catch (e) {
      if (e instanceof SyntaxError) {
        showToast("Не удалось разобрать JSON — проверь что вставлен весь текст", "error");
      } else {
        showToast("Ошибка: " + (e.message || ""), "error");
      }
    }
  };

  return (
    <Modal title="📦 Резервная копия и миграция" onClose={onClose} maxWidth={580}>
      {/* Табы */}
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {[
          {id:"export", label:"Экспорт"},
          {id:"import", label:"Импорт из JSON"},
          {id:"legacy", label:"Перенос из v1"},
        ].map(t => (
          <Chip key={t.id} label={t.label} active={tab===t.id} onClick={()=>setTab(t.id)}/>
        ))}
      </div>

      {tab === "export" && (
        <div>
          <p style={{fontSize:13,color:"#a8a8a3",marginBottom:12,lineHeight:1.5}}>
            Все твои проекты ({projects.length}) и транзакции ({txs.length}) в формате JSON.
            Скопируй текст ниже и сохрани в файл — это твоя страховка.
            Длинный тап по полю → «Выделить всё» → «Копировать».
          </p>
          <StyledTextarea
            readOnly
            value={exportJson}
            rows={10}
            style={{fontFamily:"ui-monospace,monospace",fontSize:11}}
            onClick={e => e.target.select()}
          />
          <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(exportJson);
                  showToast("✓ JSON скопирован в буфер обмена");
                } catch {
                  showToast("Не удалось скопировать автоматически — выдели вручную", "error");
                }
              }}
              className={BTN.primary}
              style={{flex:1}}
            >
              📋 Скопировать в буфер
            </button>
          </div>
        </div>
      )}

      {tab === "import" && (
        <div>
          <p style={{fontSize:13,color:"#a8a8a3",marginBottom:12,lineHeight:1.5}}>
            Вставь JSON-бэкап (полученный из вкладки «Экспорт» или из старой версии артефакта).
            Все записи будут добавлены к существующим — НЕ удалят их.
          </p>
          <StyledTextarea
            value={importJson}
            onChange={e=>setImportJson(e.target.value)}
            rows={8}
            placeholder='{"projects":[...],"txs":[...]}'
            style={{fontFamily:"ui-monospace,monospace",fontSize:11}}
          />
          <button
            onClick={importFromJsonText}
            disabled={busy || !importJson.trim()}
            className={BTN.primary}
            style={{width:"100%",marginTop:12,opacity:busy||!importJson.trim()?0.5:1}}
          >
            {busy ? "Импортируем..." : "📥 Импортировать в Supabase"}
          </button>
        </div>
      )}

      {tab === "legacy" && (
        <div>
          <p style={{fontSize:13,color:"#a8a8a3",marginBottom:12,lineHeight:1.5}}>
            Попытка прочитать данные из локального хранилища предыдущей версии
            (window.storage). Сработает только если этот артефакт открыт в той же
            среде Claude, что и старый. Если нет — используй вкладку «Импорт из JSON».
          </p>
          {!legacyChecked ? (
            <p style={{color:"#6b6b67",fontSize:13}}>Проверяю...</p>
          ) : !legacyData || (legacyData.projects.length === 0 && legacyData.txs.length === 0) ? (
            <div style={{
              background:"#141414",border:"1px solid #1c1c1a",borderRadius:12,
              padding:16,textAlign:"center",color:"#a8a8a3",fontSize:13,
            }}>
              В локальном хранилище нет данных предыдущей версии.
              Воспользуйся вкладкой «Импорт из JSON».
            </div>
          ) : (
            <>
              <div style={{
                background:"#141414",borderRadius:12,padding:14,marginBottom:12,
                display:"flex",justifyContent:"space-around",
              }}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#6b6b67",fontWeight:700,textTransform:"uppercase"}}>Проектов</div>
                  <div style={{fontSize:22,fontWeight:900,color:"#e8c860",marginTop:2}}>{legacyData.projects.length}</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#6b6b67",fontWeight:700,textTransform:"uppercase"}}>Транзакций</div>
                  <div style={{fontSize:22,fontWeight:900,color:"#d4af37",marginTop:2}}>{legacyData.txs.length}</div>
                </div>
              </div>
              <button
                onClick={()=>doImport(legacyData)}
                disabled={busy}
                className={BTN.primary}
                style={{width:"100%",opacity:busy?0.5:1}}
              >
                {busy ? "Импортируем..." : "📥 Перенести в Supabase"}
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// REPORT VIEWER (тот же что в v1, без существенных изменений)
// ════════════════════════════════════════════════════════════════════════════
function ReportViewer({ projects, onClose }) {
  const [stage, setStage] = useState("all");
  const [showPreview, setShowPreview] = useState(false);

  const stages = ["all", ...PROJECT_STAGES.filter(s => s !== "Архив")];
  const labels  = {"all":"Все активные",...Object.fromEntries(PROJECT_STAGES.map(s=>[s,s]))};

  const visible = stage === "all"
    ? projects.filter(p => p.stage !== "Архив")
    : projects.filter(p => p.stage === stage);

  const totalContract = visible.reduce((s,p)=>s+(+p.contractSum||0),0);
  const totalPaid     = visible.reduce((s,p)=>s+(+p.paidAmount||0),0);
  const totalDebt     = totalContract - totalPaid;
  const now           = new Date();
  const dateStr       = now.toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"});

  const stageColor = {
    "Переговоры":"#a8a8a3","КП выслано":"#93c5fd","Договор подписан":"#d4af37",
    "В работе":"#d4af37","Сдан заказчику":"#6ee7a8","Оплачен":"#6ee7a8","Архив":"#404040"
  };

  useEffect(() => {
    const id = "report-print-style";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      @media print {
        body > * { display: none !important; }
        #report-print-root { display: block !important; }
        #report-print-root .no-print { display: none !important; }
      }
      @media screen {
        #report-print-root { display: none; }
      }
    `;
    document.head.appendChild(s);
    return () => { const el=document.getElementById(id); if(el) el.remove(); };
  }, []);

  useEffect(() => {
    if (!showPreview) return;
    let el = document.getElementById("report-print-root");
    if (!el) { el = document.createElement("div"); el.id = "report-print-root"; document.body.appendChild(el); }
    const sc = stageColor;
    const rows = visible.map((p,i) => {
      const contract=+p.contractSum||0, paid=+p.paidAmount||0, debt=contract-paid;
      const c=sc[p.stage]||"#d4af37";
      return `<tr style="background:${i%2===0?"white":"#fafafa"}">
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;">
          <div style="font-weight:700;color:#0a0a0a;font-size:13px;">${p.name}</div>
          ${p.client?`<div style="color:#6b6b67;font-size:11px;margin-top:1px;">${p.client}</div>`:""}
        </td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#404040;">${p.type||"—"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#404040;">${p.executor||"—"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;">
          <span style="display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${c}22;color:${c};">${p.stage}</span>
        </td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:#0a0a0a;font-size:13px;">${contract>0?fmt(contract):"—"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#6ee7a8;font-size:13px;">${paid>0?fmt(paid):"—"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;font-size:13px;color:${debt>0?"#f8a3a3":"#6ee7a8"};">${contract>0?(debt>0?fmt(debt):"✓"):"—"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:12px;color:#6b6b67;">${p.deadline?new Date(p.deadline+"T00:00:00").toLocaleDateString("ru-RU",{day:"numeric",month:"short"}):"—"}</td>
      </tr>`;
    }).join("");
    el.innerHTML = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;min-height:100vh;padding:32px 24px;">
        <div style="max-width:1050px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#0a0a0a,#1c1c1a);border-radius:16px;padding:28px 36px;color:white;margin-bottom:20px;">
            <div style="font-size:21px;font-weight:900;letter-spacing:-.02em;margin-bottom:4px;"><span style="color:#a5b4fc;">Д</span>АНИИЛ — Отчёт по проектам</div>
            <div style="font-size:13px;opacity:.7;">Сформирован ${dateStr} · ${labels[stage]} · ${visible.length} проектов</div>
            <div style="display:flex;gap:14px;margin-top:18px;flex-wrap:wrap;">
              ${[
                {l:"Сумма договоров",v:fmt(totalContract),c:"#93c5fd"},
                {l:"Получено",v:fmt(totalPaid),c:"#6ee7b7"},
                {l:"К получению",v:fmt(totalDebt),c:totalDebt>0?"#f8a3a3":"#6ee7b7"},
                {l:"% оплаты",v:`${totalContract>0?Math.round(totalPaid/totalContract*100):0}%`,c:"white"},
              ].map(k=>`<div style="background:rgba(255,255,255,.12);border-radius:12px;padding:12px 18px;min-width:130px;">
                <div style="font-size:10px;opacity:.7;text-transform:uppercase;letter-spacing:.1em;font-weight:700;">${k.l}</div>
                <div style="font-size:19px;font-weight:900;color:${k.c};margin-top:4px;">${k.v}</div>
              </div>`).join("")}
            </div>
          </div>
          ${visible.length===0
            ? `<div style="text-align:center;padding:48px;color:#a8a8a3;">Нет проектов</div>`
            : `<div style="background:white;border-radius:14px;border:1px solid #fafaf7;overflow:hidden;margin-bottom:20px;">
                <table style="width:100%;border-collapse:collapse;">
                  <thead><tr style="background:#f8fafc;">
                    ${["Проект / Клиент","Тип работ","Исполнитель","Стадия","По договору","Оплачено","Остаток","Дедлайн"].map((h,i)=>`<th style="padding:10px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#a8a8a3;border-bottom:2px solid #fafaf7;text-align:${i>=4?"right":"left"};">${h}</th>`).join("")}
                  </tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>`}
          ${visible.some(p=>p.notes)?`<div style="background:white;border-radius:12px;border:1px solid #fafaf7;padding:18px 22px;margin-bottom:16px;">
            <div style="font-size:11px;font-weight:700;color:#a8a8a3;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;">Примечания</div>
            ${visible.filter(p=>p.notes).map(p=>`<div style="margin-bottom:6px;font-size:13px;"><b>${p.name}:</b> <span style="color:#404040;">${p.notes}</span></div>`).join("")}
          </div>`:""}
          <div style="text-align:center;font-size:12px;color:#cbd5e1;padding-top:8px;">Рабочий центр Даниила · ${dateStr}</div>
        </div>
      </div>`;
    return () => { const e=document.getElementById("report-print-root"); if(e) e.innerHTML=""; };
  }, [showPreview, stage, visible]);

  if (showPreview) return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:"white",overflowY:"auto"}}>
      <div style={{
        position:"sticky",top:0,zIndex:10,
        background:"#1c1c1a",padding:"10px 24px",
        display:"flex",justifyContent:"space-between",alignItems:"center",
        boxShadow:"0 2px 12px rgba(0,0,0,.3)"
      }}>
        <span style={{color:"white",fontWeight:700,fontSize:14}}>📄 Отчёт готов</span>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <div style={{
            background:"rgba(255,255,255,.1)",borderRadius:8,
            padding:"7px 14px",display:"flex",alignItems:"center",gap:8,
          }}>
            <span style={{fontSize:13,color:"#a5b4fc",fontWeight:600}}>🖨 Для PDF нажми</span>
            <kbd style={{
              background:"white",color:"#1c1c1a",borderRadius:5,
              padding:"2px 8px",fontFamily:"monospace",fontSize:13,fontWeight:800,
            }}>Ctrl+P</kbd>
            <span style={{fontSize:12,color:"#e8c860"}}>или</span>
            <kbd style={{
              background:"white",color:"#1c1c1a",borderRadius:5,
              padding:"2px 8px",fontFamily:"monospace",fontSize:13,fontWeight:800,
            }}>Cmd+P</kbd>
            <span style={{fontSize:12,color:"#e8c860"}}>→ «Сохранить как PDF»</span>
          </div>
          <button onClick={()=>setShowPreview(false)} style={{
            padding:"8px 14px",borderRadius:8,background:"#1c1c1a",border:"none",
            color:"white",fontWeight:600,fontSize:13,cursor:"pointer"
          }}>← Назад</button>
        </div>
      </div>
      <div id="report-inline" style={{
        fontFamily:"system-ui,sans-serif",background:"#f8fafc",minHeight:"calc(100vh - 52px)"
      }}>
        <div style={{maxWidth:1050,margin:"0 auto",padding:"28px 24px"}}>
          <div style={{background:"linear-gradient(135deg,#0a0a0a,#1c1c1a)",borderRadius:16,padding:"28px 36px",color:"white",marginBottom:20}}>
            <div style={{fontSize:21,fontWeight:900,letterSpacing:"-.02em",marginBottom:4}}>
              <span style={{color:"#a5b4fc"}}>Д</span>АНИИЛ — Отчёт по проектам
            </div>
            <div style={{fontSize:13,opacity:.7}}>Сформирован {dateStr} · {labels[stage]} · {visible.length} проектов</div>
            <div style={{display:"flex",gap:14,marginTop:18,flexWrap:"wrap"}}>
              {[
                {l:"Сумма договоров",v:fmt(totalContract),c:"#93c5fd"},
                {l:"Получено",       v:fmt(totalPaid),     c:"#6ee7b7"},
                {l:"К получению",    v:fmt(totalDebt),     c:totalDebt>0?"#f8a3a3":"#6ee7b7"},
                {l:"% оплаты",       v:`${totalContract>0?Math.round(totalPaid/totalContract*100):0}%`, c:"white"},
              ].map(k=>(
                <div key={k.l} style={{background:"rgba(255,255,255,.12)",borderRadius:12,padding:"12px 18px",minWidth:130}}>
                  <div style={{fontSize:10,opacity:.7,textTransform:"uppercase",letterSpacing:".1em",fontWeight:700}}>{k.l}</div>
                  <div style={{fontSize:19,fontWeight:900,color:k.c,marginTop:4}}>{k.v}</div>
                </div>
              ))}
            </div>
          </div>
          {visible.length===0
            ? <div style={{textAlign:"center",padding:48,color:"#a8a8a3",fontSize:14}}>Нет проектов</div>
            : <div style={{background:"white",borderRadius:14,border:"1px solid #fafaf7",overflow:"hidden",marginBottom:20}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr style={{background:"#f8fafc"}}>
                      {["Проект / Клиент","Тип работ","Исполнитель","Стадия","По договору","Оплачено","Остаток","Дедлайн"].map((h,i)=>(
                        <th key={h} style={{padding:"10px 14px",fontSize:10,fontWeight:700,textTransform:"uppercase",
                          letterSpacing:".1em",color:"#a8a8a3",borderBottom:"2px solid #fafaf7",
                          textAlign:i>=4?"right":"left"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((p,i)=>{
                      const contract=+p.contractSum||0,paid=+p.paidAmount||0,debt=contract-paid;
                      const c=stageColor[p.stage]||"#d4af37";
                      return (
                        <tr key={p.id} style={{background:i%2===0?"white":"#fafafa"}}>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9"}}>
                            <div style={{fontWeight:700,color:"#0a0a0a",fontSize:13}}>{p.name}</div>
                            {p.client&&<div style={{color:"#6b6b67",fontSize:11,marginTop:1}}>{p.client}</div>}
                          </td>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",fontSize:12,color:"#404040"}}>{p.type||"—"}</td>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",fontSize:12,color:"#404040"}}>{p.executor||"—"}</td>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9"}}>
                            <span style={{display:"inline-block",padding:"2px 9px",borderRadius:20,fontSize:11,fontWeight:700,background:c+"22",color:c}}>{p.stage}</span>
                          </td>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",textAlign:"right",fontWeight:600,color:"#0a0a0a",fontSize:13}}>{contract>0?fmt(contract):"—"}</td>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",textAlign:"right",fontWeight:700,color:"#6ee7a8",fontSize:13}}>{paid>0?fmt(paid):"—"}</td>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",textAlign:"right",fontWeight:700,fontSize:13,color:debt>0?"#f8a3a3":"#6ee7a8"}}>{contract>0?(debt>0?fmt(debt):"✓"):"—"}</td>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",textAlign:"right",fontSize:12,color:"#6b6b67"}}>{p.deadline?new Date(p.deadline+"T00:00:00").toLocaleDateString("ru-RU",{day:"numeric",month:"short"}):"—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>}
          {visible.some(p=>p.notes)&&(
            <div style={{background:"white",borderRadius:12,border:"1px solid #fafaf7",padding:"18px 22px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#a8a8a3",textTransform:"uppercase",letterSpacing:".1em",marginBottom:10}}>Примечания</div>
              {visible.filter(p=>p.notes).map(p=>(
                <div key={p.id} style={{marginBottom:6,fontSize:13}}>
                  <b>{p.name}:</b> <span style={{color:"#404040"}}>{p.notes}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{textAlign:"center",fontSize:12,color:"#cbd5e1",paddingBottom:32}}>
            Рабочий центр Даниила · {dateStr}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Modal title="📄 Экспорт отчёта" onClose={onClose} maxWidth={440}>
      <p style={{fontSize:13,color:"#a8a8a3",marginBottom:16,lineHeight:1.6}}>
        Отчёт откроется прямо здесь. Нажми «Печать / PDF» — браузер сохранит красивый PDF который можно отправить заказчику.
      </p>
      <div style={{marginBottom:16}}>
        <p style={{fontSize:10,fontWeight:700,color:"#6b6b67",textTransform:"uppercase",
          letterSpacing:"0.12em",marginBottom:8}}>Фильтр по стадии</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {stages.map(s=>(
            <button key={s} onClick={()=>setStage(s)} style={{
              padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",
              background:stage===s?"#d4af37":"#141414",
              color:stage===s?"white":"#a8a8a3",
              border:"none",transition:"all .15s",
            }}>{labels[s]}</button>
          ))}
        </div>
      </div>
      <div style={{
        padding:"12px 16px",background:"#141414",borderRadius:12,marginBottom:16,
        display:"flex",justifyContent:"space-between",alignItems:"center",
      }}>
        <span style={{fontSize:13,color:"#a8a8a3"}}>Проектов в отчёте</span>
        <span style={{fontSize:18,fontWeight:900,color:"#e8c860"}}>{visible.length}</span>
      </div>
      <button onClick={()=>setShowPreview(true)} style={{
        width:"100%",padding:14,borderRadius:14,background:"#d4af37",border:"none",
        color:"white",fontSize:15,fontWeight:700,cursor:"pointer",
      }}>
        👁 Открыть отчёт
      </button>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// APP ROOT — главная точка входа
// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  // Стадии загрузки приложения:
  //   loading  — инициализируем Supabase и проверяем сессию
  //   auth     — пользователь не авторизован, показываем экран входа
  //   ready    — всё подключено, показываем основной интерфейс
  //   error    — критическая ошибка подключения
  const [phase, setPhase] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);

  const [tab, setTab]               = useState("dashboard");
  const [projects, setProjects]     = useState([]);
  const [txs, setTxs]               = useState([]);

  const [reportModal, setReportModal] = useState(false);
  const [backupModal, setBackupModal] = useState(false);

  const [toast, setToast] = useState({ visible: false, text: "", type: "success" });
  const toastTimer = useRef(null);

  const showToast = useCallback((text = "✓ Сохранено", type = "success") => {
    setToast({ visible: true, text, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(()=>setToast(t => ({ ...t, visible: false })), 2500);
  }, []);

  // ── Инициализация: проверяем сохранённую сессию ─────────────────────────
  // В отличие от версии для артефактов Claude, здесь не нужно ждать
  // загрузки библиотеки с CDN — клиент supabase уже создан на уровне
  // модуля и готов к работе. Нам остаётся только узнать, есть ли у
  // пользователя сохранённая сессия в localStorage, и если да —
  // подгрузить его профиль и данные.
  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          // Сессия есть — подгружаем профиль и данные
          try {
            const prof = await fetchProfile(supabase, session.user.id);
            if (!prof.approved) {
              await signOut(supabase);
              setErrorMsg("Аккаунт ожидает одобрения администратором");
              setPhase("auth");
              return;
            }
            setUser(session.user);
            setProfile(prof);
            const [p, t] = await Promise.all([
              fetchProjects(supabase),
              fetchTransactions(supabase),
            ]);
            setProjects(p);
            setTxs(t);
            setPhase("ready");
          } catch (e) {
            console.warn("Сессия есть, но профиль не загружается:", e);
            await signOut(supabase).catch(()=>{});
            setPhase("auth");
          }
        } else {
          // Сессии нет — показываем экран входа
          setPhase("auth");
        }
      } catch (e) {
        console.error("Ошибка проверки сессии:", e);
        setErrorMsg(e.message || "Не удалось подключиться к серверу");
        setPhase("error");
      }
    })();
  }, []);

  // ── Подписка на изменения сессии ────────────────────────────────────────
  // Supabase сам отслеживает события: SIGNED_IN при входе, SIGNED_OUT при
  // выходе, TOKEN_REFRESHED когда продлил токен в фоне. Нам интересен
  // только SIGNED_OUT — нужно сбросить состояние и вернуть на экран входа.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        setProjects([]);
        setTxs([]);
        setPhase("auth");
      }
    });
    return () => subscription?.unsubscribe?.();
  }, []);

  // ── Обработчик успешной авторизации ────────────────────────────────────
  const handleAuthenticated = async (u, prof) => {
    setUser(u);
    setProfile(prof);
    try {
      const [p, t] = await Promise.all([
        fetchProjects(supabase),
        fetchTransactions(supabase),
      ]);
      setProjects(p);
      setTxs(t);
      setPhase("ready");
      showToast(`Добро пожаловать, ${prof.email.split("@")[0]}!`);
    } catch (e) {
      showToast("Ошибка загрузки данных: " + (e.message || ""), "error");
      setPhase("ready");  // всё равно показываем интерфейс с пустыми данными
    }
  };

  // ── Выход ──────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    await signOut(supabase);
    // onAuthStateChange сам сбросит состояние
  };

  // ── Импорт из бэкапа закончен — обновляем локальный state ─────────────
  const handleImported = (importedProjects, importedTxs) => {
    setProjects(prev => [...importedProjects, ...prev]);
    setTxs(prev => [...importedTxs, ...prev]);
  };

  // ───────────────────────────────────────────────────────────────────────
  // РЕНДЕРИНГ ПО ФАЗЕ
  // ───────────────────────────────────────────────────────────────────────

  if (phase === "loading") return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Geist Variable', system-ui, sans-serif",
    }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        style={{
          width: 36, height: 36,
          border: "2px solid rgba(212,175,55,0.15)",
          borderTopColor: "#e8c860",
          borderRadius: "50%",
        }}
      />
    </div>
  );

  if (phase === "error") return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#f7f8f8",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "'Geist Variable', system-ui, sans-serif",
    }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card"
        style={{ maxWidth: 400, textAlign: "center", borderRadius: 16, padding: 24 }}
      >
        <div style={{
          width: 56, height: 56,
          borderRadius: 14,
          background: "rgba(248,163,163,0.12)",
          border: "1px solid rgba(248,163,163,0.30)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 16px",
          color: "#f8a3a3",
        }}>
          <AlertTriangle size={28} strokeWidth={1.8} />
        </div>
        <div style={{
          fontSize: 17,
          fontWeight: 600,
          color: "#f7f8f8",
          marginBottom: 8,
          letterSpacing: "-0.02em",
        }}>
          Ошибка подключения
        </div>
        <p style={{ fontSize: 13, color: "#9b9ca4", marginBottom: 20, lineHeight: 1.5 }}>
          {errorMsg}
        </p>
        <button
          onClick={() => window.location.reload()}
          className={BTN.primary}
          style={{ width: "100%" }}
        >
          Попробовать снова
        </button>
      </motion.div>
    </div>
  );

  if (phase === "auth") return (
    <>
      <AuthScreen onAuthenticated={handleAuthenticated} />
      <Toast visible={toast.visible} text={toast.text} type={toast.type}/>
    </>
  );

  // phase === "ready"
  const TABS = [
    { id: "dashboard", label: "Дашборд",   Icon: LayoutDashboard },
    { id: "projects",  label: "Проекты",   Icon: FolderKanban },
    { id: "finance",   label: "Финансы",   Icon: Receipt },
    { id: "analytics", label: "Аналитика", Icon: BarChart3 },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#f7f8f8",
      fontFamily: "'Geist Variable', system-ui, -apple-system, sans-serif",
    }}>

      {/* Шапка с логотипом, действиями и информацией о пользователе */}
      <div style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "14px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        background: "rgba(8,9,15,0.85)",
        backdropFilter: "blur(8px)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        {/* Логотип */}
        <div>
          <h1 style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: "-0.025em",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{
              background: "linear-gradient(135deg, #d4af37, #e8c860)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>ДАНИИЛ</span>
            <span style={{
              color: "#62646b",
              fontWeight: 400,
              fontSize: 13,
            }}>· рабочий центр</span>
          </h1>
        </div>

        {/* Правая часть: кнопки действий и информация о пользователе */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {/* Кнопка отчёта — акцентная, в фирменном цвете */}
            <button
              onClick={() => setReportModal(true)}
              style={{
                fontSize: 12,
                padding: "6px 12px",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 500,
                background: "rgba(212,175,55,0.12)",
                border: "1px solid rgba(212,175,55,0.30)",
                color: "#e8c860",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.18s",
                fontFamily: "inherit",
              }}
              title="Экспорт отчёта для заказчика"
            >
              <FileText size={13} strokeWidth={2.2} />
              Отчёт
            </button>
            {/* Кнопка резерва — нейтральная */}
            <button
              onClick={() => setBackupModal(true)}
              style={{
                fontSize: 12,
                padding: "6px 12px",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 500,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "#9b9ca4",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.18s",
                fontFamily: "inherit",
              }}
              title="Резерв и миграция данных"
            >
              <Package size={13} strokeWidth={2.2} />
              Резерв
            </button>
            {/* Кнопка выхода — в красноватом цвете опасности */}
            <button
              onClick={handleSignOut}
              style={{
                fontSize: 12,
                padding: "6px 12px",
                borderRadius: 8,
                cursor: "pointer",
                fontWeight: 500,
                background: "rgba(248,163,163,0.10)",
                border: "1px solid rgba(248,163,163,0.25)",
                color: "#f8a3a3",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.18s",
                fontFamily: "inherit",
              }}
              title="Выйти из аккаунта"
            >
              <LogOut size={13} strokeWidth={2.2} />
              Выход
            </button>
            <div style={{ fontSize: 11, color: "#62646b", marginLeft: 4 }}>
              {new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
          {/* Бейдж администратора и email */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {profile?.role === "admin" && (
              <span style={{
                fontSize: 9,
                padding: "2px 7px",
                borderRadius: 5,
                fontWeight: 600,
                background: "rgba(243,215,123,0.12)",
                color: "#f3d77b",
                border: "1px solid rgba(243,215,123,0.25)",
                letterSpacing: "0.08em",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}>
                <Sparkles size={9} strokeWidth={2.4} />
                ADMIN
              </span>
            )}
            <div style={{
              fontSize: 11,
              padding: "3px 9px",
              borderRadius: 6,
              fontWeight: 500,
              background: "rgba(110,231,168,0.10)",
              color: "#6ee7a8",
              border: "1px solid rgba(110,231,168,0.20)",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}>
              <Cloud size={11} strokeWidth={2.2} />
              {profile?.email}
            </div>
          </div>
        </div>
      </div>

      {/* Навигация по вкладкам с активным индикатором */}
      <div style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "0 24px",
        display: "flex",
        overflowX: "auto",
        background: "rgba(8,9,15,0.85)",
        backdropFilter: "blur(8px)",
        position: "sticky",
        top: 64,
        zIndex: 40,
      }}>
        {TABS.map(t => {
          const isActive = tab === t.id;
          const TabIcon = t.Icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "12px 18px",
                fontSize: 13,
                fontWeight: 500,
                color: isActive ? "#e8c860" : "#9b9ca4",
                background: "none",
                border: "none",
                cursor: "pointer",
                transition: "color 0.2s",
                display: "flex",
                alignItems: "center",
                gap: 8,
                whiteSpace: "nowrap",
                position: "relative",
                fontFamily: "inherit",
              }}
            >
              <TabIcon size={15} strokeWidth={isActive ? 2.4 : 2} />
              {t.label}
              {/* Анимированная подложка под активным табом — плавно перетекает между табами */}
              {isActive && (
                <motion.div
                  layoutId="activeTabIndicator"
                  style={{
                    position: "absolute",
                    bottom: -1,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: "linear-gradient(90deg, #d4af37, #e8c860)",
                    borderRadius: 2,
                  }}
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Содержимое страницы — обёрнуто в AnimatePresence для плавных переходов */}
      <div style={{ padding: 24, maxWidth: 1080, margin: "0 auto" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {tab === "dashboard" && <Dashboard projects={projects} txs={txs} />}
            {tab === "projects" && <Projects projects={projects} setProjects={setProjects} client={supabase} ownerId={profile.id} showToast={showToast} />}
            {tab === "finance" && <Finance txs={txs} setTxs={setTxs} client={supabase} ownerId={profile.id} showToast={showToast} />}
            {tab === "analytics" && <Analytics projects={projects} txs={txs} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <Toast visible={toast.visible} text={toast.text} type={toast.type}/>

      {reportModal && <ReportViewer projects={projects} onClose={()=>setReportModal(false)}/>}
      {backupModal && <BackupPanel
        projects={projects}
        txs={txs}
        client={supabase}
        ownerId={profile.id}
        onImported={handleImported}
        onClose={()=>setBackupModal(false)}
        showToast={showToast}
      />}
    </div>
  );
}

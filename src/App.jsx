import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
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
  "Переговоры":       { color:"#64748b", progress:10  },
  "КП выслано":       { color:"#60a5fa", progress:25  },
  "Договор подписан": { color:"#a78bfa", progress:40  },
  "В работе":         { color:"#fbbf24", progress:65  },
  "Сдан заказчику":   { color:"#34d399", progress:85  },
  "Оплачен":          { color:"#10b981", progress:100 },
  "Архив":            { color:"#334155", progress:100 },
};

const PALETTE = ["#6366f1","#22d3ee","#f59e0b","#10b981","#ef4444","#8b5cf6","#ec4899","#f97316"];

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
    id:           row.id,
    name:         row.name || "",
    client:       row.client || "",
    executor:     row.executor || "",
    type:         row.type || "ОВиК",
    stage:        row.stage || "Переговоры",
    startDate:    row.start_date || "",
    deadline:     row.deadline || "",
    contractSum:  row.contract_sum != null ? Number(row.contract_sum) : 0,
    paidAmount:   row.paid_amount  != null ? Number(row.paid_amount)  : 0,
    notes:        row.notes || "",
    visibility:   row.visibility || "private",
    ownerId:      row.owner_id,
  };
}

function projectJsToDb(p, ownerId) {
  // Возвращаем только поля для записи в БД — без id (его генерирует БД при insert)
  return {
    name:         p.name || "Без названия",
    client:       p.client || null,
    executor:     p.executor || null,
    type:         p.type || null,
    stage:        p.stage || "Переговоры",
    start_date:   p.startDate || null,
    deadline:     p.deadline || null,
    contract_sum: parseFloat(p.contractSum) || 0,
    paid_amount:  parseFloat(p.paidAmount)  || 0,
    notes:        p.notes || null,
    visibility:   p.visibility || "private",
    owner_id:     ownerId,
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
// STYLED INPUTS — те же что в v1, инлайн-стили для iOS Safari
// ════════════════════════════════════════════════════════════════════════════
// Используем инлайн-стили, потому что Tailwind не перебивает -webkit-text-fill-color.
// Это свойство — единственный надёжный способ сделать текст белым в iOS Safari.
const BASE_INPUT = {
  background:"#0f172a",
  color:"white",
  WebkitTextFillColor:"white",
  border:"1px solid #1e293b",
  borderRadius:8,
  padding:"8px 12px",
  fontSize:14,
  width:"100%",
  outline:"none",
  boxSizing:"border-box",
  colorScheme:"dark",
  transition:"border-color 0.15s",
};

function StyledInput(props) {
  const [focused, setFocused] = useState(false);
  const { style={}, ...rest } = props;
  return (
    <input {...rest}
      style={{...BASE_INPUT, border:`1px solid ${focused?"#6366f1":"#1e293b"}`, ...style}}
      onFocus={()=>setFocused(true)}
      onBlur={()=>setFocused(false)}
    />
  );
}
function StyledSelect(props) {
  const [focused, setFocused] = useState(false);
  const { style={}, ...rest } = props;
  return (
    <select {...rest}
      style={{...BASE_INPUT, border:`1px solid ${focused?"#6366f1":"#1e293b"}`,
        appearance:"none", cursor:"pointer", ...style}}
      onFocus={()=>setFocused(true)}
      onBlur={()=>setFocused(false)}
    />
  );
}
function StyledTextarea(props) {
  const [focused, setFocused] = useState(false);
  const { style={}, ...rest } = props;
  return (
    <textarea {...rest}
      style={{...BASE_INPUT, border:`1px solid ${focused?"#6366f1":"#1e293b"}`,
        resize:"vertical", ...style}}
      onFocus={()=>setFocused(true)}
      onBlur={()=>setFocused(false)}
    />
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PRIMITIVE UI
// ════════════════════════════════════════════════════════════════════════════
const BTN = {
  primary: "px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors",
  ghost:   "px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-sm transition-colors",
  danger:  "px-2 py-1 rounded text-slate-500 hover:text-red-400 text-sm transition-colors",
  edit:    "px-2 py-1 rounded text-slate-500 hover:text-indigo-400 text-sm transition-colors",
};

function Label({ children }) {
  return <p style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.12em",
    color:"#64748b",marginBottom:4,fontWeight:700,margin:"0 0 4px 0"}}>{children}</p>;
}
function Field({ label, children, style={} }) {
  return <div style={{marginBottom:12,...style}}><Label>{label}</Label>{children}</div>;
}
function Card({ children, style={} }) {
  return (
    <div style={{background:"#0f1623",border:"1px solid #1e2a3a",borderRadius:16,padding:16,...style}}>
      {children}
    </div>
  );
}
function SectionTitle({ children }) {
  return <p style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",
    letterSpacing:"0.12em",margin:"0 0 12px 0"}}>{children}</p>;
}
function Chip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",
      background: active?"#4f46e5":"#1e2a3a",
      color: active?"white":"#94a3b8",
      border:"none",transition:"all 0.15s",
    }}>{label}</button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TOAST — уведомления о сохранении и ошибках
// ────────────────────────────────────────────────────────────────────────────
// Один компонент, который умеет показывать как успешные сообщения (зелёный),
// так и ошибки (красный) — определяется параметром `type`.
function Toast({ visible, text, type }) {
  const colors = {
    success: "#10b981",
    error:   "#ef4444",
    info:    "#6366f1",
  };
  return (
    <div style={{
      position:"fixed",bottom:24,right:24,zIndex:200,
      background: colors[type] || colors.success,
      color:"white",borderRadius:12,
      padding:"10px 18px",fontSize:13,fontWeight:600,
      boxShadow:"0 8px 30px rgba(0,0,0,0.4)",
      opacity: visible?1:0,
      transform: visible?"translateY(0)":"translateY(12px)",
      transition:"all 0.3s ease",
      pointerEvents:"none",
      maxWidth: "calc(100vw - 48px)",
    }}>{text}</div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MODAL
// ────────────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, maxWidth=480 }) {
  return (
    <div style={{
      position:"fixed",inset:0,zIndex:100,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16,
      background:"rgba(2,8,23,0.88)",backdropFilter:"blur(4px)",
    }}>
      <div style={{
        background:"#0f1623",border:"1px solid #1e2a3a",borderRadius:20,
        width:"100%",maxWidth,maxHeight:"90vh",overflowY:"auto",
        boxShadow:"0 25px 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"16px 24px",borderBottom:"1px solid #1e2a3a"}}>
          <h3 style={{color:"white",fontWeight:700,fontSize:16,margin:0}}>{title}</h3>
          <button onClick={onClose} style={{
            background:"#1e2a3a",border:"none",color:"#94a3b8",
            width:32,height:32,borderRadius:8,cursor:"pointer",fontSize:18,
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>×</button>
        </div>
        <div style={{padding:"20px 24px"}}>{children}</div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// KPI CARD
// ────────────────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color="#6366f1", icon }) {
  return (
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{flex:1}}>
          <Label>{label}</Label>
          <div style={{fontSize:16,fontWeight:900,color,marginTop:4,lineHeight:1.2}}>{value}</div>
          {sub&&<div style={{fontSize:11,color:"#475569",marginTop:4}}>{sub}</div>}
        </div>
        <span style={{fontSize:22,opacity:0.7}}>{icon}</span>
      </div>
    </Card>
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
      minHeight:"100vh",background:"#080e1a",color:"white",
      fontFamily:"system-ui,-apple-system,sans-serif",
      display:"flex",alignItems:"center",justifyContent:"center",padding:16,
    }}>
      <div style={{width:"100%",maxWidth:380}}>
        {/* Шапка */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:28,fontWeight:900,letterSpacing:"-0.02em",marginBottom:6}}>
            <span style={{color:"#6366f1"}}>Д</span>АНИИЛ
          </div>
          <div style={{fontSize:11,color:"#475569",textTransform:"uppercase",letterSpacing:"0.12em"}}>
            Рабочий центр · Проекты · Финансы
          </div>
        </div>

        <Card>
          {mode === "check_email" ? (
            <div style={{textAlign:"center",padding:"16px 0"}}>
              <div style={{fontSize:42,marginBottom:14}}>📬</div>
              <div style={{fontSize:16,fontWeight:700,color:"white",marginBottom:8}}>
                Проверь почту
              </div>
              <p style={{fontSize:13,color:"#94a3b8",marginBottom:20,lineHeight:1.5}}>
                На <span style={{color:"#818cf8"}}>{email}</span> отправлено письмо
                с ссылкой для подтверждения. Перейди по ней, потом возвращайся
                и войди.
              </p>
              <button
                onClick={()=>{ setMode("signin"); setError(null); }}
                className={BTN.primary}
                style={{width:"100%"}}
              >
                Назад ко входу
              </button>
            </div>
          ) : (
            <>
              <p style={{fontSize:14,fontWeight:600,color:"white",marginBottom:16,marginTop:0}}>
                {mode === "signin" ? "Вход" : "Регистрация"}
              </p>

              <Field label="Email">
                <StyledInput
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e=>setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>

              <Field label="Пароль">
                <StyledInput
                  type="password"
                  autoComplete={mode==="signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={e=>setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  onKeyDown={e=>{ if(e.key==="Enter") submit(); }}
                />
              </Field>

              {error && (
                <div style={{
                  background:"#ef444422",border:"1px solid #ef444466",
                  color:"#fca5a5",padding:"8px 12px",borderRadius:8,
                  fontSize:12,marginBottom:14,
                }}>
                  {error}
                </div>
              )}

              <button
                onClick={submit}
                disabled={loading}
                className={BTN.primary}
                style={{width:"100%",opacity:loading?0.6:1,marginBottom:12}}
              >
                {loading ? "Подключаемся..." : (mode==="signin"?"Войти":"Зарегистрироваться")}
              </button>

              <div style={{textAlign:"center",fontSize:12,color:"#64748b"}}>
                {mode === "signin" ? (
                  <>Нет аккаунта?{" "}
                    <button
                      onClick={()=>{ setMode("signup"); setError(null); }}
                      style={{background:"none",border:"none",color:"#818cf8",
                        cursor:"pointer",fontSize:12,fontWeight:600,padding:0,
                      }}
                    >Зарегистрироваться</button>
                  </>
                ) : (
                  <>Уже есть аккаунт?{" "}
                    <button
                      onClick={()=>{ setMode("signin"); setError(null); }}
                      style={{background:"none",border:"none",color:"#818cf8",
                        cursor:"pointer",fontSize:12,fontWeight:600,padding:0,
                      }}
                    >Войти</button>
                  </>
                )}
              </div>
            </>
          )}
        </Card>

        <p style={{textAlign:"center",fontSize:10,color:"#334155",marginTop:24}}>
          Данные хранятся в защищённой облачной БД Supabase (Frankfurt)
        </p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PROJECT FORM
// ════════════════════════════════════════════════════════════════════════════
function ProjectForm({ initial, onSave, onClose, saving }) {
  const [f, setF] = useState(initial || {
    name:"",client:"",executor:"",type:"ОВиК",stage:"Переговоры",
    startDate:todayStr(),deadline:"",contractSum:"",paidAmount:"",notes:"",
    visibility:"private",
  });
  const s = (k,v) => setF(p=>({...p,[k]:v}));

  return (
    <div>
      <Field label="Название проекта">
        <StyledInput value={f.name} onChange={e=>s("name",e.target.value)}
          placeholder="Н-р: ОВиК Жилой дом пер. Строителей"/>
      </Field>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div><Label>Заказчик / Клиент</Label>
          <StyledInput value={f.client} onChange={e=>s("client",e.target.value)}/></div>
        <div><Label>Исполнитель</Label>
          <StyledInput value={f.executor} onChange={e=>s("executor",e.target.value)}
            placeholder="Н-р: Даниил, Субподряд"/></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div>
          <Label>Тип работ</Label>
          <StyledSelect value={f.type} onChange={e=>s("type",e.target.value)}>
            {PROJECT_TYPES.map(t=><option key={t}>{t}</option>)}
          </StyledSelect>
        </div>
        <div>
          <Label>Стадия</Label>
          <StyledSelect value={f.stage} onChange={e=>s("stage",e.target.value)}>
            {PROJECT_STAGES.map(t=><option key={t}>{t}</option>)}
          </StyledSelect>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div><Label>Дата начала</Label>
          <StyledInput type="date" value={f.startDate} onChange={e=>s("startDate",e.target.value)}/></div>
        <div><Label>Дедлайн</Label>
          <StyledInput type="date" value={f.deadline} onChange={e=>s("deadline",e.target.value)}/></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <div><Label>Сумма договора (₽)</Label>
          <StyledInput type="number" value={f.contractSum} onChange={e=>s("contractSum",e.target.value)} placeholder="0"/></div>
        <div><Label>Оплачено факт (₽)</Label>
          <StyledInput type="number" value={f.paidAmount} onChange={e=>s("paidAmount",e.target.value)} placeholder="0"/></div>
      </div>
      <Field label="Видимость">
        <StyledSelect value={f.visibility} onChange={e=>s("visibility",e.target.value)}>
          <option value="private">Личный (только я)</option>
          <option value="team">Командный (видят все одобренные)</option>
        </StyledSelect>
      </Field>
      <Field label="Примечания">
        <StyledTextarea rows={2} value={f.notes} onChange={e=>s("notes",e.target.value)}/>
      </Field>
      <div style={{display:"flex",gap:10,marginTop:4}}>
        <button onClick={onClose} className={BTN.ghost} style={{flex:1}} disabled={saving}>Отмена</button>
        <button onClick={()=>onSave(f)} className={BTN.primary} style={{flex:2,opacity:saving?0.6:1}} disabled={saving}>
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
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
function Dashboard({ projects, txs }) {
  const active = projects.filter(p=>!["Оплачен","Архив"].includes(p.stage));
  const portfolio = projects.filter(p=>p.stage!=="Архив");
  const totalContract = portfolio.reduce((s,p)=>s+(+p.contractSum||0),0);
  const totalPaid     = portfolio.reduce((s,p)=>s+(+p.paidAmount||0),0);

  const now = new Date();
  const mk = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const mTxs    = txs.filter(t=>t.date.startsWith(mk));
  const mIncome  = mTxs.filter(t=>t.type==="income").reduce((s,t)=>s+(+t.amount||0),0);
  const mExpense = mTxs.filter(t=>t.type==="expense").reduce((s,t)=>s+(+t.amount||0),0);

  const stageData = PROJECT_STAGES.slice(0,-1)
    .map(s=>({name:s,value:projects.filter(p=>p.stage===s).length,fill:STAGE_META[s].color}))
    .filter(d=>d.value>0);

  const months6 = Array.from({length:6},(_,i)=>{
    const d = new Date(now.getFullYear(),now.getMonth()-5+i,1);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const inc = txs.filter(t=>t.type==="income"&&t.date.startsWith(k)).reduce((s,t)=>s+(+t.amount||0),0);
    const exp = txs.filter(t=>t.type==="expense"&&t.date.startsWith(k)).reduce((s,t)=>s+(+t.amount||0),0);
    return {label:d.toLocaleDateString("ru-RU",{month:"short"}),inc,exp};
  });

  const todayS  = todayStr();
  const overdue  = active.filter(p=>p.deadline&&p.deadline<todayS&&p.stage!=="Сдан заказчику");
  const upcoming = active.filter(p=>p.deadline&&p.deadline>=todayS)
    .sort((a,b)=>a.deadline.localeCompare(b.deadline)).slice(0,4);

  const tt = {background:"#0f1623",border:"1px solid #1e2a3a",borderRadius:8,fontSize:12,color:"white"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <KpiCard label="Активных проектов" value={active.length} icon="📁" color="#6366f1" sub={`всего: ${projects.length}`}/>
        <KpiCard label="Портфель (договор)" value={fmt(totalContract)} icon="📋" color="#22d3ee"/>
        <KpiCard label="Получено / осталось" value={fmt(totalPaid)} icon="✅" color="#10b981" sub={`осталось: ${fmt(totalContract-totalPaid)}`}/>
        <KpiCard label="Баланс месяца" value={fmt(mIncome-mExpense)} icon="💰" color={mIncome>=mExpense?"#10b981":"#ef4444"} sub={`доходы ${fmt(mIncome)}`}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card>
          <SectionTitle>Проекты по стадиям</SectionTitle>
          {stageData.length>0
            ? <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={stageData} cx="50%" cy="50%" innerRadius={55} outerRadius={82} dataKey="value" paddingAngle={2}>
                    {stageData.map((e,i)=><Cell key={i} fill={e.fill} stroke="transparent"/>)}
                  </Pie>
                  <Tooltip contentStyle={tt} formatter={(v,n)=>[`${v} проектов`,n]}/>
                  <Legend iconType="circle" iconSize={8} formatter={v=><span style={{fontSize:10,color:"#94a3b8"}}>{v}</span>}/>
                </PieChart>
              </ResponsiveContainer>
            : <Empty text="Добавь первый проект"/>}
        </Card>
        <Card>
          <SectionTitle>Доходы и расходы — 6 мес.</SectionTitle>
          {months6.some(m=>m.inc>0||m.exp>0)
            ? <ResponsiveContainer width="100%" height={200}>
                <BarChart data={months6} barSize={12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" vertical={false}/>
                  <XAxis dataKey="label" tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}
                    tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}к`:v}/>
                  <Tooltip contentStyle={tt} formatter={(v,n)=>[fmt(v),n==="inc"?"Доходы":"Расходы"]}/>
                  <Bar dataKey="inc" name="inc" fill="#6366f1" radius={[4,4,0,0]}/>
                  <Bar dataKey="exp" name="exp" fill="#ef4444" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            : <Empty text="Добавь первые финансовые записи"/>}
        </Card>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card>
          <SectionTitle>⚠️ Просроченные дедлайны</SectionTitle>
          {overdue.length===0
            ? <p style={{color:"#64748b",fontSize:13}}>Всё в срок 🎉</p>
            : overdue.map(p=>(
              <div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #1e2a3a"}}>
                <span style={{color:"#f87171",fontSize:13,fontWeight:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
                <span style={{color:"#64748b",fontSize:11,flexShrink:0,marginLeft:8}}>{fmtD(p.deadline)}</span>
              </div>
            ))}
        </Card>
        <Card>
          <SectionTitle>📅 Ближайшие дедлайны</SectionTitle>
          {upcoming.length===0
            ? <p style={{color:"#64748b",fontSize:13}}>Нет запланированных дедлайнов</p>
            : upcoming.map(p=>(
              <div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #1e2a3a"}}>
                <span style={{color:"#e2e8f0",fontSize:13,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
                <span style={{color:"#818cf8",fontSize:11,flexShrink:0,marginLeft:8}}>{fmtD(p.deadline)}</span>
              </div>
            ))}
        </Card>
      </div>

      <Card>
        <SectionTitle>Финансы текущего месяца</SectionTitle>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
          {[
            {label:"Доходы",val:mIncome,color:"#818cf8"},
            {label:"Расходы",val:mExpense,color:"#f87171"},
            {label:"Баланс",val:mIncome-mExpense,color:mIncome>=mExpense?"#34d399":"#f87171"},
          ].map(r=>(
            <div key={r.label}>
              <Label>{r.label}</Label>
              <div style={{fontSize:18,fontWeight:900,color:r.color,marginTop:4}}>{fmt(r.val)}</div>
            </div>
          ))}
        </div>
        {mIncome>0&&(
          <div style={{marginTop:16}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#64748b",marginBottom:6}}>
              <span>Расходы от доходов</span>
              <span>{Math.min(100,Math.round(mExpense/mIncome*100))}%</span>
            </div>
            <div style={{height:6,background:"#1e2a3a",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",background:"#6366f1",borderRadius:3,
                width:`${Math.min(100,mExpense/mIncome*100)}%`,transition:"width 0.7s"}}/>
            </div>
          </div>
        )}
      </Card>
    </div>
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
            const meta = STAGE_META[p.stage]||{color:"#6366f1",progress:0};
            const isAwaitingPayment = p.stage==="Сдан заказчику";
            const isOverdue = p.deadline&&p.deadline<todayS&&!["Оплачен","Архив","Сдан заказчику"].includes(p.stage);
            const paid = +p.paidAmount||0;
            const contract = +p.contractSum||0;
            return (
              <div key={p.id} style={{background:"#0f1623",border:"1px solid #1e2a3a",borderRadius:16,padding:16}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{color:"white",fontWeight:700,fontSize:15}}>{p.name}</span>
                      <span style={{fontSize:11,padding:"2px 10px",borderRadius:20,fontWeight:600,
                        background:meta.color+"22",color:meta.color}}>{p.stage}</span>
                      {p.visibility==="team" && <span style={{fontSize:10,padding:"1px 6px",borderRadius:10,
                        background:"#22d3ee22",color:"#22d3ee",fontWeight:600}}>👥 команда</span>}
                      {isAwaitingPayment&&<span style={{fontSize:11,color:"#fbbf24",fontWeight:600}}>⏳ Ожидает оплаты</span>}
                      {isOverdue&&<span style={{fontSize:11,color:"#f87171",fontWeight:600}}>⚠ Просрочен</span>}
                    </div>
                    <div style={{fontSize:13,color:"#94a3b8",marginBottom:10,display:"flex",flexWrap:"wrap",alignItems:"center",gap:"2px 0"}}>
                      {p.client&&<span>{p.client}</span>}
                      {p.client&&p.type&&<span style={{margin:"0 6px",color:"#334155"}}>·</span>}
                      <span style={{color:"#818cf8",fontWeight:600}}>{p.type}</span>
                      {p.executor&&<><span style={{margin:"0 6px",color:"#334155"}}>·</span>
                      <span style={{color:"#fbbf24"}}>👤 {p.executor}</span></>}
                    </div>
                    <div style={{height:4,background:"#1e2a3a",borderRadius:2,overflow:"hidden",marginBottom:10}}>
                      <div style={{height:"100%",borderRadius:2,background:meta.color,
                        width:`${meta.progress}%`,transition:"width 0.5s"}}/>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:"4px 20px",fontSize:12}}>
                      {contract>0&&<span style={{color:"#94a3b8"}}>Договор: <span style={{color:"#e2e8f0",fontWeight:600}}>{fmt(contract)}</span></span>}
                      {paid>0&&<span style={{color:"#94a3b8"}}>Оплачено: <span style={{color:"#34d399",fontWeight:600}}>{fmt(paid)}</span></span>}
                      {contract>0&&paid>0&&<span style={{color:"#94a3b8"}}>Остаток: <span style={{color:"#fbbf24",fontWeight:600}}>{fmt(contract-paid)}</span></span>}
                      {p.deadline&&<span style={{color:"#94a3b8"}}>Дедлайн: <span style={{color:isOverdue?"#f87171":"#e2e8f0",fontWeight:isOverdue?600:400}}>{fmtD(p.deadline)}</span></span>}
                    </div>
                    {contract>0&&paid>0&&(
                      <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
                        <div style={{flex:1,height:3,background:"#1e2a3a",borderRadius:2,overflow:"hidden"}}>
                          <div style={{height:"100%",background:"#10b981",borderRadius:2,
                            width:`${Math.min(100,paid/contract*100)}%`}}/>
                        </div>
                        <span style={{fontSize:10,color:"#64748b"}}>{Math.round(paid/contract*100)}%</span>
                      </div>
                    )}
                    {p.notes&&<p style={{margin:"8px 0 0",fontSize:11,color:"#64748b",fontStyle:"italic"}}>{p.notes}</p>}
                  </div>
                  <div style={{display:"flex",gap:4,flexShrink:0}}>
                    <button onClick={()=>setModal(p)} className={BTN.edit}>✏️</button>
                    <button onClick={()=>{if(confirmDel===p.id){del(p.id);}else{setConfirmDel(p.id);}}}
                      style={{
                        padding:"4px 8px",borderRadius:6,border:"none",cursor:"pointer",
                        fontSize:12,fontWeight:700,transition:"all .15s",
                        background:confirmDel===p.id?"#ef444433":"transparent",
                        color:confirmDel===p.id?"#ef4444":"#64748b",
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
        background:"#0f1623",border:"1px solid #1e2a3a",borderRadius:20,
        width:"100%",maxWidth: step==="preview" ? 740 : 460,
        maxHeight:"90vh",overflowY:"auto",
        boxShadow:"0 25px 60px rgba(0,0,0,.6)",
      }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"16px 24px",borderBottom:"1px solid #1e2a3a",position:"sticky",top:0,
          background:"#0f1623",zIndex:1}}>
          <div>
            <h3 style={{color:"white",fontWeight:700,fontSize:16,margin:0}}>📂 Импорт из банка</h3>
            {step==="preview" && <p style={{fontSize:11,color:"#64748b",marginTop:2}}>
              Банк: <span style={{color:"#818cf8",fontWeight:600}}>{BANK_LABELS[bank]||bank}</span>
              {" · "}{parsed.length} операций найдено
            </p>}
          </div>
          <button onClick={onClose} style={{
            background:"#1e2a3a",border:"none",color:"#94a3b8",
            width:32,height:32,borderRadius:8,cursor:"pointer",fontSize:18,
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>×</button>
        </div>

        <div style={{padding:"20px 24px"}}>
          {step==="upload" && (
            <div>
              <p style={{fontSize:13,color:"#94a3b8",marginBottom:16,lineHeight:1.5}}>
                Загрузи файл выписки из банка. Поддерживаются CSV (Тинькофф, Сбер, Альфа, Яндекс)
                и PDF (Яндекс Банк). Все операции пройдут автокатегоризацию,
                и ты сможешь проверить и подправить категории перед импортом.
              </p>
              <input ref={fileRef} type="file" accept=".csv,.pdf" onChange={handleFile} style={{display:"none"}}/>
              <button onClick={()=>fileRef.current?.click()} disabled={pdfLoading} style={{
                width:"100%",padding:"32px 16px",borderRadius:14,
                background:"#1e2a3a",border:"2px dashed #334155",
                color:pdfLoading?"#64748b":"#e2e8f0",fontSize:14,fontWeight:600,
                cursor:pdfLoading?"wait":"pointer",
              }}>
                {pdfLoading ? "Парсим PDF..." : "📁 Выбрать файл (.csv или .pdf)"}
              </button>
            </div>
          )}

          {step==="preview" && <>
            <div style={{
              display:"flex",gap:12,marginBottom:16,padding:"12px 16px",
              background:"#1e2a3a",borderRadius:12,flexWrap:"wrap"
            }}>
              {[
                {label:"Найдено",  val:parsed.length,             color:"#818cf8"},
                {label:"Импортируем", val:toImport.length,        color:"#10b981"},
                {label:"Пропускаем", val:edited.filter(r=>r.skip).length, color:"#f59e0b"},
                {label:"Расходов", val:toImport.filter(r=>r.type==="expense").length, color:"#ef4444"},
                {label:"Доходов",  val:toImport.filter(r=>r.type==="income").length,  color:"#22d3ee"},
              ].map(s=>(
                <div key={s.label} style={{textAlign:"center",minWidth:70}}>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:".08em"}}>{s.label}</div>
                  <div style={{fontSize:18,fontWeight:900,color:s.color,marginTop:2}}>{s.val}</div>
                </div>
              ))}
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:11,color:"#64748b",fontWeight:600}}>
                Нажми на название чтобы отредактировать. ✂ — автоочистка длинного текста.
              </div>
              <button
                onClick={()=>setEdited(e=>e.map(r=>({...r,description:cleanDesc(r.description)})))}
                style={{
                  background:"#1e2a3a",border:"1px solid #2d3f55",borderRadius:8,
                  color:"#94a3b8",fontSize:11,fontWeight:700,cursor:"pointer",
                  padding:"5px 12px",flexShrink:0,whiteSpace:"nowrap",
                }}>✂ Очистить все названия</button>
            </div>

            <div style={{border:"1px solid #1e2a3a",borderRadius:12,overflow:"hidden",marginBottom:16}}>
              <div style={{
                display:"grid",gridTemplateColumns:"90px 1fr 130px 90px 32px",gap:8,
                padding:"8px 12px",background:"#131d2e",
                fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:".08em"
              }}>
                <span>Дата</span><span>Описание</span><span>Категория</span>
                <span style={{textAlign:"right"}}>Сумма</span><span></span>
              </div>
              <div style={{maxHeight:380,overflowY:"auto"}}>
                {edited.map(row=>(
                  <div key={row.id} style={{
                    display:"grid",gridTemplateColumns:"90px 1fr 130px 90px 32px",gap:8,
                    padding:"8px 12px",borderTop:"1px solid #1e2a3a",alignItems:"center",
                    opacity:row.skip?0.35:1,transition:"opacity .15s",
                    background:row.skip?"transparent":(row.type==="income"?"#6366f108":"transparent"),
                  }}>
                    <span style={{fontSize:11,color:"#64748b",whiteSpace:"nowrap"}}>{fmtD(row.date)}</span>
                    <div style={{minWidth:0}}>
                      <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:3}}>
                        <input
                          value={row.description||""}
                          onChange={e=>changeDesc(row.id, e.target.value)}
                          style={{
                            flex:1,background:"#0f172a",border:"1px solid #1e2a3a",
                            borderRadius:6,padding:"3px 7px",fontSize:12,
                            color:"white",WebkitTextFillColor:"white",
                            outline:"none",minWidth:0,
                          }}
                          onFocus={e=>e.target.style.borderColor="#6366f1"}
                          onBlur={e=>e.target.style.borderColor="#1e2a3a"}
                        />
                        <button
                          onClick={()=>changeDesc(row.id, cleanDesc(row.description))}
                          style={{
                            background:"#1e2a3a",border:"none",borderRadius:5,
                            color:"#64748b",fontSize:11,cursor:"pointer",
                            padding:"3px 6px",flexShrink:0,fontWeight:700,
                          }}>✂</button>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        {["expense","income"].map(t=>(
                          <button key={t} onClick={()=>changeType(row.id,t)} style={{
                            padding:"1px 7px",borderRadius:6,border:"none",cursor:"pointer",fontSize:10,fontWeight:700,
                            background: row.type===t ? (t==="income"?"#22d3ee22":"#ef444422") : "#1e2a3a",
                            color: row.type===t ? (t==="income"?"#22d3ee":"#ef4444") : "#475569",
                          }}>{t==="income"?"Доход":"Расход"}</button>
                        ))}
                      </div>
                    </div>
                    <select
                      value={row.category}
                      onChange={e=>changeCat(row.id,e.target.value)}
                      style={{
                        background:"#131d2e",border:"1px solid #1e2a3a",borderRadius:6,
                        color:"white",WebkitTextFillColor:"white",fontSize:11,padding:"4px 6px",
                        width:"100%",colorScheme:"dark",
                      }}>
                      {cats.map(c=><option key={c}>{c}</option>)}
                    </select>
                    <div style={{
                      textAlign:"right",fontSize:12,fontWeight:700,
                      color:row.type==="income"?"#22d3ee":"#f87171",whiteSpace:"nowrap"
                    }}>
                      {row.type==="income"?"+":"−"}{Math.round(row.amount).toLocaleString("ru-RU")}
                    </div>
                    <button onClick={()=>toggleSkip(row.id)} style={{
                      background:"none",border:"none",cursor:"pointer",
                      color:row.skip?"#10b981":"#475569",fontSize:16,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      transition:"color .15s",
                    }}>{row.skip?"↩":"×"}</button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setStep("upload")} style={{
                flex:1,padding:"12px",borderRadius:12,background:"#1e2a3a",border:"none",
                color:"#94a3b8",fontSize:14,fontWeight:600,cursor:"pointer",
              }}>← Назад</button>
              <button onClick={doImport} disabled={importing||toImport.length===0} style={{
                flex:2,padding:"12px",borderRadius:12,background:"#4f46e5",border:"none",
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
              <div style={{fontSize:13,color:"#64748b",marginBottom:24}}>
                {toImport.length} операций добавлены в финансы
              </div>
              <button onClick={onClose} style={{
                padding:"12px 32px",borderRadius:12,background:"#4f46e5",border:"none",
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

  const tt = {background:"#0f1623",border:"1px solid #1e2a3a",borderRadius:8,fontSize:12,color:"white"};

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
          background:"#10b98122",border:"1px solid #10b98144",color:"#10b981",flexShrink:0,
        }}>
          📂 Импорт CSV
        </button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
        {[
          {label:"Доходы",val:inc,color:"#818cf8"},
          {label:"Расходы",val:exp,color:"#f87171"},
          {label:"Баланс",val:inc-exp,color:inc>=exp?"#34d399":"#f87171"},
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
                  <Legend iconType="circle" iconSize={7} formatter={v=><span style={{fontSize:10,color:"#94a3b8"}}>{v}</span>}/>
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
                  <Legend iconType="circle" iconSize={7} formatter={v=><span style={{fontSize:10,color:"#94a3b8"}}>{v}</span>}/>
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
              background:"#0f1623",border:"1px solid #1e2a3a",borderRadius:12,
              padding:"12px 16px",display:"flex",alignItems:"center",gap:12,
            }}>
              <div style={{width:4,height:36,borderRadius:2,flexShrink:0,
                background:t.type==="income"?"#6366f1":"#ef4444"}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:"#e2e8f0",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {t.description||t.category}
                </div>
                <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{t.category} · {fmtD(t.date)}</div>
              </div>
              <div style={{fontWeight:700,fontSize:14,flexShrink:0,
                color:t.type==="income"?"#818cf8":"#f87171"}}>
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
                  background:confirmDel===t.id?"#ef444433":"transparent",
                  color:confirmDel===t.id?"#ef4444":"#64748b",
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
  const tt = {background:"#0f1623",border:"1px solid #1e2a3a",borderRadius:8,fontSize:12,color:"white"};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {[
          {label:"Всего проектов",       value:projects.length,                                  color:"#6366f1"},
          {label:"Завершено и оплачено", value:projects.filter(p=>p.stage==="Оплачен").length,  color:"#10b981"},
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
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" horizontal={false}/>
              <XAxis type="number" tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}
                tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}к`:v}/>
              <YAxis type="category" dataKey="name" tick={{fill:"#94a3b8",fontSize:11}} width={165} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={tt} formatter={(v,n)=>[fmt(v),n==="contract"?"Договор":"Оплачено"]}/>
              <Bar dataKey="contract" name="contract" fill="#6366f1" radius={[0,4,4,0]}/>
              <Bar dataKey="paid"     name="paid"     fill="#10b981" radius={[0,4,4,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {months12.some(m=>m.balance!==0)&&(
        <Card>
          <SectionTitle>Баланс по месяцам — 12 мес.</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={months12}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" vertical={false}/>
              <XAxis dataKey="label" tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fill:"#64748b",fontSize:10}} axisLine={false} tickLine={false}
                tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}к`:v<=-1000?`-${Math.abs(v/1000).toFixed(0)}к`:v}/>
              <Tooltip contentStyle={tt} formatter={v=>[fmt(v),"Баланс"]}/>
              <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2.5} dot={false}/>
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
                <div style={{width:160,textAlign:"right",fontSize:12,color:"#94a3b8",fontWeight:500}}>{stage}</div>
                <div style={{flex:1,height:28,background:"#1e2a3a",borderRadius:8,overflow:"hidden"}}>
                  {w>0&&(
                    <div style={{height:"100%",borderRadius:8,display:"flex",alignItems:"center",
                      justifyContent:"flex-end",paddingRight:10,fontSize:12,fontWeight:700,color:"white",
                      width:`${w}%`,background:STAGE_META[stage]?.color||"#6366f1"}}>
                      {count}
                    </div>
                  )}
                </div>
                <div style={{width:20,textAlign:"center",fontSize:11,color:"#475569"}}>{count}</div>
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
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"center",padding:"56px 0",color:"#475569"}}>
      <div style={{fontSize:36,marginBottom:12}}>📭</div>
      <p style={{fontSize:13,margin:0}}>{text}</p>
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
          <p style={{fontSize:13,color:"#94a3b8",marginBottom:12,lineHeight:1.5}}>
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
          <p style={{fontSize:13,color:"#94a3b8",marginBottom:12,lineHeight:1.5}}>
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
          <p style={{fontSize:13,color:"#94a3b8",marginBottom:12,lineHeight:1.5}}>
            Попытка прочитать данные из локального хранилища предыдущей версии
            (window.storage). Сработает только если этот артефакт открыт в той же
            среде Claude, что и старый. Если нет — используй вкладку «Импорт из JSON».
          </p>
          {!legacyChecked ? (
            <p style={{color:"#64748b",fontSize:13}}>Проверяю...</p>
          ) : !legacyData || (legacyData.projects.length === 0 && legacyData.txs.length === 0) ? (
            <div style={{
              background:"#1e2a3a",border:"1px solid #334155",borderRadius:12,
              padding:16,textAlign:"center",color:"#94a3b8",fontSize:13,
            }}>
              В локальном хранилище нет данных предыдущей версии.
              Воспользуйся вкладкой «Импорт из JSON».
            </div>
          ) : (
            <>
              <div style={{
                background:"#1e2a3a",borderRadius:12,padding:14,marginBottom:12,
                display:"flex",justifyContent:"space-around",
              }}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase"}}>Проектов</div>
                  <div style={{fontSize:22,fontWeight:900,color:"#818cf8",marginTop:2}}>{legacyData.projects.length}</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:700,textTransform:"uppercase"}}>Транзакций</div>
                  <div style={{fontSize:22,fontWeight:900,color:"#22d3ee",marginTop:2}}>{legacyData.txs.length}</div>
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
    "Переговоры":"#94a3b8","КП выслано":"#60a5fa","Договор подписан":"#a78bfa",
    "В работе":"#fbbf24","Сдан заказчику":"#34d399","Оплачен":"#10b981","Архив":"#475569"
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
      const c=sc[p.stage]||"#6366f1";
      return `<tr style="background:${i%2===0?"white":"#fafafa"}">
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;">
          <div style="font-weight:700;color:#0f172a;font-size:13px;">${p.name}</div>
          ${p.client?`<div style="color:#64748b;font-size:11px;margin-top:1px;">${p.client}</div>`:""}
        </td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569;">${p.type||"—"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#475569;">${p.executor||"—"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;">
          <span style="display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${c}22;color:${c};">${p.stage}</span>
        </td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:#0f172a;font-size:13px;">${contract>0?fmt(contract):"—"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#10b981;font-size:13px;">${paid>0?fmt(paid):"—"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;font-size:13px;color:${debt>0?"#ef4444":"#10b981"};">${contract>0?(debt>0?fmt(debt):"✓"):"—"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:12px;color:#64748b;">${p.deadline?new Date(p.deadline+"T00:00:00").toLocaleDateString("ru-RU",{day:"numeric",month:"short"}):"—"}</td>
      </tr>`;
    }).join("");
    el.innerHTML = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;min-height:100vh;padding:32px 24px;">
        <div style="max-width:1050px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:16px;padding:28px 36px;color:white;margin-bottom:20px;">
            <div style="font-size:21px;font-weight:900;letter-spacing:-.02em;margin-bottom:4px;"><span style="color:#a5b4fc;">Д</span>АНИИЛ — Отчёт по проектам</div>
            <div style="font-size:13px;opacity:.7;">Сформирован ${dateStr} · ${labels[stage]} · ${visible.length} проектов</div>
            <div style="display:flex;gap:14px;margin-top:18px;flex-wrap:wrap;">
              ${[
                {l:"Сумма договоров",v:fmt(totalContract),c:"#93c5fd"},
                {l:"Получено",v:fmt(totalPaid),c:"#6ee7b7"},
                {l:"К получению",v:fmt(totalDebt),c:totalDebt>0?"#fca5a5":"#6ee7b7"},
                {l:"% оплаты",v:`${totalContract>0?Math.round(totalPaid/totalContract*100):0}%`,c:"white"},
              ].map(k=>`<div style="background:rgba(255,255,255,.12);border-radius:12px;padding:12px 18px;min-width:130px;">
                <div style="font-size:10px;opacity:.7;text-transform:uppercase;letter-spacing:.1em;font-weight:700;">${k.l}</div>
                <div style="font-size:19px;font-weight:900;color:${k.c};margin-top:4px;">${k.v}</div>
              </div>`).join("")}
            </div>
          </div>
          ${visible.length===0
            ? `<div style="text-align:center;padding:48px;color:#94a3b8;">Нет проектов</div>`
            : `<div style="background:white;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:20px;">
                <table style="width:100%;border-collapse:collapse;">
                  <thead><tr style="background:#f8fafc;">
                    ${["Проект / Клиент","Тип работ","Исполнитель","Стадия","По договору","Оплачено","Остаток","Дедлайн"].map((h,i)=>`<th style="padding:10px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;border-bottom:2px solid #e2e8f0;text-align:${i>=4?"right":"left"};">${h}</th>`).join("")}
                  </tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>`}
          ${visible.some(p=>p.notes)?`<div style="background:white;border-radius:12px;border:1px solid #e2e8f0;padding:18px 22px;margin-bottom:16px;">
            <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;">Примечания</div>
            ${visible.filter(p=>p.notes).map(p=>`<div style="margin-bottom:6px;font-size:13px;"><b>${p.name}:</b> <span style="color:#475569;">${p.notes}</span></div>`).join("")}
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
        background:"#1e1b4b",padding:"10px 24px",
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
              background:"white",color:"#1e1b4b",borderRadius:5,
              padding:"2px 8px",fontFamily:"monospace",fontSize:13,fontWeight:800,
            }}>Ctrl+P</kbd>
            <span style={{fontSize:12,color:"#818cf8"}}>или</span>
            <kbd style={{
              background:"white",color:"#1e1b4b",borderRadius:5,
              padding:"2px 8px",fontFamily:"monospace",fontSize:13,fontWeight:800,
            }}>Cmd+P</kbd>
            <span style={{fontSize:12,color:"#818cf8"}}>→ «Сохранить как PDF»</span>
          </div>
          <button onClick={()=>setShowPreview(false)} style={{
            padding:"8px 14px",borderRadius:8,background:"#334155",border:"none",
            color:"white",fontWeight:600,fontSize:13,cursor:"pointer"
          }}>← Назад</button>
        </div>
      </div>
      <div id="report-inline" style={{
        fontFamily:"system-ui,sans-serif",background:"#f8fafc",minHeight:"calc(100vh - 52px)"
      }}>
        <div style={{maxWidth:1050,margin:"0 auto",padding:"28px 24px"}}>
          <div style={{background:"linear-gradient(135deg,#1e1b4b,#312e81)",borderRadius:16,padding:"28px 36px",color:"white",marginBottom:20}}>
            <div style={{fontSize:21,fontWeight:900,letterSpacing:"-.02em",marginBottom:4}}>
              <span style={{color:"#a5b4fc"}}>Д</span>АНИИЛ — Отчёт по проектам
            </div>
            <div style={{fontSize:13,opacity:.7}}>Сформирован {dateStr} · {labels[stage]} · {visible.length} проектов</div>
            <div style={{display:"flex",gap:14,marginTop:18,flexWrap:"wrap"}}>
              {[
                {l:"Сумма договоров",v:fmt(totalContract),c:"#93c5fd"},
                {l:"Получено",       v:fmt(totalPaid),     c:"#6ee7b7"},
                {l:"К получению",    v:fmt(totalDebt),     c:totalDebt>0?"#fca5a5":"#6ee7b7"},
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
            ? <div style={{textAlign:"center",padding:48,color:"#94a3b8",fontSize:14}}>Нет проектов</div>
            : <div style={{background:"white",borderRadius:14,border:"1px solid #e2e8f0",overflow:"hidden",marginBottom:20}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr style={{background:"#f8fafc"}}>
                      {["Проект / Клиент","Тип работ","Исполнитель","Стадия","По договору","Оплачено","Остаток","Дедлайн"].map((h,i)=>(
                        <th key={h} style={{padding:"10px 14px",fontSize:10,fontWeight:700,textTransform:"uppercase",
                          letterSpacing:".1em",color:"#94a3b8",borderBottom:"2px solid #e2e8f0",
                          textAlign:i>=4?"right":"left"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((p,i)=>{
                      const contract=+p.contractSum||0,paid=+p.paidAmount||0,debt=contract-paid;
                      const c=stageColor[p.stage]||"#6366f1";
                      return (
                        <tr key={p.id} style={{background:i%2===0?"white":"#fafafa"}}>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9"}}>
                            <div style={{fontWeight:700,color:"#0f172a",fontSize:13}}>{p.name}</div>
                            {p.client&&<div style={{color:"#64748b",fontSize:11,marginTop:1}}>{p.client}</div>}
                          </td>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",fontSize:12,color:"#475569"}}>{p.type||"—"}</td>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",fontSize:12,color:"#475569"}}>{p.executor||"—"}</td>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9"}}>
                            <span style={{display:"inline-block",padding:"2px 9px",borderRadius:20,fontSize:11,fontWeight:700,background:c+"22",color:c}}>{p.stage}</span>
                          </td>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",textAlign:"right",fontWeight:600,color:"#0f172a",fontSize:13}}>{contract>0?fmt(contract):"—"}</td>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",textAlign:"right",fontWeight:700,color:"#10b981",fontSize:13}}>{paid>0?fmt(paid):"—"}</td>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",textAlign:"right",fontWeight:700,fontSize:13,color:debt>0?"#ef4444":"#10b981"}}>{contract>0?(debt>0?fmt(debt):"✓"):"—"}</td>
                          <td style={{padding:"10px 14px",borderBottom:"1px solid #f1f5f9",textAlign:"right",fontSize:12,color:"#64748b"}}>{p.deadline?new Date(p.deadline+"T00:00:00").toLocaleDateString("ru-RU",{day:"numeric",month:"short"}):"—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>}
          {visible.some(p=>p.notes)&&(
            <div style={{background:"white",borderRadius:12,border:"1px solid #e2e8f0",padding:"18px 22px",marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".1em",marginBottom:10}}>Примечания</div>
              {visible.filter(p=>p.notes).map(p=>(
                <div key={p.id} style={{marginBottom:6,fontSize:13}}>
                  <b>{p.name}:</b> <span style={{color:"#475569"}}>{p.notes}</span>
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
      <p style={{fontSize:13,color:"#94a3b8",marginBottom:16,lineHeight:1.6}}>
        Отчёт откроется прямо здесь. Нажми «Печать / PDF» — браузер сохранит красивый PDF который можно отправить заказчику.
      </p>
      <div style={{marginBottom:16}}>
        <p style={{fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",
          letterSpacing:"0.12em",marginBottom:8}}>Фильтр по стадии</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {stages.map(s=>(
            <button key={s} onClick={()=>setStage(s)} style={{
              padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"pointer",
              background:stage===s?"#4f46e5":"#1e2a3a",
              color:stage===s?"white":"#94a3b8",
              border:"none",transition:"all .15s",
            }}>{labels[s]}</button>
          ))}
        </div>
      </div>
      <div style={{
        padding:"12px 16px",background:"#1e2a3a",borderRadius:12,marginBottom:16,
        display:"flex",justifyContent:"space-between",alignItems:"center",
      }}>
        <span style={{fontSize:13,color:"#94a3b8"}}>Проектов в отчёте</span>
        <span style={{fontSize:18,fontWeight:900,color:"#818cf8"}}>{visible.length}</span>
      </div>
      <button onClick={()=>setShowPreview(true)} style={{
        width:"100%",padding:14,borderRadius:14,background:"#4f46e5",border:"none",
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
    <div style={{minHeight:"100vh",background:"#080e1a",display:"flex",
      alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#6366f1",fontWeight:700,letterSpacing:"0.15em",
        fontSize:13,textTransform:"uppercase"}}>Подключаемся к серверу...</div>
    </div>
  );

  if (phase === "error") return (
    <div style={{minHeight:"100vh",background:"#080e1a",color:"white",
      display:"flex",alignItems:"center",justifyContent:"center",padding:24,
      fontFamily:"system-ui,-apple-system,sans-serif"}}>
      <Card style={{maxWidth:400,textAlign:"center"}}>
        <div style={{fontSize:42,marginBottom:14}}>⚠️</div>
        <div style={{fontSize:16,fontWeight:700,color:"white",marginBottom:8}}>
          Ошибка подключения
        </div>
        <p style={{fontSize:13,color:"#94a3b8",marginBottom:20,lineHeight:1.5}}>
          {errorMsg}
        </p>
        <button onClick={()=>window.location.reload()} className={BTN.primary} style={{width:"100%"}}>
          Попробовать снова
        </button>
      </Card>
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
    {id:"dashboard", label:"Дашборд",   icon:"◈"},
    {id:"projects",  label:"Проекты",   icon:"▦"},
    {id:"finance",   label:"Финансы",   icon:"◎"},
    {id:"analytics", label:"Аналитика", icon:"◇"},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#080e1a",color:"white",
      fontFamily:"system-ui,-apple-system,sans-serif"}}>

      {/* Header */}
      <div style={{borderBottom:"1px solid #1e2a3a",padding:"14px 24px",
        display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
        <div>
          <h1 style={{margin:0,fontSize:17,fontWeight:900,letterSpacing:"-0.02em"}}>
            <span style={{color:"#6366f1"}}>Д</span>АНИИЛ
            <span style={{color:"#334155",fontWeight:400,fontSize:13,marginLeft:8}}>/ рабочий центр</span>
          </h1>
          <p style={{margin:"2px 0 0",fontSize:10,color:"#334155",
            textTransform:"uppercase",letterSpacing:"0.1em"}}>
            Проекты · Финансы · Аналитика
          </p>
        </div>

        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
            <button onClick={()=>setReportModal(true)} style={{
              fontSize:11,padding:"4px 10px",borderRadius:8,cursor:"pointer",fontWeight:600,
              background:"#4f46e533",border:"1px solid #6366f1",color:"#818cf8",
            }} title="Экспорт отчёта для заказчика">
              📄 Отчёт
            </button>
            <button onClick={()=>setBackupModal(true)} style={{
              fontSize:11,padding:"4px 10px",borderRadius:8,cursor:"pointer",fontWeight:600,
              background:"#1e2a3a",border:"1px solid #334155",color:"#94a3b8",
            }} title="Резерв и миграция данных">
              📦 Резерв
            </button>
            <button onClick={handleSignOut} style={{
              fontSize:11,padding:"4px 10px",borderRadius:8,cursor:"pointer",fontWeight:600,
              background:"#ef444422",border:"1px solid #ef444444",color:"#fca5a5",
            }} title="Выйти из аккаунта">
              ⎋ Выход
            </button>
            <div style={{fontSize:11,color:"#475569"}}>
              {new Date().toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"})}
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {profile?.role==="admin" && (
              <span style={{
                fontSize:9,padding:"2px 7px",borderRadius:5,fontWeight:700,
                background:"#fbbf2422",color:"#fbbf24",letterSpacing:"0.08em",
              }}>ADMIN</span>
            )}
            <div style={{
              fontSize:10,padding:"2px 8px",borderRadius:6,fontWeight:600,
              background:"#10b98122",color:"#10b981",
            }}>
              ☁ {profile?.email}
            </div>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div style={{borderBottom:"1px solid #1e2a3a",padding:"0 24px",display:"flex",overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:"14px 20px",fontSize:13,fontWeight:600,
            color: tab===t.id?"#818cf8":"#64748b",
            background:"none",border:"none",
            borderBottom:`2px solid ${tab===t.id?"#6366f1":"transparent"}`,
            cursor:"pointer",transition:"all 0.2s",
            display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap",
          }}>
            <span style={{fontSize:15}}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Page content */}
      <div style={{padding:24,maxWidth:960,margin:"0 auto"}}>
        {tab==="dashboard"  && <Dashboard  projects={projects} txs={txs}/>}
        {tab==="projects"   && <Projects   projects={projects} setProjects={setProjects} client={supabase} ownerId={profile.id} showToast={showToast}/>}
        {tab==="finance"    && <Finance    txs={txs} setTxs={setTxs} client={supabase} ownerId={profile.id} showToast={showToast}/>}
        {tab==="analytics"  && <Analytics  projects={projects} txs={txs}/>}
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

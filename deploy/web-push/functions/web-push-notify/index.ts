// Edge Function web-push-notify — Web Push уведомления (замена telegram-notify).
// Секрет (VAPID) — в config.json рядом (НЕ в git). PostgREST под service_role
// через SUPABASE_URL=http://kong:8000. Фильтр получателей по profiles.notif_*.
//
// Типы: task_assigned / task_status / task_created / deadline / project_taken /
//       team_invite / comment / project_published.
import cfg from "./config.json" with { type: "json" };
import * as webpush from "jsr:@negrel/webpush";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;        // http://kong:8000
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200): Response =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function rest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, ...(init?.headers || {}) },
  });
}

// VAPID application server (один раз на холодный старт isolate)
const vapidKeys = await webpush.importVapidKeys(cfg.vapidKeys);
const appServer = await webpush.ApplicationServer.new({
  contactInformation: cfg.subject,
  vapidKeys,
});

// получатели по id-списку + флагу notif_*, минус инициатор
async function recipients(ids: (string | null | undefined)[], initiator: string | undefined, flag: string): Promise<string[]> {
  const uniq = [...new Set(ids.filter(Boolean).filter((x) => x !== initiator))] as string[];
  if (!uniq.length) return [];
  const inList = uniq.map((x) => `"${x}"`).join(",");
  const r = await rest(`profiles?id=in.(${inList})&${flag}=eq.true&select=id`);
  const rows = await r.json();
  return Array.isArray(rows) ? rows.map((p) => p.id) : [];
}

// все одобренные минус владелец (broadcast)
async function broadcastApproved(ownerId: string | undefined, flag: string): Promise<string[]> {
  const r = await rest(`profiles?approved=eq.true&${flag}=eq.true&select=id`);
  const rows = await r.json();
  return Array.isArray(rows) ? rows.map((p) => p.id).filter((id) => id !== ownerId) : [];
}

// участники проекта (project_members) — может быть пуст в текущей модели
async function projectMembers(projectId: string | null): Promise<string[]> {
  if (!projectId) return [];
  const r = await rest(`project_members?project_id=eq.${projectId}&select=user_id`);
  const rows = await r.json();
  return Array.isArray(rows) ? rows.map((m) => m.user_id) : [];
}

async function projectOwner(projectId: string | null): Promise<string | null> {
  if (!projectId) return null;
  const r = await rest(`projects?id=eq.${projectId}&select=owner_id`);
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0].owner_id : null;
}

// отправка payload всем подпискам перечисленных пользователей; 404/410 → удалить
async function sendToUsers(userIds: string[], payload: object): Promise<number> {
  if (!userIds.length) return 0;
  const inList = userIds.map((x) => `"${x}"`).join(",");
  const r = await rest(`push_subscriptions?user_id=in.(${inList})&select=endpoint,p256dh,auth`);
  const subs = await r.json();
  if (!Array.isArray(subs)) return 0;
  const msg = JSON.stringify(payload);
  let sent = 0;
  for (const s of subs) {
    try {
      const subscriber = appServer.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } });
      await subscriber.pushTextMessage(msg, {});
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" });
      } else {
        console.warn("push send error", String(e));
      }
    }
  }
  return sent;
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

async function loadTask(taskId: string) {
  const tr = await rest(`project_tasks?id=eq.${taskId}&select=title,project_id,author_id,assigned_to,status,due_date`);
  const rows = await tr.json();
  return Array.isArray(rows) ? rows[0] : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const b = await req.json().catch(() => ({} as Record<string, unknown>));
  const type = b.type as string | undefined;
  const initiator = b.initiatorId as string | undefined;
  try {
    // --- task-события ---
    if (type === "task_assigned" || type === "task_status" || type === "task_created") {
      const taskId = b.taskId as string | undefined;
      if (!taskId || !UUID.test(taskId)) return j({ error: "valid taskId (uuid) required" }, 400);
      const task = await loadTask(taskId);
      if (!task) return j({ ok: true, note: "task not found" });
      let ids: string[] = [];
      let body = "";
      if (type === "task_assigned") {
        ids = await recipients([task.assigned_to], initiator, "notif_task");
        body = `📌 Вам назначена задача: ${task.title}`;
      } else if (type === "task_status") {
        ids = await recipients([task.author_id, task.assigned_to], initiator, "notif_task");
        body = `🔄 Задача «${task.title}» → ${task.status}`;
      } else {
        const members = await projectMembers(task.project_id);
        const owner = await projectOwner(task.project_id);
        ids = await recipients([...members, owner].filter((x) => x !== task.assigned_to), initiator, "notif_task");
        body = `🆕 Новая задача в проекте: ${task.title}`;
      }
      const sent = await sendToUsers(ids, { title: "КЛИМАТ-ПРО", body, url: "/", tag: `task-${taskId}` });
      return j({ ok: true, sent });
    }

    // --- deadline (cron): задачи с due_date в ближайшие сутки, не финальные ---
    if (type === "deadline") {
      const tr = await rest(
        `project_tasks?select=id,title,author_id,assigned_to,due_date,status` +
          `&due_date=gte.${new Date().toISOString().slice(0, 10)}` +
          `&due_date=lte.${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}` +
          `&status=not.in.(%22Готово%22,%22Отменена%22)`
      );
      const tasks = await tr.json();
      if (!Array.isArray(tasks)) return j({ ok: true, sent: 0 });
      let total = 0;
      for (const t of tasks) {
        const ids = await recipients([t.author_id, t.assigned_to], undefined, "notif_deadline");
        total += await sendToUsers(ids, { title: "КЛИМАТ-ПРО", body: `⏰ Срок задачи «${t.title}»: ${t.due_date}`, url: "/", tag: `task-${t.id}` });
      }
      return j({ ok: true, sent: total });
    }

    // --- legacy с явным адресатом ---
    if (type === "project_taken" || type === "team_invite") {
      const flag = type === "project_taken" ? "notif_project_taken" : "notif_team_invite";
      const ids = await recipients([b.recipientId as string], initiator, flag);
      const body = type === "project_taken" ? "✅ Ваш проект взят в работу" : "👥 Вас пригласили в команду проекта";
      const sent = await sendToUsers(ids, { title: "КЛИМАТ-ПРО", body, url: "/" });
      return j({ ok: true, sent });
    }

    // --- комментарий/вопрос по задаче ---
    if (type === "comment") {
      const taskId = b.taskId as string | undefined;
      if (!taskId || !UUID.test(taskId)) return j({ error: "valid taskId (uuid) required" }, 400);
      const task = await loadTask(taskId);
      if (!task) return j({ ok: true, note: "task not found" });
      const members = await projectMembers(task.project_id);
      const ids = await recipients([task.author_id, task.assigned_to, ...members], initiator, "notif_comment");
      const sent = await sendToUsers(ids, { title: "КЛИМАТ-ПРО", body: `💬 Новый комментарий: ${task.title}`, url: "/", tag: `task-${taskId}` });
      return j({ ok: true, sent });
    }

    // --- broadcast: новый проект в поиске исполнителя ---
    if (type === "project_published") {
      const ids = await broadcastApproved(b.ownerId as string, "notif_new_project");
      const sent = await sendToUsers(ids, { title: "КЛИМАТ-ПРО", body: "🆕 Новый проект в поиске исполнителя", url: "/" });
      return j({ ok: true, sent });
    }

    return j({ ok: true, note: "unknown type" });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});

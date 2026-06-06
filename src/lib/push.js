// Web Push: подписка/отписка браузера + сохранение в push_subscriptions.
const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushState() {
  if (!isPushSupported()) return { supported: false, subscribed: false, permission: 'default' }
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return { supported: true, subscribed: !!sub, permission: Notification.permission }
}

export async function enablePush(client) {
  if (!isPushSupported()) throw new Error('Push не поддерживается этим браузером')
  if (!VAPID_PUBLIC) throw new Error('VAPID public key не сконфигурирован')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Нет разрешения на уведомления')
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
  })
  const json = sub.toJSON()
  const {
    data: { user },
  } = await client.auth.getUser()
  const { error } = await client.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: 'endpoint' }
  )
  if (error) throw error
  return true
}

export async function disablePush(client) {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await client.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

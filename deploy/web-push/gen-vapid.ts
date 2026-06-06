// Генерация VAPID-ключей (один раз). Печатает JSON { publicKey, privateKey }.
// Запуск: deno run deploy/web-push/gen-vapid.ts
// publicKey (base64url) → фронт (.env VITE_VAPID_PUBLIC_KEY)
// весь JSON → config.json edge-функции web-push-notify (vapidKeys), НЕ в git.
import * as webpush from "jsr:@negrel/webpush";

const keys = await webpush.generateVapidKeys({ extractable: true });
const exported = await webpush.exportVapidKeys(keys);
console.log(JSON.stringify(exported, null, 2));

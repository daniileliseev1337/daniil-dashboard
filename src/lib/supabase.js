// Единый Supabase client для всего приложения.
// Используется как App.jsx (admin v1.5), так и новыми trading-модулями.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Не заданы переменные окружения VITE_SUPABASE_URL и VITE_SUPABASE_KEY. " +
    "Проверь файл .env (локально) или Environment Variables на Vercel."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

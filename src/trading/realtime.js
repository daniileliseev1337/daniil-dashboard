// Realtime подписки на trading-таблицы.
// Возвращают функцию unsubscribe (вызывать в useEffect cleanup).
import { supabase } from "../lib/supabase";

/**
 * Подписка на INSERT/UPDATE в trading_signals.
 * onChange({ eventType, new, old }) вызывается на каждое событие.
 */
export function subscribeToSignals(onChange) {
  const channel = supabase
    .channel("trading_signals_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trading_signals" },
      (payload) => onChange(payload),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Подписка на UPDATE trading_system_state (kill_switch / sandbox toggle).
 */
export function subscribeToSystemState(onChange) {
  const channel = supabase
    .channel("trading_system_state_changes")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "trading_system_state" },
      (payload) => onChange(payload),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// Supabase queries для trading_* таблиц.
// RLS гарантирует что только trading_admin user видит данные.
import { supabase } from "../lib/supabase";

// ───────── System state ─────────

export async function fetchSystemState() {
  const { data, error } = await supabase
    .from("trading_system_state")
    .select("*")
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

export async function updateSystemState(patch) {
  const { data, error } = await supabase
    .from("trading_system_state")
    .update({ ...patch, updated_by: "web" })
    .eq("id", 1)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ───────── Signals ─────────

export async function fetchRecentSignals({ limit = 50, statusIn = null } = {}) {
  let q = supabase
    .from("trading_signals")
    .select("*")
    .order("ts", { ascending: false })
    .limit(limit);
  if (statusIn && statusIn.length) q = q.in("status", statusIn);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function confirmSignal(signalId) {
  const { data, error } = await supabase
    .from("trading_signals")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_via: "web",
    })
    .eq("id", signalId)
    .eq("status", "pending_confirm")
    .select();
  if (error) throw error;
  return data;
}

export async function rejectSignal(signalId) {
  const { data, error } = await supabase
    .from("trading_signals")
    .update({
      status: "rejected",
      confirmed_at: new Date().toISOString(),
      confirmed_via: "web",
    })
    .eq("id", signalId)
    .eq("status", "pending_confirm")
    .select();
  if (error) throw error;
  return data;
}

// ───────── Positions ─────────

export async function fetchPositions() {
  const { data, error } = await supabase
    .from("trading_positions")
    .select("*, trading_instruments(ticker, name)")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// ───────── Watchlist ─────────

export async function fetchWatchlist() {
  const { data, error } = await supabase
    .from("trading_watchlist")
    .select("figi, active, strategies, timeframes, trading_instruments(ticker, name, lot)")
    .order("figi");
  if (error) throw error;
  return data || [];
}

// ───────── Instruments (для отображения ticker по figi) ─────────

export async function fetchInstrumentsMap() {
  const { data, error } = await supabase
    .from("trading_instruments")
    .select("figi, ticker, name");
  if (error) throw error;
  const map = {};
  for (const inst of data || []) {
    map[inst.figi] = inst;
  }
  return map;
}

// ───────── Audit log ─────────

export async function fetchRecentAudit({ limit = 30 } = {}) {
  const { data, error } = await supabase
    .from("trading_audit_log")
    .select("*")
    .order("ts", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

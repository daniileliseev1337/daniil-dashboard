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

// ───────── P&L summary ─────────

/**
 * Сводка по доходам:
 *   total_pnl        = sum(realized) + sum(unrealized) по всем позициям
 *   total_realized   = sum(realized_pnl) -- закрытые лоты с момента открытия
 *   total_unrealized = sum(unrealized_pnl) -- бумажный по открытым позициям
 *   today_trades     = кол-во executed-сигналов за сегодня (UTC start of day)
 */
export async function fetchPnlSummary() {
  const todayIsoStart = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
  const [posRes, tradesRes] = await Promise.all([
    supabase.from("trading_positions").select("realized_pnl, unrealized_pnl"),
    supabase
      .from("trading_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("action", "signal.executed")
      .gte("ts", todayIsoStart),
  ]);
  if (posRes.error) throw posRes.error;
  if (tradesRes.error) throw tradesRes.error;
  const rows = posRes.data || [];
  let realized = 0;
  let unrealized = 0;
  for (const r of rows) {
    realized += parseFloat(r.realized_pnl || 0);
    unrealized += parseFloat(r.unrealized_pnl || 0);
  }
  return {
    total_realized: realized,
    total_unrealized: unrealized,
    total_pnl: realized + unrealized,
    today_trades: tradesRes.count || 0,
  };
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

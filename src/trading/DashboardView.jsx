import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Wallet,
  ShieldAlert,
  Bell,
  TrendingUp,
  TrendingDown,
  Loader2,
} from "lucide-react";
import {
  fetchSystemState,
  fetchPositions,
  fetchRecentSignals,
  fetchPnlSummary,
  updateSystemState,
} from "./api";
import {
  subscribeToSystemState,
  subscribeToSignals,
  subscribeToPositions,
} from "./realtime";

export default function DashboardView() {
  const [state, setState] = useState(null);
  const [positions, setPositions] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [pnl, setPnl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, pos, pending, summary] = await Promise.all([
        fetchSystemState(),
        fetchPositions(),
        fetchRecentSignals({ limit: 100, statusIn: ["pending_confirm"] }),
        fetchPnlSummary(),
      ]);
      setState(s);
      setPositions(pos);
      setPendingCount(pending.length);
      setPnl(summary);
    } catch (e) {
      console.error("Dashboard load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPnl = useCallback(() => {
    fetchPnlSummary().then(setPnl).catch(console.error);
  }, []);

  useEffect(() => {
    reload();
    const unsubSig = subscribeToSignals(() => {
      fetchRecentSignals({ limit: 100, statusIn: ["pending_confirm"] })
        .then((p) => setPendingCount(p.length))
        .catch(console.error);
    });
    const unsubState = subscribeToSystemState((payload) => {
      setState(payload.new);
    });
    const unsubPos = subscribeToPositions(() => {
      // позиция обновилась -> пересчитать P&L и положения
      fetchPositions().then(setPositions).catch(console.error);
      refreshPnl();
    });
    return () => {
      unsubSig();
      unsubState();
      unsubPos();
    };
  }, [reload, refreshPnl]);

  const toggleKillSwitch = async () => {
    if (!state) return;
    const confirmText = state.kill_switch
      ? "Снять kill_switch?"
      : "ВКЛЮЧИТЬ kill_switch? Все новые ордера будут блокированы.";
    if (!confirm(confirmText)) return;
    setBusy(true);
    try {
      const updated = await updateSystemState({ kill_switch: !state.kill_switch });
      setState(updated);
    } catch (e) {
      alert("Ошибка: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <LoadingBlock />;
  }

  const totalPnl = positions.reduce(
    (sum, p) => sum + parseFloat(p.unrealized_pnl || 0),
    0,
  );
  const isSandbox = !!state?.sandbox_mode;
  const killOn = !!state?.kill_switch;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* P&L summary -- сводка по доходам, обновляется Realtime через trading_positions */}
      <PnlSummary pnl={pnl} />

      {/* Status row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <StatusCard
          Icon={Wallet}
          title="Режим"
          value={isSandbox ? "Sandbox" : "PROD"}
          accentColor={isSandbox ? "#7aa6ff" : "#ef4444"}
          accentBg={isSandbox ? "rgba(122,166,255,0.12)" : "rgba(239,68,68,0.12)"}
          accentBorder={isSandbox ? "rgba(122,166,255,0.30)" : "rgba(239,68,68,0.30)"}
        />
        <button
          onClick={toggleKillSwitch}
          disabled={busy}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 16px",
            borderRadius: 12,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.5 : 1,
            background: killOn ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${killOn ? "rgba(239,68,68,0.40)" : "rgba(255,255,255,0.06)"}`,
            color: killOn ? "#ef9a9a" : "#a8a8a3",
            fontFamily: "inherit",
            textAlign: "left",
            transition: "background 0.15s",
          }}
        >
          <ShieldAlert size={20} strokeWidth={2.2} />
          <div>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                opacity: 0.7,
              }}
            >
              Kill switch
            </div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {killOn ? "ВКЛЮЧЁН" : "OFF"}
            </div>
          </div>
        </button>
        <StatusCard
          Icon={Bell}
          title="Pending сигналы"
          value={String(pendingCount)}
          accentColor={pendingCount > 0 ? "#e8c860" : "#a8a8a3"}
          accentBg={pendingCount > 0 ? "rgba(212,175,55,0.10)" : "rgba(255,255,255,0.04)"}
          accentBorder={pendingCount > 0 ? "rgba(212,175,55,0.30)" : "rgba(255,255,255,0.06)"}
        />
      </div>

      {/* Positions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 14,
          padding: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 600,
              color: "#e6e6e6",
            }}
          >
            Открытые позиции
          </h3>
          <div
            style={{
              fontSize: 13,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              color: totalPnl >= 0 ? "#6ee7a8" : "#ef9a9a",
            }}
          >
            P&L: {totalPnl.toFixed(2)} ₽
          </div>
        </div>
        {positions.length === 0 ? (
          <div
            style={{
              color: "#6b6b67",
              fontSize: 13,
              padding: "24px 0",
              textAlign: "center",
            }}
          >
            Позиций нет
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ color: "#6b6b67", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <th style={{ textAlign: "left", padding: "8px 4px" }}>Тикер</th>
                  <th style={{ textAlign: "right", padding: "8px 4px" }}>Лотов</th>
                  <th style={{ textAlign: "right", padding: "8px 4px" }}>Средняя</th>
                  <th style={{ textAlign: "right", padding: "8px 4px" }}>Нереал. P&L</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => {
                  const ticker = p.trading_instruments?.ticker || p.figi.slice(0, 8);
                  const pnl = parseFloat(p.unrealized_pnl || 0);
                  const isUp = pnl >= 0;
                  return (
                    <tr
                      key={p.figi}
                      style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <td style={{ padding: "10px 4px", color: "#e6e6e6", fontWeight: 500 }}>
                        {ticker}
                      </td>
                      <td style={{ padding: "10px 4px", textAlign: "right", color: "#a8a8a3" }}>
                        {p.qty_lots}
                      </td>
                      <td
                        style={{
                          padding: "10px 4px",
                          textAlign: "right",
                          color: "#a8a8a3",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        {p.avg_price}
                      </td>
                      <td
                        style={{
                          padding: "10px 4px",
                          textAlign: "right",
                          color: isUp ? "#6ee7a8" : "#ef9a9a",
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-end",
                          gap: 4,
                        }}
                      >
                        {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {pnl.toFixed(2)} ₽
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function PnlSummary({ pnl }) {
  if (!pnl) return null;
  const total = pnl.total_pnl;
  const isPlus = total >= 0;
  const accent = isPlus ? "#6ee7a8" : "#ef9a9a";
  const sign = isPlus ? "+" : "−";
  const fmt = (n) =>
    Math.abs(n).toLocaleString("ru-RU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return (
    <div
      style={{
        background: "linear-gradient(135deg, rgba(212,175,55,0.04), rgba(212,175,55,0.01))",
        border: "1px solid rgba(212,175,55,0.15)",
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 14,
      }}
    >
      <div>
        <div
          style={{
            fontSize: 11,
            color: "#a8a8a3",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 4,
          }}
        >
          Общий P&L (sandbox)
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: accent,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            letterSpacing: "-0.02em",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {isPlus ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
          {sign}{fmt(total)} ₽
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: 22,
          flexWrap: "wrap",
        }}
      >
        <PnlBreakdownItem label="Реализованный" value={pnl.total_realized} fmt={fmt} />
        <PnlBreakdownItem label="Бумажный" value={pnl.total_unrealized} fmt={fmt} />
        <PnlBreakdownItem
          label="Сделок сегодня"
          value={pnl.today_trades}
          fmt={(n) => String(Math.trunc(n))}
          neutral
        />
      </div>
    </div>
  );
}

function PnlBreakdownItem({ label, value, fmt, neutral = false }) {
  const isPlus = value >= 0;
  const color = neutral ? "#e6e6e6" : isPlus ? "#6ee7a8" : "#ef9a9a";
  const prefix = neutral ? "" : isPlus ? "+" : "−";
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "#6b6b67",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {prefix}{fmt(value)}{neutral ? "" : " ₽"}
      </div>
    </div>
  );
}

function StatusCard({ Icon, title, value, accentColor, accentBg, accentBorder }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 12,
        background: accentBg,
        border: `1px solid ${accentBorder}`,
        color: accentColor,
        fontFamily: "inherit",
      }}
    >
      <Icon size={20} strokeWidth={2.2} />
      <div>
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            opacity: 0.75,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 48,
        color: "#a8a8a3",
        fontSize: 13,
      }}
    >
      <Loader2 size={18} className="trading-spin" style={{ marginRight: 8 }} />
      Загрузка...
    </div>
  );
}

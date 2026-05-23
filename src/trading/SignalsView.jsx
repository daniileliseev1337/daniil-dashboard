import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Check,
  X,
  Clock,
  Loader2,
  CircleAlert,
  CheckCircle2,
  XCircle,
  Hourglass,
} from "lucide-react";
import {
  fetchRecentSignals,
  fetchInstrumentsMap,
  confirmSignal,
  rejectSignal,
} from "./api";
import { subscribeToSignals } from "./realtime";

const STATUS_META = {
  pending_confirm: { label: "Ожидает", Icon: Clock, color: "#e8c860" },
  confirmed: { label: "Подтверждён", Icon: CheckCircle2, color: "#7aa6ff" },
  rejected: { label: "Отклонён", Icon: XCircle, color: "#6b6b67" },
  expired: { label: "Истёк", Icon: Hourglass, color: "#6b6b67" },
  executed: { label: "Исполнен", Icon: CheckCircle2, color: "#6ee7a8" },
  failed: { label: "Ошибка", Icon: CircleAlert, color: "#ef9a9a" },
};

const STATUS_FILTER_ORDER = [
  "all",
  "pending_confirm",
  "confirmed",
  "executed",
  "expired",
  "rejected",
  "failed",
];

export default function SignalsView() {
  const [signals, setSignals] = useState([]);
  const [tickerMap, setTickerMap] = useState({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [sigs, tmap] = await Promise.all([
        fetchRecentSignals({ limit: 50 }),
        fetchInstrumentsMap(),
      ]);
      setSignals(sigs);
      setTickerMap(tmap);
    } catch (e) {
      console.error("Signals load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const unsub = subscribeToSignals(() => reload());
    return () => unsub();
  }, [reload]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return signals;
    return signals.filter((s) => s.status === statusFilter);
  }, [signals, statusFilter]);

  const onConfirm = async (id) => {
    setBusyId(id);
    try {
      await confirmSignal(id);
    } catch (e) {
      alert("Ошибка: " + e.message);
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (id) => {
    setBusyId(id);
    try {
      await rejectSignal(id);
    } catch (e) {
      alert("Ошибка: " + e.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Filter chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {STATUS_FILTER_ORDER.map((s) => {
          const active = statusFilter === s;
          const label = s === "all" ? "Все" : STATUS_META[s]?.label || s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                background: active ? "rgba(212,175,55,0.15)" : "rgba(255,255,255,0.04)",
                color: active ? "#d4af37" : "#a8a8a3",
                border: `1px solid ${active ? "rgba(212,175,55,0.30)" : "rgba(255,255,255,0.06)"}`,
                fontFamily: "inherit",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 14,
          overflowX: "auto",
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              color: "#6b6b67",
              fontSize: 13,
              padding: "48px 0",
              textAlign: "center",
            }}
          >
            Сигналов нет
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  color: "#6b6b67",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <th style={{ textAlign: "left", padding: "12px" }}>Время</th>
                <th style={{ textAlign: "left", padding: "12px 4px" }}>Тикер</th>
                <th style={{ textAlign: "left", padding: "12px 4px" }}>Сторона</th>
                <th style={{ textAlign: "left", padding: "12px 4px" }}>Стратегия</th>
                <th style={{ textAlign: "right", padding: "12px 4px" }}>Цена</th>
                <th style={{ textAlign: "right", padding: "12px 4px" }}>Conf</th>
                <th style={{ textAlign: "left", padding: "12px 4px" }}>Статус</th>
                <th style={{ textAlign: "right", padding: "12px" }}>Действие</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const ticker = tickerMap[s.figi]?.ticker || s.figi.slice(0, 8);
                const meta = STATUS_META[s.status] || {
                  label: s.status,
                  Icon: Clock,
                  color: "#a8a8a3",
                };
                const Icon = meta.Icon;
                const isPending = s.status === "pending_confirm";
                const sideColor = s.side === "buy" ? "#6ee7a8" : "#ef9a9a";
                return (
                  <tr
                    key={s.id}
                    style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <td
                      style={{
                        padding: "10px 12px",
                        color: "#a8a8a3",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontSize: 12,
                      }}
                    >
                      {String(s.ts || "").slice(11, 16)}
                    </td>
                    <td style={{ padding: "10px 4px", color: "#e6e6e6", fontWeight: 600 }}>
                      {ticker}
                    </td>
                    <td
                      style={{
                        padding: "10px 4px",
                        color: sideColor,
                        fontWeight: 600,
                      }}
                    >
                      {(s.side || "").toUpperCase()}
                    </td>
                    <td
                      style={{
                        padding: "10px 4px",
                        color: "#a8a8a3",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontSize: 12,
                      }}
                    >
                      {s.strategy}
                    </td>
                    <td
                      style={{
                        padding: "10px 4px",
                        textAlign: "right",
                        color: "#a8a8a3",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}
                    >
                      {s.suggested_price}
                    </td>
                    <td
                      style={{
                        padding: "10px 4px",
                        textAlign: "right",
                        color: "#a8a8a3",
                      }}
                    >
                      {Math.round((s.confidence || 0) * 100)}%
                    </td>
                    <td
                      style={{
                        padding: "10px 4px",
                        color: meta.color,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Icon size={13} strokeWidth={2.2} />
                        {meta.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      {isPending ? (
                        <div
                          style={{
                            display: "inline-flex",
                            gap: 4,
                            justifyContent: "flex-end",
                          }}
                        >
                          <button
                            onClick={() => onConfirm(s.id)}
                            disabled={busyId === s.id}
                            title="Подтвердить"
                            style={{
                              padding: "5px 8px",
                              borderRadius: 6,
                              cursor: busyId === s.id ? "default" : "pointer",
                              opacity: busyId === s.id ? 0.5 : 1,
                              background: "rgba(110,231,168,0.18)",
                              border: "1px solid rgba(110,231,168,0.35)",
                              color: "#6ee7a8",
                              display: "inline-flex",
                              alignItems: "center",
                              fontFamily: "inherit",
                            }}
                          >
                            <Check size={14} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => onReject(s.id)}
                            disabled={busyId === s.id}
                            title="Отклонить"
                            style={{
                              padding: "5px 8px",
                              borderRadius: 6,
                              cursor: busyId === s.id ? "default" : "pointer",
                              opacity: busyId === s.id ? 0.5 : 1,
                              background: "rgba(255,255,255,0.04)",
                              border: "1px solid rgba(255,255,255,0.10)",
                              color: "#a8a8a3",
                              display: "inline-flex",
                              alignItems: "center",
                              fontFamily: "inherit",
                            }}
                          >
                            <X size={14} strokeWidth={2.5} />
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: "#3f3f3c" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

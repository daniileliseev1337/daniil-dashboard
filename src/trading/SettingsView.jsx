import { useState, useEffect, useCallback } from "react";
import { Loader2, Save, AlertTriangle, ListChecks } from "lucide-react";
import { fetchSystemState, fetchWatchlist, updateSystemState } from "./api";

export default function SettingsView() {
  const [state, setState] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [maxPos, setMaxPos] = useState("");
  const [maxLoss, setMaxLoss] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, w] = await Promise.all([fetchSystemState(), fetchWatchlist()]);
      setState(s);
      setWatchlist(w);
      setMaxPos(String(s.max_position_rub ?? ""));
      setMaxLoss(String(s.max_daily_loss_rub ?? ""));
    } catch (e) {
      console.error("Settings load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const onToggleSandbox = async () => {
    if (!state) return;
    const newMode = !state.sandbox_mode;
    const warning = newMode
      ? "Включить SANDBOX режим?"
      : "ПЕРЕКЛЮЧИТЬ НА БОЕВОЙ СЧЁТ?\n\nВсе ордера пойдут на реальный счёт с реальными деньгами. Уверен?";
    if (!confirm(warning)) return;
    setSaving(true);
    try {
      const updated = await updateSystemState({ sandbox_mode: newMode });
      setState(updated);
      setMsg(newMode ? "Sandbox включён" : "PROD режим включён");
    } catch (e) {
      alert("Ошибка: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const onSaveLimits = async () => {
    const max_position_rub = parseFloat(maxPos);
    const max_daily_loss_rub = parseFloat(maxLoss);
    if (!Number.isFinite(max_position_rub) || max_position_rub <= 0) {
      alert("max_position_rub должно быть положительным числом");
      return;
    }
    if (!Number.isFinite(max_daily_loss_rub) || max_daily_loss_rub <= 0) {
      alert("max_daily_loss_rub должно быть положительным числом");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateSystemState({
        max_position_rub,
        max_daily_loss_rub,
      });
      setState(updated);
      setMsg("Лимиты сохранены");
    } catch (e) {
      alert("Ошибка: " + e.message);
    } finally {
      setSaving(false);
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

  const isSandbox = !!state?.sandbox_mode;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 18,
        maxWidth: 720,
      }}
    >
      {/* Sandbox / Prod */}
      <section style={cardStyle}>
        <h3 style={sectionTitleStyle}>
          <AlertTriangle size={15} strokeWidth={2.2} />
          Режим работы
        </h3>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: isSandbox ? "#7aa6ff" : "#ef9a9a",
              }}
            >
              {isSandbox ? "Sandbox (виртуальные деньги)" : "PROD (реальный счёт)"}
            </div>
            <div style={{ fontSize: 11, color: "#6b6b67", marginTop: 4 }}>
              Последнее изменение: {state?.updated_by || "—"} в{" "}
              {String(state?.updated_at || "").slice(0, 16)}
            </div>
          </div>
          <button
            onClick={onToggleSandbox}
            disabled={saving}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.5 : 1,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "#e6e6e6",
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            Переключить
          </button>
        </div>
      </section>

      {/* Risk limits */}
      <section style={cardStyle}>
        <h3 style={sectionTitleStyle}>Риск-лимиты</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Max position, ₽</span>
            <input
              type="number"
              step="100"
              min="0"
              value={maxPos}
              onChange={(e) => setMaxPos(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "block" }}>
            <span style={labelStyle}>Max daily loss, ₽</span>
            <input
              type="number"
              step="100"
              min="0"
              value={maxLoss}
              onChange={(e) => setMaxLoss(e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>
        <button
          onClick={onSaveLimits}
          disabled={saving}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderRadius: 8,
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.5 : 1,
            background: "rgba(212,175,55,0.15)",
            border: "1px solid rgba(212,175,55,0.30)",
            color: "#d4af37",
            fontSize: 13,
            fontWeight: 500,
            fontFamily: "inherit",
          }}
        >
          {saving ? (
            <Loader2 size={14} className="trading-spin" />
          ) : (
            <Save size={14} strokeWidth={2.2} />
          )}
          Сохранить
        </button>
        {msg && (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: "#6ee7a8",
            }}
          >
            {msg}
          </div>
        )}
      </section>

      {/* Watchlist read-only */}
      <section style={cardStyle}>
        <h3 style={sectionTitleStyle}>
          <ListChecks size={15} strokeWidth={2.2} />
          Watchlist ({watchlist.length})
        </h3>
        <div style={{ fontSize: 11, color: "#6b6b67", marginBottom: 10 }}>
          Редактирование watchlist пока через SQL/seed-скрипт. Web-edit — Phase 2.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 8,
          }}
        >
          {watchlist.map((w) => {
            const active = !!w.active;
            return (
              <div
                key={w.figi}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  background: active ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)"}`,
                  color: active ? "#e6e6e6" : "#6b6b67",
                }}
              >
                <div
                  style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontWeight: 600,
                  }}
                >
                  {w.trading_instruments?.ticker || w.figi.slice(0, 8)}
                </div>
                <div style={{ fontSize: 11, color: "#6b6b67", marginTop: 2 }}>
                  {w.timeframes?.join(", ") || "—"}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const cardStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 14,
  padding: 16,
};

const sectionTitleStyle = {
  margin: "0 0 12px 0",
  fontSize: 14,
  fontWeight: 600,
  color: "#e6e6e6",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const labelStyle = {
  display: "block",
  fontSize: 11,
  color: "#6b6b67",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 4,
};

const inputStyle = {
  width: "100%",
  background: "rgba(0,0,0,0.30)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 8,
  padding: "8px 12px",
  color: "#e6e6e6",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

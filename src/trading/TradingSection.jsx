import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TrendingUp, ListChecks, Settings as SettingsIcon } from "lucide-react";
import DashboardView from "./DashboardView";
import SignalsView from "./SignalsView";
import SettingsView from "./SettingsView";

const TABS = [
  { id: "dashboard", label: "Dashboard", Icon: TrendingUp, Component: DashboardView },
  { id: "signals", label: "Signals", Icon: ListChecks, Component: SignalsView },
  { id: "settings", label: "Settings", Icon: SettingsIcon, Component: SettingsView },
];

export default function TradingSection() {
  const [active, setActive] = useState("dashboard");
  const Active =
    TABS.find((t) => t.id === active)?.Component || DashboardView;

  return (
    <div>
      <header style={{ marginBottom: 18 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: "#f7f8f8",
            letterSpacing: "-0.025em",
          }}
        >
          Trading
        </h2>
        <p
          style={{
            margin: "6px 0 0 0",
            fontSize: 13,
            color: "#6b6b67",
          }}
        >
          Гибридный режим: сигналы → подтверждение → исполнение в T-Invest
        </p>
      </header>

      {/* Sub-tabs (gold-on-black, паттерн AdminPage) */}
      <div
        style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}
      >
        {TABS.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                background: isActive ? "rgba(212,175,55,0.15)" : "rgba(255,255,255,0.04)",
                color: isActive ? "#d4af37" : "#a8a8a3",
                border: `1px solid ${isActive ? "rgba(212,175,55,0.30)" : "rgba(255,255,255,0.06)"}`,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "inherit",
              }}
            >
              <t.Icon size={13} strokeWidth={2.2} /> {t.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <Active />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

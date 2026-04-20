"use client";

import { useState } from "react";
import PaperTradingDashboard from "@/components/PaperTradingDashboard";
import RealTradingDashboard from "@/components/RealTradingDashboard";

type TradingMode = "paper" | "real";

export default function TradingModeSwitcher() {
  const [mode, setMode] = useState<TradingMode>("paper");

  return (
    <div className="space-y-6">
      {/* Mode Tabs */}
      <div className="flex gap-2 bg-card border border-border rounded-lg p-1">
        <button
          onClick={() => setMode("paper")}
          className={`flex-1 px-4 py-3 rounded-lg font-bold text-sm transition-all ${
            mode === "paper"
              ? "bg-yellow/10 text-yellow border border-yellow/30"
              : "text-muted hover:text-foreground"
          }`}
        >
          📄 PAPER TRADING
        </button>
        <button
          onClick={() => setMode("real")}
          className={`flex-1 px-4 py-3 rounded-lg font-bold text-sm transition-all ${
            mode === "real"
              ? "bg-red/10 text-red border border-red/30"
              : "text-muted hover:text-foreground"
          }`}
        >
          🔴 REAL TRADING
        </button>
      </div>

      {/* Dashboard Content */}
      {mode === "paper" ? <PaperTradingDashboard /> : <RealTradingDashboard />}
    </div>
  );
}

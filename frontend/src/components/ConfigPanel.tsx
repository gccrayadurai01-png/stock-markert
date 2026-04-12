"use client";

import { useState, useEffect } from "react";

interface Props {
  capital: number;
  riskPercent: number;
  maxTrades: number;
  tradingMode: string;
  marketStatus: string;
  connected: boolean;
  lastUpdate: Date | null;
  onConfigUpdate: (config: Record<string, number | string>) => void;
  onRefresh: () => void;
}

export default function ConfigPanel({
  capital, riskPercent, maxTrades, tradingMode,
  marketStatus, connected, lastUpdate,
  onConfigUpdate, onRefresh,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    capital: "",
    risk: "",
    maxTrades: "",
  });

  // Sync form with props when entering edit mode
  const startEditing = () => {
    setForm({
      capital: String(capital),
      risk: String(riskPercent),
      maxTrades: String(maxTrades),
    });
    setEditing(true);
  };

  const save = () => {
    onConfigUpdate({
      capital: parseFloat(form.capital) || 100000,
      risk_percent: parseFloat(form.risk) || 1,
      max_trades: parseInt(form.maxTrades) || 3,
      trading_mode: tradingMode,
    });
    setEditing(false);
  };

  return (
    <header className="bg-card border-b border-border sticky top-0 z-50">
      <div className="max-w-[1920px] mx-auto px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        {editing ? (
          <div className="flex items-center gap-3 flex-wrap flex-1">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-muted font-semibold">Capital ₹</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.capital}
                onChange={(e) => setForm({ ...form, capital: e.target.value })}
                className="w-28 bg-background text-foreground text-xs px-2 py-1.5 rounded border border-border outline-none focus:border-accent"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-muted font-semibold">Risk %</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.risk}
                onChange={(e) => setForm({ ...form, risk: e.target.value })}
                className="w-16 bg-background text-foreground text-xs px-2 py-1.5 rounded border border-border outline-none focus:border-accent"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-muted font-semibold">Max Stocks</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.maxTrades}
                onChange={(e) => setForm({ ...form, maxTrades: e.target.value })}
                className="w-12 bg-background text-foreground text-xs px-2 py-1.5 rounded border border-border outline-none focus:border-accent"
              />
            </div>
            <button onClick={save} className="bg-accent text-white text-xs px-3 py-1.5 rounded hover:bg-accent/80 font-semibold">
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-muted hover:text-foreground">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4 flex-wrap flex-1">
            <button
              onClick={startEditing}
              className="flex items-center gap-3 bg-background rounded-lg px-3 py-1.5 hover:bg-card-hover transition-colors"
            >
              <div className="text-xs"><span className="text-muted">Capital: </span><span className="font-bold">₹{capital.toLocaleString("en-IN")}</span></div>
              <div className="text-xs"><span className="text-muted">Risk: </span><span className="font-bold text-yellow">{riskPercent}%</span></div>
              <div className="text-xs"><span className="text-muted">Stocks: </span><span className="font-bold">{maxTrades}</span></div>
              <span className="text-[10px] text-accent font-semibold">edit</span>
            </button>
          </div>
        )}

        {/* Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${marketStatus === "OPEN" ? "bg-green animate-pulse-green" : "bg-red"}`} />
            <span className="text-[10px] font-semibold">{marketStatus === "OPEN" ? "LIVE" : "CLOSED"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green" : "bg-red"}`} />
            <span className="text-[10px] text-muted">{connected ? "WS" : "OFF"}</span>
          </div>
          {lastUpdate && <span className="text-[10px] text-muted">{lastUpdate.toLocaleTimeString("en-IN")}</span>}
          <button onClick={onRefresh} className="bg-green hover:bg-green/80 text-white text-xs font-black px-4 py-2 rounded-lg animate-pulse shadow-lg shadow-green/20">
            REFRESH ANALYSIS
          </button>
        </div>
      </div>
    </header>
  );
}

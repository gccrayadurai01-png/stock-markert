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
    <header className="bg-card border-b border-border sticky top-0 z-40 md:z-50">
      <div className="max-w-[1920px] mx-auto px-3 py-2 flex items-center justify-between gap-2">
        {editing ? (
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-muted font-semibold hidden sm:block">₹</label>
              <input type="text" inputMode="numeric" value={form.capital} placeholder="Capital"
                onChange={(e) => setForm({ ...form, capital: e.target.value })}
                className="w-24 bg-background text-foreground text-xs px-2 py-1.5 rounded border border-border outline-none focus:border-accent" autoFocus />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-muted font-semibold hidden sm:block">R%</label>
              <input type="text" inputMode="decimal" value={form.risk} placeholder="Risk%"
                onChange={(e) => setForm({ ...form, risk: e.target.value })}
                className="w-14 bg-background text-foreground text-xs px-2 py-1.5 rounded border border-border outline-none focus:border-accent" />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-muted font-semibold hidden sm:block">Max</label>
              <input type="text" inputMode="numeric" value={form.maxTrades} placeholder="Max"
                onChange={(e) => setForm({ ...form, maxTrades: e.target.value })}
                className="w-10 bg-background text-foreground text-xs px-2 py-1.5 rounded border border-border outline-none focus:border-accent" />
            </div>
            <button onClick={save} className="bg-accent text-white text-xs px-3 py-1.5 rounded font-semibold">Save</button>
            <button onClick={() => setEditing(false)} className="text-xs text-muted">✕</button>
          </div>
        ) : (
          <button onClick={startEditing}
            className="flex items-center gap-2 bg-background rounded-lg px-2.5 py-1.5 hover:bg-white/5 transition-colors flex-1 min-w-0">
            <span className="text-xs truncate">
              <span className="text-muted">₹</span><span className="font-bold">{capital.toLocaleString("en-IN")}</span>
              <span className="text-muted ml-2 hidden sm:inline">Risk: </span><span className="font-bold text-yellow hidden sm:inline">{riskPercent}%</span>
              <span className="text-muted ml-2 hidden sm:inline">Stocks: </span><span className="font-bold hidden sm:inline">{maxTrades}</span>
            </span>
            <span className="text-[10px] text-accent font-semibold shrink-0">edit</span>
          </button>
        )}

        {/* Status */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${marketStatus === "OPEN" ? "bg-green animate-pulse" : "bg-red"}`} />
            <span className="text-[10px] font-semibold hidden sm:block">{marketStatus === "OPEN" ? "LIVE" : "CLOSED"}</span>
          </div>
          <div className="hidden sm:flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green" : "bg-red"}`} />
            <span className="text-[10px] text-muted">{connected ? "WS" : "OFF"}</span>
          </div>
          {lastUpdate && <span className="text-[10px] text-muted hidden md:block">{lastUpdate.toLocaleTimeString("en-IN")}</span>}
          <button onClick={onRefresh}
            className="bg-green hover:bg-green/80 text-white text-[10px] sm:text-xs font-black px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg shadow-lg shadow-green/20">
            <span className="hidden sm:inline">REFRESH ANALYSIS</span>
            <span className="sm:hidden">⟳ REFRESH</span>
          </button>
        </div>
      </div>
    </header>
  );
}

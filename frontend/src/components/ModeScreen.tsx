"use client";

import { useState, useEffect } from "react";
import type { DashboardData, ModeConfig, ScreenTab, StockAnalysis } from "@/lib/types";
import TradeCards from "./TradeCards";
import StockScanner from "./StockScanner";
import StockChart from "./StockChart";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const MODE_INFO: Record<string, { title: string; icon: string; color: string; desc: string; timeframe: string }> = {
  intraday: {
    title: "Intraday Trading",
    icon: "⚡",
    color: "text-yellow",
    desc: "Quick trades. Enter and exit same day. Use tight stop losses.",
    timeframe: "5min",
  },
  swing: {
    title: "Swing Trading",
    icon: "🔄",
    color: "text-green",
    desc: "Hold 2-15 days. Ride the momentum. Medium risk-reward.",
    timeframe: "1day",
  },
  positional: {
    title: "Positional Trading",
    icon: "🏗️",
    color: "text-accent",
    desc: "Hold weeks to months. Follow the trend. Bigger targets.",
    timeframe: "1week",
  },
  options: {
    title: "Options Trading",
    icon: "🎯",
    color: "text-red",
    desc: "High risk, high reward. Strict capital limits. Only trade what you can lose.",
    timeframe: "15min",
  },
};

const MODE_INDICATORS: Record<string, string[]> = {
  intraday: ["RSI", "MACD", "VWAP", "Supertrend", "EMA", "Volume"],
  swing: ["RSI", "MACD", "Bollinger", "EMA", "ADX", "Supertrend"],
  positional: ["EMA", "MACD", "ADX", "RSI", "Bollinger", "OBV"],
  options: ["RSI", "VWAP", "Bollinger", "ATR", "Volume", "OBV"],
};

interface Props {
  mode: ScreenTab;
  data: DashboardData;
  onConfigUpdate: (config: Record<string, number | string>) => void;
}

export default function ModeScreen({ mode, data, onConfigUpdate }: Props) {
  const [config, setConfig] = useState<ModeConfig | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ capital: "", risk: "", maxTrades: "" });
  const [selectedStock, setSelectedStock] = useState<string | null>(null);

  const info = MODE_INFO[mode] || MODE_INFO.intraday;

  useEffect(() => {
    fetch(`${API_BASE}/api/mode/${mode}/config`)
      .then((r) => r.json())
      .then((d) => {
        setConfig(d);
        setForm({
          capital: String(d.capital || 100000),
          risk: String(d.risk_percent || 1.5),
          maxTrades: String(d.max_trades || 3),
        });
      })
      .catch(() => {});
  }, [mode]);

  const saveConfig = () => {
    const updated = {
      capital: parseFloat(form.capital) || 100000,
      risk_percent: parseFloat(form.risk) || 1.5,
      max_trades: parseInt(form.maxTrades) || 3,
    };
    fetch(`${API_BASE}/api/mode/${mode}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    }).then(() => {
      setConfig({ ...config!, ...updated });
      setEditing(false);
      // Also update main config if this is the active mode
      if (data.trading_mode === mode) {
        onConfigUpdate({ ...updated, trading_mode: mode });
      }
    });
  };

  // Filter trades for this mode
  const modeTradeType = mode === "intraday" ? "INTRADAY" : mode === "swing" ? "SWING" : "POSITIONAL";
  const modeTrades = data.recommended_trades.filter(
    (t) => t.trade_type === modeTradeType || data.recommended_trades.length <= 3
  );

  // Filter stocks by mode-specific criteria
  const modeStocks = [...data.all_stocks].sort((a, b) => {
    if (mode === "intraday") return (b.votes?.BUY || 0) - (a.votes?.BUY || 0);
    if (mode === "swing") return b.score - a.score;
    if (mode === "positional") return b.adx - a.adx;
    return b.score - a.score;
  });

  const indicators = MODE_INDICATORS[mode] || MODE_INDICATORS.intraday;

  return (
    <div className="space-y-6">
      {/* Mode Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{info.icon}</span>
          <div>
            <h2 className={`text-xl font-black ${info.color}`}>{info.title}</h2>
            <p className="text-xs text-muted">{info.desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-card px-2 py-1 rounded border border-border text-muted">
            Timeframe: {info.timeframe}
          </span>
          <span className="text-[10px] bg-card px-2 py-1 rounded border border-border text-muted">
            Indicators: {indicators.join(", ")}
          </span>
        </div>
      </div>

      {/* Mode Config */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">Mode Configuration</h3>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-accent hover:text-accent/80 font-semibold"
            >
              Edit Config
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={saveConfig} className="text-xs bg-accent text-white px-3 py-1 rounded hover:bg-accent/80">
                Save
              </button>
              <button onClick={() => setEditing(false)} className="text-xs text-muted hover:text-foreground">
                Cancel
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] text-muted block mb-1">Capital (₹)</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.capital}
                onChange={(e) => setForm({ ...form, capital: e.target.value })}
                className="w-full bg-background text-foreground text-sm px-3 py-2 rounded border border-border focus:border-accent outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-1">Risk %</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.risk}
                onChange={(e) => setForm({ ...form, risk: e.target.value })}
                className="w-full bg-background text-foreground text-sm px-3 py-2 rounded border border-border focus:border-accent outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-1">Max Trades</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.maxTrades}
                onChange={(e) => setForm({ ...form, maxTrades: e.target.value })}
                className="w-full bg-background text-foreground text-sm px-3 py-2 rounded border border-border focus:border-accent outline-none"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4 text-center">
            <div className="bg-background rounded-lg p-3">
              <div className="text-[10px] text-muted">Capital</div>
              <div className="text-lg font-black">₹{(config?.capital || 100000).toLocaleString("en-IN")}</div>
            </div>
            <div className="bg-background rounded-lg p-3">
              <div className="text-[10px] text-muted">Risk %</div>
              <div className="text-lg font-black text-yellow">{config?.risk_percent || 1.5}%</div>
            </div>
            <div className="bg-background rounded-lg p-3">
              <div className="text-[10px] text-muted">Max Trades</div>
              <div className="text-lg font-black">{config?.max_trades || 3}</div>
            </div>
            <div className="bg-background rounded-lg p-3">
              <div className="text-[10px] text-muted">Indicators</div>
              <div className="text-lg font-black text-accent">{indicators.length}</div>
            </div>
          </div>
        )}
      </div>

      {/* Active Indicators for this mode */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="text-sm font-bold mb-3">Active Indicators for {info.title}</h3>
        <div className="flex flex-wrap gap-2">
          {indicators.map((ind) => (
            <span key={ind} className="text-xs bg-accent/10 text-accent px-3 py-1.5 rounded-lg font-semibold">
              {ind}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-muted mt-2">
          These indicators are optimized for {mode} trading timeframe ({info.timeframe})
        </p>
      </div>

      {/* Trade Recommendations for this mode */}
      <TradeCards trades={modeTrades} capital={config?.capital || data.user_capital} />

      {/* Stock Scanner with chart expand */}
      <StockScanner
        stocks={modeStocks}
        title={`${info.title} Scanner`}
        onStockClick={(sym) => setSelectedStock(selectedStock === sym ? null : sym)}
        expandedStock={selectedStock}
      />

      {/* Chart for selected stock */}
      {selectedStock && (
        <StockChart
          symbol={selectedStock}
          interval={info.timeframe}
          height={350}
        />
      )}
    </div>
  );
}

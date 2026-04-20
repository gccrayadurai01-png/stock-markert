"use client";

import { useState, useEffect } from "react";
import { Save, RotateCcw } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Settings {
  paper_trading_capital: number;
  real_trading_capital: number;
  min_balance_limit: number;
  strategy_win_rate_threshold: number;
  min_trades_for_selection: number;
}

export default function TradingSettings() {
  const [settings, setSettings] = useState<Settings>({
    paper_trading_capital: 10000,
    real_trading_capital: 5000,
    min_balance_limit: 2000,
    strategy_win_rate_threshold: 60,
    min_trades_for_selection: 10,
  });

  const [edited, setEdited] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await fetch(`${API}/api/settings`);
      const data = await res.json();
      if (data.settings) {
        setSettings(data.settings);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  }

  function handleChange(key: keyof Settings, value: string) {
    const numValue = parseFloat(value);
    setEdited({
      ...edited || settings,
      [key]: numValue,
    });
    setSaved(false);
  }

  async function saveSettings() {
    if (!edited) return;

    setSaving(true);
    try {
      const res = await fetch(`${API}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edited),
      });

      if (res.ok) {
        setSettings(edited);
        setEdited(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      alert("Failed to save settings: " + String(err));
    }
    setSaving(false);
  }

  function resetChanges() {
    setEdited(null);
  }

  const currentSettings = edited || settings;

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-sm uppercase tracking-wider">Trading Settings</h3>
        {saved && <span className="text-[10px] text-green font-bold">✅ Saved</span>}
      </div>

      {/* Paper Trading */}
      <div className="space-y-2">
        <label className="text-[11px] font-bold text-muted uppercase">Paper Trading Capital (₹)</label>
        <input
          type="number"
          value={currentSettings.paper_trading_capital}
          onChange={(e) => handleChange("paper_trading_capital", e.target.value)}
          className="w-full px-3 py-2 text-sm bg-black/30 border border-border rounded-lg text-foreground focus:outline-none focus:border-accent"
        />
        <p className="text-[9px] text-muted">Test trading with this amount</p>
      </div>

      {/* Real Trading */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-muted uppercase">Real Trading Capital (₹)</label>
          <input
            type="number"
            value={currentSettings.real_trading_capital}
            onChange={(e) => handleChange("real_trading_capital", e.target.value)}
            className="w-full px-3 py-2 text-sm bg-black/30 border border-border rounded-lg text-foreground focus:outline-none focus:border-accent"
          />
        </div>
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-muted uppercase">Min Balance Limit (₹)</label>
          <input
            type="number"
            value={currentSettings.min_balance_limit}
            onChange={(e) => handleChange("min_balance_limit", e.target.value)}
            className="w-full px-3 py-2 text-sm bg-black/30 border border-border rounded-lg text-foreground focus:outline-none focus:border-accent"
          />
          <p className="text-[9px] text-red">Stop trading if below</p>
        </div>
      </div>

      {/* Strategy Selection */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-muted uppercase">Win Rate Threshold (%)</label>
          <input
            type="number"
            value={currentSettings.strategy_win_rate_threshold}
            onChange={(e) => handleChange("strategy_win_rate_threshold", e.target.value)}
            className="w-full px-3 py-2 text-sm bg-black/30 border border-border rounded-lg text-foreground focus:outline-none focus:border-accent"
          />
          <p className="text-[9px] text-muted">Min % to select strategy</p>
        </div>
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-muted uppercase">Min Trades for Selection</label>
          <input
            type="number"
            value={currentSettings.min_trades_for_selection}
            onChange={(e) => handleChange("min_trades_for_selection", e.target.value)}
            className="w-full px-3 py-2 text-sm bg-black/30 border border-border rounded-lg text-foreground focus:outline-none focus:border-accent"
          />
          <p className="text-[9px] text-muted">Min trades before eval</p>
        </div>
      </div>

      {/* Save/Reset Buttons */}
      {edited && (
        <div className="flex gap-2 pt-2">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold rounded-lg bg-green/10 hover:bg-green/20 text-green border border-green/30 transition disabled:opacity-50"
          >
            <Save className="w-3 h-3" />
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={resetChanges}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold rounded-lg bg-red/10 hover:bg-red/20 text-red border border-red/30 transition"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

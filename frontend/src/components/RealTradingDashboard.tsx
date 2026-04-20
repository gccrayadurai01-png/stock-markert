"use client";

import { useState, useEffect, useRef } from "react";
import type { AutoTraderData } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  initialData?: AutoTraderData;
  onOpenStrategyLab?: () => void;
}

const STRATEGIES = [
  { id: "A", name: "Momentum", emoji: "🚀", color: "text-green",      bg: "bg-green/10 border-green/30",           min: 45 },
  { id: "B", name: "Reversal", emoji: "📉", color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30",     min: 40 },
  { id: "C", name: "Trend",    emoji: "🏄", color: "text-yellow",     bg: "bg-yellow/10 border-yellow/30",         min: 45 },
  { id: "D", name: "News",     emoji: "📰", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30", min: 35 },
  { id: "E", name: "SMC/ICT",  emoji: "🧠", color: "text-red",        bg: "bg-red/10 border-red/30",               min: 45 },
];

interface PaperPerformance {
  [key: string]: { trades: number; win_rate: number; pnl: number; };
}

interface RiskConfig {
  max_trades_per_day: number;
  max_open_positions: number;
  max_position_size_pct: number;
  emergency_stop_balance: number;
  daily_loss_limit_pct: number;
  risk_per_trade_pct: number;
  min_paper_win_rate: number;
  min_paper_trades: number;
  auto_square_off_time: string;
  allow_premarket: boolean;
}

interface RealStatus {
  connected: boolean;
  real_trading_enabled: boolean;
  balance: number;
  total_balance?: number;
  positions: any[];
  today_pnl: number;
  total_pnl: number;
  auth_error?: string;
  stats: { total_trades: number; win_rate: number; avg_win: number; avg_loss: number; total_pnl: number };
  scan?: {
    scan_count: number;
    last_scan: string | null;
    next_scan_eta_seconds: number | null;
    scan_interval_seconds: number;
    scan_running: boolean;
    pending_signals: unknown[];
  };
  config: {
    active_strategies: Record<string, boolean>;
    capitals: Record<string, number>;
  } & Partial<RiskConfig>;
}

const DEFAULT_RISK: RiskConfig = {
  max_trades_per_day: 5,
  max_open_positions: 3,
  max_position_size_pct: 10,
  emergency_stop_balance: 2000,
  daily_loss_limit_pct: 5,
  risk_per_trade_pct: 1,
  min_paper_win_rate: 60,
  min_paper_trades: 10,
  auto_square_off_time: "15:15",
  allow_premarket: false,
};

export default function RealTradingDashboard({ initialData, onOpenStrategyLab }: Props) {
  const [real, setReal] = useState<RealStatus | null>(null);
  const [realEnabled, setRealEnabled] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [exchanging, setExchanging] = useState(false);
  const [kiteLoginUrl, setKiteLoginUrl] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsOpenRef = useRef(false);
  useEffect(() => { settingsOpenRef.current = settingsOpen; }, [settingsOpen]);
  const [risk, setRisk] = useState<RiskConfig>(DEFAULT_RISK);
  const [savingRisk, setSavingRisk] = useState(false);

  // Capital allocation per strategy
  const [editMode, setEditMode] = useState(false);
  const editModeRef = useRef(false);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);
  const [capitals, setCapitals] = useState<Record<string, number>>({ A: 1000, B: 1000, C: 1000, D: 1000, E: 1000 });
  const [activeStrategies, setActiveStrategies] = useState<Record<string, boolean>>({ A: false, B: false, C: false, D: false, E: false });

  // Paper trading performance (to help decide which to deploy)
  const [paperPerf, setPaperPerf] = useState<PaperPerformance>({});

  useEffect(() => {
    fetchAll();
    const i = setInterval(fetchAll, 10000);
    return () => clearInterval(i);
  }, []);

  async function fetchAll() {
    try {
      const [realR, perfR] = await Promise.all([
        fetch(`${API}/api/real-trading/status`),
        fetch(`${API}/api/auto-trader/strategy-performance`),
      ]);
      const rs: RealStatus = await realR.json();
      const pf = await perfR.json();
      setReal(rs);
      setRealEnabled(rs.real_trading_enabled ?? false);
      setPaperPerf(pf ?? {});
      // Load saved config into edit state (only if not currently editing — read via ref to avoid stale closure)
      if (!editModeRef.current && rs.config) {
        if (rs.config.capitals) setCapitals((p) => ({ ...p, ...rs.config.capitals }));
        if (rs.config.active_strategies) setActiveStrategies((p) => ({ ...p, ...rs.config.active_strategies }));
      }
      // Risk config always mirrors backend (only overwritten when settings modal is closed)
      if (!settingsOpenRef.current && rs.config) {
        setRisk((p) => ({
          ...p,
          ...Object.fromEntries(
            (Object.keys(DEFAULT_RISK) as (keyof RiskConfig)[])
              .filter((k) => rs.config[k] !== undefined)
              .map((k) => [k, rs.config[k] as RiskConfig[typeof k]])
          ),
        }));
      }
    } catch { /* ignore */ }
  }

  async function toggleRealTrading() {
    if (!realEnabled) {
      const ok = confirm("⚠️ REAL TRADING WARNING\n\nThis will place ACTUAL trades with your Zerodha account using REAL MONEY. Are you sure you want to enable LIVE trading?");
      if (!ok) return;
    }
    setToggling(true);
    try {
      await fetch(`${API}/api/broker/toggle-real-trading?enable=${!realEnabled}`, { method: "POST" });
      await fetchAll();
    } catch { /* ignore */ }
    setToggling(false);
  }

  async function openTokenModal() {
    setTokenInput("");
    setTokenModalOpen(true);
    try {
      const r = await fetch(`${API}/api/broker/kite-login-url`);
      const j = await r.json();
      if (j.url) setKiteLoginUrl(j.url);
    } catch { /* ignore */ }
  }

  async function exchangeToken() {
    if (!tokenInput.trim()) {
      alert("Paste your request_token (or the full redirect URL) first.");
      return;
    }
    setExchanging(true);
    try {
      const res = await fetch(`${API}/api/broker/exchange-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_token: tokenInput.trim() }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setTokenModalOpen(false);
        setTokenInput("");
        alert(`✅ Zerodha connected\nBalance: ₹${(data.balance ?? 0).toLocaleString("en-IN")}`);
        await fetchAll();
      } else {
        alert(`❌ ${data.message || "Token exchange failed"}`);
      }
    } catch (err) {
      alert("❌ Network error: " + String(err));
    }
    setExchanging(false);
  }

  async function connectZerodha() {
    setConnecting(true);
    try {
      const res = await fetch(`${API}/api/broker/test-connection`);
      const data = await res.json();
      if (data.connected) {
        alert(`✅ Connected to Zerodha\nBalance: ₹${(data.balance ?? 0).toLocaleString("en-IN")}`);
        await fetchAll();
      } else if (data.status === "auth_error") {
        alert(`❌ Zerodha authentication failed\n\n${data.message}\n\n→ Open backend/.env, replace KITE_ACCESS_TOKEN with a fresh one from the Kite login flow, then restart the backend.`);
      } else {
        alert(`❌ ${data.message || "Zerodha connection failed"}\n\nCheck KITE_API_KEY / KITE_ACCESS_TOKEN in backend .env.`);
      }
    } catch (err) {
      alert("❌ Network error: " + String(err));
    }
    setConnecting(false);
  }

  async function forceScan() {
    setScanning(true);
    try {
      await fetch(`${API}/api/auto-trader/scan-now`, { method: "POST" });
      await fetchAll();
    } catch { /* ignore */ }
    setScanning(false);
  }

  async function saveRisk() {
    setSavingRisk(true);
    try {
      const res = await fetch(`${API}/api/real-trading/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(risk),
      });
      const j = await res.json();
      if (j.status === "saved") {
        setSettingsOpen(false);
        alert("✅ Risk settings saved");
        fetchAll();
      } else {
        alert("❌ Save failed");
      }
    } catch {
      alert("❌ Failed to save risk settings");
    }
    setSavingRisk(false);
  }

  async function saveAllocation() {
    try {
      const res = await fetch(`${API}/api/real-trading/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capitals,
          active_strategies: activeStrategies,
          strategy_mode: "ANY_TRIGGERS",
        }),
      });
      const j = await res.json();
      if (j.status === "saved") {
        setEditMode(false);
        alert("✅ Real trading allocation saved");
        fetchAll();
      } else {
        alert("❌ Save failed");
      }
    } catch {
      alert("❌ Failed to save allocation");
    }
  }

  function deployFromPaper(stratId: string) {
    const perf = paperPerf[stratId];
    if (!perf || perf.win_rate < 60 || perf.trades < 10) {
      alert(`⚠️ Strategy ${stratId} not ready.\nNeeds: ≥60% win rate & ≥10 trades.\nCurrent: ${perf?.win_rate ?? 0}% win rate, ${perf?.trades ?? 0} trades.`);
      return;
    }
    setActiveStrategies((prev) => ({ ...prev, [stratId]: true }));
    setEditMode(true);
    alert(`✅ Strategy ${stratId} marked for real trading. Click SAVE to confirm.`);
  }

  const positions = real?.positions ?? [];
  const stats = real?.stats;
  const brokerBalance = Number(real?.balance) || 0;
  const brokerConnected = real?.connected ?? false;
  const totalAllocated = Object.entries(capitals).reduce((sum, [k, v]) => sum + (activeStrategies[k] ? v : 0), 0);
  const activeCount = Object.values(activeStrategies).filter(Boolean).length;

  const todayPnlNum = Number(real?.today_pnl) || 0;
  const totalPnlNum = Number(stats?.total_pnl ?? real?.total_pnl) || 0;
  const winRateNum = Number(stats?.win_rate) || 0;

  return (
    <div className="space-y-6">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl sm:text-3xl">🔴</span>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-foreground">REAL TRADING</h1>
            <p className="text-xs text-muted">Live Zerodha account · Real money</p>
          </div>
          <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${realEnabled ? "bg-red/20 text-red animate-pulse" : "bg-yellow/20 text-yellow"}`}>
            {realEnabled ? "🔴 LIVE" : "🟡 DISABLED"}
          </span>
          {real?.scan && (
            <span
              className={`text-[10px] px-2 py-1 rounded-full font-bold border ${
                real.scan.scan_running
                  ? "bg-green/10 text-green border-green/40"
                  : "bg-muted/10 text-muted border-border"
              }`}
              title={`Shared scan: every ${Math.round((real.scan.scan_interval_seconds || 180) / 60)} min — powers both Paper & Real`}
            >
              {real.scan.scan_running ? "🔄" : "⏸"} Scan #{real.scan.scan_count}
              {real.scan.next_scan_eta_seconds != null && real.scan.scan_running && (
                <span className="ml-1 opacity-70">
                  · next in {real.scan.next_scan_eta_seconds}s
                </span>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm bg-white/5 hover:bg-white/10 text-foreground border border-border transition"
            title="Edit risk & execution settings"
          >
            ⚙️ SETTINGS
          </button>
          <button
            onClick={forceScan}
            disabled={scanning}
            className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm bg-accent hover:bg-accent/80 text-white transition-all shadow-lg shadow-accent/20"
          >
            {scanning ? "⏳..." : "🔍 SCAN NOW"}
          </button>
          <button
            onClick={toggleRealTrading}
            disabled={toggling || !brokerConnected}
            className={`flex-1 sm:flex-none px-4 sm:px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all ${
              realEnabled
                ? "bg-red text-white shadow-lg shadow-red/30 animate-pulse"
                : "bg-card border-2 border-border text-muted hover:border-red hover:text-red disabled:opacity-50"
            }`}
          >
            {toggling ? "..." : realEnabled ? "LIVE: ON" : "LIVE: OFF"}
          </button>
        </div>
      </div>

      {/* ─── AUTH ERROR BANNER ─── */}
      {real?.auth_error && (
        <div className="rounded-xl border border-yellow/40 bg-yellow/10 p-3 flex items-start gap-3">
          <span className="text-xl">🔑</span>
          <div className="flex-1 text-xs">
            <div className="font-black text-yellow mb-0.5">Zerodha session expired</div>
            <div className="text-foreground leading-snug">
              Kite access tokens expire daily around 6:00 AM IST. Click <strong>Refresh Token</strong> to re-authenticate — you&apos;ll log into Kite in a new tab, then paste the redirect URL here.
            </div>
          </div>
          <button
            onClick={openTokenModal}
            className="shrink-0 text-[10px] font-black px-3 py-1.5 rounded-md bg-yellow text-black hover:bg-yellow/80"
          >
            🔄 Refresh Token
          </button>
        </div>
      )}

      {/* ─── BROKER / ACCOUNT CARD ─── */}
      <div className={`rounded-xl border p-4 ${brokerConnected ? "bg-green/5 border-green/30" : "bg-red/5 border-red/30"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[10px] uppercase font-bold text-muted">Zerodha</div>
              <div className="flex items-center gap-2">
                <div className={`text-sm font-black ${brokerConnected ? "text-green" : "text-red"}`}>
                  {brokerConnected ? "✅ Connected" : "❌ Disconnected"}
                </div>
                {!brokerConnected && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={connectZerodha}
                      disabled={connecting}
                      className="text-[10px] font-black px-2.5 py-1 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/40 hover:bg-blue-500/25 disabled:opacity-50"
                    >
                      {connecting ? "Testing..." : "🔌 Test"}
                    </button>
                    <button
                      onClick={openTokenModal}
                      className="text-[10px] font-black px-2.5 py-1 rounded-md bg-accent text-white border border-accent hover:opacity-90"
                    >
                      🔑 Refresh Token
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <div className="text-[10px] uppercase font-bold text-muted">Account Balance</div>
              <div className="text-lg font-black text-blue-400">₹{brokerBalance.toLocaleString("en-IN")}</div>
            </div>
            <div className="h-8 w-px bg-border hidden sm:block" />
            <div className="hidden sm:block">
              <div className="text-[10px] uppercase font-bold text-muted">Mode</div>
              <div className={`text-sm font-black ${realEnabled ? "text-red" : "text-yellow"}`}>
                {realEnabled ? "🔴 LIVE" : "🟢 TEST"}
              </div>
            </div>
            <div className="h-8 w-px bg-border hidden sm:block" />
            <div className="hidden sm:block">
              <div className="text-[10px] uppercase font-bold text-muted">Shared Scan</div>
              <div className="text-sm font-black text-foreground flex items-center gap-1.5">
                <span className={real?.scan?.scan_running ? "text-green" : "text-muted"}>
                  {real?.scan?.scan_running ? "● live" : "○ idle"}
                </span>
                <span className="text-muted text-xs font-normal">
                  every {Math.round((real?.scan?.scan_interval_seconds || 180) / 60)}m
                </span>
              </div>
              <div className="text-[9px] text-muted">
                {real?.scan?.last_scan
                  ? `Last: ${new Date(real.scan.last_scan).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                  : "Awaiting first scan"}
                {" · Paper + Real"}
              </div>
            </div>
          </div>
          {onOpenStrategyLab && (
            <button
              onClick={onOpenStrategyLab}
              className="px-3 py-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/30 font-bold text-xs hover:bg-purple-500/20"
            >
              🧪 Strategy Lab
            </button>
          )}
        </div>
      </div>

      {/* ─── ANY FIRES = TRADE BANNER ─── */}
      <div className={`rounded-xl border p-3 ${activeCount > 0 ? "bg-green/5 border-green/30" : "bg-yellow/5 border-yellow/30"}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-muted uppercase tracking-wider">
              {activeCount} of 5 Strategies Active
            </span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${activeCount > 0 ? "bg-green/20 text-green" : "bg-yellow/20 text-yellow"}`}>
              ANY fires → Real Trade
            </span>
          </div>
          <div className="flex gap-1">
            {STRATEGIES.map((s) => (
              <div
                key={s.id}
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black border ${
                  activeStrategies[s.id]
                    ? `${s.bg} ${s.color} ring-1 ring-green/50`
                    : "bg-black/30 text-muted border-border opacity-40"
                }`}
                title={`${s.id} - ${s.name} ${activeStrategies[s.id] ? "ACTIVE" : "off"}`}
              >
                {s.id}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── CAPITAL ALLOCATION & STRATEGY SELECTION ─── */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-foreground">
              💼 Capital Allocation & Strategy Selection
            </h2>
            <p className="text-[11px] text-muted mt-0.5">
              Active: {activeCount}/5 · Allocated: ₹{totalAllocated.toLocaleString("en-IN")} / ₹{brokerBalance.toLocaleString("en-IN")}
            </p>
          </div>
          <button
            onClick={() => (editMode ? saveAllocation() : setEditMode(true))}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              editMode ? "bg-green text-white" : "bg-white/5 text-foreground border border-border hover:border-accent"
            }`}
          >
            {editMode ? "💾 SAVE" : "✏️ EDIT"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {STRATEGIES.map((s) => {
            const perf = paperPerf[s.id];
            const ready = perf && perf.win_rate >= 60 && perf.trades >= 10;
            const isActive = activeStrategies[s.id];
            return (
              <div
                key={s.id}
                className={`rounded-xl border p-3 ${s.bg} ${isActive ? "ring-2 ring-green/40" : "opacity-70"}`}
              >
                {/* Active toggle */}
                <label className="flex items-center gap-2 mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    disabled={!editMode}
                    onChange={(e) => setActiveStrategies((p) => ({ ...p, [s.id]: e.target.checked }))}
                    className="w-4 h-4 accent-green"
                  />
                  <span className={`text-[10px] font-black uppercase ${isActive ? "text-green" : "text-muted"}`}>
                    {isActive ? "ACTIVE" : "DISABLED"}
                  </span>
                </label>

                {/* Strategy name */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-lg">{s.emoji}</span>
                  <div>
                    <div className={`text-sm font-black ${s.color}`}>{s.id}</div>
                    <div className="text-[10px] text-muted leading-tight">{s.name}</div>
                  </div>
                </div>

                {/* Capital input */}
                <div className="bg-black/30 rounded-lg p-2 mb-2">
                  <div className="text-[9px] uppercase text-muted text-center mb-1">Capital</div>
                  {editMode ? (
                    <input
                      type="number"
                      value={capitals[s.id]}
                      onChange={(e) => setCapitals((p) => ({ ...p, [s.id]: Number(e.target.value) || 0 }))}
                      className="w-full bg-transparent text-center text-sm font-black text-foreground outline-none"
                    />
                  ) : (
                    <div className="text-center text-sm font-black">₹{capitals[s.id].toLocaleString("en-IN")}</div>
                  )}
                </div>

                {/* Paper performance */}
                <div className="border-t border-border/50 pt-2 space-y-1">
                  <div className="text-[9px] uppercase text-muted">Paper Perf</div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted">Win Rate</span>
                    <span className={`font-black ${perf?.win_rate >= 60 ? "text-green" : "text-yellow"}`}>
                      {perf?.win_rate?.toFixed(0) ?? 0}%
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted">Trades</span>
                    <span className="font-black">{perf?.trades ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted">P&L</span>
                    <span className={`font-black ${(perf?.pnl ?? 0) >= 0 ? "text-green" : "text-red"}`}>
                      ₹{(perf?.pnl ?? 0).toFixed(0)}
                    </span>
                  </div>
                  {ready ? (
                    <div className="text-[9px] text-center bg-green/20 text-green rounded py-0.5 font-bold">
                      ✅ READY
                    </div>
                  ) : (
                    <button
                      onClick={() => deployFromPaper(s.id)}
                      className="w-full text-[9px] bg-white/5 hover:bg-accent/20 text-muted hover:text-accent rounded py-0.5 font-bold"
                    >
                      ⏳ Needs ≥60% & ≥10 trades
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {editMode && (
          <div className="mt-3 flex items-center justify-between p-3 bg-yellow/5 border border-yellow/30 rounded-lg text-[11px]">
            <span className="text-yellow font-bold">
              💡 Enable only strategies proven in paper trading. Minimum 60% win rate & 10 trades.
            </span>
            <span className="text-muted">
              Total: <span className="text-foreground font-black">₹{totalAllocated.toLocaleString("en-IN")}</span>
            </span>
          </div>
        )}
      </div>

      {/* ─── LIVE STATS (tracking like paper) ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Status" value={realEnabled ? "LIVE" : "OFF"} color={realEnabled ? "text-red" : "text-muted"} />
        <StatCard label="Positions" value={`${positions.length}/${activeCount}`} color="text-foreground" />
        <StatCard label="Today P&L" value={`₹${todayPnlNum.toFixed(0)}`} color={todayPnlNum >= 0 ? "text-green" : "text-red"} />
        <StatCard label="Total P&L" value={`₹${totalPnlNum.toFixed(0)}`} color={totalPnlNum >= 0 ? "text-green" : "text-red"} />
        <StatCard label="Win Rate" value={`${winRateNum.toFixed(0)}%`} color={winRateNum >= 60 ? "text-green" : "text-yellow"} />
        <StatCard label="Total Trades" value={Number(stats?.total_trades) || 0} color="text-foreground" />
        <StatCard label="Avg Win" value={`₹${(Number(stats?.avg_win) || 0).toFixed(0)}`} color="text-green" />
        <StatCard label="Avg Loss" value={`₹${(Number(stats?.avg_loss) || 0).toFixed(0)}`} color="text-red" />
      </div>

      {/* ─── OPEN POSITIONS ─── */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="text-sm font-black uppercase tracking-wider mb-3">📊 Live Positions ({positions.length})</h3>
        {positions.length === 0 ? (
          <div className="py-6 text-center text-muted text-xs">
            No open positions. {realEnabled ? "Waiting for signals..." : "Enable LIVE mode to start trading."}
          </div>
        ) : (
          <div className="space-y-2">
            {positions.map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-border">
                <div>
                  <div className="text-sm font-black">{p.symbol?.replace(".NS", "")}</div>
                  <div className="text-[10px] text-muted">
                    Qty: {p.quantity} · Entry: ₹{p.entry_price?.toFixed(2)} · Strategy: {p.strategy ?? "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-black ${(p.unrealized_pnl ?? 0) >= 0 ? "text-green" : "text-red"}`}>
                    ₹{(p.unrealized_pnl ?? 0).toFixed(0)}
                  </div>
                  <div className="text-[10px] text-muted">₹{p.current_price?.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── RISK MANAGEMENT ─── */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black uppercase tracking-wider">🛡️ Risk Management</h3>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-[10px] font-bold px-2.5 py-1 rounded-md bg-white/5 text-foreground border border-border hover:border-accent"
          >
            ✏️ EDIT
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-black/30 rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted mb-1">Max Position Size</div>
            <div className="text-base font-black text-foreground">₹{((brokerBalance * risk.max_position_size_pct) / 100).toLocaleString("en-IN")}</div>
            <div className="text-[9px] text-muted">{risk.max_position_size_pct}% of account</div>
          </div>
          <div className="bg-black/30 rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted mb-1">Emergency Stop</div>
            <div className="text-base font-black text-red">₹{risk.emergency_stop_balance.toLocaleString("en-IN")}</div>
            <div className="text-[9px] text-muted">Trading halts below</div>
          </div>
          <div className="bg-black/30 rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted mb-1">Daily Loss Limit</div>
            <div className="text-base font-black text-yellow">₹{((brokerBalance * risk.daily_loss_limit_pct) / 100).toLocaleString("en-IN")}</div>
            <div className="text-[9px] text-muted">{risk.daily_loss_limit_pct}% of account</div>
          </div>
          <div className="bg-black/30 rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted mb-1">Risk / Trade</div>
            <div className="text-base font-black text-blue-400">{risk.risk_per_trade_pct}%</div>
            <div className="text-[9px] text-muted">of strategy capital</div>
          </div>
          <div className="bg-black/30 rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted mb-1">Max Trades / Day</div>
            <div className="text-base font-black text-foreground">{risk.max_trades_per_day}</div>
            <div className="text-[9px] text-muted">daily cap</div>
          </div>
          <div className="bg-black/30 rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted mb-1">Max Open Positions</div>
            <div className="text-base font-black text-foreground">{risk.max_open_positions}</div>
            <div className="text-[9px] text-muted">concurrent</div>
          </div>
          <div className="bg-black/30 rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted mb-1">Auto Square-off</div>
            <div className="text-base font-black text-foreground">{risk.auto_square_off_time}</div>
            <div className="text-[9px] text-muted">IST, intraday exit</div>
          </div>
          <div className="bg-black/30 rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted mb-1">Paper Deploy Gate</div>
            <div className="text-base font-black text-foreground">{risk.min_paper_win_rate}% · {risk.min_paper_trades} trades</div>
            <div className="text-[9px] text-muted">min to go live</div>
          </div>
        </div>
      </div>

      {/* ─── KITE TOKEN MODAL ─── */}
      {tokenModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
          onClick={() => !exchanging && setTokenModalOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl w-full max-w-lg my-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h2 className="text-base font-black">🔑 Refresh Zerodha Access Token</h2>
                <p className="text-[11px] text-muted">Kite tokens expire every day at ~6:00 AM IST</p>
              </div>
              <button
                onClick={() => !exchanging && setTokenModalOpen(false)}
                className="text-muted hover:text-foreground text-xl leading-none px-2"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              <ol className="space-y-3 text-xs">
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-accent/20 text-accent text-[10px] font-black flex items-center justify-center">1</span>
                  <div className="flex-1">
                    <div className="font-bold mb-1">Open the Kite login page</div>
                    {kiteLoginUrl ? (
                      <a
                        href={kiteLoginUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-[11px] font-black px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90"
                      >
                        🔗 Open Kite Login →
                      </a>
                    ) : (
                      <div className="text-muted italic">Loading login URL...</div>
                    )}
                    <div className="text-muted text-[10px] mt-1">Log in with your Zerodha credentials + OTP.</div>
                  </div>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-accent/20 text-accent text-[10px] font-black flex items-center justify-center">2</span>
                  <div className="flex-1">
                    <div className="font-bold mb-1">Copy the redirect URL</div>
                    <div className="text-muted text-[10px]">
                      After login, Zerodha redirects to a URL like <code className="bg-black/30 px-1 rounded">…?request_token=XXXX&action=login…</code>. Copy the entire URL from your address bar.
                    </div>
                  </div>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-accent/20 text-accent text-[10px] font-black flex items-center justify-center">3</span>
                  <div className="flex-1">
                    <div className="font-bold mb-1">Paste it here</div>
                    <textarea
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="Paste full redirect URL OR just the request_token"
                      rows={3}
                      className="w-full bg-black/30 border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-accent resize-none"
                    />
                    <div className="text-muted text-[10px] mt-1">
                      We&apos;ll extract the request_token, exchange it for a long-lived access_token, and save it to <code className="bg-black/30 px-1 rounded">.env</code> automatically.
                    </div>
                  </div>
                </li>
              </ol>

              <div className="bg-yellow/5 border border-yellow/30 rounded-lg p-2 text-[10px] text-yellow leading-snug">
                ⏱️ Request tokens are single-use and expire in minutes. Paste it immediately after login.
              </div>
            </div>

            <div className="p-4 border-t border-border flex items-center justify-end gap-2">
              <button
                onClick={() => setTokenModalOpen(false)}
                disabled={exchanging}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-white/5 border border-border text-muted hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={exchangeToken}
                disabled={exchanging || !tokenInput.trim()}
                className="px-4 py-2 text-xs font-black rounded-lg bg-green text-white disabled:opacity-50"
              >
                {exchanging ? "Exchanging..." : "💾 Save Token"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SETTINGS MODAL ─── */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl w-full max-w-2xl my-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card rounded-t-2xl">
              <div>
                <h2 className="text-base font-black">⚙️ Real Trading Configuration</h2>
                <p className="text-[11px] text-muted">Risk & execution limits applied to all live trades</p>
              </div>
              <button
                onClick={() => setSettingsOpen(false)}
                className="text-muted hover:text-foreground text-xl leading-none px-2"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-5">
              {/* Trade caps */}
              <div>
                <h3 className="text-[11px] uppercase font-black text-accent mb-2">Trade Limits</h3>
                <div className="grid grid-cols-2 gap-3">
                  <SettingInput
                    label="Max Trades / Day"
                    hint="Hard cap on new trades opened daily"
                    suffix="trades"
                    value={risk.max_trades_per_day}
                    onChange={(v) => setRisk((p) => ({ ...p, max_trades_per_day: v }))}
                  />
                  <SettingInput
                    label="Max Open Positions"
                    hint="Concurrent positions allowed"
                    suffix="positions"
                    value={risk.max_open_positions}
                    onChange={(v) => setRisk((p) => ({ ...p, max_open_positions: v }))}
                  />
                </div>
              </div>

              {/* Risk */}
              <div>
                <h3 className="text-[11px] uppercase font-black text-accent mb-2">Risk Controls</h3>
                <div className="grid grid-cols-2 gap-3">
                  <SettingInput
                    label="Max Position Size"
                    hint="% of account balance per trade"
                    suffix="%"
                    value={risk.max_position_size_pct}
                    onChange={(v) => setRisk((p) => ({ ...p, max_position_size_pct: v }))}
                  />
                  <SettingInput
                    label="Risk per Trade"
                    hint="% of strategy capital risked on SL"
                    suffix="%"
                    value={risk.risk_per_trade_pct}
                    onChange={(v) => setRisk((p) => ({ ...p, risk_per_trade_pct: v }))}
                  />
                  <SettingInput
                    label="Daily Loss Limit"
                    hint="% of balance — halt if exceeded"
                    suffix="%"
                    value={risk.daily_loss_limit_pct}
                    onChange={(v) => setRisk((p) => ({ ...p, daily_loss_limit_pct: v }))}
                  />
                  <SettingInput
                    label="Emergency Stop"
                    hint="Halt all trading below this ₹ balance"
                    suffix="₹"
                    value={risk.emergency_stop_balance}
                    onChange={(v) => setRisk((p) => ({ ...p, emergency_stop_balance: v }))}
                  />
                </div>
              </div>

              {/* Paper gate */}
              <div>
                <h3 className="text-[11px] uppercase font-black text-accent mb-2">Paper → Live Gate</h3>
                <div className="grid grid-cols-2 gap-3">
                  <SettingInput
                    label="Min Paper Win Rate"
                    hint="Required to deploy a strategy"
                    suffix="%"
                    value={risk.min_paper_win_rate}
                    onChange={(v) => setRisk((p) => ({ ...p, min_paper_win_rate: v }))}
                  />
                  <SettingInput
                    label="Min Paper Trades"
                    hint="Required sample size"
                    suffix="trades"
                    value={risk.min_paper_trades}
                    onChange={(v) => setRisk((p) => ({ ...p, min_paper_trades: v }))}
                  />
                </div>
              </div>

              {/* Execution */}
              <div>
                <h3 className="text-[11px] uppercase font-black text-accent mb-2">Execution</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-muted">Auto Square-off Time</label>
                    <input
                      type="time"
                      value={risk.auto_square_off_time}
                      onChange={(e) => setRisk((p) => ({ ...p, auto_square_off_time: e.target.value }))}
                      className="w-full mt-1 bg-black/30 border border-border rounded-lg px-3 py-2 text-sm font-black text-foreground outline-none focus:border-accent"
                    />
                    <div className="text-[9px] text-muted mt-0.5">IST · intraday exits forced after</div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-muted">Pre-market Orders</label>
                    <label className="w-full mt-1 bg-black/30 border border-border rounded-lg px-3 py-2 text-sm font-black flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={risk.allow_premarket}
                        onChange={(e) => setRisk((p) => ({ ...p, allow_premarket: e.target.checked }))}
                        className="w-4 h-4 accent-green"
                      />
                      <span className={risk.allow_premarket ? "text-green" : "text-muted"}>
                        {risk.allow_premarket ? "Allowed" : "Blocked"}
                      </span>
                    </label>
                    <div className="text-[9px] text-muted mt-0.5">Allow AMO/pre-market order placement</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-border flex items-center justify-end gap-2 sticky bottom-0 bg-card rounded-b-2xl">
              <button
                onClick={() => setSettingsOpen(false)}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-white/5 border border-border text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={saveRisk}
                disabled={savingRisk}
                className="px-4 py-2 text-xs font-black rounded-lg bg-green text-white disabled:opacity-50"
              >
                {savingRisk ? "Saving..." : "💾 Save Settings"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── WARNING ─── */}
      <div className="bg-red/5 border border-red/30 rounded-xl p-4 text-[11px] text-red/90 space-y-1">
        <p className="font-bold">⚠️ REAL TRADING DISCLAIMERS:</p>
        <ul className="list-disc list-inside space-y-0.5 text-red/80">
          <li>Real money at risk. Slippage and spreads apply vs paper.</li>
          <li>Only strategies with ≥60% win rate & ≥10 paper trades should be activated.</li>
          <li>Start small, scale gradually. Past performance ≠ future returns.</li>
          <li>Monitor positions daily. Emergency stop at ₹2,000 balance.</li>
        </ul>
      </div>
    </div>
  );
}

function SettingInput({
  label,
  hint,
  suffix,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  suffix?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase font-bold text-muted">{label}</label>
      <div className="mt-1 flex items-center bg-black/30 border border-border rounded-lg focus-within:border-accent">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="flex-1 bg-transparent px-3 py-2 text-sm font-black text-foreground outline-none min-w-0"
        />
        {suffix && <span className="px-2 text-[10px] text-muted font-bold">{suffix}</span>}
      </div>
      {hint && <div className="text-[9px] text-muted mt-0.5">{hint}</div>}
    </div>
  );
}

function StatCard({ label, value, color = "text-foreground" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-3 text-center">
      <div className="text-[10px] uppercase font-bold text-muted mb-1">{label}</div>
      <div className={`text-base sm:text-lg font-black ${color}`}>{value}</div>
    </div>
  );
}

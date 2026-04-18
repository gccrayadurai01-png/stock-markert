"use client";

import { useState, useEffect } from "react";
import type {
  AutoTraderData,
  AutoTraderPosition,
  AutoTraderPendingSignal,
  AutoTraderJournalEntry,
  DailySummary,
  StrategyPerformanceMap,
  StrategyConfig,
  StrategyId,
  SMCAnalysis,
} from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  initialData?: AutoTraderData;
}

export default function AutoTraderDashboard({ initialData }: Props) {
  const [data, setData] = useState<AutoTraderData | null>(initialData ?? null);
  const [journal, setJournal] = useState<AutoTraderJournalEntry[]>([]);
  const [tab, setTab] = useState<"positions" | "watchlist" | "journal" | "strategies" | "performance" | "summary" | "settings" | "mytrades" | "pennystocks">("positions");
  const [prefillTrade, setPrefillTrade] = useState<{ symbol: string; price: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [nextScanIn, setNextScanIn] = useState<number | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [strategyTrades, setStrategyTrades] = useState<AutoTraderJournalEntry[]>([]);
  const [loadingStratTrades, setLoadingStratTrades] = useState(false);

  // Poll auto trader status every 10 seconds
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Live countdown — tick every second based on last_scan + scan_interval
  useEffect(() => {
    const tick = () => {
      if (!data?.last_scan || !data?.running) {
        setNextScanIn(null);
        return;
      }
      const interval = data.scan_interval_seconds ?? 120;
      const lastScanMs = new Date(data.last_scan).getTime();
      const nextMs = lastScanMs + interval * 1000;
      const remaining = Math.max(0, Math.round((nextMs - Date.now()) / 1000));
      setNextScanIn(remaining);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data?.last_scan, data?.running, data?.scan_interval_seconds]);

  async function fetchStatus() {
    try {
      const res = await fetch(`${API}/api/auto-trader/status`);
      const d = await res.json();
      setData(d);
    } catch { /* ignore */ }
  }

  async function fetchJournal() {
    try {
      const res = await fetch(`${API}/api/auto-trader/journal?last_n=50`);
      const j = await res.json();
      setJournal(j);
    } catch { /* ignore */ }
  }

  async function toggleAutoTrader() {
    if (!data) return;
    setToggling(true);
    try {
      await fetch(`${API}/api/auto-trader/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !data.enabled }),
      });
      await fetchStatus();
    } catch { /* ignore */ }
    setToggling(false);
  }

  async function forceScan() {
    setScanning(true);
    try {
      await fetch(`${API}/api/auto-trader/scan-now`, { method: "POST" });
      await fetchStatus();
      if (tab === "journal") fetchJournal();
    } catch { /* ignore */ }
    setScanning(false);
  }

  async function handleStrategyClick(id: string) {
    if (selectedStrategy === id) {
      setSelectedStrategy(null);
      setStrategyTrades([]);
      return;
    }
    setSelectedStrategy(id);
    setLoadingStratTrades(true);
    try {
      const res = await fetch(`${API}/api/auto-trader/journal/by-strategy/${encodeURIComponent(id)}`);
      const d = await res.json();
      setStrategyTrades(Array.isArray(d) ? d : []);
    } catch { /* ignore */ }
    setLoadingStratTrades(false);
  }

  useEffect(() => {
    if (tab === "journal") fetchJournal();
  }, [tab]);

  const enabled = data?.enabled ?? false;
  const running = data?.running ?? false;
  const positions = data?.positions ?? [];
  const pending = data?.pending_signals ?? [];
  const stats = data?.stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl sm:text-3xl">🤖</span>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-foreground">AUTO TRADER</h1>
            <p className="text-xs text-muted">5 Independent Strategies — Any fires = Trade taken</p>
          </div>
          {data?.test_mode && (
            <span className="text-[10px] bg-yellow/20 text-yellow px-2 py-1 rounded-full font-bold">PAPER</span>
          )}
          {/* Next scan countdown */}
          {data?.last_scan && (
            <div className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-2.5 py-1">
              <span className="text-[10px] text-muted font-bold uppercase tracking-wider">
                {data.running ? "Next scan" : "Last scan"}
              </span>
              <span className={`text-xs font-black tabular-nums ${
                !data.running ? "text-muted" :
                nextScanIn === 0 ? "text-yellow animate-pulse" :
                (nextScanIn ?? 999) <= 15 ? "text-green animate-pulse" : "text-accent"
              }`}>
                {!data.running
                  ? new Date(data.last_scan).toLocaleTimeString("en-IN", {hour: "2-digit", minute: "2-digit"})
                  : nextScanIn === 0 || nextScanIn === null
                  ? "SCANNING..."
                  : nextScanIn < 60
                  ? `${nextScanIn}s`
                  : `${Math.floor(nextScanIn / 60)}m ${nextScanIn % 60}s`
                }
              </span>
            </div>
          )}
          {data?.running && data?.scan_count > 0 && (
            <span className="text-[10px] text-muted">Scan #{data.scan_count}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={forceScan} disabled={scanning}
            className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm bg-accent hover:bg-accent/80 text-white transition-all shadow-lg shadow-accent/20">
            {scanning ? "⏳..." : "🔍 SCAN NOW"}
          </button>
          <button onClick={toggleAutoTrader} disabled={toggling}
            className={`flex-1 sm:flex-none px-4 sm:px-6 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all ${
              enabled ? "bg-green text-white shadow-lg shadow-green/30 animate-pulse" : "bg-card border-2 border-border text-muted hover:border-green hover:text-green"
            }`}>
            {toggling ? "..." : enabled ? "AUTO: ON" : "AUTO: OFF"}
          </button>
        </div>
      </div>

      {/* 5 Strategy Status Bar */}
      <div className="bg-card rounded-xl border border-border p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-muted uppercase tracking-wider">5 Independent Strategies</span>
            <span className="text-[9px] bg-green/20 text-green px-1.5 py-0.5 rounded font-bold">ANY fires = Trade</span>
          </div>
          {data?.intelligence && (
            <span className={`text-[9px] font-bold ${
              data.intelligence.market_sentiment === "BULLISH" ? "text-green" :
              data.intelligence.market_sentiment === "BEARISH" ? "text-red" : "text-muted"
            }`}>📰 {data.intelligence.market_sentiment}</span>
          )}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
          {[
            { id: "A", name: "Momentum",  emoji: "🚀", color: "text-green",      bg: "bg-green/10 border-green/30",           min: 45 },
            { id: "B", name: "Reversal",  emoji: "📉", color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/30",     min: 40 },
            { id: "C", name: "Trend",     emoji: "🏄", color: "text-yellow",     bg: "bg-yellow/10 border-yellow/30",         min: 45 },
            { id: "D", name: "News",      emoji: "📰", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30", min: 35 },
            { id: "E", name: "SMC/ICT",   emoji: "🧠", color: "text-red",        bg: "bg-red/10 border-red/30",               min: 45 },
          ].map((s) => {
            const perf = (data as AutoTraderData & { strategy_performance?: Record<string, { trades: number; win_rate: number; pnl: number }> })?.strategy_performance?.[s.id];
            const isSelected = selectedStrategy === s.id;
            return (
              <button
                key={s.id}
                onClick={() => handleStrategyClick(s.id)}
                className={`rounded-lg border px-2 py-1.5 text-left transition-all cursor-pointer hover:opacity-80 ${s.bg} ${isSelected ? "ring-2 ring-offset-1 ring-offset-card ring-white/30" : ""}`}
              >
                <div className="flex items-center gap-1">
                  <span className="text-xs">{s.emoji}</span>
                  <span className={`text-[9px] font-black ${s.color}`}>{s.id}</span>
                  {isSelected && <span className="text-[8px] text-white/60 ml-auto">▲</span>}
                </div>
                <div className="text-[8px] text-muted">{s.name}</div>
                <div className="text-[8px] text-muted/70">min: {s.min}</div>
                {perf && perf.trades > 0 && (
                  <div className={`text-[8px] font-bold mt-0.5 ${perf.pnl >= 0 ? "text-green" : "text-red"}`}>
                    {perf.win_rate}% • {perf.trades}T
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {/* Strategy Detail Panel */}
        {selectedStrategy && (
          <StrategyDetailPanel
            strategyId={selectedStrategy}
            trades={strategyTrades}
            loading={loadingStratTrades}
            perfData={(data as AutoTraderData & { strategy_performance?: Record<string, { trades: number; wins: number; losses: number; win_rate: number; pnl: number }> })?.strategy_performance?.[selectedStrategy]}
          />
        )}
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
        <StatusCard
          label="Status"
          value={running ? "SCANNING" : enabled ? "WAITING" : "OFF"}
          color={running ? "text-green" : "text-muted"}
          pulse={running}
        />
        <StatusCard
          label="Capital"
          value={`₹${(data?.capital ?? 0).toLocaleString("en-IN")}`}
        />
        <StatusCard
          label="Cash"
          value={`₹${(data?.cash_available ?? 0).toLocaleString("en-IN")}`}
        />
        <StatusCard
          label="Positions"
          value={`${positions.length}/${data?.risk_status?.max_positions ?? 5}`}
        />
        <StatusCard
          label="Today P&L"
          value={`₹${(data?.today_pnl ?? 0).toLocaleString("en-IN")}`}
          color={(data?.today_pnl ?? 0) >= 0 ? "text-green" : "text-red"}
        />
        <StatusCard
          label="Total P&L"
          value={`₹${(data?.total_pnl ?? 0).toLocaleString("en-IN")}`}
          color={(data?.total_pnl ?? 0) >= 0 ? "text-green" : "text-red"}
        />
        <StatusCard
          label="Heat"
          value={`${data?.portfolio_heat ?? 0}%`}
          color={(data?.portfolio_heat ?? 0) > 6 ? "text-red" : "text-green"}
        />
      </div>

      {/* Win Rate + Scans */}
      {stats && stats.total_trades > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <div className="text-[10px] text-muted uppercase font-bold">Win Rate</div>
            <div className={`text-xl font-black ${stats.win_rate >= 50 ? "text-green" : "text-red"}`}>
              {stats.win_rate}%
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <div className="text-[10px] text-muted uppercase font-bold">Total Trades</div>
            <div className="text-xl font-black text-foreground">{stats.total_trades}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <div className="text-[10px] text-muted uppercase font-bold">Avg Win</div>
            <div className="text-xl font-black text-green">₹{stats.avg_win?.toLocaleString("en-IN")}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <div className="text-[10px] text-muted uppercase font-bold">Avg Loss</div>
            <div className="text-xl font-black text-red">₹{Math.abs(stats.avg_loss ?? 0).toLocaleString("en-IN")}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <div className="text-[10px] text-muted uppercase font-bold">Scans</div>
            <div className="text-xl font-black text-accent">{data?.scan_count ?? 0}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-1 overflow-x-auto">
        {(["positions", "watchlist", "journal", "performance", "strategies", "mytrades", "pennystocks", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 sm:px-4 py-2 text-xs font-bold rounded-t-lg transition whitespace-nowrap ${
              tab === t
                ? "bg-accent/10 text-accent border-b-2 border-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t === "positions"    && `📊 Positions (${positions.length})`}
            {t === "watchlist"   && `👁️ Watchlist (${pending.length})`}
            {t === "journal"     && "📝 Journal"}
            {t === "performance" && "🏆 Performance"}
            {t === "strategies"  && "🧩 Strategies"}
            {t === "mytrades"    && "💼 My Trades"}
            {t === "pennystocks" && "💎 Penny Stocks"}
            {t === "settings"    && "⚙️ Settings"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "positions"    && <PositionsTab positions={positions} />}
      {tab === "watchlist"   && <WatchlistTab signals={pending} onTakeTrade={(sym, price) => { setPrefillTrade({ symbol: sym, price }); setTab("mytrades"); }} />}
      {tab === "journal"     && <JournalTab entries={journal} onRefresh={fetchJournal} />}
      {tab === "performance" && <PerformanceTab data={data} />}
      {tab === "strategies"  && <StrategiesTab initialConfig={data?.strategy_config} />}
      {tab === "mytrades"    && <ManualTradesTab prefill={prefillTrade} onPrefillUsed={() => setPrefillTrade(null)} />}
      {tab === "pennystocks" && <PennyStocksTab onTakeTrade={(sym, price) => { setPrefillTrade({ symbol: sym, price }); setTab("mytrades"); }} />}
      {tab === "settings"    && <SettingsTab onSave={fetchStatus} />}

      {/* Last scan */}
      {data?.last_scan && (
        <div className="text-center text-[10px] text-muted">
          Last scan: {new Date(data.last_scan).toLocaleTimeString("en-IN")} — Scan #{data.scan_count}
        </div>
      )}
    </div>
  );
}

// ── Sub Components ────────────────────────────────────────────────────

function StatusCard({
  label, value, color = "text-foreground", pulse = false,
}: {
  label: string; value: string; color?: string; pulse?: boolean;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-3 text-center">
      <div className="text-[9px] text-muted uppercase font-bold tracking-wider">{label}</div>
      <div className={`text-lg font-black ${color} ${pulse ? "animate-pulse" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function PositionsTab({ positions }: { positions: AutoTraderPosition[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!positions.length) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <span className="text-3xl block mb-2">🎯</span>
        <p className="text-sm font-bold text-muted">No open positions</p>
        <p className="text-xs text-muted mt-1">The Master is watching... waiting for perfect confluence (75/100)</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {positions.map((p) => {
        const isProfit = p.unrealized_pnl >= 0;
        const isExpanded = expanded === p.symbol;
        return (
          <div
            key={p.symbol}
            className={`rounded-xl border-2 overflow-hidden ${
              isProfit ? "border-green/30 bg-green/5" : "border-red/30 bg-red/5"
            }`}
          >
            <button
              onClick={() => setExpanded(isExpanded ? null : p.symbol)}
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <div className={`text-xs font-black px-2 py-1 rounded ${isProfit ? "bg-green text-white" : "bg-red text-white"}`}>
                  {p.status}
                </div>
                <div>
                  <div className="font-bold text-foreground">{p.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-muted">{p.symbol.replace(".NS", "")}</span>
                    {p.strategy_key && (
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                        p.strategy_key === "A" ? "bg-green/10 text-green border-green/30" :
                        p.strategy_key === "B" ? "bg-blue-500/10 text-blue-400 border-blue-500/30" :
                        p.strategy_key === "C" ? "bg-yellow/10 text-yellow border-yellow/30" :
                        p.strategy_key === "D" ? "bg-purple-500/10 text-purple-400 border-purple-500/30" :
                        p.strategy_key === "E" ? "bg-red/10 text-red border-red/30" :
                        "bg-purple-500/10 text-purple-400 border-purple-500/30"
                      }`}>
                        {p.strategy_key === "A" ? "🚀 Momentum" :
                         p.strategy_key === "B" ? "📉 Reversal" :
                         p.strategy_key === "C" ? "🏄 Trend" :
                         p.strategy_key === "D" ? "📰 News" :
                         p.strategy_key === "E" ? "🧠 SMC/ICT" :
                         p.strategy_key.includes("+") ? `⚡ ${p.strategy_key}` : p.strategy_key}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div className="text-center">
                  <div className="text-muted">Entry</div>
                  <div className="font-bold">₹{p.entry_price.toLocaleString("en-IN")}</div>
                </div>
                <div className="text-center">
                  <div className="text-muted">Current</div>
                  <div className="font-bold">₹{p.current_price.toLocaleString("en-IN")}</div>
                </div>
                <div className="text-center">
                  <div className="text-muted">P&L</div>
                  <div className={`font-bold ${isProfit ? "text-green" : "text-red"}`}>
                    ₹{p.unrealized_pnl.toLocaleString("en-IN")} ({p.unrealized_pnl_pct.toFixed(1)}%)
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-muted">Trail SL</div>
                  <div className="font-bold text-yellow">₹{p.trailing_stop.toLocaleString("en-IN")}</div>
                </div>
                <div className={`text-center px-3 py-1 rounded-lg ${
                  p.confluence_score >= 85 ? "bg-green/20 text-green" :
                  p.confluence_score >= 75 ? "bg-yellow/20 text-yellow" : "bg-red/20 text-red"
                }`}>
                  <div className="text-[9px] font-bold">CONF</div>
                  <div className="font-black text-lg">{p.confluence_score}</div>
                </div>
                <span className="text-muted">{isExpanded ? "▲" : "▼"}</span>
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-border/50 space-y-3 pt-3">
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-muted">Shares</div>
                    <div className="font-bold">{p.shares}</div>
                  </div>
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-muted">Deployed</div>
                    <div className="font-bold">₹{p.capital_deployed.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-muted">Target 1</div>
                    <div className="font-bold text-green">₹{p.target_1.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-muted">Target 2</div>
                    <div className="font-bold text-green">₹{p.target_2.toLocaleString("en-IN")}</div>
                  </div>
                </div>
                <div className="bg-background rounded-lg p-3">
                  <div className="text-[10px] font-bold text-accent uppercase mb-1">WHY THE MASTER ENTERED</div>
                  <div className="space-y-1">
                    {p.entry_reasoning.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                        <span className="text-green">✓</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-[10px] text-muted">
                  Entered: {new Date(p.entry_time).toLocaleString("en-IN")}
                  {p.partial_exit_done && " | Partial exit done (T1 hit)"}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WatchlistTab({ signals, onTakeTrade }: { signals: AutoTraderPendingSignal[]; onTakeTrade?: (symbol: string, price: number) => void }) {
  if (!signals.length) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <span className="text-3xl block mb-2">👁️</span>
        <p className="text-sm font-bold text-muted">No stocks on watchlist</p>
        <p className="text-xs text-muted mt-1">Stocks approaching confluence threshold will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {signals.map((s) => {
        const threshold = (s as AutoTraderPendingSignal & { strategy_id?: string }).strategy_id === "B" ? 55 :
                          (s as AutoTraderPendingSignal & { strategy_id?: string }).strategy_id === "D" ? 50 : 60;
        const pct = Math.min(100, (s.confluence_score / threshold) * 100);
        return (
          <div key={s.symbol} className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">{s.name}</span>
                  {(s as AutoTraderPendingSignal & { strategy_id?: string; strategy_name?: string }).strategy_id && (
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                      (s as AutoTraderPendingSignal & { strategy_id?: string }).strategy_id === "A" ? "bg-green/10 text-green border-green/30" :
                      (s as AutoTraderPendingSignal & { strategy_id?: string }).strategy_id === "B" ? "bg-blue-500/10 text-blue-400 border-blue-500/30" :
                      (s as AutoTraderPendingSignal & { strategy_id?: string }).strategy_id === "C" ? "bg-yellow/10 text-yellow border-yellow/30" :
                      "bg-purple-500/10 text-purple-400 border-purple-500/30"
                    }`}>
                      {(s as AutoTraderPendingSignal & { strategy_id?: string }).strategy_id === "A" ? "🚀 Momentum" :
                       (s as AutoTraderPendingSignal & { strategy_id?: string }).strategy_id === "B" ? "📉 Reversal" :
                       (s as AutoTraderPendingSignal & { strategy_id?: string }).strategy_id === "C" ? "🏄 Trend" : "📰 News"}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted">₹{s.price.toLocaleString("en-IN")}</span>
              </div>
              <div className="text-right">
                <span className={`text-lg font-black ${s.confluence_score >= 50 ? "text-yellow" : "text-muted"}`}>
                  {s.confluence_score}/100
                </span>
                <div className="text-[9px] text-muted">Approaching threshold</div>
              </div>
            </div>

            {/* Confluence bar */}
            <div className="w-full h-2 bg-background rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all ${
                  pct >= 90 ? "bg-green" : pct >= 75 ? "bg-yellow" : "bg-accent"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Met conditions */}
            <div className="flex flex-wrap gap-1 mb-1">
              {s.met_conditions?.slice(0, 4).map((c, i) => (
                <span key={i} className="text-[9px] bg-green/10 text-green px-1.5 py-0.5 rounded">
                  ✓ {c.length > 35 ? c.substring(0, 35) + "..." : c}
                </span>
              ))}
            </div>

            {/* Missing conditions */}
            <div className="flex flex-wrap gap-1 mb-2">
              {s.missing?.slice(0, 3).map((m, i) => (
                <span key={i} className="text-[9px] bg-red/10 text-red px-1.5 py-0.5 rounded">
                  ✕ {m.length > 35 ? m.substring(0, 35) + "..." : m}
                </span>
              ))}
            </div>
            {onTakeTrade && (
              <button
                onClick={() => onTakeTrade(s.symbol.replace(".NS", ""), s.price)}
                className="mt-1 px-3 py-1 rounded-lg text-[10px] font-black bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 transition-all"
              >
                📌 Take Trade
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

type JournalByDate = {
  date: string;
  trades_taken: number;
  trades_exited: number;
  day_pnl: number;
  entries: AutoTraderJournalEntry[];
};

function JournalTab({
  onRefresh,
}: {
  entries?: AutoTraderJournalEntry[];
  onRefresh: () => void;
}) {
  const [byDate, setByDate] = useState<JournalByDate[]>([]);
  const [loadingJournal, setLoadingJournal] = useState(false);
  const [stratFilter, setStratFilter] = useState<string>("All");

  useEffect(() => {
    fetchByDate();
  }, []);

  async function fetchByDate() {
    setLoadingJournal(true);
    try {
      const res = await fetch(`${API}/api/auto-trader/journal/by-date`);
      const d = await res.json();
      setByDate(Array.isArray(d) ? d : []);
    } catch { /* ignore */ }
    setLoadingJournal(false);
    onRefresh();
  }

  const stratFilters = ["All", "A", "B", "C", "D", "E", "Combos"];

  function matchesFilter(entry: AutoTraderJournalEntry): boolean {
    if (stratFilter === "All") return true;
    const key = (entry as AutoTraderJournalEntry & { strategy_key?: string }).strategy_key ?? "";
    if (stratFilter === "Combos") return key.includes("+");
    return key === stratFilter;
  }

  if (loadingJournal) {
    return <div className="text-center text-muted py-8 text-sm">Loading journal...</div>;
  }

  if (!byDate.length) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <span className="text-3xl block mb-2">📝</span>
        <p className="text-sm font-bold text-muted">No journal entries yet</p>
        <p className="text-xs text-muted mt-1">Every trade decision will be logged with full reasoning</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Strategy filter bar */}
      <div className="flex gap-1.5 flex-wrap">
        {stratFilters.map((f) => (
          <button
            key={f}
            onClick={() => setStratFilter(f)}
            className={`px-3 py-1 rounded-full text-[10px] font-black transition-all border ${
              stratFilter === f
                ? "bg-accent text-white border-accent"
                : "bg-card border-border text-muted hover:border-accent/50 hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
        <button
          onClick={fetchByDate}
          className="ml-auto px-3 py-1 rounded-full text-[10px] font-black bg-card border border-border text-muted hover:border-accent/50 hover:text-foreground transition-all"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Grouped by date */}
      {byDate.map((day) => {
        const filtered = day.entries.filter(matchesFilter);
        if (stratFilter !== "All" && filtered.length === 0) return null;
        const displayDate = new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        });
        return (
          <div key={day.date} className="space-y-2">
            {/* Date header */}
            <div className="bg-card rounded-xl border border-border px-4 py-3 flex flex-wrap items-center gap-3">
              <span className="font-black text-sm text-foreground">{displayDate}</span>
              <span className="text-[10px] font-bold text-green">{day.trades_taken} entered</span>
              <span className="text-[10px] font-bold text-orange-400">{day.trades_exited} exited</span>
              <span className={`text-[10px] font-bold ml-auto ${day.day_pnl >= 0 ? "text-green" : "text-red"}`}>
                {day.day_pnl >= 0 ? "+" : ""}₹{day.day_pnl.toLocaleString("en-IN")}
              </span>
            </div>

            {/* Entries under this day */}
            {(stratFilter === "All" ? day.entries : filtered).map((e, i) => {
              const isEntry = e.action === "ENTER";
              const isExit = e.action === "EXIT" || e.action === "PARTIAL_EXIT";
              const stratKey = (e as AutoTraderJournalEntry & { strategy_key?: string }).strategy_key;
              return (
                <div
                  key={i}
                  className={`bg-card rounded-lg border p-3 ml-4 ${
                    isEntry ? "border-green/30" : isExit ? "border-red/30" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                        isEntry ? "bg-green text-white" : isExit ? "bg-red text-white" : "bg-muted/20 text-muted"
                      }`}>
                        {e.action}
                      </span>
                      <span className="font-bold text-sm text-foreground">{e.symbol?.replace(".NS", "")}</span>
                      {stratKey && (
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                          stratKey === "A" ? "bg-green/10 text-green border-green/30" :
                          stratKey === "B" ? "bg-blue-500/10 text-blue-400 border-blue-500/30" :
                          stratKey === "C" ? "bg-yellow/10 text-yellow border-yellow/30" :
                          stratKey === "D" ? "bg-purple-500/10 text-purple-400 border-purple-500/30" :
                          stratKey === "E" ? "bg-red/10 text-red border-red/30" :
                          "bg-purple-500/10 text-purple-400 border-purple-500/30"
                        }`}>
                          {stratKey === "A" ? "🚀 A" :
                           stratKey === "B" ? "📉 B" :
                           stratKey === "C" ? "🏄 C" :
                           stratKey === "D" ? "📰 D" :
                           stratKey === "E" ? "🧠 E" :
                           stratKey.includes("+") ? `⚡ ${stratKey}` : stratKey}
                        </span>
                      )}
                      {e.confluence_score != null && (
                        <span className="text-[10px] text-muted">Conf: {e.confluence_score}/100</span>
                      )}
                    </div>
                    <div className="text-right">
                      {e.pnl !== undefined && (
                        <div className={`text-sm font-bold ${(e.pnl ?? 0) >= 0 ? "text-green" : "text-red"}`}>
                          ₹{e.pnl?.toLocaleString("en-IN")} ({e.pnl_pct?.toFixed(1)}%)
                        </div>
                      )}
                      <div className="text-[9px] text-muted">
                        {new Date(e.timestamp).toLocaleTimeString("en-IN")}
                        {e.hold_duration_minutes ? ` | ${e.hold_duration_minutes}min` : ""}
                      </div>
                    </div>
                  </div>

                  {/* ENTER specific fields */}
                  {isEntry && (
                    <div className="flex flex-wrap gap-2 mb-1 text-[9px]">
                      {(e as AutoTraderJournalEntry & { entry_price?: number }).entry_price != null && (
                        <span className="bg-green/10 text-green px-1.5 py-0.5 rounded">
                          Entry ₹{(e as AutoTraderJournalEntry & { entry_price?: number }).entry_price?.toLocaleString("en-IN")}
                        </span>
                      )}
                      {(e as AutoTraderJournalEntry & { stop_loss?: number }).stop_loss != null && (
                        <span className="bg-red/10 text-red px-1.5 py-0.5 rounded">
                          SL ₹{(e as AutoTraderJournalEntry & { stop_loss?: number }).stop_loss?.toLocaleString("en-IN")}
                        </span>
                      )}
                      {(e as AutoTraderJournalEntry & { target_1?: number }).target_1 != null && (
                        <span className="bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                          T1 ₹{(e as AutoTraderJournalEntry & { target_1?: number }).target_1?.toLocaleString("en-IN")}
                        </span>
                      )}
                    </div>
                  )}

                  {/* EXIT specific fields */}
                  {isExit && (e as AutoTraderJournalEntry & { exit_price?: number }).exit_price != null && (
                    <div className="flex flex-wrap gap-2 mb-1 text-[9px]">
                      <span className="bg-red/10 text-red px-1.5 py-0.5 rounded">
                        Exit ₹{(e as AutoTraderJournalEntry & { exit_price?: number }).exit_price?.toLocaleString("en-IN")}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {e.reasoning?.map((r, j) => (
                      <span key={j} className="text-[9px] text-foreground/70 bg-background px-1.5 py-0.5 rounded">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Strategy Detail Panel ─────────────────────────────────────────────

const STRATEGY_DETAILS: Record<string, { emoji: string; fullName: string; conditions: string; description: string }> = {
  A: {
    emoji: "🚀",
    fullName: "Momentum Breakout",
    conditions: "RSI between 50–68, MACD signal = BUY, Volume spike > 1.5×, Supertrend = UP",
    description: "Catches stocks that just broke out of a base on high volume with momentum building. Best in trending markets.",
  },
  B: {
    emoji: "📉",
    fullName: "Oversold Reversal",
    conditions: "RSI < 38, Price near Bollinger Band lower, Stochastic K < 25",
    description: "Finds stocks beaten down too hard and ready to bounce back. Works well after sharp sell-offs.",
  },
  C: {
    emoji: "🏄",
    fullName: "Trend Rider",
    conditions: "ADX > 25 (strong trend), Supertrend = UP, EMA alignment bullish, OBV rising",
    description: "Joins an already-established strong trend. Low false-signal rate in trending markets.",
  },
  D: {
    emoji: "📰",
    fullName: "News Catalyst",
    conditions: "Stock-specific positive news, investor consensus > 3/5 legends agree",
    description: "Trades stocks with fresh positive catalysts supported by institutional consensus signals.",
  },
  E: {
    emoji: "🧠",
    fullName: "SMC / ICT",
    conditions: "Order Block formed + price returning to it, OR Fair Value Gap present, OR Break of Structure confirmed",
    description: "Smart Money Concepts — follows institutional order flow, not retail indicators.",
  },
};

function StrategyDetailPanel({
  strategyId,
  trades,
  loading,
  perfData,
}: {
  strategyId: string;
  trades: AutoTraderJournalEntry[];
  loading: boolean;
  perfData?: { trades: number; wins: number; losses: number; win_rate: number; pnl: number };
}) {
  const detail = STRATEGY_DETAILS[strategyId];
  const winRate = perfData?.win_rate ?? 0;
  const winColor = winRate > 60 ? "bg-green" : winRate >= 40 ? "bg-yellow" : "bg-red";
  const winTextColor = winRate > 60 ? "text-green" : winRate >= 40 ? "text-yellow" : "text-red";

  return (
    <div className="mt-3 bg-background rounded-xl border border-border p-4 space-y-4">
      {/* Strategy card */}
      {detail ? (
        <div className="flex items-start gap-3">
          <span className="text-3xl">{detail.emoji}</span>
          <div>
            <div className="font-black text-foreground">
              {strategyId} — {detail.emoji} {detail.fullName}
            </div>
            <div className="text-[10px] text-muted mt-1">
              <span className="font-bold text-foreground/70">Conditions:</span> {detail.conditions}
            </div>
            <div className="text-[10px] text-foreground/70 mt-1">{detail.description}</div>
          </div>
        </div>
      ) : (
        <div className="font-black text-foreground">Strategy {strategyId}</div>
      )}

      {/* Stats */}
      {perfData && perfData.trades > 0 ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-card rounded-lg p-2 text-center">
              <div className="text-[9px] text-muted uppercase font-bold">Win Probability</div>
              <div className={`text-lg font-black ${winTextColor}`}>{winRate}%</div>
            </div>
            <div className="bg-card rounded-lg p-2 text-center">
              <div className="text-[9px] text-muted uppercase font-bold">Trades</div>
              <div className="text-lg font-black text-foreground">{perfData.trades}</div>
            </div>
            <div className="bg-card rounded-lg p-2 text-center">
              <div className="text-[9px] text-muted uppercase font-bold">Total P&L</div>
              <div className={`text-lg font-black ${perfData.pnl >= 0 ? "text-green" : "text-red"}`}>
                ₹{perfData.pnl >= 0 ? "+" : ""}{perfData.pnl.toLocaleString("en-IN")}
              </div>
            </div>
          </div>
          {/* Win probability bar */}
          <div>
            <div className="flex items-center justify-between text-[9px] text-muted mb-1">
              <span>Win Probability</span>
              <span className={winTextColor}>{winRate}%</span>
            </div>
            <div className="w-full h-2 bg-card rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${winColor}`} style={{ width: `${winRate}%` }} />
            </div>
          </div>
        </div>
      ) : (
        <div className="text-[10px] text-muted italic">No performance data yet for this strategy.</div>
      )}

      {/* Trades list */}
      <div>
        <div className="text-[10px] font-black text-foreground uppercase mb-2">Trades by this Strategy</div>
        {loading ? (
          <div className="text-center text-muted py-4 text-xs">Loading trades...</div>
        ) : trades.length === 0 ? (
          <div className="text-center text-muted py-4 text-xs">No trades found for strategy {strategyId}</div>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {trades.map((t, i) => {
              const isExit = t.action === "EXIT" || t.action === "PARTIAL_EXIT";
              const stratKey = (t as AutoTraderJournalEntry & { strategy_key?: string }).strategy_key;
              return (
                <div
                  key={i}
                  className={`bg-card rounded-lg border px-3 py-2 flex items-center justify-between ${
                    t.action === "ENTER" ? "border-green/20" : isExit ? "border-red/20" : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                      t.action === "ENTER" ? "bg-green text-white" : isExit ? "bg-red text-white" : "bg-muted/20 text-muted"
                    }`}>
                      {t.action}
                    </span>
                    <span className="text-xs font-bold text-foreground">{t.symbol?.replace(".NS", "")}</span>
                    {stratKey && (
                      <span className="text-[9px] bg-accent/10 text-accent px-1.5 py-0.5 rounded border border-accent/30 font-bold">
                        {stratKey}
                      </span>
                    )}
                    <span className="text-[9px] text-muted">
                      {new Date(t.timestamp).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                    </span>
                    <span className="text-[9px] text-muted/70">
                      {new Date(t.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="text-right">
                    {isExit && t.pnl !== undefined ? (
                      <span className={`text-xs font-bold ${(t.pnl ?? 0) >= 0 ? "text-green" : "text-red"}`}>
                        ₹{t.pnl?.toLocaleString("en-IN")} ({t.pnl_pct?.toFixed(1)}%)
                      </span>
                    ) : (
                      (t as AutoTraderJournalEntry & { entry_price?: number }).entry_price != null && (
                        <span className="text-xs text-green">
                          ₹{(t as AutoTraderJournalEntry & { entry_price?: number }).entry_price?.toLocaleString("en-IN")}
                        </span>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Strategy Metadata ─────────────────────────────────────────────────

const STRATEGY_META: Record<StrategyId, { label: string; desc: string; icon: string; color: string }> = {
  A: { label: "Indicators", icon: "📊", color: "accent",  desc: "12 technical indicators — RSI, MACD, Supertrend, EMA, ADX, Volume, Bollinger, VWAP, OBV, ATR" },
  B: { label: "Investors",  icon: "🏛️", color: "yellow",  desc: "5 legendary investor lenses — Jhunjhunwala, Buffett, Burry, Cathie Wood, Peter Lynch" },
  C: { label: "News",       icon: "📰", color: "green",   desc: "Live news sentiment — stock-specific + market-level news scoring" },
  D: { label: "SMC / ICT",  icon: "🎯", color: "purple",  desc: "Smart Money Concepts — Order Blocks, Fair Value Gaps, BOS/CHoCH, Liquidity, OTE zones" },
};

function StrategiesTab({ initialConfig }: { initialConfig?: StrategyConfig }) {
  const [perf, setPerf] = useState<StrategyPerformanceMap>({});
  const [config, setConfig] = useState<StrategyConfig>({
    active_strategies: initialConfig?.active_strategies ?? ["A", "B", "C"],
    strategy_mode: initialConfig?.strategy_mode ?? "ALL_REQUIRED",
    smc_min_score: initialConfig?.smc_min_score ?? 60,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [smcSymbol, setSmcSymbol] = useState("");
  const [smcResult, setSmcResult] = useState<SMCAnalysis | null>(null);
  const [smcLoading, setSmcLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/auto-trader/strategy-performance`)
      .then(r => r.json())
      .then(d => { if (d && typeof d === "object") setPerf(d); })
      .catch(() => {});
    // Refresh config from server
    fetch(`${API}/api/auto-trader/config`)
      .then(r => r.json())
      .then(d => {
        if (d.active_strategies) {
          setConfig({
            active_strategies: d.active_strategies,
            strategy_mode: d.strategy_mode ?? "ALL_REQUIRED",
            smc_min_score: d.smc_min_score ?? 60,
          });
        }
      })
      .catch(() => {});
  }, []);

  function toggleStrategy(id: StrategyId) {
    const current = config.active_strategies;
    const next = current.includes(id)
      ? current.filter(s => s !== id)
      : [...current, id] as StrategyId[];
    setConfig({ ...config, active_strategies: next });
  }

  async function saveConfig() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`${API}/api/auto-trader/strategy-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function resetPerf() {
    await fetch(`${API}/api/auto-trader/strategy-performance/reset`, { method: "POST" });
    setPerf({});
  }

  async function runSMC() {
    if (!smcSymbol.trim()) return;
    setSmcLoading(true);
    setSmcResult(null);
    try {
      const sym = smcSymbol.toUpperCase().includes(".NS") ? smcSymbol.toUpperCase() : `${smcSymbol.toUpperCase()}.NS`;
      const res = await fetch(`${API}/api/auto-trader/smc-analyze/${encodeURIComponent(sym)}`, { method: "POST" });
      const d = await res.json();
      setSmcResult(d);
    } catch { /* ignore */ }
    setSmcLoading(false);
  }

  // Active strategy combinations that have data
  const perfKeys = Object.keys(perf).filter(k => k !== "_trade_log");
  const singleKeys = (["A", "B", "C", "D"] as StrategyId[]).filter(k => perf[k]);
  const comboKeys = perfKeys.filter(k => k.includes("+") && perf[k]?.trades > 0);

  return (
    <div className="space-y-6">
      {/* Strategy Cards — A B C D */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-black text-foreground uppercase">4 Trading Strategies</span>
          {saved && <span className="text-xs text-green font-bold animate-pulse">✅ Saved & Active!</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["A", "B", "C", "D"] as StrategyId[]).map((id) => {
            const meta = STRATEGY_META[id];
            const isActive = config.active_strategies.includes(id);
            const p = perf[id];
            const colorClass = {
              accent: isActive ? "border-accent/60 bg-accent/5" : "border-border",
              yellow: isActive ? "border-yellow/60 bg-yellow/5" : "border-border",
              green:  isActive ? "border-green/60 bg-green/5"  : "border-border",
              purple: isActive ? "border-purple-500/60 bg-purple-500/5" : "border-border",
            }[meta.color];
            const textColor = {
              accent: "text-accent", yellow: "text-yellow",
              green: "text-green",   purple: "text-purple-400",
            }[meta.color];

            return (
              <div key={id} className={`rounded-xl border-2 p-4 transition-all ${colorClass}`}>
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{meta.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-black ${textColor}`}>Strategy {id}</span>
                        <span className="text-xs text-muted font-bold">— {meta.label}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleStrategy(id)}
                    className={`px-3 py-1 rounded-full text-[10px] font-black transition-all ${
                      isActive
                        ? "bg-green text-white shadow shadow-green/30"
                        : "bg-muted/20 text-muted hover:bg-muted/40"
                    }`}
                  >
                    {isActive ? "ACTIVE" : "OFF"}
                  </button>
                </div>

                <p className="text-[10px] text-muted mb-3 leading-relaxed">{meta.desc}</p>

                {/* Performance stats */}
                {p && p.trades > 0 ? (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="bg-background rounded-lg p-1.5 text-center">
                        <div className="text-[9px] text-muted">Trades</div>
                        <div className="text-sm font-black text-foreground">{p.trades}</div>
                      </div>
                      <div className="bg-background rounded-lg p-1.5 text-center">
                        <div className="text-[9px] text-muted">P&L</div>
                        <div className={`text-sm font-black ${p.pnl >= 0 ? "text-green" : "text-red"}`}>₹{p.pnl >= 0 ? "+" : ""}{p.pnl.toLocaleString("en-IN")}</div>
                      </div>
                      <div className="bg-background rounded-lg p-1.5 text-center">
                        <div className="text-[9px] text-muted">W/L</div>
                        <div className="text-sm font-black text-foreground">{p.wins}/{p.losses}</div>
                      </div>
                    </div>
                    {/* Win Probability bar */}
                    <div className="bg-background rounded-lg p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] text-muted font-bold">Win Probability</span>
                        <span className={`text-[9px] font-black ${p.win_rate >= 60 ? "text-green" : p.win_rate >= 40 ? "text-yellow" : "text-red"}`}>{p.win_rate}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-card rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${p.win_rate >= 60 ? "bg-green" : p.win_rate >= 40 ? "bg-yellow" : "bg-red"}`}
                          style={{ width: `${p.win_rate}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-muted italic text-center py-1">No trades recorded yet</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Strategy Mode + Save */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-4">
        <div className="text-xs font-black text-foreground uppercase">Combination Mode</div>

        <div className="grid grid-cols-2 gap-3">
          {(["ALL_REQUIRED", "ANY_TRIGGERS"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setConfig({ ...config, strategy_mode: mode })}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                config.strategy_mode === mode
                  ? "border-accent bg-accent/10"
                  : "border-border bg-background hover:border-accent/50"
              }`}
            >
              <div className="text-xs font-black text-foreground mb-1">
                {mode === "ALL_REQUIRED" ? "🔒 ALL REQUIRED" : "⚡ ANY TRIGGERS"}
              </div>
              <div className="text-[10px] text-muted">
                {mode === "ALL_REQUIRED"
                  ? "All active strategies must agree (strictest — fewest, highest quality trades)"
                  : "Any active strategy can trigger (more trades, test each independently)"}
              </div>
            </button>
          ))}
        </div>

        {/* Active combo preview */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted">Active combination:</span>
          {config.active_strategies.length === 0 ? (
            <span className="text-[10px] text-red font-bold">No strategies selected</span>
          ) : (
            <span className="text-[10px] font-black text-accent">
              {config.active_strategies.sort().join(" + ")}
              {" "}({config.strategy_mode === "ALL_REQUIRED" ? "all must agree" : "any triggers"})
            </span>
          )}
        </div>

        {/* SMC min score (only when D is active) */}
        {config.active_strategies.includes("D") && (
          <div>
            <label className="text-[10px] text-muted font-bold uppercase block mb-1">
              SMC Min Score (D strategy threshold, 0–100)
            </label>
            <input
              type="number"
              min={0} max={100}
              value={config.smc_min_score}
              onChange={e => setConfig({ ...config, smc_min_score: Number(e.target.value) })}
              className="w-32 bg-background text-foreground text-xs px-3 py-2 rounded border border-border focus:border-accent outline-none"
            />
            <span className="text-[10px] text-muted ml-2">
              {config.smc_min_score >= 70 ? "Strict (best OB+FVG+Structure)" : config.smc_min_score >= 50 ? "Moderate" : "Relaxed"}
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={saveConfig}
            disabled={saving || config.active_strategies.length === 0}
            className="bg-green hover:bg-green/80 text-white text-xs font-black px-5 py-2.5 rounded-xl shadow-lg shadow-green/20 transition-all disabled:opacity-50"
          >
            {saving ? "Saving..." : "💾 Apply Strategy Config"}
          </button>
          <button
            onClick={resetPerf}
            className="text-xs text-muted hover:text-red border border-border hover:border-red/50 px-4 py-2.5 rounded-xl transition-all"
          >
            🔄 Reset Performance Data
          </button>
        </div>
      </div>

      {/* Combination Performance */}
      {comboKeys.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-xs font-black text-foreground uppercase mb-3">Combination Performance</div>
          <div className="space-y-2">
            {comboKeys
              .sort((a, b) => (perf[b]?.win_rate ?? 0) - (perf[a]?.win_rate ?? 0))
              .map(key => {
                const p = perf[key];
                return (
                  <div key={key} className="flex items-center justify-between bg-background rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-accent">{key}</span>
                      <span className="text-[9px] text-muted">{p.trades} trades</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span className={`font-bold ${p.win_rate >= 50 ? "text-green" : "text-red"}`}>{p.win_rate}% WR</span>
                      <span className={`font-bold ${p.pnl >= 0 ? "text-green" : "text-red"}`}>₹{p.pnl.toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* SMC On-Demand Scanner */}
      <div className="bg-card rounded-xl border border-purple-500/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span>🎯</span>
          <span className="text-xs font-black text-purple-400 uppercase">SMC / ICT Live Analysis</span>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <input
            type="text"
            placeholder="RELIANCE, TATAMOTORS, HDFCBANK..."
            value={smcSymbol}
            onChange={e => setSmcSymbol(e.target.value)}
            onKeyDown={e => e.key === "Enter" && runSMC()}
            className="flex-1 bg-background text-foreground text-xs px-3 py-2 rounded-lg border border-border focus:border-purple-500 outline-none"
          />
          <button
            onClick={runSMC}
            disabled={smcLoading || !smcSymbol.trim()}
            className="px-4 py-2 rounded-lg text-xs font-black bg-purple-500 hover:bg-purple-500/80 text-white transition-all disabled:opacity-50"
          >
            {smcLoading ? "Analyzing..." : "Analyze"}
          </button>
        </div>

        {smcResult && (
          <SMCResultCard result={smcResult} />
        )}
      </div>
    </div>
  );
}

function SMCResultCard({ result }: { result: SMCAnalysis }) {
  if (!result.available) {
    return (
      <div className="text-center text-muted py-4 text-xs">
        {result.reasons?.[0] ?? "SMC data not available"}
      </div>
    );
  }

  const score = result.smc_score;
  const signal = result.signal;
  const pd = result.premium_discount;
  const structure = result.structure;

  return (
    <div className="space-y-3">
      {/* Score bar */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-black text-foreground">{result.symbol.replace(".NS", "")} — SMC Score</span>
        <span className={`text-lg font-black ${score >= 65 ? "text-green" : score >= 45 ? "text-yellow" : "text-red"}`}>
          {score}/100
        </span>
      </div>
      <div className="w-full h-2.5 bg-background rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${score >= 65 ? "bg-green" : score >= 45 ? "bg-yellow" : "bg-red"}`}
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Signal + structure */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-background rounded-lg p-2 text-center">
          <div className="text-[9px] text-muted">Signal</div>
          <div className={`font-black text-sm ${signal === "BULLISH" ? "text-green" : signal === "BEARISH" ? "text-red" : "text-muted"}`}>{signal}</div>
        </div>
        <div className="bg-background rounded-lg p-2 text-center">
          <div className="text-[9px] text-muted">Structure</div>
          <div className={`font-black text-sm ${structure?.trend === "BULLISH" ? "text-green" : structure?.trend === "BEARISH" ? "text-red" : "text-muted"}`}>
            {structure?.trend ?? "N/A"}
          </div>
        </div>
        <div className="bg-background rounded-lg p-2 text-center">
          <div className="text-[9px] text-muted">Zone</div>
          <div className={`font-black text-sm ${pd?.zone === "DISCOUNT" ? "text-green" : pd?.zone === "PREMIUM" ? "text-red" : "text-muted"}`}>
            {pd ? `${pd.zone} ${pd.pct.toFixed(0)}%` : "N/A"}
          </div>
        </div>
      </div>

      {/* OBs */}
      {result.order_blocks && result.order_blocks.length > 0 && (
        <div className="bg-background rounded-lg p-3">
          <div className="text-[10px] font-bold text-foreground uppercase mb-1.5">Order Blocks</div>
          {result.order_blocks.map((ob, i) => (
            <div key={i} className="flex items-center justify-between text-[10px] mb-1">
              <span className={`font-bold ${ob.type === "BULLISH" ? "text-green" : "text-red"}`}>
                {ob.type === "BULLISH" ? "🟩" : "🟥"} {ob.type} OB
                {ob.touched ? " 🎯 IN ZONE" : ""}
              </span>
              <span className="text-muted">₹{ob.low.toLocaleString("en-IN")} – ₹{ob.high.toLocaleString("en-IN")}</span>
            </div>
          ))}
        </div>
      )}

      {/* FVGs */}
      {result.fair_value_gaps && result.fair_value_gaps.length > 0 && (
        <div className="bg-background rounded-lg p-3">
          <div className="text-[10px] font-bold text-foreground uppercase mb-1.5">Fair Value Gaps</div>
          {result.fair_value_gaps.map((fvg, i) => (
            <div key={i} className="flex items-center justify-between text-[10px] mb-1">
              <span className={`font-bold ${fvg.type === "BULLISH" ? "text-green" : "text-red"}`}>
                ⬜ {fvg.type} FVG (₹{fvg.size.toLocaleString("en-IN")} gap)
              </span>
              <span className="text-muted">₹{fvg.low.toLocaleString("en-IN")} – ₹{fvg.high.toLocaleString("en-IN")}</span>
            </div>
          ))}
        </div>
      )}

      {/* Structure event */}
      {structure?.last_event && (
        <div className={`rounded-lg p-2 text-[10px] font-bold ${
          structure.last_event.direction === "BULLISH" ? "bg-green/10 text-green" : "bg-red/10 text-red"
        }`}>
          {structure.last_event.type}: {structure.last_event.label}
        </div>
      )}

      {/* Reasons */}
      <div className="space-y-1">
        {result.reasons.map((r, i) => (
          <div key={i} className="flex items-start gap-1.5 text-[10px] text-foreground/80">
            <span className="text-green mt-0.5">✓</span><span>{r}</span>
          </div>
        ))}
        {result.missing.slice(0, 3).map((m, i) => (
          <div key={i} className="flex items-start gap-1.5 text-[10px] text-muted">
            <span className="text-red mt-0.5">✕</span><span>{m}</span>
          </div>
        ))}
      </div>

      <div className="text-[9px] text-muted text-right">{result.candles_used} × {result.interval} candles analysed</div>
    </div>
  );
}

function DailySummaryTab() {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selected, setSelected] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchSummaries();
  }, []);

  async function fetchSummaries() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auto-trader/daily-summaries?last_n=60`);
      const data = await res.json();
      if (Array.isArray(data)) {
        // Deduplicate by date (keep latest entry per date)
        const byDate = new Map<string, DailySummary>();
        for (const s of data) {
          byDate.set(s.date, s);
        }
        const sorted = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
        setSummaries(sorted);
        if (sorted.length > 0) {
          setSelectedDate(sorted[0].date);
          setSelected(sorted[0]);
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  function handleDateChange(date: string) {
    setSelectedDate(date);
    const found = summaries.find((s) => s.date === date);
    setSelected(found ?? null);
  }

  async function generateNow() {
    setGenerating(true);
    try {
      await fetch(`${API}/api/auto-trader/generate-summary`, { method: "POST" });
      await fetchSummaries();
    } catch { /* ignore */ }
    setGenerating(false);
  }

  function downloadCSV() {
    if (!selectedDate) return;
    window.open(`${API}/api/auto-trader/daily-summary/${selectedDate}/download`, "_blank");
  }

  if (loading) return <div className="text-center text-muted py-8 text-sm">Loading summaries...</div>;

  // Get AI analysis from either nested or flat structure
  const ai = selected?.ai_summary?.ai_analysis ?? selected?.ai_analysis;
  const fiiDii = selected?.ai_summary?.fii_dii ?? selected?.fii_dii;
  const newsHeadlines = selected?.ai_summary?.news_headlines ?? [];

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="bg-background text-foreground text-xs px-3 py-2 rounded-lg border border-border focus:border-accent outline-none"
          >
            {/* Deduplicate dates for the dropdown */}
            {[...new Map(summaries.map((s) => [s.date, s])).values()].map((s) => (
              <option key={s.date} value={s.date}>{s.date}</option>
            ))}
            {summaries.length === 0 && <option value="">No summaries yet</option>}
          </select>
          <span className="text-[10px] text-muted">{summaries.length} days available</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generateNow}
            disabled={generating}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-accent hover:bg-accent/80 text-white transition-all"
          >
            {generating ? "Generating..." : "🧠 Generate Today's Summary"}
          </button>
          <button
            onClick={downloadCSV}
            disabled={!selectedDate}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-card border border-border text-foreground hover:border-accent transition-all"
          >
            📥 Download CSV
          </button>
        </div>
      </div>

      {!selected ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <span className="text-3xl block mb-2">📋</span>
          <p className="text-sm font-bold text-muted">No daily summary available</p>
          <p className="text-xs text-muted mt-1">Summaries are auto-generated at market close, or click "Generate" above</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Grade + P&L Header */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {ai?.grade && ai.grade !== "N/A" && (
              <div className={`rounded-xl border-2 p-3 text-center ${
                ai.grade === "A" ? "border-green/50 bg-green/10" :
                ai.grade === "B" ? "border-yellow/50 bg-yellow/10" :
                ai.grade === "C" ? "border-accent/50 bg-accent/10" :
                "border-red/50 bg-red/10"
              }`}>
                <div className="text-[9px] text-muted uppercase font-bold">Grade</div>
                <div className={`text-3xl font-black ${
                  ai.grade === "A" ? "text-green" :
                  ai.grade === "B" ? "text-yellow" :
                  ai.grade === "C" ? "text-accent" : "text-red"
                }`}>{ai.grade}</div>
              </div>
            )}
            <div className="bg-card rounded-xl border border-border p-3 text-center">
              <div className="text-[9px] text-muted uppercase font-bold">P&L</div>
              <div className={`text-lg font-black ${(selected.today_pnl ?? 0) >= 0 ? "text-green" : "text-red"}`}>
                ₹{(selected.today_pnl ?? 0).toLocaleString("en-IN")}
              </div>
            </div>
            <div className="bg-card rounded-xl border border-border p-3 text-center">
              <div className="text-[9px] text-muted uppercase font-bold">Trades</div>
              <div className="text-lg font-black text-foreground">{selected.trades_taken ?? 0}</div>
            </div>
            <div className="bg-card rounded-xl border border-border p-3 text-center">
              <div className="text-[9px] text-muted uppercase font-bold">Scans</div>
              <div className="text-lg font-black text-accent">{selected.total_scans ?? 0}</div>
            </div>
            <div className="bg-card rounded-xl border border-border p-3 text-center">
              <div className="text-[9px] text-muted uppercase font-bold">Exits</div>
              <div className="text-lg font-black text-foreground">{selected.trades_exited ?? 0}</div>
            </div>
          </div>

          {/* Market Recap */}
          {ai?.market_recap && (
            <SummaryCard icon="📊" title="Market Recap" content={ai.market_recap} />
          )}

          {/* Why Trades / No Trades */}
          {ai?.why_trades && (
            <SummaryCard icon="🎯" title="Why Trades Were / Weren't Taken" content={ai.why_trades}
              accent={selected.trades_taken > 0 ? "green" : "yellow"} />
          )}

          {/* Strategy Analysis */}
          {ai?.strategies_analysis && (
            <SummaryCard icon="🧠" title="Strategy Analysis" content={ai.strategies_analysis} accent="accent" />
          )}

          {/* Big News */}
          {ai?.big_news && ai.big_news.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <span>📰</span>
                <span className="text-xs font-black text-foreground uppercase">Big News</span>
              </div>
              <div className="space-y-2">
                {ai.big_news.map((news, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                    <span className="text-accent font-bold mt-0.5">{i + 1}.</span>
                    <span>{news}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FII/DII Flows */}
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <span>💰</span>
              <span className="text-xs font-black text-foreground uppercase">FII / DII Flows</span>
            </div>
            {fiiDii?.available ? (
              fiiDii.headline ? (
                <p className="text-xs text-foreground/80">{fiiDii.headline}</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold text-accent uppercase">FII (Foreign)</div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center bg-background rounded-lg p-2">
                        <div className="text-muted text-[9px]">Buy</div>
                        <div className="font-bold text-green">₹{fiiDii.fii_buy?.toLocaleString("en-IN")}Cr</div>
                      </div>
                      <div className="text-center bg-background rounded-lg p-2">
                        <div className="text-muted text-[9px]">Sell</div>
                        <div className="font-bold text-red">₹{fiiDii.fii_sell?.toLocaleString("en-IN")}Cr</div>
                      </div>
                      <div className="text-center bg-background rounded-lg p-2">
                        <div className="text-muted text-[9px]">Net</div>
                        <div className={`font-bold ${(fiiDii.fii_net ?? 0) >= 0 ? "text-green" : "text-red"}`}>
                          ₹{fiiDii.fii_net?.toLocaleString("en-IN")}Cr
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold text-purple-400 uppercase">DII (Domestic)</div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center bg-background rounded-lg p-2">
                        <div className="text-muted text-[9px]">Buy</div>
                        <div className="font-bold text-green">₹{fiiDii.dii_buy?.toLocaleString("en-IN")}Cr</div>
                      </div>
                      <div className="text-center bg-background rounded-lg p-2">
                        <div className="text-muted text-[9px]">Sell</div>
                        <div className="font-bold text-red">₹{fiiDii.dii_sell?.toLocaleString("en-IN")}Cr</div>
                      </div>
                      <div className="text-center bg-background rounded-lg p-2">
                        <div className="text-muted text-[9px]">Net</div>
                        <div className={`font-bold ${(fiiDii.dii_net ?? 0) >= 0 ? "text-green" : "text-red"}`}>
                          ₹{fiiDii.dii_net?.toLocaleString("en-IN")}Cr
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <p className="text-xs text-muted">FII/DII data not available for this date</p>
            )}
            {ai?.fii_dii_analysis && (
              <p className="text-xs text-foreground/70 mt-3 italic">{ai.fii_dii_analysis}</p>
            )}
          </div>

          {/* Tomorrow Outlook */}
          {ai?.tomorrow_outlook && (
            <SummaryCard icon="🔮" title="Tomorrow's Outlook" content={ai.tomorrow_outlook} accent="purple" />
          )}

          {/* Risk Notes */}
          {ai?.risk_notes && ai.risk_notes !== "N/A" && (
            <SummaryCard icon="⚠️" title="Risk Notes" content={ai.risk_notes} accent="red" />
          )}

          {/* Trade Details */}
          {selected.trade_details && selected.trade_details.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="text-xs font-black text-foreground uppercase mb-3">📈 Trade Details</div>
              <div className="space-y-2">
                {selected.trade_details.map((t, i) => (
                  <div key={i} className="bg-background rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm text-foreground">{t.symbol.replace(".NS", "")}</span>
                      <span className="text-[10px] text-muted ml-2">Confluence: {t.confluence_score}/110</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-foreground">₹{t.entry_price.toLocaleString("en-IN")}</div>
                      <div className="text-[9px] text-muted">{t.reasoning?.[0]?.substring(0, 50)}...</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exit Details */}
          {selected.exit_details && selected.exit_details.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="text-xs font-black text-foreground uppercase mb-3">📉 Exit Details</div>
              <div className="space-y-2">
                {selected.exit_details.map((t, i) => (
                  <div key={i} className="bg-background rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm text-foreground">{t.symbol.replace(".NS", "")}</span>
                      <span className="text-[10px] text-muted ml-2">{t.reasoning?.[0]}</span>
                    </div>
                    <div className={`text-sm font-bold ${t.pnl >= 0 ? "text-green" : "text-red"}`}>
                      ₹{t.pnl.toLocaleString("en-IN")} ({t.pnl_pct.toFixed(1)}%)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon, title, content, accent = "border",
}: {
  icon: string; title: string; content: string; accent?: string;
}) {
  const borderColor = accent === "green" ? "border-green/30" :
    accent === "yellow" ? "border-yellow/30" :
    accent === "red" ? "border-red/30" :
    accent === "purple" ? "border-purple-500/30" :
    accent === "accent" ? "border-accent/30" : "border-border";

  return (
    <div className={`bg-card rounded-xl border ${borderColor} p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <span>{icon}</span>
        <span className="text-xs font-black text-foreground uppercase">{title}</span>
      </div>
      <p className="text-xs text-foreground/80 leading-relaxed">{content}</p>
    </div>
  );
}

function SettingsTab({ onSave }: { onSave: () => void }) {
  const [config, setConfig] = useState<Record<string, number | boolean | string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/auto-trader/config`)
      .then((r) => r.json())
      .then((d) => { setConfig(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`${API}/api/auto-trader/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      onSave();
    } catch { /* ignore */ }
    setSaving(false);
  }

  if (loading) return <div className="text-center text-muted py-8 text-sm">Loading config...</div>;

  // Live calculations
  const capital = Number(config.capital) || 0;
  const riskPct = Number(config.risk_per_trade) || 0;
  const maxHeat = Number(config.max_portfolio_heat) || 0;
  const maxPos = Number(config.max_positions) || 1;
  const riskRs = Math.round(capital * riskPct / 100);
  const maxDeployed = Math.round(capital * maxHeat / 100);
  const perPosition = maxPos > 0 ? Math.round(maxDeployed / maxPos) : 0;
  const dailyTarget = Math.round(capital * 0.01); // 1% daily target

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-foreground uppercase">Auto Trader Configuration</h3>
        {saved && <span className="text-xs text-green font-bold animate-pulse">✅ Saved & Applied!</span>}
      </div>

      {/* Live Calculations Preview */}
      {capital > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-green/10 border border-green/30 rounded-lg p-2.5 text-center">
            <div className="text-[9px] text-muted uppercase font-bold">Risk / Trade</div>
            <div className="text-sm font-black text-green">₹{riskRs.toLocaleString("en-IN")}</div>
            <div className="text-[9px] text-muted">{riskPct}% of capital</div>
          </div>
          <div className="bg-accent/10 border border-accent/30 rounded-lg p-2.5 text-center">
            <div className="text-[9px] text-muted uppercase font-bold">Max Deployed</div>
            <div className="text-sm font-black text-accent">₹{maxDeployed.toLocaleString("en-IN")}</div>
            <div className="text-[9px] text-muted">{maxHeat}% heat limit</div>
          </div>
          <div className="bg-yellow/10 border border-yellow/30 rounded-lg p-2.5 text-center">
            <div className="text-[9px] text-muted uppercase font-bold">Per Position</div>
            <div className="text-sm font-black text-yellow">₹{perPosition.toLocaleString("en-IN")}</div>
            <div className="text-[9px] text-muted">across {maxPos} stocks</div>
          </div>
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-2.5 text-center">
            <div className="text-[9px] text-muted uppercase font-bold">Daily Target</div>
            <div className="text-sm font-black text-purple-400">₹{dailyTarget.toLocaleString("en-IN")}</div>
            <div className="text-[9px] text-muted">1% of capital</div>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <div className="text-[10px] font-bold text-accent uppercase">Capital & Risk</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <SettingInput label="Capital (₹)" value={config.capital} type="number"
            onChange={(v) => setConfig({ ...config, capital: Number(v) })} />
          <SettingInput label="Risk Per Trade (%)" value={config.risk_per_trade} type="number"
            onChange={(v) => setConfig({ ...config, risk_per_trade: Number(v) })} />
          <SettingInput label="Max Portfolio Heat (%)" value={config.max_portfolio_heat} type="number"
            onChange={(v) => setConfig({ ...config, max_portfolio_heat: Number(v) })} />
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-[10px] font-bold text-accent uppercase">Trade Rules</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <SettingInput label="Max Positions" value={config.max_positions} type="number"
            onChange={(v) => setConfig({ ...config, max_positions: Number(v) })} />
          <SettingInput label="Min Confluence (0-110)" value={config.min_confluence} type="number"
            onChange={(v) => setConfig({ ...config, min_confluence: Number(v) })} />
          <SettingInput label="Scan Interval (sec)" value={config.scan_interval_seconds} type="number"
            onChange={(v) => setConfig({ ...config, scan_interval_seconds: Number(v) })} />
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-[10px] font-bold text-accent uppercase">Timing</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <SettingInput label="No New Trades After (HH:MM)" value={config.no_new_trades_after} type="text"
            onChange={(v) => setConfig({ ...config, no_new_trades_after: v })} />
          <SettingInput label="Close Positions At (HH:MM)" value={config.close_positions_time} type="text"
            onChange={(v) => setConfig({ ...config, close_positions_time: v })} />
          <SettingInput label="Trailing SL Multiplier (ATR)" value={config.trailing_sl_atr_multiplier} type="number"
            onChange={(v) => setConfig({ ...config, trailing_sl_atr_multiplier: Number(v) })} />
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={!!config.test_mode}
            onChange={(e) => setConfig({ ...config, test_mode: e.target.checked })}
            className="w-4 h-4 rounded accent-green"
          />
          Paper Trading Mode (no real money)
        </label>
        <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={config.use_ai_confirmation !== false}
            onChange={(e) => setConfig({ ...config, use_ai_confirmation: e.target.checked })}
            className="w-4 h-4 rounded accent-yellow"
          />
          🧠 Claude AI Confirmation (for 85+ confluence trades)
        </label>
      </div>

      {/* Per-Strategy Min Scores */}
      <div className="space-y-1">
        <div className="text-[10px] font-bold text-accent uppercase">Strategy Min Scores (Dynamic)</div>
        <div className="text-[9px] text-muted mb-2">Lower = more trades. Each strategy fires independently when it hits its threshold.</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { id: "A", name: "🚀 Momentum",  key: "A" },
            { id: "B", name: "📉 Reversal",  key: "B" },
            { id: "C", name: "🏄 Trend",     key: "C" },
            { id: "D", name: "📰 News",       key: "D" },
            { id: "E", name: "🧠 SMC/ICT",   key: "E" },
          ].map((s) => {
            const scores = (config.strategy_min_scores as unknown as Record<string, number>) ?? {};
            const val = scores[s.key] ?? (s.key === "B" ? 40 : s.key === "D" ? 35 : 45);
            return (
              <div key={s.id}>
                <label className="text-[9px] text-muted font-semibold block mb-1">{s.name}</label>
                <input
                  type="number"
                  min={10} max={100}
                  value={val}
                  onChange={(e) => {
                    const scores2 = { ...((config.strategy_min_scores as unknown as Record<string, number>) ?? {}) };
                    scores2[s.key] = Number(e.target.value);
                    setConfig({ ...config, strategy_min_scores: scores2 as unknown as number });
                  }}
                  className="w-full bg-background text-foreground text-xs px-2 py-1.5 rounded border border-border focus:border-accent outline-none"
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-yellow/10 border border-yellow/30 rounded-lg p-3 text-xs text-yellow">
        <strong>Tip:</strong> Set 30–45 to test many trades. Set 60–75 for strict real trading.
        Capital change applies immediately to portfolio.
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="bg-green hover:bg-green/80 text-white text-sm font-black px-6 py-3 rounded-xl shadow-lg shadow-green/20 transition-all"
      >
        {saving ? "Saving..." : "💾 Save & Apply Now"}
      </button>
    </div>
  );
}

function SettingInput({
  label, value, type, onChange,
}: {
  label: string; value: unknown; type: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-muted font-semibold uppercase block mb-1">{label}</label>
      <input
        type={type}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-background text-foreground text-xs px-3 py-2 rounded border border-border focus:border-accent outline-none"
      />
    </div>
  );
}

// ── Performance Tab ───────────────────────────────────────────────────

type StratPerf = { trades: number; wins: number; losses: number; win_rate: number; pnl: number; avg_win: number; avg_loss: number; best_pnl: number; worst_pnl: number };

const STRAT_INFO: Record<string, { name: string; emoji: string; color: string; desc: string }> = {
  A: { name: "Momentum",  emoji: "🚀", color: "text-green",      desc: "RSI building + MACD BUY + Volume spike" },
  B: { name: "Reversal",  emoji: "📉", color: "text-blue-400",   desc: "RSI < 38 + Bollinger lower band" },
  C: { name: "Trend",     emoji: "🏄", color: "text-yellow",     desc: "ADX > 25 + Supertrend + EMA aligned" },
  D: { name: "News",      emoji: "📰", color: "text-purple-400", desc: "Bullish news + Investor consensus" },
  E: { name: "SMC/ICT",   emoji: "🧠", color: "text-red",        desc: "Order Blocks + FVG + BOS/CHoCH" },
};

function getComboInfo(key: string) {
  const parts = key.split("+");
  if (parts.length === 1) return STRAT_INFO[key] ?? { name: key, emoji: "🔹", color: "text-muted", desc: "" };
  const emojis = parts.map(p => STRAT_INFO[p]?.emoji ?? p).join("");
  const names  = parts.map(p => STRAT_INFO[p]?.name  ?? p).join("+");
  return { name: names, emoji: emojis, color: "text-accent", desc: `Combination: ${key}` };
}

function PerformanceTab({ data }: { data: AutoTraderData | null }) {
  const perf = (data as (AutoTraderData & { strategy_performance?: Record<string, StratPerf> }) | null)?.strategy_performance ?? {};
  const entries = Object.entries(perf).filter(([k]) => !k.startsWith("_")).sort((a, b) => b[1].pnl - a[1].pnl);

  if (!entries.length) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center space-y-2">
        <span className="text-3xl block">🏆</span>
        <p className="text-sm font-bold text-muted">No trades recorded yet</p>
        <p className="text-xs text-muted">Once trades close, strategy performance will appear here.<br/>
          Combos like A+B, A+C, B+E etc. tracked automatically.</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-2">
          {["A","B","C","D","E"].map(id => {
            const info = STRAT_INFO[id];
            return (
              <div key={id} className="bg-background rounded-lg p-2 text-center">
                <div className="text-lg">{info.emoji}</div>
                <div className={`text-[10px] font-black ${info.color}`}>{id} — {info.name}</div>
                <div className="text-[8px] text-muted mt-0.5">{info.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const best = entries[0];
  const bestInfo = getComboInfo(best[0]);

  return (
    <div className="space-y-4">
      {/* Best strategy banner */}
      <div className="bg-gradient-to-r from-green/10 to-accent/10 border border-green/30 rounded-xl p-4 flex items-center gap-3">
        <span className="text-2xl">{bestInfo.emoji}</span>
        <div>
          <div className="text-xs text-muted uppercase font-bold">Best Performing Strategy</div>
          <div className="font-black text-foreground">{bestInfo.name}</div>
          <div className="text-xs text-green">₹{best[1].pnl.toLocaleString("en-IN")} P&L • {best[1].win_rate}% Win Probability • {best[1].trades} trades</div>
        </div>
      </div>

      {/* All strategies table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-6 px-4 py-2 bg-background text-[9px] text-muted font-bold uppercase">
          <div className="col-span-2">Strategy</div>
          <div className="text-center">Trades</div>
          <div className="text-center">Win Probability</div>
          <div className="text-center">Avg Win</div>
          <div className="text-center">P&L</div>
        </div>
        {entries.map(([key, s]) => {
          const info = getComboInfo(key);
          const isCombo = key.includes("+");
          const winProbColor = s.win_rate >= 60 ? "text-green" : s.win_rate >= 40 ? "text-yellow" : "text-red";
          const winProbBar = s.win_rate >= 60 ? "bg-green" : s.win_rate >= 40 ? "bg-yellow" : "bg-red";
          return (
            <div key={key} className={`grid grid-cols-6 px-4 py-2.5 border-t border-border/50 items-center ${isCombo ? "bg-accent/5" : ""}`}>
              <div className="col-span-2 flex items-center gap-2">
                <span className="text-sm">{info.emoji}</span>
                <div>
                  <div className={`text-[10px] font-black ${info.color}`}>
                    {isCombo ? `Combo ${key}` : `Strategy ${key}`}
                  </div>
                  <div className="text-[8px] text-muted">{info.name}</div>
                </div>
              </div>
              <div className="text-center text-xs font-bold text-foreground">{s.trades}</div>
              <div className="text-center">
                <div className={`text-xs font-bold ${winProbColor}`}>{s.win_rate}%</div>
                <div className="w-full h-1 bg-background rounded-full overflow-hidden mt-0.5">
                  <div className={`h-full rounded-full ${winProbBar}`} style={{ width: `${s.win_rate}%` }} />
                </div>
              </div>
              <div className="text-center text-xs text-green">₹{s.avg_win?.toLocaleString("en-IN") ?? "—"}</div>
              <div className={`text-center text-xs font-bold ${s.pnl >= 0 ? "text-green" : "text-red"}`}>
                ₹{s.pnl.toLocaleString("en-IN")}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-center text-[9px] text-muted">
        Combos (e.g. A+B) = both strategies fired on same trade. More combos appear as trades accumulate.
      </div>
    </div>
  );
}

// ── Manual Trades Tab ─────────────────────────────────────────────────

interface ManualTrade {
  id: string;
  symbol: string;
  entry_price: number;
  quantity: number;
  trade_type: string;
  notes: string;
  entry_time: string;
  status: "OPEN" | "CLOSED";
  pnl: number;
  pnl_pct: number;
  exit_price?: number;
  exit_time?: string;
  exit_notes?: string;
}

function ManualTradesTab({ prefill, onPrefillUsed }: { prefill: { symbol: string; price: number } | null; onPrefillUsed: () => void }) {
  const [trades, setTrades] = useState<ManualTrade[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ symbol: "", entry_price: "", quantity: "1", trade_type: "Intraday", notes: "" });
  const [exitForm, setExitForm] = useState<{ id: string; price: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchTrades();
  }, []);

  // Handle prefill from watchlist/penny stocks
  useEffect(() => {
    if (prefill) {
      setForm(f => ({ ...f, symbol: prefill.symbol, entry_price: String(prefill.price) }));
      setShowForm(true);
      onPrefillUsed();
    }
  }, [prefill, onPrefillUsed]);

  async function fetchTrades() {
    try {
      const res = await fetch(`${API}/api/manual-trades`);
      const d = await res.json();
      setTrades(Array.isArray(d) ? d.reverse() : []);
    } catch { /* ignore */ }
  }

  async function submitTrade(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch(`${API}/api/manual-trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: form.symbol.toUpperCase(),
          entry_price: parseFloat(form.entry_price),
          quantity: parseInt(form.quantity),
          trade_type: form.trade_type,
          notes: form.notes,
        }),
      });
      setForm({ symbol: "", entry_price: "", quantity: "1", trade_type: "Intraday", notes: "" });
      setShowForm(false);
      await fetchTrades();
    } catch { /* ignore */ }
    setSubmitting(false);
  }

  async function submitExit(id: string, price: string) {
    try {
      await fetch(`${API}/api/manual-trades/${id}/exit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exit_price: parseFloat(price) }),
      });
      setExitForm(null);
      await fetchTrades();
    } catch { /* ignore */ }
  }

  async function deleteTrade(id: string) {
    try {
      await fetch(`${API}/api/manual-trades/${id}`, { method: "DELETE" });
      await fetchTrades();
    } catch { /* ignore */ }
  }

  const openTrades = trades.filter(t => t.status === "OPEN");
  const closedTrades = trades.filter(t => t.status === "CLOSED");
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  const typeBadge = (type: string) => {
    if (type === "Intraday") return "bg-green/20 text-green";
    if (type === "Swing") return "bg-blue-500/20 text-blue-400";
    return "bg-purple-500/20 text-purple-400";
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl border border-border p-3 text-center">
          <div className="text-[9px] text-muted uppercase font-bold">Total Trades</div>
          <div className="text-xl font-black text-foreground">{trades.length}</div>
        </div>
        <div className="bg-card rounded-xl border border-border p-3 text-center">
          <div className="text-[9px] text-muted uppercase font-bold">Open Trades</div>
          <div className="text-xl font-black text-yellow">{openTrades.length}</div>
        </div>
        <div className="bg-card rounded-xl border border-border p-3 text-center">
          <div className="text-[9px] text-muted uppercase font-bold">Total P&L</div>
          <div className={`text-xl font-black ${totalPnl >= 0 ? "text-green" : "text-red"}`}>
            ₹{totalPnl.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Take Trade Button */}
      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-black text-sm bg-accent hover:bg-accent/80 text-white transition-all shadow-lg shadow-accent/20"
      >
        {showForm ? "✕ Cancel" : "➕ TAKE TRADE"}
      </button>

      {/* Inline Form */}
      {showForm && (
        <form onSubmit={submitTrade} className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="text-xs font-black text-foreground uppercase mb-2">New Manual Trade</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-muted font-bold uppercase block mb-1">Symbol</label>
              <input
                type="text"
                required
                placeholder="RELIANCE"
                value={form.symbol}
                onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                className="w-full bg-background text-foreground text-xs px-3 py-2 rounded border border-border focus:border-accent outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted font-bold uppercase block mb-1">Entry Price</label>
              <input
                type="number"
                required
                step="0.01"
                placeholder="0.00"
                value={form.entry_price}
                onChange={e => setForm(f => ({ ...f, entry_price: e.target.value }))}
                className="w-full bg-background text-foreground text-xs px-3 py-2 rounded border border-border focus:border-accent outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted font-bold uppercase block mb-1">Quantity</label>
              <input
                type="number"
                required
                min="1"
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                className="w-full bg-background text-foreground text-xs px-3 py-2 rounded border border-border focus:border-accent outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted font-bold uppercase block mb-1">Type</label>
              <select
                value={form.trade_type}
                onChange={e => setForm(f => ({ ...f, trade_type: e.target.value }))}
                className="w-full bg-background text-foreground text-xs px-3 py-2 rounded border border-border focus:border-accent outline-none"
              >
                <option>Intraday</option>
                <option>Swing</option>
                <option>Positional</option>
              </select>
            </div>
            <div className="col-span-2 sm:col-span-2">
              <label className="text-[10px] text-muted font-bold uppercase block mb-1">Notes</label>
              <input
                type="text"
                placeholder="Reason for trade..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full bg-background text-foreground text-xs px-3 py-2 rounded border border-border focus:border-accent outline-none"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 rounded-xl font-black text-xs bg-green hover:bg-green/80 text-white transition-all"
          >
            {submitting ? "Saving..." : "✅ Save Trade"}
          </button>
        </form>
      )}

      {/* Trade List */}
      {trades.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <span className="text-3xl block mb-2">💼</span>
          <p className="text-sm font-bold text-muted">No manual trades yet</p>
          <p className="text-xs text-muted mt-1">Click "TAKE TRADE" to log your first trade</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trades.map(t => {
            const isProfit = (t.pnl ?? 0) >= 0;
            return (
              <div key={t.id} className={`bg-card rounded-xl border p-4 ${t.status === "OPEN" ? "border-yellow/30" : isProfit ? "border-green/30" : "border-red/30"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-foreground">{t.symbol}</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${typeBadge(t.trade_type)}`}>{t.trade_type}</span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                      t.status === "OPEN" ? "bg-yellow/20 text-yellow" : isProfit ? "bg-green/20 text-green" : "bg-red/20 text-red"
                    }`}>{t.status}</span>
                  </div>
                  <button onClick={() => deleteTrade(t.id)} className="text-[9px] text-muted hover:text-red transition-colors">✕</button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-3 text-xs">
                  <div>
                    <div className="text-muted text-[9px]">Entry</div>
                    <div className="font-bold">₹{t.entry_price.toLocaleString("en-IN")}</div>
                  </div>
                  <div>
                    <div className="text-muted text-[9px]">Qty</div>
                    <div className="font-bold">{t.quantity}</div>
                  </div>
                  {t.status === "CLOSED" && t.exit_price != null && (
                    <div>
                      <div className="text-muted text-[9px]">Exit</div>
                      <div className="font-bold">₹{t.exit_price.toLocaleString("en-IN")}</div>
                    </div>
                  )}
                  {t.status === "CLOSED" && (
                    <div>
                      <div className="text-muted text-[9px]">P&L</div>
                      <div className={`font-black ${isProfit ? "text-green" : "text-red"}`}>
                        ₹{(t.pnl ?? 0).toFixed(2)} ({(t.pnl_pct ?? 0).toFixed(2)}%)
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-2 text-[9px] text-muted">
                  {new Date(t.entry_time).toLocaleString("en-IN")}
                  {t.notes && <span className="ml-2 italic">{t.notes}</span>}
                </div>

                {/* Exit form for OPEN trades */}
                {t.status === "OPEN" && (
                  <div className="mt-3">
                    {exitForm?.id === t.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Exit price"
                          value={exitForm.price}
                          onChange={e => setExitForm({ id: t.id, price: e.target.value })}
                          className="w-32 bg-background text-foreground text-xs px-3 py-1.5 rounded border border-border focus:border-green outline-none"
                        />
                        <button
                          onClick={() => submitExit(t.id, exitForm.price)}
                          disabled={!exitForm.price}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-green hover:bg-green/80 text-white transition-all disabled:opacity-50"
                        >
                          Confirm Exit
                        </button>
                        <button onClick={() => setExitForm(null)} className="text-xs text-muted hover:text-foreground">Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setExitForm({ id: t.id, price: "" })}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-card border border-border hover:border-green hover:text-green text-muted transition-all"
                      >
                        ✅ Exit Trade
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Penny Stocks Tab ──────────────────────────────────────────────────

const FEATURED_PENNY_STOCKS = [
  "SUZLON", "YESBANK", "TATAPOWER", "RVNL", "IRFC",
  "NBCC", "NHPC", "SJVN", "HFCL", "RPOWER",
  "SOUTHINDBANK", "JSWENERGY", "IRCON",
];

import type { StockAnalysis } from "@/lib/types";

function PennyStocksTab({ onTakeTrade }: { onTakeTrade?: (symbol: string, price: number) => void }) {
  const [allStocks, setAllStocks] = useState<StockAnalysis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/dashboard`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.all_stocks)) setAllStocks(d.all_stocks);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const signalColor = (sig: string) => {
    if (sig === "STRONG_BUY" || sig === "BUY") return "text-green";
    if (sig === "STRONG_SELL" || sig === "SELL") return "text-red";
    return "text-muted";
  };

  const featured = allStocks.filter(s =>
    FEATURED_PENNY_STOCKS.some(f => s.symbol.startsWith(f))
  );

  const lowPrice = allStocks.filter(s =>
    s.price < 300 &&
    !FEATURED_PENNY_STOCKS.some(f => s.symbol.startsWith(f))
  );

  function StockCard({ s }: { s: StockAnalysis }) {
    const isUp = (s.change_percent ?? 0) >= 0;
    return (
      <div className="bg-card rounded-xl border border-border p-3 space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-black text-foreground text-sm">{s.symbol.replace(".NS", "")}</div>
            <div className="text-[9px] text-muted truncate max-w-[120px]">{s.name}</div>
          </div>
          <div className="text-right">
            <div className="font-black text-foreground">₹{s.price?.toLocaleString("en-IN")}</div>
            <div className={`text-[10px] font-bold ${isUp ? "text-green" : "text-red"}`}>
              {isUp ? "▲" : "▼"} {Math.abs(s.change_percent ?? 0).toFixed(2)}%
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1 text-[9px]">
          <div className="bg-background rounded p-1 text-center">
            <div className="text-muted">Signal</div>
            <div className={`font-black text-[8px] ${signalColor(s.signal)}`}>{s.signal?.replace("_", " ") ?? "—"}</div>
          </div>
          <div className="bg-background rounded p-1 text-center">
            <div className="text-muted">Score</div>
            <div className={`font-black ${s.score >= 60 ? "text-green" : s.score >= 40 ? "text-yellow" : "text-muted"}`}>{s.score ?? "—"}</div>
          </div>
          <div className="bg-background rounded p-1 text-center">
            <div className="text-muted">RSI</div>
            <div className={`font-black ${(s.rsi ?? 50) < 30 ? "text-green" : (s.rsi ?? 50) > 70 ? "text-red" : "text-foreground"}`}>{s.rsi?.toFixed(0) ?? "—"}</div>
          </div>
        </div>

        {onTakeTrade && s.price > 0 && (
          <button
            onClick={() => onTakeTrade(s.symbol.replace(".NS", ""), s.price)}
            className="w-full py-1 rounded-lg text-[10px] font-black bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 transition-all"
          >
            📌 Take Trade
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return <div className="text-center text-muted py-8 text-sm">Loading penny stocks...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Featured */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-black text-foreground uppercase">Featured Penny Stocks</span>
          <span className="text-[9px] bg-yellow/20 text-yellow px-2 py-0.5 rounded font-bold">POPULAR</span>
        </div>
        {featured.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-6 text-center">
            <p className="text-xs text-muted">Dashboard data loading... Run a refresh to populate stock data.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {featured.map(s => <StockCard key={s.symbol} s={s} />)}
          </div>
        )}

        {/* Show featured that are not in data yet */}
        {(() => {
          const foundSymbols = new Set(featured.map(s => s.symbol.replace(".NS", "")));
          const missing = FEATURED_PENNY_STOCKS.filter(f => !foundSymbols.has(f));
          if (!missing.length) return null;
          return (
            <div className="mt-2 flex flex-wrap gap-1">
              {missing.map(sym => (
                <span key={sym} className="text-[9px] bg-card border border-border rounded px-2 py-1 text-muted">{sym}</span>
              ))}
              <span className="text-[9px] text-muted italic self-center">not in current scan</span>
            </div>
          );
        })()}
      </div>

      {/* Low-price filter */}
      {lowPrice.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-black text-foreground uppercase">Low-Price Stocks (under ₹300)</span>
            <span className="text-[9px] bg-accent/20 text-accent px-2 py-0.5 rounded font-bold">{lowPrice.length}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {lowPrice.map(s => <StockCard key={s.symbol} s={s} />)}
          </div>
        </div>
      )}
    </div>
  );
}

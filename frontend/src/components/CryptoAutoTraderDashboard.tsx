"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  CryptoAutoTraderData,
  CryptoPosition,
  CryptoJournalEntry,
  CryptoStrategyId,
  CryptoAutoTraderStats,
} from "@/lib/types";
import { fmtUSD, fmtPct, changeColor, shortSymbol } from "@/lib/cryptoFormat";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const STRATEGY_META: Record<CryptoStrategyId, { name: string; emoji: string; desc: string }> = {
  A: { name: "Momentum Surge",     emoji: "🚀", desc: "RSI + MACD + EMA crossover + volume spike" },
  B: { name: "Oversold Reversal",  emoji: "📉", desc: "RSI<30 + BB lower + Hammer candle" },
  C: { name: "Trend Rider",        emoji: "🏄", desc: "Supertrend + ADX>25 + EMA aligned" },
  D: { name: "News Catalyst",      emoji: "📰", desc: "Bullish news surge + positive momentum" },
  E: { name: "SMC / ICT",          emoji: "🧠", desc: "Order blocks + FVG + BOS + OTE zone" },
  F: { name: "Sentiment Edge",     emoji: "😱", desc: "Fear<35 or>75 + funding extreme + reversal" },
};

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-background rounded-xl p-3">
      <div className="text-[10px] text-muted uppercase font-bold mb-0.5">{label}</div>
      <div className={`text-base font-black ${color ?? "text-foreground"}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  );
}

function PositionRow({ p }: { p: CryptoPosition }) {
  const pnlColor = changeColor(p.unrealized_pnl);
  const minutes = p.entry_time
    ? Math.floor((Date.now() - new Date(p.entry_time).getTime()) / 60000)
    : 0;

  return (
    <div className="border-t border-border/50 px-3 py-2.5 grid grid-cols-12 gap-2 items-center text-xs hover:bg-card-hover/20 transition">
      <div className="col-span-2">
        <div className="font-bold text-foreground">{shortSymbol(p.symbol)}</div>
        <div className="text-[9px] text-muted">{p.strategy_key} · {p.status}</div>
      </div>
      <div className="col-span-2 font-semibold">{fmtUSD(p.entry_price, p.entry_price)}</div>
      <div className="col-span-2 font-semibold">{fmtUSD(p.current_price, p.entry_price)}</div>
      <div className={`col-span-2 font-black ${pnlColor}`}>
        {fmtUSD(p.unrealized_pnl)} <span className="text-[9px]">({fmtPct(p.unrealized_pnl_pct)})</span>
      </div>
      <div className="col-span-1 text-red">{fmtUSD(p.trailing_stop, p.entry_price)}</div>
      <div className="col-span-1 text-green">{fmtUSD(p.target_1, p.entry_price)}</div>
      <div className="col-span-1 text-muted">{p.units?.toFixed(4)}</div>
      <div className="col-span-1 text-muted">{minutes}m</div>
    </div>
  );
}

function StatsPanel({ stats }: { stats: CryptoAutoTraderStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
      <StatCard label="Win Rate" value={`${stats.win_rate?.toFixed(1)}%`} color={stats.win_rate >= 50 ? "text-green" : "text-red"} />
      <StatCard label="Total Trades" value={String(stats.total_trades)} sub={`${stats.winning_trades}W / ${stats.losing_trades}L`} />
      <StatCard label="Total P&L" value={fmtUSD(stats.total_pnl)} color={changeColor(stats.total_pnl)} sub={fmtPct(stats.total_pnl_pct)} />
      <StatCard label="Avg Win" value={fmtUSD(stats.avg_win)} color="text-green" />
      <StatCard label="Avg Loss" value={fmtUSD(stats.avg_loss)} color="text-red" />
      <StatCard label="Max Drawdown" value={`${stats.max_drawdown?.toFixed(1)}%`} color="text-red" />
    </div>
  );
}

function JournalTable({ entries }: { entries: CryptoJournalEntry[] }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-3 py-2 bg-background text-[10px] font-bold text-muted uppercase tracking-wider">
        Recent Journal (last {Math.min(entries.length, 30)} entries)
      </div>
      <div className="divide-y divide-border/50">
        {entries.slice(0, 30).map((e, i) => {
          const isPnl = e.pnl != null;
          return (
            <div key={i} className="px-3 py-2 text-xs flex items-start gap-3">
              <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded ${
                e.action === "ENTER" ? "bg-green/10 text-green" :
                e.action === "EXIT" ? "bg-red/10 text-red" :
                e.action === "PARTIAL_EXIT" ? "bg-yellow/10 text-yellow" :
                "bg-muted/10 text-muted"
              }`}>{e.action}</span>
              <span className="font-semibold w-20 shrink-0">{shortSymbol(e.symbol)}</span>
              {isPnl && (
                <span className={`font-bold shrink-0 ${changeColor(e.pnl ?? 0)}`}>
                  {fmtUSD(e.pnl)} ({fmtPct(e.pnl_pct)})
                </span>
              )}
              <span className="text-muted truncate text-[10px]">
                {e.reasoning?.slice(0, 2).join(" · ")}
              </span>
              <span className="ml-auto text-[9px] text-muted shrink-0">
                {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CryptoAutoTraderDashboard() {
  const [data, setData] = useState<CryptoAutoTraderData | null>(null);
  const [journal, setJournal] = useState<CryptoJournalEntry[]>([]);
  const [tab, setTab] = useState<"overview" | "positions" | "strategy" | "journal" | "performance">("overview");
  const [toggling, setToggling] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [capitalInput, setCapitalInput] = useState("");
  const [savingCap, setSavingCap] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/crypto/auto-trader/status`);
      if (r.ok) {
        const d: CryptoAutoTraderData = await r.json();
        setData(d);
        setCapitalInput((d.capital ?? "").toString());
      }
    } catch { /* ignore */ }
  }, []);

  const fetchJournal = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/crypto/auto-trader/journal`);
      if (r.ok) {
        const d = await r.json();
        setJournal(Array.isArray(d) ? d.reverse() : []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchJournal();
    const t = setInterval(() => { fetchStatus(); fetchJournal(); }, 15_000);
    return () => clearInterval(t);
  }, [fetchStatus, fetchJournal]);

  async function toggleTrader() {
    if (!data) return;
    setToggling(true);
    try {
      await fetch(`${API}/api/crypto/auto-trader/toggle`, { method: "POST" });
      await fetchStatus();
    } finally {
      setToggling(false);
    }
  }

  async function scanNow() {
    setScanning(true);
    try {
      await fetch(`${API}/api/crypto/auto-trader/scan-now`, { method: "POST" });
      setTimeout(() => { fetchStatus(); fetchJournal(); }, 5000);
    } finally {
      setTimeout(() => setScanning(false), 6000);
    }
  }

  async function saveCapital() {
    const cap = parseFloat(capitalInput);
    if (!cap || cap <= 0) return;
    setSavingCap(true);
    try {
      await fetch(`${API}/api/crypto/auto-trader/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capital: cap }),
      });
      await fetchStatus();
    } finally {
      setSavingCap(false);
    }
  }

  async function toggleStrategy(id: CryptoStrategyId) {
    if (!data?.strategy_config) return;
    const current = data.strategy_config.active_strategies ?? [];
    const next = current.includes(id) ? current.filter((s) => s !== id) : [...current, id];
    await fetch(`${API}/api/crypto/auto-trader/strategy-config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active_strategies: next }),
    });
    await fetchStatus();
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted">Loading crypto auto-trader…</p>
        </div>
      </div>
    );
  }

  const isRunning = data.running && data.enabled;
  const canTrade = data.risk_status?.can_trade;
  const activeStrategies = data.strategy_config?.active_strategies ?? [];
  const stratPerf = data.strategy_performance ?? {};

  return (
    <div className="space-y-5">
      {/* ── Status Header ── */}
      <div className="bg-card border border-border rounded-2xl p-4 md:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2.5 h-2.5 rounded-full ${isRunning ? "bg-green animate-pulse" : "bg-muted"}`} />
              <h2 className="text-base font-black">
                Crypto Auto-Trader
                {data.test_mode && (
                  <span className="ml-2 text-[10px] bg-yellow/10 text-yellow border border-yellow/30 px-1.5 py-0.5 rounded font-bold">
                    PAPER TRADING
                  </span>
                )}
              </h2>
            </div>
            <p className="text-xs text-muted">
              {isRunning
                ? `Running 24/7 · scan #{data.scan_count} · last ${data.last_scan ? new Date(data.last_scan).toLocaleTimeString() : "—"}`
                : "Stopped · toggle ON to start scanning"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={scanNow}
              disabled={scanning}
              className="text-xs px-3 py-2 bg-background border border-border hover:border-orange-500/50 rounded-xl font-bold disabled:opacity-50 transition"
            >
              {scanning ? "Scanning…" : "⚡ Scan Now"}
            </button>
            <button
              onClick={toggleTrader}
              disabled={toggling}
              className={`text-sm px-5 py-2.5 rounded-xl font-black transition shadow-lg ${
                isRunning
                  ? "bg-red/80 hover:bg-red text-white shadow-red/20"
                  : "bg-green hover:bg-green/80 text-white shadow-green/20"
              } disabled:opacity-50`}
            >
              {toggling ? "…" : isRunning ? "STOP" : "START"}
            </button>
          </div>
        </div>

        {/* Capital + risk */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-background rounded-xl p-3">
            <div className="text-[10px] text-muted uppercase">Capital</div>
            <div className="text-base font-black">{fmtUSD(data.capital)}</div>
          </div>
          <div className="bg-background rounded-xl p-3">
            <div className="text-[10px] text-muted uppercase">Cash</div>
            <div className={`text-base font-black ${(data.cash_available / data.capital) < 0.15 ? "text-red" : "text-foreground"}`}>
              {fmtUSD(data.cash_available)}
            </div>
          </div>
          <div className="bg-background rounded-xl p-3">
            <div className="text-[10px] text-muted uppercase">Today P&L</div>
            <div className={`text-base font-black ${changeColor(data.today_pnl)}`}>{fmtUSD(data.today_pnl)}</div>
          </div>
          <div className="bg-background rounded-xl p-3">
            <div className="text-[10px] text-muted uppercase">Total P&L</div>
            <div className={`text-base font-black ${changeColor(data.total_pnl)}`}>{fmtUSD(data.total_pnl)}</div>
          </div>
          <div className={`rounded-xl p-3 ${canTrade ? "bg-green/10 border border-green/20" : "bg-red/10 border border-red/20"}`}>
            <div className="text-[10px] font-bold uppercase mb-0.5">Risk Gate</div>
            <div className={`text-xs font-black ${canTrade ? "text-green" : "text-red"}`}>
              {canTrade ? "CAN TRADE" : "BLOCKED"}
            </div>
            <div className="text-[9px] text-muted">{data.risk_status?.reason}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 flex-wrap border-b border-border pb-0 -mb-4 md:-mb-5">
          {(["overview", "positions", "strategy", "journal", "performance"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[10px] px-3 py-2 font-bold capitalize border-b-2 transition -mb-px ${
                tab === t
                  ? "border-orange-500 text-orange-400"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t}
              {t === "positions" && data.positions.length > 0 && (
                <span className="ml-1 bg-orange-500/20 text-orange-300 px-1 py-0.5 rounded text-[8px]">
                  {data.positions.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Overview Tab ── */}
      {tab === "overview" && (
        <div className="space-y-5">
          {data.stats && <StatsPanel stats={data.stats} />}

          {/* Intelligence */}
          {data.intelligence && (
            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="text-sm font-black mb-3">🧠 Intelligence Layer</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="News Articles" value={String(data.intelligence.news_articles)} sub="cached" />
                <StatCard label="Market Sentiment" value={data.intelligence.market_sentiment || "—"} />
                <StatCard label="Investor Models" value={String(data.intelligence.investor_perspectives)} />
                <StatCard label="AI Confirm" value={data.intelligence.ai_enabled ? "ON" : "OFF"}
                  color={data.intelligence.ai_enabled ? "text-green" : "text-muted"} />
              </div>
              {data.intelligence.market_overview && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard
                    label="Fear & Greed"
                    value={String(data.intelligence.market_overview.fear_greed_value ?? "—")}
                    sub={data.intelligence.market_overview.fear_greed_label}
                  />
                  <StatCard label="BTC Dominance" value={`${data.intelligence.market_overview.btc_dominance?.toFixed(1)}%`} />
                  <StatCard
                    label="Altseason"
                    value={data.intelligence.market_overview.altseason ?? "—"}
                    color={data.intelligence.market_overview.altseason === "ACTIVE" ? "text-purple-400" : "text-muted"}
                  />
                  <StatCard
                    label="BTC Funding"
                    value={fmtPct(data.intelligence.market_overview.btc_funding_pct, 3)}
                    color={changeColor(data.intelligence.market_overview.btc_funding_pct)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Pending signals */}
          {data.pending_signals?.length > 0 && (
            <div className="bg-card border border-yellow/30 rounded-2xl p-4">
              <h3 className="text-sm font-black mb-3 text-yellow">⚡ Pending Signals ({data.pending_signals.length})</h3>
              <div className="space-y-2">
                {data.pending_signals.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-background rounded-lg px-3 py-2">
                    <span className="font-bold text-foreground">{shortSymbol(s.symbol)}</span>
                    <span className="text-orange-400">{s.strategy_name ?? s.strategy_id}</span>
                    <span className="text-muted">score {s.confluence_score}</span>
                    <span className="ml-auto text-red text-[9px]">missing: {s.missing?.join(", ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Capital control */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-sm font-black mb-3">Capital Control</h3>
            <div className="flex items-center gap-2 max-w-sm">
              <span className="text-sm text-muted">$</span>
              <input
                type="number"
                value={capitalInput}
                onChange={(e) => setCapitalInput(e.target.value)}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm font-bold text-foreground"
                placeholder="Enter capital in USDT"
              />
              <button
                onClick={saveCapital}
                disabled={savingCap}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-black rounded-lg transition disabled:opacity-50"
              >
                {savingCap ? "…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Positions Tab ── */}
      {tab === "positions" && (
        <div className="space-y-4">
          {data.positions.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted text-sm">
              No open positions
            </div>
          ) : (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              {/* Position header */}
              <div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 bg-background text-[10px] font-bold text-muted uppercase">
                <div className="col-span-2">Coin</div>
                <div className="col-span-2">Entry</div>
                <div className="col-span-2">Current</div>
                <div className="col-span-2">P&L</div>
                <div>Trail SL</div>
                <div>T1</div>
                <div>Units</div>
                <div>Hold</div>
              </div>
              {data.positions.map((p) => <PositionRow key={p.symbol} p={p} />)}
            </div>
          )}
        </div>
      )}

      {/* ── Strategy Tab ── */}
      {tab === "strategy" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-sm font-black mb-1">6 Strategies — ANY fires = trade taken</h3>
            <p className="text-xs text-muted mb-4">Toggle strategies to enable/disable them. Disabled strategies are skipped during scans.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(Object.keys(STRATEGY_META) as CryptoStrategyId[]).map((id) => {
                const meta = STRATEGY_META[id];
                const active = activeStrategies.includes(id);
                const perf = stratPerf[id];
                return (
                  <div
                    key={id}
                    className={`rounded-xl border p-3 transition cursor-pointer ${
                      active
                        ? "bg-orange-500/10 border-orange-500/40"
                        : "bg-background border-border opacity-60"
                    }`}
                    onClick={() => toggleStrategy(id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-base">{meta.emoji}</span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                        active ? "bg-green/20 text-green" : "bg-muted/10 text-muted"
                      }`}>{active ? "ON" : "OFF"}</span>
                    </div>
                    <div className="text-xs font-black text-foreground mb-0.5">Strategy {id}: {meta.name}</div>
                    <div className="text-[10px] text-muted mb-2">{meta.desc}</div>
                    {perf && (
                      <div className="flex items-center gap-2 text-[9px]">
                        <span className="text-foreground font-bold">{perf.trades} trades</span>
                        <span className={`font-bold ${perf.win_rate >= 50 ? "text-green" : "text-red"}`}>
                          {perf.win_rate?.toFixed(0)}% WR
                        </span>
                        <span className={`font-bold ${changeColor(perf.pnl)}`}>{fmtUSD(perf.pnl)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Journal Tab ── */}
      {tab === "journal" && <JournalTable entries={journal} />}

      {/* ── Performance Tab ── */}
      {tab === "performance" && (
        <div className="space-y-4">
          {data.stats && <StatsPanel stats={data.stats} />}

          {data.stats?.best_trade && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green/10 border border-green/20 rounded-xl p-4">
                <div className="text-[10px] text-green font-bold uppercase mb-1">Best Trade</div>
                <div className="text-sm font-black text-foreground">{data.stats.best_trade.symbol}</div>
                <div className="text-base font-black text-green">{fmtUSD(data.stats.best_trade.pnl)}</div>
              </div>
              {data.stats.worst_trade && (
                <div className="bg-red/10 border border-red/20 rounded-xl p-4">
                  <div className="text-[10px] text-red font-bold uppercase mb-1">Worst Trade</div>
                  <div className="text-sm font-black text-foreground">{data.stats.worst_trade.symbol}</div>
                  <div className="text-base font-black text-red">{fmtUSD(data.stats.worst_trade.pnl)}</div>
                </div>
              )}
            </div>
          )}

          {/* Per-strategy breakdown */}
          {Object.keys(stratPerf).length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-background text-[10px] font-bold text-muted uppercase">Strategy Performance</div>
              <div className="grid grid-cols-6 gap-2 px-3 py-2 bg-background text-[9px] font-bold text-muted uppercase border-t border-border/50">
                <div>Strategy</div><div>Trades</div><div>Win%</div><div>P&L</div><div>Avg Win</div><div>Avg Loss</div>
              </div>
              {Object.entries(stratPerf).map(([key, p]) => (
                <div key={key} className="grid grid-cols-6 gap-2 px-3 py-2 border-t border-border/50 text-xs items-center">
                  <div className="font-bold text-orange-400">{key} {STRATEGY_META[key as CryptoStrategyId]?.emoji}</div>
                  <div>{p.trades}</div>
                  <div className={p.win_rate >= 50 ? "text-green font-bold" : "text-red font-bold"}>{p.win_rate?.toFixed(0)}%</div>
                  <div className={`font-bold ${changeColor(p.pnl)}`}>{fmtUSD(p.pnl)}</div>
                  <div className="text-green">{fmtUSD(p.avg_win)}</div>
                  <div className="text-red">{fmtUSD(p.avg_loss)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

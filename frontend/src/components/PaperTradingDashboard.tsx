"use client";

import { useState, useEffect } from "react";
import type { AutoTraderData } from "@/lib/types";
import { RefreshCw } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  initialData?: AutoTraderData;
}

interface PaperStrategyData {
  name: string;
  label: string;
  trades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  recommendation: string;
  pnl: number;
}

export default function PaperTradingDashboard({ initialData }: Props) {
  const [data, setData] = useState<AutoTraderData | null>(initialData ?? null);
  const [paperStrategies, setPaperStrategies] = useState<PaperStrategyData[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "strategies" | "performance">("overview");

  const testCapital = 10000;

  useEffect(() => {
    fetchPaperTradingData();
    const interval = setInterval(fetchPaperTradingData, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchPaperTradingData() {
    try {
      const res = await fetch(`${API}/api/auto-trader/status?mode=paper`);
      const d = await res.json();
      setData(d);

      // Mock paper trading strategy data
      setPaperStrategies([
        { name: "A", label: "Momentum", trades: 60, winRate: 45, avgWin: 42.84, avgLoss: 3.66, recommendation: "Monitor - Below 60% threshold", pnl: -120 },
        { name: "B", label: "Reversal", trades: 45, winRate: 55, avgWin: 38.50, avgLoss: 4.20, recommendation: "Monitor - Almost ready", pnl: 580 },
        { name: "C", label: "Trend", trades: 72, winRate: 42, avgWin: 51.20, avgLoss: 2.80, recommendation: "Monitor - Below threshold", pnl: -340 },
        { name: "D", label: "News", trades: 38, winRate: 48, avgWin: 44.10, avgLoss: 3.90, recommendation: "Monitor - Data insufficient", pnl: 240 },
        { name: "E", label: "SMC/ICT", trades: 84, winRate: 65, avgWin: 55.30, avgLoss: 3.10, recommendation: "✅ READY - Exceed 60% win rate!", pnl: 2200 },
      ]);
    } catch (err) {
      console.error("Failed to fetch paper trading data:", err);
    }
  }

  const totalTrades = paperStrategies.reduce((sum, s) => sum + s.trades, 0);
  const totalPnL = paperStrategies.reduce((sum, s) => sum + s.pnl, 0);
  const avgWinRate = paperStrategies.length > 0
    ? Math.round(paperStrategies.reduce((sum, s) => sum + s.winRate, 0) / paperStrategies.length)
    : 0;
  const readyStrategies = paperStrategies.filter(s => s.winRate >= 60).length;

  return (
    <div className="min-h-screen bg-background">
      {/* ── DESKTOP HEADER ── */}
      <div className="hidden md:flex items-center justify-between px-6 py-4 bg-card border-b border-border sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-yellow/20 flex items-center justify-center text-yellow font-black text-xs">
            📄
          </div>
          <div>
            <h1 className="text-lg font-black text-foreground">PAPER TRADING</h1>
            <p className="text-xs text-muted">5 Strategies · Safe Testing</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={fetchPaperTradingData}
            className="px-4 py-2 rounded-lg bg-white/5 text-muted hover:text-foreground border border-border transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <span className="px-4 py-2 rounded-lg bg-yellow/10 text-yellow border border-yellow/30 font-semibold text-sm">
            🟡 TEST MODE
          </span>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 pb-24 md:pb-6">
        {/* Key Metrics Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted mb-1">Test Capital</p>
            <p className="text-2xl font-black text-blue-400">₹{testCapital.toLocaleString("en-IN")}</p>
            <p className="text-xs text-muted mt-1">Fixed amount</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted mb-1">Total Trades</p>
            <p className="text-2xl font-black text-cyan">{totalTrades}</p>
            <p className="text-xs text-muted mt-1">Across all</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted mb-1">Avg Win Rate</p>
            <p className={`text-2xl font-black ${avgWinRate >= 50 ? "text-green" : "text-yellow"}`}>{avgWinRate}%</p>
            <p className="text-xs text-muted mt-1">Overall</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted mb-1">Ready Strategies</p>
            <p className="text-2xl font-black text-green">{readyStrategies}</p>
            <p className="text-xs text-muted mt-1">For real trading</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border pb-1 overflow-x-auto">
          {(["overview", "strategies", "performance"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 text-sm font-bold rounded-t-lg transition whitespace-nowrap ${
                activeTab === t
                  ? "bg-accent/10 text-accent border-b-2 border-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t === "overview" && "📊 Overview"}
              {t === "strategies" && "🧩 Strategies"}
              {t === "performance" && "🏆 Performance"}
            </button>
          ))}
        </div>

        {/* TAB: Overview */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Paper Trading Summary */}
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-black text-foreground mb-4">Testing Progress</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-muted mb-2">Total P&L</p>
                  <p className={`text-3xl font-black ${totalPnL >= 0 ? "text-green" : "text-red"}`}>
                    ₹{totalPnL.toLocaleString("en-IN")}
                  </p>
                  <p className="text-xs text-muted mt-1">Test Performance</p>
                </div>
                <div>
                  <p className="text-sm text-muted mb-2">Capital Per Strategy</p>
                  <p className="text-3xl font-black text-foreground">₹{(testCapital / 5).toLocaleString("en-IN")}</p>
                  <p className="text-xs text-muted mt-1">₹{testCapital / 5} × 5</p>
                </div>
                <div>
                  <p className="text-sm text-muted mb-2">Testing Duration</p>
                  <p className="text-3xl font-black text-accent">2-4 weeks</p>
                  <p className="text-xs text-muted mt-1">Recommended</p>
                </div>
              </div>
            </div>

            {/* Ready vs Monitor */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Ready for Real Trading */}
              <div className="bg-card rounded-xl border border-green/30 bg-green/5 p-6">
                <h3 className="text-lg font-black text-green mb-4">✅ READY FOR REAL TRADING</h3>
                <div className="space-y-2">
                  {paperStrategies.filter(s => s.winRate >= 60).map((strat, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-green/10 rounded-lg border border-green/20">
                      <div>
                        <p className="font-bold text-foreground">{strat.name} - {strat.label}</p>
                        <p className="text-xs text-muted">{strat.trades} trades · {strat.winRate}% win rate</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-black text-sm ${strat.pnl >= 0 ? "text-green" : "text-red"}`}>
                          ₹{strat.pnl.toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
                  ))}
                  {paperStrategies.filter(s => s.winRate >= 60).length === 0 && (
                    <p className="text-sm text-muted py-3">No strategies ready yet. Keep testing!</p>
                  )}
                </div>
              </div>

              {/* Still Monitoring */}
              <div className="bg-card rounded-xl border border-yellow/30 bg-yellow/5 p-6">
                <h3 className="text-lg font-black text-yellow mb-4">⏳ STILL MONITORING</h3>
                <div className="space-y-2">
                  {paperStrategies.filter(s => s.winRate < 60).map((strat, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-yellow/10 rounded-lg border border-yellow/20">
                      <div>
                        <p className="font-bold text-foreground">{strat.name} - {strat.label}</p>
                        <p className="text-xs text-muted">{strat.trades} trades · {strat.winRate}% win rate</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-black text-sm ${strat.pnl >= 0 ? "text-green" : "text-red"}`}>
                          ₹{strat.pnl.toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Strategies */}
        {activeTab === "strategies" && (
          <div className="space-y-4">
            <h2 className="text-lg font-black text-foreground mb-4">Strategy Evaluation Cards</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {paperStrategies.map((strat) => (
                <div key={strat.name} className="bg-card rounded-xl border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black">{strat.name}</span>
                    <span className="text-xs text-muted">({strat.label})</span>
                  </div>
                  <div className={`text-xs font-bold px-2 py-1 rounded text-center ${
                    strat.winRate >= 60 ? "bg-green/20 text-green" : "bg-yellow/20 text-yellow"
                  }`}>
                    {strat.winRate}% Win Rate
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div className="bg-black/20 rounded p-1.5 text-center">
                      <div className="text-muted text-[10px]">Trades</div>
                      <div className="font-black">{strat.trades}</div>
                    </div>
                    <div className="bg-black/20 rounded p-1.5 text-center">
                      <div className="text-muted text-[10px]">Avg Win</div>
                      <div className="font-black text-green">₹{strat.avgWin}</div>
                    </div>
                  </div>
                  <div className="text-xs text-yellow text-center">{strat.recommendation}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: Performance */}
        {activeTab === "performance" && (
          <div className="space-y-6">
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-black text-foreground mb-4">Performance Metrics</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {paperStrategies.map((strat) => (
                  <div key={strat.name} className="border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold">{strat.name} - {strat.label}</h3>
                      <span className={`text-xs font-bold px-2 py-1 rounded ${
                        strat.pnl >= 0 ? "bg-green/20 text-green" : "bg-red/20 text-red"
                      }`}>
                        {strat.pnl >= 0 ? "+" : ""}₹{strat.pnl}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-muted mb-1">Trades</p>
                        <p className="font-black text-lg">{strat.trades}</p>
                      </div>
                      <div>
                        <p className="text-muted mb-1">Win Rate</p>
                        <p className={`font-black text-lg ${strat.winRate >= 50 ? "text-green" : "text-red"}`}>{strat.winRate}%</p>
                      </div>
                      <div>
                        <p className="text-muted mb-1">Avg Win</p>
                        <p className="font-black text-green">₹{strat.avgWin}</p>
                      </div>
                      <div>
                        <p className="text-muted mb-1">Avg Loss</p>
                        <p className="font-black text-red">₹{strat.avgLoss}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Info Boxes */}
        <div className="space-y-3">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-xs text-blue-400">
            <p>
              <strong>📌 Paper Trading Purpose:</strong> Test all 5 strategies with ₹10,000 capital (₹2,000 per strategy) to find winning strategies. Run for 2-4 weeks before deploying real money.
            </p>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-xs text-yellow">
            <p>
              <strong>⚠️ Important:</strong> Paper trading results may differ from real trading due to slippage, liquidity, and market volatility. Only strategies with &gt;60% win rate should be deployed to real trading.
            </p>
          </div>
        </div>

        <footer className="text-center py-4 border-t border-border">
          <p className="text-[10px] text-muted">Paper trading uses simulated capital. Not financial advice. All trading involves risk.</p>
        </footer>
      </main>
    </div>
  );
}

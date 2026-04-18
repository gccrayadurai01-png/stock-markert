"use client";

import { useState, useEffect, useCallback } from "react";
import type { StrategyId, StrategyPerformanceMap } from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const STRATEGY_GUIDE: Record<StrategyId, {
  name: string;
  emoji: string;
  how_it_works: string;
  entry_conditions: string[];
  best_market: string;
  worst_market: string;
  real_trading_verdict: "EXCELLENT" | "GOOD" | "CAUTION" | "RESEARCH_ONLY";
  real_trading_reason: string;
  expected_win_rate: string;
  expected_rr: string;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  famous_users: string;
}> = {
  A: {
    name: "Momentum Surge",
    emoji: "🚀",
    how_it_works:
      "Catches stocks already moving strongly. RSI rising (50–70), MACD bullish crossover, EMAs stacked (9>21>50), AND volume spiking above average. All four must agree — this is a high-conviction momentum entry.",
    entry_conditions: [
      "RSI between 50–70 (momentum building, not overbought)",
      "MACD crossed bullish within last 3 candles",
      "EMA 9 > EMA 21 > EMA 50 (full bullish stack)",
      "Volume ≥ 1.5× the 20-period average (institutional participation)",
    ],
    best_market: "Bull market, breakout days post-earnings, Nifty trending up with strong breadth",
    worst_market: "Sideways NIFTY 50 range, pre-election uncertainty, thin intraday volumes",
    real_trading_verdict: "EXCELLENT",
    real_trading_reason:
      "Textbook institutional strategy. Used by every prop desk in NSE. The 4-condition filter keeps false signals low — on average 2–3 quality setups per week on Nifty 50 stocks. Works best on high-volume stocks (RELIANCE, TCS, HDFC, INFY). Use on 15-min chart for intraday, daily chart for swing.",
    expected_win_rate: "55–65%",
    expected_rr: "1:2 to 1:3",
    risk_level: "MEDIUM",
    famous_users: "Rakesh Jhunjhunwala's active momentum trades, Jesse Livermore's core principle",
  },
  B: {
    name: "Oversold Reversal",
    emoji: "📉",
    how_it_works:
      "Finds stocks beaten down to extreme levels and showing first recovery signs. RSI below 30, price at lower Bollinger Band, and a reversal candle pattern (Hammer, Doji, or Bullish Engulfing). Sector must not be in structural downtrend.",
    entry_conditions: [
      "RSI < 30 (oversold — sellers exhausted)",
      "Price at or below lower Bollinger Band (2σ)",
      "Hammer, Doji or Bullish Engulfing candle",
      "FII/DII data not strongly negative for the sector",
    ],
    best_market: "Post-panic selloffs, budget day overreactions, sector-specific bad news that is already priced in",
    worst_market: "During structural bear markets — stocks can stay oversold for months in India",
    real_trading_verdict: "GOOD",
    real_trading_reason:
      "Works well for swing trades (2–5 days hold) on Nifty 50 stocks. The key rule: only take it when FII data is neutral or positive. If FIIs are selling heavily, skip — Indian markets follow FII flows more than technicals. Always keep stop below the candle's low, never average down.",
    expected_win_rate: "50–60%",
    expected_rr: "1:1.5 to 1:2.5",
    risk_level: "MEDIUM",
    famous_users: "Warren Buffett's 'buy fear' principle, Ramesh Damani's contrarian picks",
  },
  C: {
    name: "Trend Rider",
    emoji: "🏄",
    how_it_works:
      "Rides confirmed strong trends. Supertrend shows UP, ADX above 25 proves the trend has real strength (not just noise), and EMAs fully aligned. Entry on pullbacks to EMA21 during an uptrend — momentum continuation strategy.",
    entry_conditions: [
      "Supertrend indicator: UP direction",
      "ADX > 25 (strong trend confirmed)",
      "EMA 9/21/50 all bullish aligned",
      "Pullback to EMA21 gives optimal entry",
    ],
    best_market: "Post-budget rally, Nifty trending quarters, post-RBI rate cut cycles",
    worst_market: "Pre-event sideways, global uncertainty (Fed meetings, geopolitical events)",
    real_trading_verdict: "EXCELLENT",
    real_trading_reason:
      "The single best strategy for Indian markets long-term. NSE trend moves last 2–8 weeks on average — Trend Rider captures the meat of these moves. The ADX filter is critical: without ADX > 25, 60% of signals are false breakouts. Best stocks: RELIANCE, HDFC BANK, TCS, BAJFINANCE — deep liquid names with real institutional participation.",
    expected_win_rate: "45–55% (avg wins are 2–3× avg losses)",
    expected_rr: "1:2 to 1:5",
    risk_level: "LOW",
    famous_users: "Rakesh Jhunjhunwala's long-term trend plays, Vijay Kedia's sector rotation",
  },
  D: {
    name: "SMC / ICT",
    emoji: "🧠",
    how_it_works:
      "Smart Money Concepts — reads the market like FIIs and DIIs do. Identifies Order Blocks (zones where big money entered), Fair Value Gaps (price inefficiencies that get filled), and Break of Structure (trend shifts). Enters when price returns to these high-probability zones.",
    entry_conditions: [
      "Break of Structure confirmed in trade direction",
      "Price retrace into Order Block or Fair Value Gap",
      "Price in OTE zone (61.8%–79% Fibonacci retracement)",
      "Premium/Discount analysis: only buy in Discount, sell in Premium",
    ],
    best_market: "Any day with institutional participation — works on Nifty 50 index constituents",
    worst_market: "Small/mid caps with no institutional interest — no order blocks form",
    real_trading_verdict: "EXCELLENT",
    real_trading_reason:
      "Highest-edge strategy when you understand it. FIIs and DIIs leave footprints in the form of Order Blocks on every Nifty 50 stock chart. Once you train your eye, you will see setups daily. Best used on NIFTY INDEX (via NIFTYBEES) and top 10 Nifty stocks. Takes 2–4 weeks to learn properly — use paper trading first.",
    expected_win_rate: "40–55%",
    expected_rr: "1:3 to 1:6",
    risk_level: "MEDIUM",
    famous_users: "ICT methodology, used by institutional prop traders globally and growing NSE community",
  },
};

const VERDICT_STYLE: Record<string, string> = {
  EXCELLENT:     "bg-green/10 text-green border-green/30",
  GOOD:          "bg-blue-500/10 text-blue-400 border-blue-500/30",
  CAUTION:       "bg-yellow/10 text-yellow border-yellow/30",
  RESEARCH_ONLY: "bg-red/10 text-red border-red/30",
};

const RISK_STYLE: Record<string, string> = {
  LOW:    "text-green",
  MEDIUM: "text-yellow",
  HIGH:   "text-red",
};

const RECOMMENDATION_ORDER: StrategyId[] = ["C", "A", "D", "B"];
const RECOMMENDATION_LABEL: Record<StrategyId, string> = {
  C: "Start here — lowest risk, captures big Nifty trends",
  A: "Add second — boosts wins on breakout days",
  D: "Add third — highest edge, requires learning SMC concepts",
  B: "Only during post-panic oversold bounces",
};

export default function StockStrategyLab() {
  const [selected, setSelected] = useState<StrategyId>("C");
  const [perf, setPerf] = useState<StrategyPerformanceMap>({});
  const [view, setView] = useState<"ranking" | "guide">("ranking");

  const fetchPerf = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/auto-trader/strategy-performance`);
      if (r.ok) setPerf((await r.json()) ?? {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchPerf(); }, [fetchPerf]);

  const guide = STRATEGY_GUIDE[selected];
  const livePerfSelected = perf[selected];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">Strategy Lab — NSE Stocks</h2>
        <p className="text-xs text-muted mt-0.5">
          Which strategy works, why it works, and what to expect in real trading.
        </p>
      </div>

      <div className="flex gap-2">
        {(["ranking", "guide"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`text-xs px-4 py-2 rounded-lg font-bold border transition ${
              view === v
                ? "bg-accent text-white border-accent"
                : "bg-card text-muted border-border hover:text-foreground"
            }`}
          >
            {v === "ranking" ? "📊 Which is Best?" : "🔬 Deep Dive"}
          </button>
        ))}
      </div>

      {/* ── RANKING VIEW ── */}
      {view === "ranking" && (
        <div className="space-y-4">
          <div className="bg-card border border-accent/30 rounded-2xl p-4">
            <h3 className="text-sm font-black mb-1 text-accent">Recommended Order for Real Trading</h3>
            <p className="text-xs text-muted mb-4">Master these in order. Don't jump to SMC until C and A are profitable for you.</p>

            <div className="space-y-3">
              {RECOMMENDATION_ORDER.map((id, idx) => {
                const g = STRATEGY_GUIDE[id];
                const p = perf[id];
                return (
                  <div
                    key={id}
                    className="rounded-xl border border-border bg-background hover:border-accent/30 p-3 cursor-pointer transition"
                    onClick={() => { setSelected(id); setView("guide"); }}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${
                        idx === 0 ? "bg-yellow/20 text-yellow border border-yellow/40" :
                        idx === 1 ? "bg-slate-400/20 text-slate-300 border border-slate-500/40" :
                        idx === 2 ? "bg-orange-700/20 text-orange-600 border border-orange-700/40" :
                        "bg-muted/10 text-muted border border-muted/20"
                      }`}>
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black">{g.emoji} Strategy {id}: {g.name}</span>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${VERDICT_STYLE[g.real_trading_verdict]}`}>
                            {g.real_trading_verdict.replace("_", " ")}
                          </span>
                          <span className={`text-[9px] font-semibold ${RISK_STYLE[g.risk_level]}`}>{g.risk_level} RISK</span>
                        </div>
                        <p className="text-[10px] text-accent font-semibold mt-0.5">{RECOMMENDATION_LABEL[id]}</p>
                        <p className="text-[10px] text-muted mt-1 leading-snug">{g.real_trading_reason}</p>
                        <div className="flex flex-wrap gap-4 mt-2 text-[10px]">
                          <span className="text-muted">Expected WR: <strong className="text-foreground">{g.expected_win_rate}</strong></span>
                          <span className="text-muted">R:R: <strong className="text-foreground">{g.expected_rr}</strong></span>
                          {p?.trades > 0 ? (
                            <>
                              <span className="text-muted">Live WR: <strong className={p.win_rate >= 50 ? "text-green" : "text-red"}>{p.win_rate?.toFixed(0)}%</strong></span>
                              <span className="text-muted">Live P&L: <strong className={p.pnl >= 0 ? "text-green" : "text-red"}>₹{p.pnl?.toFixed(0)}</strong></span>
                              <span className="text-muted">{p.trades} trades</span>
                            </>
                          ) : (
                            <span className="text-muted italic">No live data yet — run auto-trader to populate</span>
                          )}
                        </div>
                      </div>
                      <div className="text-[10px] text-muted shrink-0 hidden sm:block">Tap to deep-dive →</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Comparison table */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-background"><h3 className="text-sm font-black">Quick Comparison</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-background/50 text-[10px] text-muted uppercase">
                    <th className="px-3 py-2 text-left">Strategy</th>
                    <th className="px-3 py-2 text-left">Win Rate</th>
                    <th className="px-3 py-2 text-left">R:R</th>
                    <th className="px-3 py-2 text-left">Risk</th>
                    <th className="px-3 py-2 text-left">Real Trading</th>
                    <th className="px-3 py-2 text-left">Live WR</th>
                    <th className="px-3 py-2 text-left">Live P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(STRATEGY_GUIDE) as StrategyId[]).map((id) => {
                    const g = STRATEGY_GUIDE[id];
                    const p = perf[id];
                    return (
                      <tr key={id} className="border-t border-border/50 hover:bg-card-hover/20 cursor-pointer" onClick={() => { setSelected(id); setView("guide"); }}>
                        <td className="px-3 py-2 font-bold">{g.emoji} {id}: {g.name}</td>
                        <td className="px-3 py-2">{g.expected_win_rate}</td>
                        <td className="px-3 py-2">{g.expected_rr}</td>
                        <td className={`px-3 py-2 font-bold ${RISK_STYLE[g.risk_level]}`}>{g.risk_level}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${VERDICT_STYLE[g.real_trading_verdict]}`}>
                            {g.real_trading_verdict.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {p?.trades > 0 ? <span className={p.win_rate >= 50 ? "text-green font-bold" : "text-red font-bold"}>{p.win_rate?.toFixed(0)}%</span> : <span className="text-muted">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {p?.trades > 0 ? <span className={`font-bold ${p.pnl >= 0 ? "text-green" : "text-red"}`}>₹{p.pnl?.toFixed(0)}</span> : <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action guide */}
          <div className="bg-green/5 border border-green/20 rounded-2xl p-4">
            <h3 className="text-sm font-black text-green mb-2">How to use this in real NSE trading</h3>
            <ol className="space-y-2 text-xs text-foreground">
              <li className="flex gap-2"><span className="font-black text-green shrink-0">1.</span> Enable only Strategy C (Trend Rider) first — trade 1 lot of NIFTY or 1 share of RELIANCE/TCS</li>
              <li className="flex gap-2"><span className="font-black text-green shrink-0">2.</span> Paper trade 3 weeks, review journal — if WR exceeds 50%, go live with ₹5,000 risk/trade</li>
              <li className="flex gap-2"><span className="font-black text-green shrink-0">3.</span> Add Strategy A (Momentum) — use on breakout days when NIFTY opens gap-up with volume</li>
              <li className="flex gap-2"><span className="font-black text-green shrink-0">4.</span> Learn SMC on weekends, add Strategy D only after you can identify order blocks by eye</li>
              <li className="flex gap-2"><span className="font-black text-green shrink-0">5.</span> Always check FII/DII data before trading — FII selling = no long trades regardless of signals</li>
            </ol>
          </div>
        </div>
      )}

      {/* ── DEEP DIVE VIEW ── */}
      {view === "guide" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STRATEGY_GUIDE) as StrategyId[]).map((id) => (
              <button
                key={id}
                onClick={() => setSelected(id)}
                className={`text-xs px-3 py-2 rounded-lg font-bold border transition ${
                  selected === id ? "bg-accent text-white border-accent" : "bg-card text-muted border-border hover:text-foreground hover:border-accent/30"
                }`}
              >
                {STRATEGY_GUIDE[id].emoji} {id}
              </button>
            ))}
          </div>

          <div className="bg-card border border-accent/30 rounded-2xl p-5 space-y-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{guide.emoji}</span>
                <div>
                  <h3 className="text-xl font-black">Strategy {selected}: {guide.name}</h3>
                  <p className="text-xs text-muted">{guide.famous_users}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className={`text-xs font-black px-3 py-1.5 rounded-lg border ${VERDICT_STYLE[guide.real_trading_verdict]}`}>
                  Real Trading: {guide.real_trading_verdict.replace("_", " ")}
                </span>
                <span className={`text-xs font-bold ${RISK_STYLE[guide.risk_level]}`}>{guide.risk_level} RISK</span>
              </div>
            </div>

            <div className="bg-background rounded-xl p-4">
              <h4 className="text-[10px] font-black text-accent uppercase mb-2">How This Strategy Works</h4>
              <p className="text-sm text-foreground leading-relaxed">{guide.how_it_works}</p>
            </div>

            <div>
              <h4 className="text-[10px] font-black text-muted uppercase mb-2">Entry Conditions (ALL must be true)</h4>
              <div className="space-y-1.5">
                {guide.entry_conditions.map((cond, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-green font-black shrink-0 mt-0.5">✓</span>
                    <span className="text-foreground">{cond}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-background rounded-xl p-3 text-center">
                <div className="text-[10px] text-muted uppercase font-bold">Expected Win Rate</div>
                <div className="text-base font-black">{guide.expected_win_rate}</div>
              </div>
              <div className="bg-background rounded-xl p-3 text-center">
                <div className="text-[10px] text-muted uppercase font-bold">Target R:R</div>
                <div className="text-base font-black">{guide.expected_rr}</div>
              </div>
              <div className="bg-background rounded-xl p-3 text-center">
                <div className="text-[10px] text-muted uppercase font-bold">Best For</div>
                <div className="text-xs font-semibold leading-snug">{guide.best_market}</div>
              </div>
              <div className="bg-background rounded-xl p-3 text-center">
                <div className="text-[10px] text-muted uppercase font-bold">Avoid When</div>
                <div className="text-xs font-semibold text-red leading-snug">{guide.worst_market}</div>
              </div>
            </div>

            {livePerfSelected?.trades > 0 ? (
              <div className="bg-background rounded-xl p-4">
                <h4 className="text-[10px] font-black text-accent uppercase mb-3">Live Auto-Trader Performance</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                  <div><div className="text-[10px] text-muted">Trades</div><div className="text-lg font-black">{livePerfSelected.trades}</div></div>
                  <div><div className="text-[10px] text-muted">Win Rate</div><div className={`text-lg font-black ${livePerfSelected.win_rate >= 50 ? "text-green" : "text-red"}`}>{livePerfSelected.win_rate?.toFixed(1)}%</div></div>
                  <div><div className="text-[10px] text-muted">Total P&L</div><div className={`text-lg font-black ${livePerfSelected.pnl >= 0 ? "text-green" : "text-red"}`}>₹{livePerfSelected.pnl?.toFixed(0)}</div></div>
                  <div><div className="text-[10px] text-muted">Best Trade</div><div className="text-lg font-black text-green">₹{livePerfSelected.best_pnl?.toFixed(0)}</div></div>
                </div>
              </div>
            ) : (
              <div className="bg-background rounded-xl p-4 text-center text-xs text-muted">
                No live data yet. Start the auto-trader to see real performance for Strategy {selected}.
              </div>
            )}

            <div className={`rounded-xl border p-4 ${VERDICT_STYLE[guide.real_trading_verdict]}`}>
              <h4 className="text-[10px] font-black uppercase mb-2">Real Money Verdict</h4>
              <p className="text-sm leading-relaxed">{guide.real_trading_reason}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import type { CryptoStrategyId, StrategyPerformanceMap } from "@/lib/types";
import { fmtUSD, fmtPct, changeColor } from "@/lib/cryptoFormat";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Static knowledge base for each strategy ───────────────────────────
const STRATEGY_GUIDE: Record<CryptoStrategyId, {
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
      "Catches coins that are already moving strongly upward. RSI is rising (50–70), MACD just crossed bullish, EMAs are stacked in order (9 > 21 > 50), AND volume is spiking — meaning real buyers are coming in. All four must agree.",
    entry_conditions: [
      "RSI between 50–70 (momentum, not overbought)",
      "MACD line crossed above signal line within last 3 bars",
      "EMA 9 > EMA 21 > EMA 50 (full bullish alignment)",
      "Volume ≥ 1.5× 20-period average (real participation)",
    ],
    best_market: "Strong bull market, breakout days, post-news surges",
    worst_market: "Sideways chop, thin liquidity altcoins, bear market",
    real_trading_verdict: "EXCELLENT",
    real_trading_reason:
      "This is a textbook professional strategy. Momentum + volume confirmation is used by institutional desks worldwide. The 4-condition filter keeps false signals low. Best used on BTC, ETH, SOL, BNB — high-liquidity coins only.",
    expected_win_rate: "55–65%",
    expected_rr: "1:2 to 1:3",
    risk_level: "MEDIUM",
    famous_users: "Used by top quant funds, Jesse Livermore's core principle",
  },
  B: {
    name: "Oversold Reversal",
    emoji: "📉",
    how_it_works:
      "Finds coins that have been beaten down hard and are showing first signs of recovery. RSI below 30 (extreme selling exhaustion), price near the lower Bollinger Band, and a Hammer or Doji candle — meaning sellers are losing control.",
    entry_conditions: [
      "RSI < 30 (oversold territory)",
      "Price at or below lower Bollinger Band (2 standard deviations)",
      "Hammer, Doji, or bullish engulfing candle pattern",
      "No major negative news catalyst",
    ],
    best_market: "After sharp corrections, crypto fear events (F&G < 25)",
    worst_market: "During structural downtrends — coins can stay oversold for weeks",
    real_trading_verdict: "GOOD",
    real_trading_reason:
      "Excellent for catching bounces after crashes but requires discipline. Never average down — if the candle pattern doesn't form, skip it. Works best when Fear & Greed is below 30. Always use the stop loss — some oversold coins keep falling.",
    expected_win_rate: "50–60%",
    expected_rr: "1:1.5 to 1:2.5",
    risk_level: "MEDIUM",
    famous_users: "Howard Marks' contrarian principles, John Templeton's buy-at-maximum-pessimism",
  },
  C: {
    name: "Trend Rider",
    emoji: "🏄",
    how_it_works:
      "Rides coins that are in a confirmed, strong trend. Supertrend indicator shows UP direction, ADX above 25 confirms the trend has real strength, and EMAs are fully aligned bullish. This is a trend-following strategy — it never picks tops or bottoms.",
    entry_conditions: [
      "Supertrend indicator: UP direction",
      "ADX > 25 (trend has strength, not just noise)",
      "EMA 9/21/50 all bullish aligned",
      "Pullback to EMA21 or EMA50 for better entry",
    ],
    best_market: "Sustained bull runs, post-halving cycles, strong sector rotations",
    worst_market: "Ranging markets, whipsaw conditions — will get chopped up",
    real_trading_verdict: "EXCELLENT",
    real_trading_reason:
      "The most battle-tested strategy class in trading history. 'Trend is your friend' — professionals use this on every timeframe. Wins big when trends last. The ADX filter is critical — without it, 60% of signals fail. This strategy has the best Sharpe ratio long-term.",
    expected_win_rate: "45–55% (but avg wins are 2–3× avg losses)",
    expected_rr: "1:2 to 1:5",
    risk_level: "LOW",
    famous_users: "Paul Tudor Jones, Ray Dalio, CTA hedge funds globally",
  },
  D: {
    name: "News Catalyst",
    emoji: "📰",
    how_it_works:
      "Trades the momentum created by bullish news events. When a coin gets positive news coverage AND technical indicators confirm upward movement, a short-term surge often follows. The window is narrow — usually 30 minutes to 4 hours.",
    entry_conditions: [
      "Bullish news detected for the specific coin",
      "Price moving up in first 15 minutes after news",
      "RSI not overbought (< 75)",
      "Volume spike confirming real buying interest",
    ],
    best_market: "Partnership announcements, exchange listings, protocol upgrades, ETF approvals",
    worst_market: "General market news (affects all coins equally), fake/rumor news",
    real_trading_verdict: "CAUTION",
    real_trading_reason:
      "Works in paper trading but is harder in real trading because: (1) news spreads instantly, (2) whales often sell the news, (3) requires very fast execution. Best used with small position sizes (5–8% of capital). Skip this strategy for real trading until you are comfortable with the others.",
    expected_win_rate: "45–55%",
    expected_rr: "1:1.5 to 1:2",
    risk_level: "HIGH",
    famous_users: "News-driven quant funds, George Soros' information edge philosophy",
  },
  E: {
    name: "SMC / ICT",
    emoji: "🧠",
    how_it_works:
      "Smart Money Concepts — reads the market the way institutional traders (banks, hedge funds) do. Identifies Order Blocks (price zones where big players entered), Fair Value Gaps (price inefficiencies that get filled), and Break of Structure events. Enters when price returns to these zones.",
    entry_conditions: [
      "Break of Structure (BOS) confirmed in direction of trade",
      "Price retraces into an Order Block or Fair Value Gap",
      "Price in Optimal Trade Entry zone (61.8%–79% retracement)",
      "Premium/Discount zone analysis confirms setup",
    ],
    best_market: "Any market with institutional participation — BTC, ETH always work",
    worst_market: "Very small altcoins with no institutional interest",
    real_trading_verdict: "EXCELLENT",
    real_trading_reason:
      "The highest-edge strategy in this system when you understand it. Institutions cannot hide their footprint — Order Blocks and FVGs appear on every chart. This strategy wins less often than Trend Rider but each win is large. Use on BTC/ETH 1h or 4h charts for best results in real trading.",
    expected_win_rate: "40–55%",
    expected_rr: "1:3 to 1:6",
    risk_level: "MEDIUM",
    famous_users: "ICT (Michael Huddleston), Inner Circle Trader methodology, used by professional prop traders",
  },
  F: {
    name: "Sentiment Edge",
    emoji: "😱",
    how_it_works:
      "Crypto-exclusive strategy that trades against the crowd at sentiment extremes. When Fear & Greed Index is in Extreme Fear (< 25), it buys — because that is when good coins are on sale. When Extreme Greed (> 80), it prepares to sell. Funding rate extremes (negative = shorts piling in = contrarian buy signal) add another layer.",
    entry_conditions: [
      "Fear & Greed < 25 (Extreme Fear) → look for long entries",
      "OR Fear & Greed > 80 + funding rate very positive → look for exits",
      "Funding rate negative (< -0.05%) → longs being punished, reversal likely",
      "Technical confirmation: RSI showing divergence or reversal pattern",
    ],
    best_market: "Crypto-specific panic events, liquidation cascades, over-leveraged market conditions",
    worst_market: "Prolonged bear markets where fear is justified — 2022-style drawdowns",
    real_trading_verdict: "GOOD",
    real_trading_reason:
      "This is unique to crypto — no stock market equivalent exists at this scale. Warren Buffett's 'be greedy when others are fearful' literally programmed as a strategy. Works best as a POSITION SIZING guide: put more capital to work when F&G < 25, reduce when > 75. Combine with Strategy A or C for better entries.",
    expected_win_rate: "50–65% (depends on timing)",
    expected_rr: "1:2 to 1:4",
    risk_level: "MEDIUM",
    famous_users: "Warren Buffett's contrarian principle, Raoul Pal's macro timing",
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

// ── Recommendation ranking ────────────────────────────────────────────
const RECOMMENDATION_ORDER: CryptoStrategyId[] = ["C", "A", "E", "F", "B", "D"];
const RECOMMENDATION_LABEL: Record<CryptoStrategyId, string> = {
  C: "Start here — lowest risk, most consistent",
  A: "Add second — boosts wins in bull markets",
  E: "Add third — highest edge when you understand SMC",
  F: "Use as position-sizing guide, not standalone",
  B: "Only during extreme fear events (F&G < 25)",
  D: "Skip for real trading until advanced",
};

export default function CryptoStrategyLab() {
  const [selected, setSelected] = useState<CryptoStrategyId>("C");
  const [perf, setPerf] = useState<StrategyPerformanceMap>({});
  const [view, setView] = useState<"guide" | "ranking">("ranking");

  const fetchPerf = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/crypto/auto-trader/strategy-performance`);
      if (r.ok) {
        const d = await r.json();
        setPerf(d ?? {});
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchPerf();
  }, [fetchPerf]);

  const guide = STRATEGY_GUIDE[selected];
  const livePerfSelected = perf[selected];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">Strategy Lab</h2>
        <p className="text-xs text-muted mt-0.5">
          Understand every strategy, see live performance, and know which to use in real trading.
        </p>
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        {(["ranking", "guide"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`text-xs px-4 py-2 rounded-lg font-bold border transition ${
              view === v
                ? "bg-orange-500 text-white border-orange-500"
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
          {/* Recommendation order */}
          <div className="bg-card border border-orange-500/30 rounded-2xl p-4">
            <h3 className="text-sm font-black mb-1 text-orange-400">
              Recommended Strategy Order for Real Trading
            </h3>
            <p className="text-xs text-muted mb-4">
              Start with the safest strategies, add complexity only when you are profitable with the simpler ones.
            </p>

            <div className="space-y-3">
              {RECOMMENDATION_ORDER.map((id, idx) => {
                const g = STRATEGY_GUIDE[id];
                const p = perf[id];
                return (
                  <div
                    key={id}
                    className="rounded-xl border border-border bg-background hover:border-orange-500/30 p-3 cursor-pointer transition"
                    onClick={() => { setSelected(id); setView("guide"); }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Rank badge */}
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
                          <span className={`text-[9px] font-semibold ${RISK_STYLE[g.risk_level]}`}>
                            {g.risk_level} RISK
                          </span>
                        </div>

                        <p className="text-[10px] text-orange-300 font-semibold mt-0.5">{RECOMMENDATION_LABEL[id]}</p>
                        <p className="text-[10px] text-muted mt-1 leading-snug">{g.real_trading_reason}</p>

                        <div className="flex flex-wrap gap-4 mt-2 text-[10px]">
                          <span className="text-muted">Expected WR: <strong className="text-foreground">{g.expected_win_rate}</strong></span>
                          <span className="text-muted">R:R target: <strong className="text-foreground">{g.expected_rr}</strong></span>
                          {p && p.trades > 0 && (
                            <>
                              <span className="text-muted">Live WR: <strong className={p.win_rate >= 50 ? "text-green" : "text-red"}>{p.win_rate?.toFixed(0)}%</strong></span>
                              <span className="text-muted">Live P&L: <strong className={changeColor(p.pnl)}>{fmtUSD(p.pnl)}</strong></span>
                              <span className="text-muted">{p.trades} trades</span>
                            </>
                          )}
                          {(!p || p.trades === 0) && (
                            <span className="text-muted italic">No live data yet — run auto-trader to populate</span>
                          )}
                        </div>
                      </div>

                      <div className="text-[10px] text-muted shrink-0 hidden sm:block">
                        Tap to deep-dive →
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick comparison table */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-background">
              <h3 className="text-sm font-black">Quick Comparison</h3>
            </div>
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
                  {(Object.keys(STRATEGY_GUIDE) as CryptoStrategyId[]).map((id) => {
                    const g = STRATEGY_GUIDE[id];
                    const p = perf[id];
                    return (
                      <tr
                        key={id}
                        className="border-t border-border/50 hover:bg-card-hover/20 cursor-pointer"
                        onClick={() => { setSelected(id); setView("guide"); }}
                      >
                        <td className="px-3 py-2 font-bold">{g.emoji} {id}: {g.name}</td>
                        <td className="px-3 py-2 text-foreground">{g.expected_win_rate}</td>
                        <td className="px-3 py-2 text-foreground">{g.expected_rr}</td>
                        <td className={`px-3 py-2 font-bold ${RISK_STYLE[g.risk_level]}`}>{g.risk_level}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${VERDICT_STYLE[g.real_trading_verdict]}`}>
                            {g.real_trading_verdict.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {p?.trades > 0
                            ? <span className={p.win_rate >= 50 ? "text-green font-bold" : "text-red font-bold"}>{p.win_rate?.toFixed(0)}%</span>
                            : <span className="text-muted">—</span>
                          }
                        </td>
                        <td className="px-3 py-2">
                          {p?.trades > 0
                            ? <span className={`font-bold ${changeColor(p.pnl)}`}>{fmtUSD(p.pnl)}</span>
                            : <span className="text-muted">—</span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action box */}
          <div className="bg-green/5 border border-green/20 rounded-2xl p-4">
            <h3 className="text-sm font-black text-green mb-2">How to use this in real trading</h3>
            <ol className="space-y-2 text-xs text-foreground">
              <li className="flex gap-2"><span className="font-black text-green shrink-0">1.</span> Enable only Strategy C (Trend Rider) + Strategy A (Momentum) first</li>
              <li className="flex gap-2"><span className="font-black text-green shrink-0">2.</span> Paper trade for 2–4 weeks, watch the journal, see which trades make sense to you</li>
              <li className="flex gap-2"><span className="font-black text-green shrink-0">3.</span> Once live win rate exceeds 50%, add Strategy E (SMC/ICT)</li>
              <li className="flex gap-2"><span className="font-black text-green shrink-0">4.</span> Use Strategy F's Fear & Greed reading to decide how much capital to deploy each day</li>
              <li className="flex gap-2"><span className="font-black text-green shrink-0">5.</span> Always keep Strategy D (News) off for real money — news is fastest in crypto, hard to beat</li>
            </ol>
          </div>
        </div>
      )}

      {/* ── DEEP DIVE VIEW ── */}
      {view === "guide" && (
        <div className="space-y-4">
          {/* Strategy selector */}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STRATEGY_GUIDE) as CryptoStrategyId[]).map((id) => {
              const g = STRATEGY_GUIDE[id];
              return (
                <button
                  key={id}
                  onClick={() => setSelected(id)}
                  className={`text-xs px-3 py-2 rounded-lg font-bold border transition ${
                    selected === id
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-card text-muted border-border hover:text-foreground hover:border-orange-500/30"
                  }`}
                >
                  {g.emoji} {id}
                </button>
              );
            })}
          </div>

          {/* Detail card */}
          <div className="bg-card border border-orange-500/30 rounded-2xl p-5 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-3xl">{guide.emoji}</span>
                  <div>
                    <h3 className="text-xl font-black">Strategy {selected}: {guide.name}</h3>
                    <p className="text-xs text-muted">{guide.famous_users}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className={`text-xs font-black px-3 py-1.5 rounded-lg border ${VERDICT_STYLE[guide.real_trading_verdict]}`}>
                  Real Trading: {guide.real_trading_verdict.replace("_", " ")}
                </span>
                <span className={`text-xs font-bold ${RISK_STYLE[guide.risk_level]}`}>
                  {guide.risk_level} RISK
                </span>
              </div>
            </div>

            {/* How it works */}
            <div className="bg-background rounded-xl p-4">
              <h4 className="text-[10px] font-black text-orange-400 uppercase mb-2">How This Strategy Works</h4>
              <p className="text-sm text-foreground leading-relaxed">{guide.how_it_works}</p>
            </div>

            {/* Entry conditions */}
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

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-background rounded-xl p-3 text-center">
                <div className="text-[10px] text-muted uppercase font-bold">Expected Win Rate</div>
                <div className="text-base font-black text-foreground">{guide.expected_win_rate}</div>
              </div>
              <div className="bg-background rounded-xl p-3 text-center">
                <div className="text-[10px] text-muted uppercase font-bold">Target R:R</div>
                <div className="text-base font-black text-foreground">{guide.expected_rr}</div>
              </div>
              <div className="bg-background rounded-xl p-3 text-center">
                <div className="text-[10px] text-muted uppercase font-bold">Best For</div>
                <div className="text-xs font-semibold text-foreground leading-snug">{guide.best_market}</div>
              </div>
              <div className="bg-background rounded-xl p-3 text-center">
                <div className="text-[10px] text-muted uppercase font-bold">Avoid When</div>
                <div className="text-xs font-semibold text-red leading-snug">{guide.worst_market}</div>
              </div>
            </div>

            {/* Live performance */}
            {livePerfSelected && livePerfSelected.trades > 0 ? (
              <div className="bg-background rounded-xl p-4">
                <h4 className="text-[10px] font-black text-orange-400 uppercase mb-3">Live Paper Trading Performance</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="text-center">
                    <div className="text-[10px] text-muted">Trades</div>
                    <div className="text-lg font-black">{livePerfSelected.trades}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-muted">Win Rate</div>
                    <div className={`text-lg font-black ${livePerfSelected.win_rate >= 50 ? "text-green" : "text-red"}`}>
                      {livePerfSelected.win_rate?.toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-muted">Total P&L</div>
                    <div className={`text-lg font-black ${changeColor(livePerfSelected.pnl)}`}>
                      {fmtUSD(livePerfSelected.pnl)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-muted">Best Trade</div>
                    <div className="text-lg font-black text-green">{fmtUSD(livePerfSelected.best_pnl)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-background rounded-xl p-4 text-center text-xs text-muted">
                No live data yet. Start the auto-trader to see real performance for Strategy {selected}.
              </div>
            )}

            {/* Real trading verdict */}
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

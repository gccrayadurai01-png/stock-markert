"use client";

import { useState } from "react";
import type { RecommendedTrade } from "@/lib/types";
import InvestorSwitcher from "./InvestorSwitcher";

interface Props {
  trades: RecommendedTrade[];
  capital: number;
}

export default function TradeCards({ trades, capital }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!trades.length) {
    return (
      <section>
        <h2 className="text-lg font-bold mb-3">Recommended Trades</h2>
        <div className="bg-yellow/5 border border-yellow/30 rounded-xl p-6 text-center">
          <span className="text-2xl block mb-2">💰</span>
          <p className="text-sm font-bold text-yellow">SIT ON CASH</p>
          <p className="text-xs text-muted mt-1">No high-confidence setups right now. Cash IS a position.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-lg font-bold">Recommended Trades</h2>
        <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-semibold">
          {trades.length} active
        </span>
        <span className="text-[10px] bg-blue-500/15 text-blue-400 px-2 py-1 rounded-full font-semibold animate-pulse ml-auto">
          Click any trade to see Investor Perspectives
        </span>
      </div>

      <div className="space-y-3">
        {trades.map((t, i) => {
          const isBuy = t.action === "BUY";
          const isOpen = expanded === i;
          const riskPerShare = Math.abs(t.entry_price - t.stop_loss);
          const rr1 = riskPerShare > 0 ? ((Math.abs(t.target_1 - t.entry_price)) / riskPerShare).toFixed(1) : "?";
          const rr2 = riskPerShare > 0 ? ((Math.abs(t.target_2 - t.entry_price)) / riskPerShare).toFixed(1) : "?";
          const capPct = capital > 0 ? ((t.capital_to_deploy / capital) * 100).toFixed(0) : 0;

          return (
            <div
              key={`${t.symbol}-${i}`}
              className={`rounded-xl border-2 overflow-hidden transition-all ${
                isBuy ? "border-green/30 bg-green/5" : "border-red/30 bg-red/5"
              }`}
            >
              {/* Header */}
              <button
                onClick={() => setExpanded(isOpen ? null : i)}
                className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <span className={`text-xs font-black px-3 py-1 rounded-lg ${
                      isBuy ? "bg-green text-white" : "bg-red text-white"
                    }`}>
                      {t.action}
                    </span>
                    <div className="text-[9px] text-muted mt-0.5">{t.trade_type}</div>
                  </div>
                  <div>
                    <div className="font-bold text-foreground">{t.stock_name}</div>
                    <div className="text-xs text-muted">{t.symbol.replace(".NS", "")}</div>
                  </div>
                </div>

                <div className="flex items-center gap-5 text-xs">
                  <div className="text-center">
                    <div className="text-muted">Entry</div>
                    <div className="font-bold text-base">₹{t.entry_price.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted">SL</div>
                    <div className="font-bold text-red text-base">₹{t.stop_loss.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted">T1</div>
                    <div className="font-bold text-green text-base">₹{t.target_1.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted">Deploy</div>
                    <div className="font-bold text-accent text-base">₹{t.capital_to_deploy.toLocaleString("en-IN")}</div>
                    <div className="text-[9px] text-muted">{capPct}% of capital</div>
                  </div>
                  <div className="text-center">
                    <div className="text-muted">Shares</div>
                    <div className="font-bold text-base">{t.shares_to_buy}</div>
                  </div>
                  <div className={`text-center px-3 py-1 rounded-lg ${
                    t.confidence >= 8 ? "bg-green/20 text-green" :
                    t.confidence >= 6 ? "bg-yellow/20 text-yellow" : "bg-red/20 text-red"
                  }`}>
                    <div className="text-[9px] font-bold">CONF</div>
                    <div className="font-black text-lg">{t.confidence}/10</div>
                  </div>
                  <span className={`flex flex-col items-center ${isOpen ? "text-accent" : "text-blue-400"}`}>
                    <span className="text-sm">{isOpen ? "▲" : "▼"}</span>
                    {!isOpen && <span className="text-[8px] font-bold">EXPAND</span>}
                  </span>
                </div>
              </button>

              {/* Expanded */}
              {isOpen && (
                <div className="px-4 pb-4 border-t border-border/50 space-y-3 pt-3">
                  <div className="grid grid-cols-4 gap-3 text-xs">
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-muted">Target 2</div>
                      <div className="font-bold text-green">₹{t.target_2.toLocaleString("en-IN")}</div>
                    </div>
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-muted">R:R (T1)</div>
                      <div className="font-bold">1:{rr1}</div>
                    </div>
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-muted">R:R (T2)</div>
                      <div className="font-bold">1:{rr2}</div>
                    </div>
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-muted">Risk ₹</div>
                      <div className="font-bold text-red">
                        ₹{(riskPerShare * t.shares_to_buy).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>

                  <div className="bg-background rounded-lg p-3">
                    <div className="text-[10px] font-bold text-accent uppercase tracking-wider mb-1">WHY THIS TRADE</div>
                    <p className="text-xs text-foreground/80 leading-relaxed">{t.reason}</p>
                  </div>

                  <div className="bg-background rounded-lg p-3">
                    <div className="text-[10px] font-bold text-yellow uppercase tracking-wider mb-2">INDICATOR INSIGHTS</div>
                    <div className="space-y-1">
                      {t.indicator_summary.split(" | ").map((insight, idx) => {
                        const isBullish = insight.toLowerCase().includes("bullish") || insight.toLowerCase().includes("buy") || insight.toLowerCase().includes("up") || insight.toLowerCase().includes("oversold") || insight.toLowerCase().includes("strong trend");
                        const isBearish = insight.toLowerCase().includes("bearish") || insight.toLowerCase().includes("sell") || insight.toLowerCase().includes("down") || insight.toLowerCase().includes("overbought") || insight.toLowerCase().includes("weak");
                        return (
                          <div key={idx} className="flex items-start gap-2">
                            <span className={`text-xs mt-0.5 ${isBullish ? "text-green" : isBearish ? "text-red" : "text-yellow"}`}>
                              {isBullish ? "▲" : isBearish ? "▼" : "●"}
                            </span>
                            <span className="text-xs text-foreground/80">{insight}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-red/5 rounded-lg p-3 border border-red/20">
                    <div className="text-[10px] font-bold text-red uppercase tracking-wider mb-1">WHAT WILL KILL THIS TRADE</div>
                    <p className="text-xs text-foreground/80">{t.risk}</p>
                  </div>

                  {/* Investor Perspectives */}
                  {t.investor_perspectives && t.investor_perspectives.length > 0 && (
                    <div className="border-2 border-blue-500/40 bg-blue-500/5 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">🧠</span>
                        <h3 className="text-sm font-black text-blue-400 uppercase tracking-wider">Legendary Investor Perspectives</h3>
                        <span className="text-[9px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold">Use dropdown below</span>
                      </div>
                      <InvestorSwitcher
                        perspectives={t.investor_perspectives}
                        consensus={t.investor_consensus}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import type { StockAnalysis } from "@/lib/types";
import StockChart from "./StockChart";
import InvestorSwitcher from "./InvestorSwitcher";

interface Props {
  stocks: StockAnalysis[];
  title: string;
  onStockClick?: (symbol: string) => void;
  expandedStock?: string | null;
}

const SIGNAL_COLORS: Record<string, string> = {
  STRONG_BUY: "bg-green text-white",
  BUY: "bg-green/20 text-green",
  NEUTRAL: "bg-muted/20 text-muted",
  SELL: "bg-red/20 text-red",
  STRONG_SELL: "bg-red text-white",
  NO_DATA: "bg-muted/10 text-muted",
};

const VOTE_BAR_COLORS = { BUY: "bg-green", SELL: "bg-red", NEUTRAL: "bg-yellow" };

export default function StockScanner({ stocks, title, onStockClick, expandedStock }: Props) {
  const [internalExpanded, setInternalExpanded] = useState<string | null>(null);
  const [investorData, setInvestorData] = useState<Record<string, any>>({});
  const [loadingInvestors, setLoadingInvestors] = useState<string | null>(null);

  if (!stocks.length) return null;

  const expanded = expandedStock !== undefined ? expandedStock : internalExpanded;

  const handleClick = onStockClick || ((sym: string) => {
    const isExpanding = internalExpanded !== sym;
    setInternalExpanded(isExpanding ? sym : null);

    // Load investor perspectives when expanding
    if (isExpanding && !investorData[sym]) {
      setLoadingInvestors(sym);
      fetch(`/api/stock/${sym}/investor-perspectives`)
        .then((res) => res.json())
        .then((data) => {
          setInvestorData((prev) => ({ ...prev, [sym]: data }));
          setLoadingInvestors(null);
        })
        .catch((err) => {
          console.error("Failed to load investor perspectives:", err);
          setLoadingInvestors(null);
        });
    }
  });

  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-lg font-bold">{title}</h2>
        <span className="text-[10px] bg-blue-500/15 text-blue-400 px-2 py-1 rounded-full font-semibold ml-auto">
          Click any stock row to see Investor Analysis
        </span>
      </div>
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-background text-[10px] font-bold text-muted uppercase tracking-wider">
          <div className="col-span-2">Stock</div>
          <div>Price</div>
          <div>Chg%</div>
          <div>Signal</div>
          <div>Score</div>
          <div>RSI</div>
          <div>MACD</div>
          <div>Trend</div>
          <div>EMA</div>
          <div>ADX</div>
          <div>Votes</div>
        </div>

        {/* Rows */}
        {stocks.map((s) => (
          <div key={s.symbol}>
            <div
              onClick={() => handleClick(s.symbol)}
              className={`grid grid-cols-12 gap-2 px-3 py-2 border-t border-border/50 items-center text-xs cursor-pointer transition-colors ${
                expanded === s.symbol ? "bg-accent/5 border-l-2 border-l-accent" : "hover:bg-card-hover/30"
              }`}
            >
              <div className="col-span-2">
                <div className="font-semibold text-foreground">{s.name}</div>
              </div>
              <div className="font-semibold">₹{s.price?.toLocaleString("en-IN")}</div>
              <div className={s.change_percent >= 0 ? "text-green font-semibold" : "text-red font-semibold"}>
                {s.change_percent >= 0 ? "+" : ""}{s.change_percent?.toFixed(2)}%
              </div>
              <div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${SIGNAL_COLORS[s.signal] || ""}`}>
                  {s.signal?.replace("_", " ")}
                </span>
              </div>
              <div className={`font-bold ${s.score > 0 ? "text-green" : s.score < 0 ? "text-red" : "text-muted"}`}>
                {s.score > 0 ? "+" : ""}{s.score}
              </div>
              <div className={
                s.rsi < 30 ? "text-green font-bold" :
                s.rsi > 70 ? "text-red font-bold" : "text-muted"
              }>
                {s.rsi?.toFixed(0)}
              </div>
              <div className={
                s.macd_vote === "BUY" ? "text-green" :
                s.macd_vote === "SELL" ? "text-red" : "text-muted"
              }>
                {s.macd_vote}
              </div>
              <div className={s.supertrend_dir === "UP" ? "text-green" : "text-red"}>
                {s.supertrend_dir === "UP" ? "▲ UP" : "▼ DN"}
              </div>
              <div className={
                s.ema_align === "BULLISH" ? "text-green" :
                s.ema_align === "BEARISH" ? "text-red" : "text-yellow"
              }>
                {s.ema_align}
              </div>
              <div className={s.adx > 25 ? "font-bold" : "text-muted"}>
                {s.adx?.toFixed(0)}
              </div>
              <div>
                {s.votes && (
                  <div className="flex h-2 rounded-full overflow-hidden bg-background w-full">
                    {s.votes.BUY > 0 && (
                      <div className={VOTE_BAR_COLORS.BUY} style={{ width: `${(s.votes.BUY / (s.votes.BUY + s.votes.SELL + s.votes.NEUTRAL)) * 100}%` }} />
                    )}
                    {s.votes.NEUTRAL > 0 && (
                      <div className={VOTE_BAR_COLORS.NEUTRAL} style={{ width: `${(s.votes.NEUTRAL / (s.votes.BUY + s.votes.SELL + s.votes.NEUTRAL)) * 100}%` }} />
                    )}
                    {s.votes.SELL > 0 && (
                      <div className={VOTE_BAR_COLORS.SELL} style={{ width: `${(s.votes.SELL / (s.votes.BUY + s.votes.SELL + s.votes.NEUTRAL)) * 100}%` }} />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Expanded Detail View */}
            {expanded === s.symbol && (
              <div className="border-t border-accent/30 bg-accent/5 p-4 space-y-4">
                {/* Indicator Details */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-[9px] text-muted uppercase">RSI</div>
                    <div className={`text-sm font-bold ${s.rsi < 30 ? "text-green" : s.rsi > 70 ? "text-red" : "text-foreground"}`}>
                      {s.rsi?.toFixed(1)}
                    </div>
                    <div className="text-[8px] text-muted">
                      {s.rsi < 30 ? "Oversold" : s.rsi > 70 ? "Overbought" : "Neutral"}
                    </div>
                  </div>
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-[9px] text-muted uppercase">MACD</div>
                    <div className={`text-sm font-bold ${s.macd_vote === "BUY" ? "text-green" : s.macd_vote === "SELL" ? "text-red" : "text-foreground"}`}>
                      {s.macd_vote}
                    </div>
                    <div className="text-[8px] text-muted">Signal Line Cross</div>
                  </div>
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-[9px] text-muted uppercase">Supertrend</div>
                    <div className={`text-sm font-bold ${s.supertrend_dir === "UP" ? "text-green" : "text-red"}`}>
                      {s.supertrend_dir}
                    </div>
                    <div className="text-[8px] text-muted">Trend Direction</div>
                  </div>
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-[9px] text-muted uppercase">EMA</div>
                    <div className={`text-sm font-bold ${s.ema_align === "BULLISH" ? "text-green" : s.ema_align === "BEARISH" ? "text-red" : "text-yellow"}`}>
                      {s.ema_align}
                    </div>
                    <div className="text-[8px] text-muted">9/21/50 Alignment</div>
                  </div>
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-[9px] text-muted uppercase">ADX</div>
                    <div className={`text-sm font-bold ${s.adx > 25 ? "text-accent" : "text-muted"}`}>
                      {s.adx?.toFixed(1)}
                    </div>
                    <div className="text-[8px] text-muted">{s.adx > 25 ? "Strong Trend" : "Weak Trend"}</div>
                  </div>
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-[9px] text-muted uppercase">BB %B</div>
                    <div className="text-sm font-bold text-foreground">
                      {(s.bb_pct * 100)?.toFixed(0)}%
                    </div>
                    <div className="text-[8px] text-muted">
                      {s.bb_pct > 0.8 ? "Near Upper" : s.bb_pct < 0.2 ? "Near Lower" : "Middle"}
                    </div>
                  </div>
                </div>

                {/* Targets */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-[9px] text-muted">Stop Loss</div>
                    <div className="text-sm font-bold text-red">₹{s.stop_loss?.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-[9px] text-muted">Target 1</div>
                    <div className="text-sm font-bold text-green">₹{s.target_1?.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-[9px] text-muted">Target 2</div>
                    <div className="text-sm font-bold text-green">₹{s.target_2?.toLocaleString("en-IN")}</div>
                  </div>
                </div>

                {/* Votes breakdown */}
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted">Indicator Votes:</span>
                  <span className="text-xs font-bold text-green">{s.votes?.BUY} BUY</span>
                  <span className="text-xs font-bold text-yellow">{s.votes?.NEUTRAL} NEUTRAL</span>
                  <span className="text-xs font-bold text-red">{s.votes?.SELL} SELL</span>
                  {s.volume_spike && <span className="text-[9px] bg-yellow/10 text-yellow px-2 py-0.5 rounded font-bold">VOLUME SPIKE</span>}
                </div>

                {/* Investor Perspectives */}
                {loadingInvestors === s.symbol ? (
                  <div className="border-t border-border/50 pt-4 text-center">
                    <div className="text-sm text-muted animate-pulse">Loading investor perspectives...</div>
                  </div>
                ) : investorData[s.symbol]?.investor_perspectives ? (
                  <div className="border-2 border-blue-500/40 bg-blue-500/5 rounded-xl p-4 mt-2">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🧠</span>
                      <h3 className="text-sm font-black text-blue-400 uppercase tracking-wider">Legendary Investor Perspectives</h3>
                      <span className="text-[9px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold">Use dropdown below</span>
                    </div>
                    <InvestorSwitcher
                      perspectives={investorData[s.symbol].investor_perspectives}
                      consensus={investorData[s.symbol].consensus}
                    />
                  </div>
                ) : null}

                {/* Chart */}
                <StockChart symbol={s.symbol} interval="1day" height={300} />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

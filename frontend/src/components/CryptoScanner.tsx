"use client";

import { useMemo, useState } from "react";
import type { CryptoAnalysis, CryptoInvestorAnalysis } from "@/lib/types";
import { fmtUSD, fmtPct, fmtLargeUSD, signalColor, changeColor, shortSymbol } from "@/lib/cryptoFormat";
import CryptoChart from "./CryptoChart";
import InvestorSwitcher from "./InvestorSwitcher";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  coins: CryptoAnalysis[];
  title?: string;
}

type SortKey = "signal" | "score" | "change" | "volume" | "price";

function readNum(obj: Record<string, unknown> | undefined, keys: string[]): number | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function readString(obj: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string") return v;
  }
  return null;
}

export default function CryptoScanner({ coins, title = "Crypto Scanner (12 Indicators)" }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [filter, setFilter] = useState<"all" | "buys" | "sells">("all");
  const [investorData, setInvestorData] = useState<Record<string, CryptoInvestorAnalysis>>({});
  const [loadingInv, setLoadingInv] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = coins.slice();
    if (filter === "buys")  list = list.filter((c) => c.signal === "BUY" || c.signal === "STRONG_BUY");
    if (filter === "sells") list = list.filter((c) => c.signal === "SELL" || c.signal === "STRONG_SELL");
    list.sort((a, b) => {
      switch (sortKey) {
        case "change": return (b.change_24h_pct ?? 0) - (a.change_24h_pct ?? 0);
        case "volume": return (b.volume_24h_usd ?? 0) - (a.volume_24h_usd ?? 0);
        case "price":  return (b.price ?? 0) - (a.price ?? 0);
        case "signal": {
          const rank: Record<string, number> = { STRONG_BUY: 5, BUY: 4, NEUTRAL: 3, SELL: 2, STRONG_SELL: 1, NO_DATA: 0 };
          return (rank[b.signal] ?? 0) - (rank[a.signal] ?? 0);
        }
        default: return (b.score ?? 0) - (a.score ?? 0);
      }
    });
    return list;
  }, [coins, filter, sortKey]);

  if (!coins.length) {
    return (
      <section className="bg-card rounded-xl border border-border p-6 text-center text-sm text-muted">
        No coin data yet — scanner is warming up.
      </section>
    );
  }

  function handleClick(symbol: string) {
    const expanding = expanded !== symbol;
    setExpanded(expanding ? symbol : null);
    if (expanding && !investorData[symbol]) {
      setLoadingInv(symbol);
      fetch(`${API}/api/crypto/coin/${encodeURIComponent(symbol)}/investors`)
        .then((r) => r.json())
        .then((d: CryptoInvestorAnalysis) => {
          setInvestorData((prev) => ({ ...prev, [symbol]: d }));
          setLoadingInv(null);
        })
        .catch(() => setLoadingInv(null));
    }
  }

  return (
    <section>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h2 className="text-lg font-bold">{title}</h2>
        <span className="text-[10px] bg-orange-500/15 text-orange-300 px-2 py-1 rounded-full font-semibold">
          Click row for indicators · chart · investor views
        </span>

        <div className="ml-auto flex items-center gap-1">
          {(["all", "buys", "sells"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[10px] px-2 py-1 rounded font-bold uppercase transition ${
                filter === f ? "bg-orange-500 text-white" : "bg-background text-muted hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="text-[10px] bg-background border border-border rounded px-2 py-1 text-foreground font-semibold"
          >
            <option value="score">Sort: Score</option>
            <option value="signal">Sort: Signal</option>
            <option value="change">Sort: 24h %</option>
            <option value="volume">Sort: Volume</option>
            <option value="price">Sort: Price</option>
          </select>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 bg-background text-[10px] font-bold text-muted uppercase tracking-wider">
          <div className="col-span-2">Coin</div>
          <div className="col-span-2">Price</div>
          <div>24h%</div>
          <div>Signal</div>
          <div>Score</div>
          <div>Conf</div>
          <div>Stop</div>
          <div>T1</div>
          <div>T2</div>
          <div>Vol 24h</div>
        </div>

        {/* Rows */}
        {filtered.map((c) => {
          const isOpen = expanded === c.symbol;
          const ind = c.indicators || {};
          const rsi = readNum(ind, ["rsi", "RSI"]);
          const macdVote = readString(ind, ["macd_vote", "macd"]);
          const trend = readString(ind, ["supertrend_dir", "supertrend", "trend"]);
          const emaAlign = readString(ind, ["ema_align", "ema"]);

          return (
            <div key={c.symbol}>
              {/* Desktop row */}
              <div
                className={`hidden md:grid grid-cols-12 gap-2 px-3 py-2 border-t border-border/50 items-center text-xs cursor-pointer transition-colors ${
                  isOpen ? "bg-orange-500/5 border-l-2 border-l-orange-500" : "hover:bg-card-hover/30"
                }`}
                onClick={() => handleClick(c.symbol)}
              >
                <div className="col-span-2">
                  <div className="font-semibold text-foreground">{shortSymbol(c.symbol)}</div>
                  <div className="text-[9px] text-muted">{c.name}</div>
                </div>
                <div className="col-span-2 font-semibold">{fmtUSD(c.price, c.price)}</div>
                <div className={`font-semibold ${changeColor(c.change_24h_pct)}`}>{fmtPct(c.change_24h_pct)}</div>
                <div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${signalColor(c.signal)}`}>
                    {c.signal?.replace("_", " ")}
                  </span>
                </div>
                <div className={`font-bold ${c.score > 0 ? "text-green" : c.score < 0 ? "text-red" : "text-muted"}`}>
                  {c.score > 0 ? "+" : ""}{c.score}
                </div>
                <div className="font-semibold">{c.confidence?.toFixed(0)}%</div>
                <div className="text-red">{fmtUSD(c.stop_loss, c.price)}</div>
                <div className="text-green">{fmtUSD(c.target_1, c.price)}</div>
                <div className="text-green">{fmtUSD(c.target_2, c.price)}</div>
                <div className="text-muted">{fmtLargeUSD(c.volume_24h_usd)}</div>
              </div>

              {/* Mobile row */}
              <div
                className={`md:hidden border-t border-border/50 px-3 py-3 cursor-pointer ${
                  isOpen ? "bg-orange-500/5 border-l-2 border-l-orange-500" : ""
                }`}
                onClick={() => handleClick(c.symbol)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-foreground">{shortSymbol(c.symbol)}</div>
                    <div className="text-[10px] text-muted">{c.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black">{fmtUSD(c.price, c.price)}</div>
                    <div className={`text-xs font-semibold ${changeColor(c.change_24h_pct)}`}>{fmtPct(c.change_24h_pct)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 text-[10px]">
                  <span className={`font-bold px-1.5 py-0.5 rounded border ${signalColor(c.signal)}`}>
                    {c.signal?.replace("_", " ")}
                  </span>
                  <span className={`font-bold ${c.score > 0 ? "text-green" : c.score < 0 ? "text-red" : "text-muted"}`}>
                    {c.score > 0 ? "+" : ""}{c.score}
                  </span>
                  <span className="text-muted">·</span>
                  <span className="text-muted">{c.confidence?.toFixed(0)}%</span>
                  <span className="text-muted ml-auto">{fmtLargeUSD(c.volume_24h_usd)}</span>
                </div>
              </div>

              {/* Expanded */}
              {isOpen && (
                <div className="border-t border-orange-500/30 bg-orange-500/5 p-4 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase">Entry</div>
                      <div className="text-sm font-bold">{fmtUSD(c.price, c.price)}</div>
                    </div>
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase">Stop Loss</div>
                      <div className="text-sm font-bold text-red">{fmtUSD(c.stop_loss, c.price)}</div>
                    </div>
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase">Target 1</div>
                      <div className="text-sm font-bold text-green">{fmtUSD(c.target_1, c.price)}</div>
                    </div>
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase">Target 2</div>
                      <div className="text-sm font-bold text-green">{fmtUSD(c.target_2, c.price)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {rsi != null && (
                      <div className="bg-background rounded-lg p-2 text-center">
                        <div className="text-[9px] text-muted uppercase">RSI</div>
                        <div className={`text-sm font-bold ${rsi < 30 ? "text-green" : rsi > 70 ? "text-red" : "text-foreground"}`}>
                          {rsi.toFixed(1)}
                        </div>
                        <div className="text-[8px] text-muted">
                          {rsi < 30 ? "Oversold" : rsi > 70 ? "Overbought" : "Neutral"}
                        </div>
                      </div>
                    )}
                    {macdVote && (
                      <div className="bg-background rounded-lg p-2 text-center">
                        <div className="text-[9px] text-muted uppercase">MACD</div>
                        <div className={`text-sm font-bold ${macdVote === "BUY" ? "text-green" : macdVote === "SELL" ? "text-red" : "text-foreground"}`}>
                          {macdVote}
                        </div>
                      </div>
                    )}
                    {trend && (
                      <div className="bg-background rounded-lg p-2 text-center">
                        <div className="text-[9px] text-muted uppercase">Trend</div>
                        <div className={`text-sm font-bold ${trend === "UP" ? "text-green" : trend === "DOWN" ? "text-red" : "text-muted"}`}>
                          {trend}
                        </div>
                      </div>
                    )}
                    {emaAlign && (
                      <div className="bg-background rounded-lg p-2 text-center">
                        <div className="text-[9px] text-muted uppercase">EMA</div>
                        <div className={`text-sm font-bold ${emaAlign === "BULLISH" ? "text-green" : emaAlign === "BEARISH" ? "text-red" : "text-yellow"}`}>
                          {emaAlign}
                        </div>
                      </div>
                    )}
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase">ATR</div>
                      <div className="text-sm font-bold">{fmtUSD(c.atr, c.price)}</div>
                    </div>
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase">24h Hi/Lo</div>
                      <div className="text-[10px] font-bold text-green">{fmtUSD(c.high_24h, c.price)}</div>
                      <div className="text-[10px] font-bold text-red">{fmtUSD(c.low_24h, c.price)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-xs text-muted">Votes:</span>
                    <span className="text-xs font-bold text-green">{c.votes?.BUY ?? 0} BUY</span>
                    <span className="text-xs font-bold text-yellow">{c.votes?.NEUTRAL ?? 0} NEUTRAL</span>
                    <span className="text-xs font-bold text-red">{c.votes?.SELL ?? 0} SELL</span>
                    <span className="text-xs text-muted ml-auto">Trades 24h: {c.trades_24h?.toLocaleString()}</span>
                  </div>

                  {/* Investor perspectives */}
                  {loadingInv === c.symbol ? (
                    <div className="border-t border-border/50 pt-4 text-center">
                      <div className="text-sm text-muted animate-pulse">Loading crypto investor perspectives...</div>
                    </div>
                  ) : investorData[c.symbol]?.investor_perspectives?.length ? (
                    <div className="border-2 border-orange-500/40 bg-orange-500/5 rounded-xl p-4 mt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">🧠</span>
                        <h3 className="text-sm font-black text-orange-400 uppercase tracking-wider">Crypto Investor Perspectives</h3>
                      </div>
                      <InvestorSwitcher
                        perspectives={investorData[c.symbol].investor_perspectives}
                        consensus={investorData[c.symbol].consensus}
                      />
                    </div>
                  ) : null}

                  {/* Chart */}
                  <CryptoChart symbol={c.symbol} interval="1h" height={300} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

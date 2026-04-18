"use client";

import { useState } from "react";
import type { CryptoScreenTab, Platform } from "@/lib/types";
import { useCryptoDashboard } from "@/hooks/useCryptoDashboard";
import CryptoSidebar from "./CryptoSidebar";
import CryptoMarketBanner from "./CryptoMarketBanner";
import CryptoTradeCards from "./CryptoTradeCards";
import CryptoScanner from "./CryptoScanner";
import CryptoChart from "./CryptoChart";
import CryptoMacroNews from "./CryptoMacroNews";
import CryptoInvestorsScreen from "./CryptoInvestorsScreen";
import CryptoAutoTraderDashboard from "./CryptoAutoTraderDashboard";
import CryptoStrategyLab from "./CryptoStrategyLab";

interface Props {
  onSwitchPlatform: (p: Platform) => void;
  onLogout: () => void;
}

const EMPTY_OVERVIEW = {
  btc_price: 0, btc_change_24h: 0, btc_high_24h: 0, btc_low_24h: 0,
  eth_price: 0, eth_change_24h: 0,
  total_market_cap_usd: 0, total_volume_24h_usd: 0,
  btc_dominance: 0, eth_dominance: 0,
  market_cap_change_24h_pct: 0, active_cryptocurrencies: 0,
  fear_greed_value: 50, fear_greed_classification: "Neutral",
  market_status: "OPEN" as const,
};

const EMPTY_SENTIMENT = {
  fear_greed_value: null, fear_greed_label: "—", fear_greed_bias: "—",
  btc_dominance: 0, eth_dominance: 0,
  altseason: "OFF" as const,
  btc_funding_pct: 0, eth_funding_pct: 0,
  market_cap_change_24h_pct: 0,
  overall_bias: "NEUTRAL", narrative: "Loading market data…",
};

export default function CryptoDashboardScreen({ onSwitchPlatform, onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<CryptoScreenTab>("dashboard");
  const [chartSymbol, setChartSymbol] = useState("BTCUSDT");

  const { data, autoTrader, loading, error, lastUpdate, refresh } = useCryptoDashboard(30_000);

  const overview   = data?.overview   ?? EMPTY_OVERVIEW;
  const sentiment  = data?.sentiment_overview ?? EMPTY_SENTIMENT;
  const coins      = data?.coins      ?? [];
  const buys       = data?.buy_candidates  ?? [];
  const sells      = data?.sell_candidates ?? [];
  const news       = data?.news       ?? [];
  const newsSent   = data?.news_sentiment ?? { sentiment: "NEUTRAL", bullish: 0, bearish: 0, neutral: 0, total: 0 };
  const trending   = data?.trending   ?? [];

  const isRunning  = (autoTrader?.running && autoTrader?.enabled) ?? false;

  return (
    <div className="min-h-screen bg-background flex">
      <CryptoSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSwitchPlatform={onSwitchPlatform}
        onLogout={onLogout}
        running={isRunning}
        lastUpdate={lastUpdate}
      />

      {/* pt-14 on mobile for fixed top bar; pb-20 for bottom nav */}
      <div className="flex-1 min-w-0 pt-14 md:pt-0 pb-20 md:pb-0">
        {/* Top bar */}
        <div className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border px-4 py-2 flex items-center justify-between gap-3 md:top-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-orange-400 uppercase">Crypto</span>
            {loading && (
              <span className="text-[10px] text-muted animate-pulse">Refreshing…</span>
            )}
            {error && (
              <span className="text-[10px] text-red">Error: {error}</span>
            )}
            {lastUpdate && !loading && (
              <span className="text-[10px] text-muted hidden sm:inline">
                Updated {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isRunning && (
              <span className="text-[10px] font-bold bg-green/10 text-green border border-green/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
                Auto-Trader ON
              </span>
            )}
            <button
              onClick={refresh}
              className="text-[10px] text-muted hover:text-foreground px-2 py-1 rounded bg-background border border-border transition"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Loading splash */}
        {loading && !data && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center space-y-3">
              <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-black text-foreground">CRYPTO BRAIN</p>
              <p className="text-xs text-muted">Scanning 30 pairs on Binance… ~20 seconds.</p>
            </div>
          </div>
        )}

        {/* Main content */}
        {(data || !loading) && (
          <main className="max-w-[1920px] mx-auto px-4 py-5 space-y-6">
            {/* ── Dashboard ── */}
            {activeTab === "dashboard" && (
              <>
                <CryptoMarketBanner overview={overview} sentiment={sentiment} />
                <CryptoTradeCards buyCandidates={buys} sellCandidates={sells} />
                <CryptoScanner coins={coins} title="Full Crypto Scanner (30 Pairs · 12 Indicators)" />
                <CryptoMacroNews news={news} sentiment={newsSent} trending={trending} />
              </>
            )}

            {/* ── Scanner ── */}
            {activeTab === "scanner" && (
              <>
                <CryptoMarketBanner overview={overview} sentiment={sentiment} />
                <CryptoScanner coins={coins} title="Crypto Scanner" />
              </>
            )}

            {/* ── Chart ── */}
            {activeTab === "chart" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold mb-3">Price Charts</h2>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","ADAUSDT","XRPUSDT",
                      "DOTUSDT","AVAXUSDT","MATICUSDT","LINKUSDT","LTCUSDT","ATOMUSDT"].map((sym) => (
                      <button
                        key={sym}
                        onClick={() => setChartSymbol(sym)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-bold border transition ${
                          chartSymbol === sym
                            ? "bg-orange-500 text-white border-orange-500"
                            : "bg-background text-muted border-border hover:text-foreground hover:border-orange-500/50"
                        }`}
                      >
                        {sym.replace("USDT", "")}
                      </button>
                    ))}
                  </div>
                  <CryptoChart symbol={chartSymbol} interval="1h" height={450} />
                </div>
              </div>
            )}

            {/* ── Portfolio (auto-trader positions) ── */}
            {activeTab === "portfolio" && (
              <div className="space-y-5">
                {autoTrader ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Capital",   value: `$${autoTrader.capital?.toLocaleString()}` },
                      { label: "Cash",      value: `$${autoTrader.cash_available?.toLocaleString()}` },
                      { label: "Today P&L", value: `$${autoTrader.today_pnl?.toFixed(2)}` },
                      { label: "Total P&L", value: `$${autoTrader.total_pnl?.toFixed(2)}` },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-card border border-border rounded-xl p-4">
                        <div className="text-[10px] text-muted uppercase font-bold">{label}</div>
                        <div className="text-xl font-black">{value}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">Auto-trader not running — portfolio is empty.</p>
                )}
                {autoTrader?.positions?.length ? (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-3 py-2 bg-background text-[10px] font-bold text-muted uppercase">Open Positions</div>
                    {autoTrader.positions.map((p) => (
                      <div key={p.symbol} className="border-t border-border/50 px-3 py-2.5 flex items-center gap-4 text-xs">
                        <span className="font-bold w-20">{p.symbol.replace("USDT","")}</span>
                        <span className="text-muted">{p.units?.toFixed(4)} units @ ${p.entry_price}</span>
                        <span className={p.unrealized_pnl >= 0 ? "text-green font-bold" : "text-red font-bold"}>
                          ${p.unrealized_pnl?.toFixed(2)} ({p.unrealized_pnl_pct?.toFixed(1)}%)
                        </span>
                        <span className="ml-auto text-muted">{p.status}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted">
                    No open positions
                  </div>
                )}
              </div>
            )}

            {/* ── Auto-Trader ── */}
            {activeTab === "auto-trader" && <CryptoAutoTraderDashboard />}

            {/* ── News ── */}
            {activeTab === "news" && (
              <CryptoMacroNews news={news} sentiment={newsSent} trending={trending} />
            )}

            {/* ── Strategy Lab ── */}
            {activeTab === "strategy-lab" && <CryptoStrategyLab />}

            {/* ── Investors ── */}
            {activeTab === "investors" && <CryptoInvestorsScreen />}

            <footer className="text-center py-4 border-t border-border">
              <p className="text-[10px] text-muted">Paper trading only. Not financial advice. All crypto trading involves risk.</p>
            </footer>
          </main>
        )}
      </div>
    </div>
  );
}

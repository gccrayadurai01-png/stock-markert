"use client";

import { useState, useEffect } from "react";
import { useDashboard } from "@/hooks/useDashboard";
import type { ScreenTab, Platform } from "@/lib/types";
import Sidebar from "@/components/Sidebar";
import ConfigPanel from "@/components/ConfigPanel";
import MarketOverview from "@/components/MarketOverview";
import VerdictBanner from "@/components/VerdictBanner";
import TradeCards from "@/components/TradeCards";
import StockScanner from "@/components/StockScanner";
import SectorHeatmap from "@/components/SectorHeatmap";
import MacroNews from "@/components/MacroNews";
import EmotionControl from "@/components/EmotionControl";
import GoalTracker from "@/components/GoalTracker";
import ModeScreen from "@/components/ModeScreen";
import PortfolioDashboard from "@/components/PortfolioDashboard";
import NewsAlerts from "@/components/NewsAlerts";
import LoginPage from "@/components/LoginPage";
import AutoTraderDashboard from "@/components/AutoTraderDashboard";
import PlatformSelector from "@/components/PlatformSelector";
import CryptoDashboardScreen from "@/components/CryptoDashboardScreen";
import StockStrategyLab from "@/components/StockStrategyLab";
import { LogOut } from "lucide-react";

export default function Dashboard() {
  const { data, loading, connected, lastUpdate, refresh, updateConfig } = useDashboard();
  const [activeTab, setActiveTab] = useState<ScreenTab>("dashboard");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [platform, setPlatform] = useState<Platform | null>(null);

  useEffect(() => {
    const savedEmail = localStorage.getItem("user_email");
    const savedPlatform = localStorage.getItem("trading_platform") as Platform | null;
    if (savedEmail) {
      setUserEmail(savedEmail);
      setIsLoggedIn(true);
    }
    if (savedPlatform === "stocks" || savedPlatform === "crypto") {
      setPlatform(savedPlatform);
    }
  }, []);

  const handleLoginSuccess = (email: string) => {
    setUserEmail(email);
    setIsLoggedIn(true);
    localStorage.setItem("user_email", email);
    // Don't auto-set platform — let user pick each session (or restore saved)
    const saved = localStorage.getItem("trading_platform") as Platform | null;
    if (saved === "stocks" || saved === "crypto") {
      setPlatform(saved);
    }
  };

  const handleSelectPlatform = (p: Platform) => {
    setPlatform(p);
    localStorage.setItem("trading_platform", p);
  };

  const handleSwitchPlatform = (p: Platform) => {
    setPlatform(p);
    localStorage.setItem("trading_platform", p);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserEmail("");
    setPlatform(null);
    localStorage.removeItem("user_email");
    localStorage.removeItem("trading_platform");
  };

  // ── Not logged in ──
  if (!isLoggedIn) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // ── Platform picker ──
  if (!platform) {
    return (
      <PlatformSelector
        userEmail={userEmail}
        onSelect={handleSelectPlatform}
        onLogout={handleLogout}
      />
    );
  }

  // ── Crypto platform ──
  if (platform === "crypto") {
    return (
      <CryptoDashboardScreen
        onSwitchPlatform={handleSwitchPlatform}
        onLogout={handleLogout}
      />
    );
  }

  // ── Stocks platform ──
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <div>
            <p className="text-foreground font-black text-lg">TRADING BRAIN</p>
            <p className="text-sm text-muted mt-1">Running 12 indicators on 30 stocks... ~60 seconds.</p>
          </div>
        </div>
      </div>
    );
  }

  const market = data?.market_overview ?? {
    nifty_50: 0, nifty_50_change: 0, nifty_50_high: 0, nifty_50_low: 0,
    sensex: 0, sensex_change: 0, bank_nifty: 0, bank_nifty_change: 0,
    india_vix: 0, market_status: "CLOSED" as const,
  };

  const emptyPnl = { date: "", total_invested: 0, realized_pnl: 0, closed_trades: [], open_positions: [], trade_count: 0 };
  const emptyProjection = { days: 0, months: 0, years: 0, daily_target_rupees: 0, weekly_target_rupees: 0, achievable: false };

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        connected={connected}
        onSwitchPlatform={() => handleSwitchPlatform("crypto")}
        onLogout={handleLogout}
      />

      <div className="flex-1 min-w-0 pt-14 md:pt-0 pb-20 md:pb-0">
        <ConfigPanel
          capital={data?.user_capital ?? 100000}
          riskPercent={data?.risk_per_trade ?? 1}
          maxTrades={data?.max_trades ?? 3}
          tradingMode={data?.trading_mode ?? "intraday"}
          marketStatus={market.market_status}
          connected={connected}
          lastUpdate={lastUpdate}
          onConfigUpdate={updateConfig}
          onRefresh={refresh}
        />

        <main className="max-w-[1920px] mx-auto px-4 py-5 space-y-6">
          {activeTab === "dashboard" && (
            <>
              <MarketOverview data={market} keyLevels={data?.key_levels ?? {}} bias={data?.market_verdict ?? "NEUTRAL"} />
              <VerdictBanner
                verdict={data?.market_verdict ?? "NEUTRAL"}
                reason={data?.verdict_reason ?? "Analyzing..."}
                actionPlan={data?.action_plan ?? ""}
                preMarketPlan={data?.pre_market_plan ?? ""}
                first30MinPlan={data?.first_30_min_plan ?? ""}
              />
              <GoalTracker
                capital={data?.user_capital ?? 100000}
                goal={data?.goal ?? {}}
                projection={data?.goal_projection ?? emptyProjection}
                todayPnl={data?.today_pnl ?? emptyPnl}
              />
              <TradeCards trades={data?.recommended_trades ?? []} capital={data?.user_capital ?? 100000} />
              <StockScanner stocks={data?.all_stocks ?? []} title="Stock Scanner (12 Indicators)" />

              {((data?.avoid_stocks?.length ?? 0) > 0 || (data?.exit_signals?.length ?? 0) > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(data?.avoid_stocks?.length ?? 0) > 0 && (
                    <div className="bg-red/5 rounded-xl border border-red/20 p-4">
                      <h3 className="text-sm font-bold text-red mb-2">AVOID THESE STOCKS</h3>
                      {data!.avoid_stocks.map((s, i) => (
                        <div key={i} className="flex items-start gap-2 mb-2 last:mb-0">
                          <span className="text-red text-xs font-bold">✕</span>
                          <div>
                            <span className="text-xs font-semibold">{s.symbol.replace(".NS", "")}</span>
                            <span className="text-xs text-muted ml-2">{s.reason}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(data?.exit_signals?.length ?? 0) > 0 && (
                    <div className="bg-yellow/5 rounded-xl border border-yellow/20 p-4">
                      <h3 className="text-sm font-bold text-yellow mb-2">EXIT NOW</h3>
                      {data!.exit_signals.map((s, i) => (
                        <div key={i} className="flex items-start gap-2 mb-2 last:mb-0">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.urgency === "HIGH" ? "bg-red/10 text-red" : "bg-yellow/10 text-yellow"}`}>
                            {s.urgency}
                          </span>
                          <div>
                            <span className="text-xs font-semibold">{s.symbol.replace(".NS", "")}</span>
                            <span className="text-xs text-muted ml-2">{s.reason}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
          )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <SectorHeatmap sectors={data?.sectors ?? []} />
                  <MacroNews
                    macroEvents={data?.macro_impact ?? []}
                    news={data?.news ?? []}
                    sentiment={data?.news_sentiment ?? { sentiment: "NEUTRAL", bullish: 0, bearish: 0, neutral: 0, total: 0 }}
                  />
                </div>
                <EmotionControl warnings={data?.emotion_warnings ?? []} />
              </div>
            </>
          )}

          {(activeTab === "intraday" || activeTab === "swing" || activeTab === "positional" || activeTab === "options") && data && (
            <ModeScreen mode={activeTab} data={data} onConfigUpdate={updateConfig} />
          )}

          {activeTab === "portfolio" && (
            <PortfolioDashboard
              capital={data?.user_capital ?? 100000}
              todayPnl={data?.today_pnl ?? emptyPnl}
              goal={data?.goal ?? {}}
              projection={data?.goal_projection ?? emptyProjection}
            />
          )}

          {activeTab === "auto-trader" && <AutoTraderDashboard />}

          {activeTab === "strategy-lab" && <StockStrategyLab />}

          {activeTab === "news" && (
            <NewsAlerts
              news={data?.news ?? []}
              sentiment={data?.news_sentiment ?? { sentiment: "NEUTRAL", bullish: 0, bearish: 0, neutral: 0, total: 0 }}
              macroEvents={data?.macro_impact ?? []}
              stocks={data?.all_stocks ?? []}
              newsTrades={data?.news_trades ?? []}
            />
          )}

          <footer className="text-center py-4 border-t border-border">
            <p className="text-[10px] text-muted">Personal use only. Not financial advice. All trading involves risk.</p>
          </footer>
        </main>
      </div>
    </div>
  );
}

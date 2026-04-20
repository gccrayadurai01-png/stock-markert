"use client";

import { useState, useEffect } from "react";
import type { ForexDashboardData } from "@/lib/types";
import { ArrowLeftRight, LogOut, RefreshCw } from "lucide-react";

interface Props {
  onSwitchPlatform?: (platform: "stocks" | "crypto") => void;
  onLogout?: () => void;
}

export default function ForexDashboardScreen({ onSwitchPlatform, onLogout }: Props) {
  const [data, setData] = useState<ForexDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "candidates" | "news">("overview");
  const [autoTraderEnabled, setAutoTraderEnabled] = useState(false);

  useEffect(() => {
    fetchForexData();
    const interval = setInterval(fetchForexData, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const fetchForexData = async () => {
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${API}/api/forex/dashboard`);
      if (response.ok) {
        const json = await response.json();
        setData(json);
      }
    } catch (error) {
      console.error("Failed to fetch forex data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <div>
            <p className="text-foreground font-black text-lg">FOREX BRAIN</p>
            <p className="text-sm text-muted mt-1">Scanning 28 forex pairs... ~30 seconds.</p>
          </div>
        </div>
      </div>
    );
  }

  const overview = data.overview;
  const sentiment = data.sentiment_overview;

  return (
    <div className="min-h-screen bg-background">
      {/* ── TOP BAR ── */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-card border-b border-border px-4 py-3 flex items-center justify-between md:hidden">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-white font-black text-[10px]">
            FX
          </div>
          <span className="text-sm font-black text-foreground">FOREX <span className="text-accent">BRAIN</span></span>
        </div>
        <div className="flex items-center gap-2">
          {onSwitchPlatform && (
            <button
              onClick={() => onSwitchPlatform("stocks")}
              className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1"
            >
              <ArrowLeftRight className="w-3 h-3" />
              Stocks
            </button>
          )}
          <button
            onClick={onLogout}
            className="text-foreground p-2 rounded-lg bg-white/5 font-bold text-lg leading-none"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── DESKTOP HEADER ── */}
      <div className="hidden md:flex items-center justify-between px-6 py-4 bg-card border-b border-border sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center text-white font-black text-xs">
            FX
          </div>
          <div>
            <h1 className="text-lg font-black text-foreground">FOREX BRAIN</h1>
            <p className="text-xs text-muted">28 Pairs · Real-time Analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setAutoTraderEnabled(!autoTraderEnabled);
            }}
            className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition ${
              autoTraderEnabled
                ? "bg-green/20 text-green border border-green/50"
                : "bg-white/5 text-muted border border-border hover:text-foreground"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoTraderEnabled ? "bg-green animate-pulse" : "bg-gray-500"}`} />
            {autoTraderEnabled ? "Auto-Trader ON" : "Auto-Trader OFF"}
          </button>
          <button
            onClick={fetchForexData}
            className="px-4 py-2 rounded-lg bg-white/5 text-muted hover:text-foreground border border-border transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {onSwitchPlatform && (
            <button
              onClick={() => onSwitchPlatform("stocks")}
              className="px-4 py-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/30 font-semibold text-sm flex items-center gap-2 hover:bg-blue-500/20 transition"
            >
              <ArrowLeftRight className="w-4 h-4" />
              Switch to Stocks
            </button>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="px-4 py-2 rounded-lg bg-red/10 text-red border border-red/30 font-semibold text-sm flex items-center gap-2 hover:bg-red/20 transition"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 pb-24 md:pb-6 pt-20 md:pt-6">
        {/* Market Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted mb-1">EUR/USD</p>
            <p className="text-2xl font-black text-foreground">{overview.eurusd_price.toFixed(5)}</p>
            <p className={`text-xs font-bold ${overview.eurusd_change_1h >= 0 ? "text-green" : "text-red"}`}>
              {overview.eurusd_change_1h >= 0 ? "+" : ""}{overview.eurusd_change_1h.toFixed(2)}%
            </p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted mb-1">GBP/USD</p>
            <p className="text-2xl font-black text-foreground">{overview.gbpusd_price.toFixed(5)}</p>
            <p className={`text-xs font-bold ${overview.gbpusd_change_1h >= 0 ? "text-green" : "text-red"}`}>
              {overview.gbpusd_change_1h >= 0 ? "+" : ""}{overview.gbpusd_change_1h.toFixed(2)}%
            </p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted mb-1">USD/JPY</p>
            <p className="text-2xl font-black text-foreground">{overview.usdjpy_price.toFixed(2)}</p>
            <p className={`text-xs font-bold ${overview.usdjpy_change_1h >= 0 ? "text-green" : "text-red"}`}>
              {overview.usdjpy_change_1h >= 0 ? "+" : ""}{overview.usdjpy_change_1h.toFixed(2)}%
            </p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted mb-1">AUD/USD</p>
            <p className="text-2xl font-black text-foreground">{overview.audusd_price.toFixed(5)}</p>
            <p className={`text-xs font-bold ${overview.audusd_change_1h >= 0 ? "text-green" : "text-red"}`}>
              {overview.audusd_change_1h >= 0 ? "+" : ""}{overview.audusd_change_1h.toFixed(2)}%
            </p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted mb-1">Volatility</p>
            <p className="text-2xl font-black text-accent">{sentiment.volatility}</p>
            <p className="text-xs text-muted">Market Risk</p>
          </div>
        </div>

        {/* Sentiment & Analysis */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-black text-foreground mb-4">Market Sentiment</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-muted mb-2">Market Bias</p>
              <p className="text-2xl font-black text-accent">{sentiment.market_bias}</p>
              <p className="text-xs text-muted mt-1">Risk Sentiment: {sentiment.risk_sentiment}</p>
            </div>
            <div>
              <p className="text-sm text-muted mb-2">USD Strength</p>
              <p className="text-2xl font-black text-foreground">{(sentiment.usd_strength * 100).toFixed(0)}%</p>
              <p className="text-xs text-muted mt-1">Commodity: {sentiment.commodity_correlation}</p>
            </div>
            <div>
              <p className="text-sm text-muted mb-2">Economic Events</p>
              <p className="text-2xl font-black text-orange-400">{sentiment.economic_events_today}</p>
              <p className="text-xs text-muted mt-1">Today · {sentiment.economic_events_this_week} This Week</p>
              {sentiment.central_bank_alert && (
                <p className="text-xs text-red font-bold mt-2">⚠️ Central Bank Alert</p>
              )}
            </div>
          </div>
        </div>

        {/* Buy & Sell Candidates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Buy Candidates */}
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-lg font-black text-green mb-4">🟢 BUY Candidates</h3>
            <div className="space-y-3">
              {data.buy_candidates.slice(0, 5).map((pair, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-green/5 rounded-lg border border-green/20">
                  <div>
                    <p className="font-bold text-foreground">{pair.name}</p>
                    <p className="text-xs text-muted">Score: {pair.score}/100</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-foreground">{pair.price.toFixed(5)}</p>
                    <p className="text-xs text-green font-bold">+{pair.change_1h_pct.toFixed(2)}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sell Candidates */}
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-lg font-black text-red mb-4">🔴 SELL Candidates</h3>
            <div className="space-y-3">
              {data.sell_candidates.slice(0, 5).map((pair, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-red/5 rounded-lg border border-red/20">
                  <div>
                    <p className="font-bold text-foreground">{pair.name}</p>
                    <p className="text-xs text-muted">Score: {pair.score}/100</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-foreground">{pair.price.toFixed(5)}</p>
                    <p className="text-xs text-red font-bold">{pair.change_1h_pct.toFixed(2)}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Economic Calendar Preview */}
        {data.economic_calendar && data.economic_calendar.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-lg font-black text-yellow mb-4">📅 Economic Calendar</h3>
            <div className="space-y-2">
              {data.economic_calendar.slice(0, 5).map((event, i) => (
                <div key={i} className="flex items-start justify-between p-3 bg-yellow/5 rounded-lg border border-yellow/20">
                  <div>
                    <p className="font-semibold text-foreground text-sm">{event.headline}</p>
                    <p className="text-xs text-muted">{event.event_type} · {event.impact} Impact</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded ${
                    event.impact === "HIGH" ? "bg-red/20 text-red" : event.impact === "MEDIUM" ? "bg-yellow/20 text-yellow" : "bg-green/20 text-green"
                  }`}>
                    {event.impact}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* News Section */}
        {data.news && data.news.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-6">
            <h3 className="text-lg font-black text-foreground mb-4">📰 Forex News</h3>
            <div className="space-y-3">
              {data.news.slice(0, 6).map((news, i) => (
                <div key={i} className="p-3 bg-white/5 rounded-lg border border-border hover:border-accent/50 transition cursor-pointer">
                  <p className="text-sm font-semibold text-foreground line-clamp-2">{news.headline}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-muted">{news.source}</p>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded ${
                      news.sentiment === "BULLISH" ? "bg-green/20 text-green" : news.sentiment === "BEARISH" ? "bg-red/20 text-red" : "bg-gray-500/20 text-gray-400"
                    }`}>
                      {news.sentiment}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <footer className="text-center py-4 border-t border-border">
          <p className="text-[10px] text-muted">Forex trading involves high risk. Not financial advice. Demo mode.</p>
        </footer>
      </main>
    </div>
  );
}

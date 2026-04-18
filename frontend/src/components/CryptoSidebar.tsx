"use client";

import { useState } from "react";
import type { CryptoScreenTab, Platform } from "@/lib/types";
import { ArrowLeftRight, LogOut } from "lucide-react";

interface Props {
  activeTab: CryptoScreenTab;
  onTabChange: (tab: CryptoScreenTab) => void;
  onSwitchPlatform: (p: Platform) => void;
  onLogout: () => void;
  running: boolean;            // auto-trader running
  lastUpdate: Date | null;
}

const TABS: { id: CryptoScreenTab; label: string; icon: string }[] = [
  { id: "dashboard",    label: "Dashboard",    icon: "🪙" },
  { id: "scanner",      label: "Scanner",      icon: "🔎" },
  { id: "chart",        label: "Chart",        icon: "📈" },
  { id: "portfolio",    label: "Portfolio",    icon: "💼" },
  { id: "auto-trader",  label: "Auto Trader",  icon: "🤖" },
  { id: "strategy-lab", label: "Strategy Lab", icon: "🔬" },
  { id: "news",         label: "News",         icon: "📰" },
  { id: "investors",    label: "Investors",    icon: "🧠" },
];

export default function CryptoSidebar({ activeTab, onTabChange, onSwitchPlatform, onLogout, running, lastUpdate }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const LogoBlock = (
    <div className="flex items-center gap-2">
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-black text-xs">
        ₿
      </div>
      <div>
        <h1 className="text-sm font-black text-foreground leading-tight">CRYPTO</h1>
        <h1 className="text-sm font-black text-orange-400 leading-tight">BRAIN</h1>
      </div>
    </div>
  );

  return (
    <>
      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="hidden md:flex w-48 shrink-0 bg-card border-r border-border min-h-screen sticky top-0 flex-col">
        <div className="px-4 py-4 border-b border-border">
          {LogoBlock}
          <div className="flex items-center gap-1.5 mt-2">
            <div className={`w-1.5 h-1.5 rounded-full ${running ? "bg-green animate-pulse" : "bg-muted"}`} />
            <span className="text-[10px] text-muted">{running ? "Trader ON" : "Trader OFF"}</span>
          </div>
          {lastUpdate && (
            <div className="text-[9px] text-muted mt-0.5">
              {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>

        <nav className="flex-1 py-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all ${
                activeTab === tab.id
                  ? "bg-orange-500/10 border-r-2 border-orange-500 text-foreground"
                  : "text-muted hover:text-foreground hover:bg-white/5"
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              <span className="text-xs font-semibold">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-border space-y-2">
          <button
            onClick={() => onSwitchPlatform("stocks")}
            className="w-full flex items-center justify-center gap-2 text-[11px] font-semibold bg-slate-700/40 hover:bg-slate-700/70 text-foreground rounded-lg py-2 transition"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Switch to Stocks
          </button>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 text-[10px] text-muted hover:text-foreground rounded-lg py-1.5 transition"
          >
            <LogOut className="w-3 h-3" />
            Logout
          </button>
          <p className="text-[9px] text-muted text-center pt-1">Paper trading. 24/7. Not advice.</p>
        </div>
      </aside>

      {/* ── MOBILE TOP BAR ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-black text-[10px]">
            ₿
          </div>
          <span className="text-sm font-black text-foreground">CRYPTO <span className="text-orange-400">BRAIN</span></span>
          <div className={`w-1.5 h-1.5 rounded-full ml-1 ${running ? "bg-green animate-pulse" : "bg-muted"}`} />
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-foreground p-2 rounded-lg bg-white/5 font-bold text-lg leading-none"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* ── MOBILE DRAWER ── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)}>
          <div
            className="absolute left-0 top-0 bottom-0 w-64 bg-card border-r border-border pt-16 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="flex-1 py-2 overflow-y-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { onTabChange(tab.id); setMobileOpen(false); }}
                  className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-all ${
                    activeTab === tab.id
                      ? "bg-orange-500/10 border-l-4 border-orange-500 text-foreground"
                      : "text-muted hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  <span className="text-xl">{tab.icon}</span>
                  <span className="text-sm font-semibold">{tab.label}</span>
                  {tab.id === "auto-trader" && running && (
                    <span className="ml-auto text-[9px] bg-green/20 text-green px-1.5 py-0.5 rounded-full font-bold">LIVE</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="px-3 py-3 border-t border-border space-y-2">
              <button
                onClick={() => { onSwitchPlatform("stocks"); setMobileOpen(false); }}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold bg-slate-700/40 text-foreground rounded-lg py-2"
              >
                <ArrowLeftRight className="w-4 h-4" />
                Switch to Stocks
              </button>
              <button
                onClick={() => { onLogout(); setMobileOpen(false); }}
                className="w-full flex items-center justify-center gap-2 text-xs text-muted rounded-lg py-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MOBILE BOTTOM NAV ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex">
        {TABS.slice(0, 5).map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-all ${
              activeTab === tab.id ? "text-orange-400" : "text-muted"
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="text-[8px] font-semibold">{tab.label.substring(0, 5)}</span>
          </button>
        ))}
        <button
          onClick={() => setMobileOpen(true)}
          className={`flex-1 flex flex-col items-center py-2 gap-0.5 ${mobileOpen ? "text-orange-400" : "text-muted"}`}
        >
          <span className="text-lg">⋯</span>
          <span className="text-[8px] font-semibold">More</span>
        </button>
      </div>
    </>
  );
}

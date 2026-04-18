"use client";

import { useState } from "react";
import type { ScreenTab } from "@/lib/types";
import { ArrowLeftRight, LogOut } from "lucide-react";

interface Props {
  activeTab: ScreenTab;
  onTabChange: (tab: ScreenTab) => void;
  connected: boolean;
  onSwitchPlatform?: () => void;
  onLogout?: () => void;
}

const TABS: { id: ScreenTab; label: string; icon: string }[] = [
  { id: "dashboard",   label: "Dashboard",   icon: "📊" },
  { id: "intraday",    label: "Intraday",    icon: "⚡" },
  { id: "swing",       label: "Swing",       icon: "🔄" },
  { id: "positional",  label: "Positional",  icon: "🏗️" },
  { id: "options",     label: "Options",     icon: "🎯" },
  { id: "portfolio",   label: "Portfolio",   icon: "💰" },
  { id: "news",        label: "News",        icon: "📰" },
  { id: "auto-trader", label: "Auto Trader", icon: "🤖" },
  { id: "strategy-lab", label: "Strategy Lab", icon: "🔬" },
];

export default function Sidebar({ activeTab, onTabChange, connected, onSwitchPlatform, onLogout }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="hidden md:flex w-48 shrink-0 bg-card border-r border-border min-h-screen sticky top-0 flex-col">
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center text-white font-black text-xs">
              AI
            </div>
            <div>
              <h1 className="text-sm font-black text-foreground leading-tight">TRADING</h1>
              <h1 className="text-sm font-black text-accent leading-tight">BRAIN</h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green animate-pulse" : "bg-red"}`} />
            <span className="text-[10px] text-muted">{connected ? "Connected" : "Offline"}</span>
          </div>
        </div>

        <nav className="flex-1 py-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all ${
                activeTab === tab.id
                  ? "bg-accent/10 border-r-2 border-accent text-foreground"
                  : "text-muted hover:text-foreground hover:bg-white/5"
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              <span className="text-xs font-semibold">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-border space-y-2">
          {onSwitchPlatform && (
            <button
              onClick={onSwitchPlatform}
              className="w-full flex items-center justify-center gap-2 text-[11px] font-semibold bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg py-2 transition"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Switch to Crypto
            </button>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 text-[10px] text-muted hover:text-foreground rounded-lg py-1.5 transition"
            >
              <LogOut className="w-3 h-3" />
              Logout
            </button>
          )}
          <p className="text-[9px] text-muted text-center pt-0.5">Jhunjhunwala Mode · Not advice</p>
        </div>
      </aside>

      {/* ── MOBILE TOP BAR ── */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-white font-black text-[10px]">
            AI
          </div>
          <span className="text-sm font-black text-foreground">TRADING <span className="text-accent">BRAIN</span></span>
          <div className={`w-1.5 h-1.5 rounded-full ml-1 ${connected ? "bg-green animate-pulse" : "bg-red"}`} />
        </div>
        <div className="flex items-center gap-2">
          {onSwitchPlatform && (
            <button
              onClick={onSwitchPlatform}
              className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/30 flex items-center gap-1"
            >
              <ArrowLeftRight className="w-3 h-3" />
              Crypto
            </button>
          )}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-foreground p-2 rounded-lg bg-white/5 font-bold text-lg leading-none"
          >
            {mobileOpen ? "✕" : "☰"}
          </button>
        </div>
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
                      ? "bg-accent/10 border-l-4 border-accent text-foreground"
                      : "text-muted hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  <span className="text-xl">{tab.icon}</span>
                  <span className="text-sm font-semibold">{tab.label}</span>
                  {tab.id === "auto-trader" && (
                    <span className="ml-auto text-[9px] bg-green/20 text-green px-1.5 py-0.5 rounded-full font-bold">AUTO</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="px-3 py-3 border-t border-border space-y-2">
              {onSwitchPlatform && (
                <button
                  onClick={() => { onSwitchPlatform(); setMobileOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded-lg py-2"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  Switch to Crypto
                </button>
              )}
              {onLogout && (
                <button
                  onClick={() => { onLogout(); setMobileOpen(false); }}
                  className="w-full flex items-center justify-center gap-2 text-xs text-muted rounded-lg py-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Logout
                </button>
              )}
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
              activeTab === tab.id ? "text-accent" : "text-muted"
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="text-[8px] font-semibold">{tab.label.substring(0, 5)}</span>
          </button>
        ))}
        <button
          onClick={() => setMobileOpen(true)}
          className={`flex-1 flex flex-col items-center py-2 gap-0.5 ${mobileOpen ? "text-accent" : "text-muted"}`}
        >
          <span className="text-lg">⋯</span>
          <span className="text-[8px] font-semibold">More</span>
        </button>
      </div>
    </>
  );
}

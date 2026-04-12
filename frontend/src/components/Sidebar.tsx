"use client";

import type { ScreenTab } from "@/lib/types";

interface Props {
  activeTab: ScreenTab;
  onTabChange: (tab: ScreenTab) => void;
  connected: boolean;
}

const TABS: { id: ScreenTab; label: string; icon: string; color: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊", color: "text-accent" },
  { id: "intraday", label: "Intraday", icon: "⚡", color: "text-yellow" },
  { id: "swing", label: "Swing", icon: "🔄", color: "text-green" },
  { id: "positional", label: "Positional", icon: "🏗️", color: "text-accent" },
  { id: "options", label: "Options", icon: "🎯", color: "text-red" },
  { id: "portfolio", label: "Portfolio", icon: "💰", color: "text-green" },
  { id: "news", label: "News", icon: "📰", color: "text-yellow" },
];

export default function Sidebar({ activeTab, onTabChange, connected }: Props) {
  return (
    <aside className="w-48 shrink-0 bg-card border-r border-border min-h-screen sticky top-0 flex flex-col">
      {/* Logo */}
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
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green animate-pulse-green" : "bg-red"}`} />
          <span className="text-[10px] text-muted">{connected ? "Connected" : "Offline"}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all ${
              activeTab === tab.id
                ? "bg-accent/10 border-r-2 border-accent text-foreground"
                : "text-muted hover:text-foreground hover:bg-card-hover"
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            <span className="text-xs font-semibold">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <p className="text-[9px] text-muted text-center">Jhunjhunwala Mode</p>
        <p className="text-[9px] text-muted text-center mt-0.5">Not financial advice</p>
      </div>
    </aside>
  );
}

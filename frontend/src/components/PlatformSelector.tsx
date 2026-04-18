"use client";

import { TrendingUp, Bitcoin, ArrowRight, Activity, Clock, Globe, Zap } from "lucide-react";
import type { Platform } from "@/lib/types";

interface PlatformSelectorProps {
  userEmail: string;
  onSelect: (platform: Platform) => void;
  onLogout: () => void;
}

export default function PlatformSelector({ userEmail, onSelect, onLogout }: PlatformSelectorProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      <header className="flex items-center justify-between p-4 md:p-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-green-400" />
          <span className="text-white font-black text-lg">TRADING BRAIN</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 hidden sm:inline">{userEmail}</span>
          <button
            onClick={onLogout}
            className="text-xs text-gray-400 hover:text-white border border-slate-700 px-3 py-1.5 rounded-lg transition"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-8 md:mb-12">
            <h1 className="text-3xl md:text-5xl font-black text-white mb-3">Choose your arena</h1>
            <p className="text-gray-400 text-sm md:text-base">
              Separate engines, separate portfolios, separate strategies — pick what you want to trade today.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Stocks card */}
            <button
              onClick={() => onSelect("stocks")}
              className="group relative bg-slate-800/60 hover:bg-slate-800 border-2 border-slate-700 hover:border-green-500/60 rounded-2xl p-6 md:p-8 text-left transition-all overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative space-y-5">
                <div className="flex items-center justify-between">
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                    <TrendingUp className="w-7 h-7 text-green-400" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-500 group-hover:text-green-400 group-hover:translate-x-1 transition" />
                </div>

                <div>
                  <h2 className="text-2xl font-black text-white mb-1">NSE Stocks</h2>
                  <p className="text-sm text-gray-400">Indian equities — 30 blue chips, intraday + swing + positional.</p>
                </div>

                <ul className="space-y-2 text-xs text-gray-300">
                  <li className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-green-400" />
                    12 indicators · 5 strategies · SMC/ICT
                  </li>
                  <li className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-green-400" />
                    Market hours: 9:15 – 15:30 IST
                  </li>
                  <li className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-green-400" />
                    5 legendary investors · FII/DII flows · news
                  </li>
                </ul>

                <div className="pt-3 border-t border-slate-700/60 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Capital: ₹ INR</span>
                  <span className="text-xs font-bold text-green-400 group-hover:text-green-300">Enter →</span>
                </div>
              </div>
            </button>

            {/* Crypto card */}
            <button
              onClick={() => onSelect("crypto")}
              className="group relative bg-slate-800/60 hover:bg-slate-800 border-2 border-slate-700 hover:border-orange-500/60 rounded-2xl p-6 md:p-8 text-left transition-all overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="relative space-y-5">
                <div className="flex items-center justify-between">
                  <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                    <Bitcoin className="w-7 h-7 text-orange-400" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-500 group-hover:text-orange-400 group-hover:translate-x-1 transition" />
                </div>

                <div>
                  <h2 className="text-2xl font-black text-white mb-1">Crypto</h2>
                  <p className="text-sm text-gray-400">30 USDT pairs on Binance — 24/7 auto-trader with 6 strategies.</p>
                </div>

                <ul className="space-y-2 text-xs text-gray-300">
                  <li className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-orange-400" />
                    12 indicators · 6 strategies · SMC/ICT · Sentiment Edge
                  </li>
                  <li className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-orange-400" />
                    24/7 market · Fear &amp; Greed · funding rates
                  </li>
                  <li className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-orange-400" />
                    8 crypto investors: Saylor, Pal, Hayes, Woo, PlanB…
                  </li>
                </ul>

                <div className="pt-3 border-t border-slate-700/60 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Capital: $ USDT</span>
                  <span className="text-xs font-bold text-orange-400 group-hover:text-orange-300">Enter →</span>
                </div>
              </div>
            </button>
          </div>

          <p className="text-center text-xs text-gray-500 mt-8">
            You can switch arenas anytime from the sidebar. Portfolios stay isolated.
          </p>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import type { CryptoInvestorAnalysis } from "@/lib/types";
import InvestorSwitcher from "./InvestorSwitcher";
import { shortSymbol } from "@/lib/cryptoFormat";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const UNIVERSE = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "ADAUSDT",
  "XRPUSDT", "DOTUSDT", "AVAXUSDT", "MATICUSDT", "LINKUSDT",
  "LTCUSDT", "ATOMUSDT", "NEARUSDT", "ARBUSDT", "OPUSDT",
];

const INVESTORS = [
  { name: "Michael Saylor",  role: "MicroStrategy CEO — conviction bitcoin holder" },
  { name: "Raoul Pal",       role: "Real Vision CEO — macro & altcoin thesis" },
  { name: "Arthur Hayes",    role: "BitMEX founder — liquidity & macro plays" },
  { name: "Willy Woo",       role: "On-chain analyst — data-driven signals" },
  { name: "PlanB",           role: "Stock-to-Flow model creator" },
  { name: "Cathie Wood",     role: "ARK Invest — disruptive tech & ETF flows" },
  { name: "Vitalik Buterin", role: "Ethereum co-founder — ETH & L2 ecosystem" },
  { name: "CZ Binance",      role: "Exchange volume & BSC ecosystem lens" },
];

export default function CryptoInvestorsScreen() {
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [analysis, setAnalysis] = useState<CryptoInvestorAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/api/crypto/coin/${encodeURIComponent(sym)}/investors`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: CryptoInvestorAnalysis = await r.json();
      setAnalysis(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  function handleSelect(sym: string) {
    setSelectedSymbol(sym);
    fetchAnalysis(sym);
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-bold mb-1">Crypto Investor Perspectives</h2>
        <p className="text-xs text-muted">
          See how 8 legendary crypto investors — Saylor, Pal, Hayes, Woo, PlanB, Wood, Vitalik, CZ — would view any coin.
        </p>
      </div>

      {/* Investor bios */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {INVESTORS.map((inv) => (
          <div key={inv.name} className="bg-card border border-border rounded-xl p-3">
            <div className="text-xs font-black text-orange-400">{inv.name}</div>
            <div className="text-[10px] text-muted mt-0.5 leading-snug">{inv.role}</div>
          </div>
        ))}
      </div>

      {/* Coin selector */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-bold mb-3">Select a coin to analyze</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {UNIVERSE.map((sym) => (
            <button
              key={sym}
              onClick={() => handleSelect(sym)}
              className={`text-xs px-3 py-1.5 rounded-lg font-bold border transition ${
                selectedSymbol === sym
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-background text-muted border-border hover:text-foreground hover:border-orange-500/50"
              }`}
            >
              {shortSymbol(sym)}
            </button>
          ))}
        </div>

        <button
          onClick={() => fetchAnalysis(selectedSymbol)}
          disabled={loading}
          className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-black text-sm rounded-xl transition"
        >
          {loading ? "Analyzing…" : `🧠 Analyze ${shortSymbol(selectedSymbol)}`}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red/10 border border-red/30 rounded-xl p-4 text-sm text-red">{error}</div>
      )}

      {/* Results */}
      {analysis && !loading && (
        <div className="bg-card border border-orange-500/30 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-base font-black">
              {shortSymbol(analysis.symbol)} — Investor Consensus
            </h3>
            {analysis.consensus && (
              <>
                <span className="text-[10px] font-bold bg-green/10 text-green px-2 py-0.5 rounded border border-green/20">
                  {analysis.consensus.bullish_count} Bullish
                </span>
                <span className="text-[10px] font-bold bg-red/10 text-red px-2 py-0.5 rounded border border-red/20">
                  {analysis.consensus.bearish_count} Bearish
                </span>
                <span className="text-[10px] font-bold bg-muted/10 text-muted px-2 py-0.5 rounded">
                  {analysis.consensus.neutral_count} Neutral
                </span>
                <span className="text-[10px] font-semibold text-muted">
                  Avg conf {analysis.consensus.avg_confidence?.toFixed(0)}%
                </span>
              </>
            )}
          </div>

          {analysis.consensus?.key_insight && (
            <div className="bg-orange-500/10 border-l-2 border-orange-500/60 rounded-r-lg px-3 py-2">
              <p className="text-sm text-foreground leading-relaxed">
                <span className="font-black text-orange-400">Key Insight: </span>
                {analysis.consensus.key_insight}
              </p>
            </div>
          )}

          <InvestorSwitcher
            perspectives={analysis.investor_perspectives}
            consensus={analysis.consensus}
          />
        </div>
      )}
    </section>
  );
}

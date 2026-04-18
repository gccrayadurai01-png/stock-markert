"use client";

import type { CryptoMarketOverview, CryptoSentimentOverview } from "@/lib/types";
import { fmtUSD, fmtPct, fmtLargeUSD, changeColor } from "@/lib/cryptoFormat";

interface Props {
  overview: CryptoMarketOverview;
  sentiment: CryptoSentimentOverview;
}

function fearGreedColor(v: number | null): string {
  if (v == null) return "text-muted";
  if (v <= 25) return "text-red-400";
  if (v <= 45) return "text-orange-400";
  if (v <= 55) return "text-yellow-400";
  if (v <= 75) return "text-lime-400";
  return "text-green-400";
}

function altseasonBadge(a: string): { label: string; cls: string } {
  switch (a) {
    case "ACTIVE":      return { label: "ALTSEASON ON",  cls: "bg-purple-500/15 text-purple-300 border-purple-500/40" };
    case "APPROACHING": return { label: "ALT ROTATION",  cls: "bg-blue-500/15 text-blue-300 border-blue-500/40" };
    default:            return { label: "BTC LEADING",   cls: "bg-orange-500/15 text-orange-300 border-orange-500/40" };
  }
}

export default function CryptoMarketBanner({ overview, sentiment }: Props) {
  const fg = sentiment.fear_greed_value;
  const alt = altseasonBadge(sentiment.altseason);

  return (
    <section className="bg-card rounded-xl border border-border p-4 md:p-5">
      {/* Top row — global counters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🌐</span>
          <h2 className="text-sm font-black tracking-wider text-foreground uppercase">Crypto Market</h2>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${alt.cls}`}>
          {alt.label}
        </span>
        <span className="text-[10px] font-bold bg-green/10 text-green px-2 py-0.5 rounded-full border border-green/20">
          24/7 OPEN
        </span>
        <span className="text-[10px] text-muted ml-auto">
          Total cap {fmtLargeUSD(overview.total_market_cap_usd)} · 24h vol {fmtLargeUSD(overview.total_volume_24h_usd)}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {/* BTC */}
        <div className="bg-background rounded-lg p-3">
          <div className="text-[10px] text-muted uppercase font-bold">Bitcoin</div>
          <div className="text-base font-black text-foreground">{fmtUSD(overview.btc_price)}</div>
          <div className={`text-[11px] font-bold ${changeColor(overview.btc_change_24h)}`}>
            {fmtPct(overview.btc_change_24h)}
          </div>
        </div>

        {/* ETH */}
        <div className="bg-background rounded-lg p-3">
          <div className="text-[10px] text-muted uppercase font-bold">Ethereum</div>
          <div className="text-base font-black text-foreground">{fmtUSD(overview.eth_price)}</div>
          <div className={`text-[11px] font-bold ${changeColor(overview.eth_change_24h)}`}>
            {fmtPct(overview.eth_change_24h)}
          </div>
        </div>

        {/* BTC dominance */}
        <div className="bg-background rounded-lg p-3">
          <div className="text-[10px] text-muted uppercase font-bold">BTC Dominance</div>
          <div className="text-base font-black text-foreground">{overview.btc_dominance?.toFixed(1)}%</div>
          <div className="text-[10px] text-muted">ETH {overview.eth_dominance?.toFixed(1)}%</div>
        </div>

        {/* Fear & Greed */}
        <div className="bg-background rounded-lg p-3">
          <div className="text-[10px] text-muted uppercase font-bold">Fear &amp; Greed</div>
          <div className={`text-base font-black ${fearGreedColor(fg)}`}>
            {fg ?? "—"}
          </div>
          <div className="text-[10px] text-muted truncate">{sentiment.fear_greed_label || "—"}</div>
        </div>

        {/* Funding */}
        <div className="bg-background rounded-lg p-3">
          <div className="text-[10px] text-muted uppercase font-bold">BTC Funding</div>
          <div className={`text-base font-black ${changeColor(sentiment.btc_funding_pct)}`}>
            {fmtPct(sentiment.btc_funding_pct, 3)}
          </div>
          <div className="text-[10px] text-muted">ETH {fmtPct(sentiment.eth_funding_pct, 3)}</div>
        </div>

        {/* Market cap change */}
        <div className="bg-background rounded-lg p-3">
          <div className="text-[10px] text-muted uppercase font-bold">Total Cap 24h</div>
          <div className={`text-base font-black ${changeColor(overview.market_cap_change_24h_pct)}`}>
            {fmtPct(overview.market_cap_change_24h_pct)}
          </div>
          <div className="text-[10px] text-muted">{overview.active_cryptocurrencies?.toLocaleString()} coins</div>
        </div>
      </div>

      {/* Narrative line */}
      <div className="mt-4 bg-slate-900/60 border-l-2 border-orange-500/60 rounded-r-lg px-3 py-2">
        <p className="text-xs text-gray-200 leading-relaxed">
          <span className="font-black text-orange-400">Bias: </span>
          <span className="font-bold text-foreground">{sentiment.overall_bias || "NEUTRAL"}</span>
          {" — "}
          <span className="text-gray-300">{sentiment.narrative || "Market in equilibrium."}</span>
        </p>
      </div>
    </section>
  );
}

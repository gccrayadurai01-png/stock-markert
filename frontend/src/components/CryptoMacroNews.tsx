"use client";

import { useState } from "react";
import type { CryptoNewsItem, CryptoTrendingCoin } from "@/lib/types";

interface Props {
  news: CryptoNewsItem[];
  sentiment: { sentiment: string; bullish: number; bearish: number; neutral: number; total: number };
  trending?: CryptoTrendingCoin[];
}

const SENT_BADGE: Record<string, string> = {
  BULLISH: "bg-green/10 text-green border-green/20",
  BEARISH: "bg-red/10 text-red border-red/20",
  NEUTRAL: "bg-muted/10 text-muted border-muted/20",
};

export default function CryptoMacroNews({ news, sentiment, trending = [] }: Props) {
  const [tab, setTab] = useState<"news" | "trending">("news");

  const sentimentColor =
    sentiment.sentiment === "BULLISH" ? "text-green" :
    sentiment.sentiment === "BEARISH" ? "text-red" : "text-yellow";

  return (
    <section className="bg-card rounded-xl border border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">📰</span>
          <h2 className="text-sm font-black uppercase tracking-wider">Crypto News</h2>
          <span className={`text-xs font-bold ml-2 ${sentimentColor}`}>
            {sentiment.sentiment}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-green font-bold">{sentiment.bullish}↑</span>
          <span className="text-[10px] text-muted">{sentiment.neutral}→</span>
          <span className="text-[10px] text-red font-bold">{sentiment.bearish}↓</span>
          <div className="flex gap-1 ml-3">
            {(["news", "trending"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-[10px] px-2 py-1 rounded font-bold capitalize transition ${
                  tab === t ? "bg-orange-500 text-white" : "bg-background text-muted hover:text-foreground"
                }`}
              >{t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* News tab */}
      {tab === "news" && (
        <div className="divide-y divide-border/50">
          {news.length === 0 && (
            <p className="px-4 py-6 text-sm text-muted text-center">No news loaded yet.</p>
          )}
          {news.slice(0, 20).map((item, i) => (
            <div key={i} className="px-4 py-3 hover:bg-card-hover/20 transition">
              <div className="flex items-start gap-2">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap mt-0.5 ${SENT_BADGE[item.sentiment] || SENT_BADGE.NEUTRAL}`}>
                  {item.sentiment}
                </span>
                <div className="flex-1 min-w-0">
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-foreground hover:text-orange-400 transition leading-snug line-clamp-2"
                    >
                      {item.headline}
                    </a>
                  ) : (
                    <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2">{item.headline}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[9px] text-muted">{item.source}</span>
                    {item.published && (
                      <span className="text-[9px] text-muted">· {item.published}</span>
                    )}
                    {item.affected_coins?.slice(0, 3).map((coin) => (
                      <span key={coin} className="text-[9px] bg-orange-500/10 text-orange-300 px-1 py-0.5 rounded">
                        {coin}
                      </span>
                    ))}
                    {item.narratives?.slice(0, 2).map((n) => (
                      <span key={n} className="text-[9px] text-muted italic">{n}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trending tab */}
      {tab === "trending" && (
        <div className="p-4">
          {trending.length === 0 && (
            <p className="text-sm text-muted text-center py-4">No trending data.</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {trending.slice(0, 10).map((coin) => (
              <div key={coin.id} className="bg-background rounded-lg p-3 flex items-center gap-2">
                {coin.thumb && (
                  <img src={coin.thumb} alt={coin.name} className="w-6 h-6 rounded-full" loading="lazy" />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-foreground truncate">{coin.symbol.toUpperCase()}</div>
                  <div className="text-[9px] text-muted truncate">{coin.name}</div>
                  {coin.market_cap_rank && (
                    <div className="text-[9px] text-muted">Rank #{coin.market_cap_rank}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

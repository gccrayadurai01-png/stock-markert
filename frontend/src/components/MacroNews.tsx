"use client";

import type { MacroImpact, NewsItem } from "@/lib/types";

interface Props {
  macroEvents: MacroImpact[];
  news: NewsItem[];
  sentiment: {
    sentiment: string;
    bullish: number;
    bearish: number;
    neutral: number;
    total: number;
  };
}

export default function MacroNews({ macroEvents, news, sentiment }: Props) {
  return (
    <section className="space-y-4">
      {/* Macro Events */}
      <div>
        <h2 className="text-lg font-bold mb-3">Macro + News Impact</h2>

        {/* Sentiment bar */}
        {sentiment.total > 0 && (
          <div className="bg-card rounded-xl p-3 border border-border mb-3">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs text-muted">Market Sentiment:</span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded ${
                  sentiment.sentiment === "BULLISH"
                    ? "bg-green/10 text-green"
                    : sentiment.sentiment === "BEARISH"
                    ? "bg-red/10 text-red"
                    : "bg-yellow/10 text-yellow"
                }`}
              >
                {sentiment.sentiment}
              </span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-background">
              {sentiment.bullish > 0 && (
                <div
                  className="bg-green"
                  style={{
                    width: `${(sentiment.bullish / sentiment.total) * 100}%`,
                  }}
                />
              )}
              {sentiment.neutral > 0 && (
                <div
                  className="bg-yellow"
                  style={{
                    width: `${(sentiment.neutral / sentiment.total) * 100}%`,
                  }}
                />
              )}
              {sentiment.bearish > 0 && (
                <div
                  className="bg-red"
                  style={{
                    width: `${(sentiment.bearish / sentiment.total) * 100}%`,
                  }}
                />
              )}
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-muted">
              <span>Bullish: {sentiment.bullish}</span>
              <span>Neutral: {sentiment.neutral}</span>
              <span>Bearish: {sentiment.bearish}</span>
            </div>
          </div>
        )}

        {/* Macro events */}
        {macroEvents.length > 0 && (
          <div className="space-y-2 mb-4">
            {macroEvents.map((e, i) => (
              <div
                key={i}
                className={`rounded-xl p-3 border ${
                  e.severity === "HIGH"
                    ? "bg-red/5 border-red/20"
                    : e.severity === "MEDIUM"
                    ? "bg-yellow/5 border-yellow/20"
                    : "bg-card border-border"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      e.severity === "HIGH"
                        ? "bg-red/10 text-red"
                        : e.severity === "MEDIUM"
                        ? "bg-yellow/10 text-yellow"
                        : "bg-muted/10 text-muted"
                    }`}
                  >
                    {e.severity}
                  </span>
                  <span className="text-sm font-semibold">{e.event}</span>
                </div>
                <p className="text-xs text-muted leading-relaxed">{e.impact}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* News Feed */}
      <div>
        <h3 className="text-sm font-bold mb-2 text-muted">Latest News</h3>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {news.map((n, i) => (
            <div
              key={i}
              className="flex items-start gap-2 bg-card rounded-lg p-2.5 border border-border"
            >
              <span
                className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                  n.sentiment === "BULLISH"
                    ? "bg-green"
                    : n.sentiment === "BEARISH"
                    ? "bg-red"
                    : "bg-yellow"
                }`}
              />
              <div className="min-w-0">
                <p className="text-xs text-foreground leading-snug line-clamp-2">
                  {n.url ? (
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-accent transition-colors"
                    >
                      {n.headline}
                    </a>
                  ) : (
                    n.headline
                  )}
                </p>
                <span className="text-[10px] text-muted">{n.source}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import type { StockAnalysis } from "@/lib/types";

interface Props {
  gainers: StockAnalysis[];
  losers: StockAnalysis[];
}

export default function AlertsPanel({ gainers, losers }: Props) {
  return (
    <section>
      <h2 className="text-lg font-bold mb-3">Live Alerts</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Top Gainers */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-3 py-2 bg-green/5 border-b border-green/20">
            <span className="text-xs font-bold text-green">TOP GAINERS</span>
          </div>
          <div className="divide-y divide-border/50">
            {gainers.map((s) => (
              <div
                key={s.symbol}
                className="flex items-center justify-between px-3 py-2"
              >
                <div>
                  <div className="text-xs font-semibold">{s.name}</div>
                  <div className="text-[10px] text-muted">
                    ₹{s.price.toLocaleString("en-IN")}
                  </div>
                </div>
                <span className="text-xs font-bold text-green">
                  +{s.change_percent.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Losers */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-3 py-2 bg-red/5 border-b border-red/20">
            <span className="text-xs font-bold text-red">TOP LOSERS</span>
          </div>
          <div className="divide-y divide-border/50">
            {losers.map((s) => (
              <div
                key={s.symbol}
                className="flex items-center justify-between px-3 py-2"
              >
                <div>
                  <div className="text-xs font-semibold">{s.name}</div>
                  <div className="text-[10px] text-muted">
                    ₹{s.price.toLocaleString("en-IN")}
                  </div>
                </div>
                <span className="text-xs font-bold text-red">
                  {s.change_percent.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

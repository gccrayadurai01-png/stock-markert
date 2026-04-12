"use client";

import type { MarketOverview as MarketOverviewType } from "@/lib/types";

interface Props {
  data: MarketOverviewType;
  keyLevels: Record<string, number>;
  bias: string;
}

function IndexCard({
  label,
  value,
  change,
  high,
  low,
}: {
  label: string;
  value: number;
  change: number;
  high?: number;
  low?: number;
}) {
  const isUp = change >= 0;
  return (
    <div className="bg-card rounded-xl p-4 border border-border">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted">{label}</span>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            isUp ? "bg-green/10 text-green" : "bg-red/10 text-red"
          }`}
        >
          {isUp ? "+" : ""}
          {change.toFixed(2)}%
        </span>
      </div>
      <div className="text-2xl font-bold text-foreground">
        {value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
      </div>
      {high !== undefined && low !== undefined && (
        <div className="flex gap-3 mt-2 text-xs text-muted">
          <span>
            H: <span className="text-green">{high.toLocaleString("en-IN")}</span>
          </span>
          <span>
            L: <span className="text-red">{low.toLocaleString("en-IN")}</span>
          </span>
        </div>
      )}
    </div>
  );
}

export default function MarketOverview({ data, keyLevels, bias }: Props) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-bold">Market Overview</h2>
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            bias === "BULLISH"
              ? "bg-green/10 text-green"
              : bias === "BEARISH"
              ? "bg-red/10 text-red"
              : "bg-yellow/10 text-yellow"
          }`}
        >
          {bias}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <IndexCard
          label="NIFTY 50"
          value={data.nifty_50}
          change={data.nifty_50_change}
          high={data.nifty_50_high}
          low={data.nifty_50_low}
        />
        <IndexCard
          label="SENSEX"
          value={data.sensex}
          change={data.sensex_change}
        />
        <IndexCard
          label="BANK NIFTY"
          value={data.bank_nifty}
          change={data.bank_nifty_change}
        />
        <IndexCard label="INDIA VIX" value={data.india_vix} change={0} />
      </div>

      {/* Key Levels */}
      {Object.keys(keyLevels).length > 0 && (
        <div className="mt-3 bg-card rounded-xl p-3 border border-border">
          <span className="text-xs font-semibold text-muted mb-2 block">
            KEY LEVELS
          </span>
          <div className="flex flex-wrap gap-4 text-xs">
            {Object.entries(keyLevels).map(([key, val]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className="text-muted capitalize">
                  {key.replace(/_/g, " ")}:
                </span>
                <span className="font-semibold text-foreground">
                  {val.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

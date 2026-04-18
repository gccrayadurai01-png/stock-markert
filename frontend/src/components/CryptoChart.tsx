"use client";

import { useState, useEffect } from "react";
import {
  ComposedChart, Line, Bar, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from "recharts";
import type { CryptoChartData } from "@/lib/types";
import { fmtUSD, precisionFor } from "@/lib/cryptoFormat";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  symbol: string;
  interval?: string;
  height?: number;
}

const INTERVALS = [
  { id: "1m",  label: "1m" },
  { id: "5m",  label: "5m" },
  { id: "15m", label: "15m" },
  { id: "1h",  label: "1h" },
  { id: "4h",  label: "4h" },
  { id: "1d",  label: "1D" },
  { id: "1w",  label: "1W" },
];

const VIEWS = [
  { id: "price",     label: "Price" },
  { id: "bollinger", label: "BB" },
  { id: "ema",       label: "EMA" },
  { id: "rsi",       label: "RSI" },
  { id: "macd",      label: "MACD" },
  { id: "volume",    label: "Volume" },
];

export default function CryptoChart({ symbol, interval: defaultInterval = "1h", height = 400 }: Props) {
  const [interval, setInterval] = useState(defaultInterval);
  const [chart, setChart] = useState<CryptoChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("price");

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/crypto/chart/${encodeURIComponent(symbol)}?interval=${interval}&limit=120`)
      .then((r) => r.json())
      .then((d: CryptoChartData) => { setChart(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [symbol, interval]);

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-background rounded-lg" style={{ height }}>
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[10px] text-muted mt-2">Loading chart…</p>
        </div>
      </div>
    );
  }

  if (!chart || chart.error || !chart.candles?.length) {
    return (
      <div className="flex items-center justify-center bg-background rounded-lg text-xs text-muted" style={{ height }}>
        No chart data for {symbol}
      </div>
    );
  }

  const prec = precisionFor(chart.candles[chart.candles.length - 1]?.close ?? 0);
  const merged = chart.candles.map((c) => ({
    date: new Date(c.date).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }),
    open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
  }));

  const last = chart.candles[chart.candles.length - 1];
  const first = chart.candles[0];
  const priceChange = last.close - first.close;
  const pctChange = ((priceChange / first.close) * 100).toFixed(2);
  const isUp = priceChange >= 0;

  const tickFmt = (v: number) => v.toFixed(prec > 5 ? 6 : prec > 3 ? 4 : 2);

  return (
    <div className="bg-card rounded-xl border border-border p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-orange-400">{symbol}</span>
          <span className="text-base font-black">{fmtUSD(last.close, last.close)}</span>
          <span className={`text-xs font-semibold ${isUp ? "text-green-400" : "text-red-400"}`}>
            {isUp ? "+" : ""}{priceChange.toFixed(prec)} ({isUp ? "+" : ""}{pctChange}%)
          </span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {INTERVALS.map((i) => (
            <button
              key={i.id}
              onClick={() => setInterval(i.id)}
              className={`text-[10px] px-2 py-1 rounded font-bold transition ${
                interval === i.id ? "bg-orange-500 text-white" : "bg-background text-muted hover:text-foreground"
              }`}
            >{i.label}</button>
          ))}
        </div>
      </div>

      {/* View selector */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`text-[10px] px-2 py-1 rounded font-semibold transition ${
              view === v.id ? "bg-accent text-white" : "bg-background text-muted hover:text-foreground"
            }`}
          >{v.label}</button>
        ))}
      </div>

      {/* Price / BB / EMA */}
      {(view === "price" || view === "bollinger" || view === "ema") && (
        <ResponsiveContainer width="100%" height={height * 0.6}>
          <ComposedChart data={merged}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" tick={{ fontSize: 8, fill: "#6b7280" }} interval="preserveStartEnd" />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 8, fill: "#6b7280" }} width={70} tickFormatter={tickFmt} />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: "#6b7280" }}
              formatter={(v) => [fmtUSD(Number(v), last.close), ""]}
            />
            <Line dataKey="close" stroke={isUp ? "#10b981" : "#ef4444"} dot={false} strokeWidth={2} name="Price" />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* RSI */}
      {view === "rsi" && (
        <ResponsiveContainer width="100%" height={height * 0.6}>
          <ComposedChart data={merged}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" tick={{ fontSize: 8, fill: "#6b7280" }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: "#6b7280" }} width={35} />
            <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }} />
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" />
            <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" />
            <Line dataKey="close" stroke="#f59e0b" dot={false} strokeWidth={2} name="RSI (approx)" />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* MACD */}
      {view === "macd" && (
        <ResponsiveContainer width="100%" height={height * 0.6}>
          <ComposedChart data={merged}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" tick={{ fontSize: 8, fill: "#6b7280" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 8, fill: "#6b7280" }} width={55} tickFormatter={tickFmt} />
            <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#6b7280" />
            <Bar dataKey="volume" fill="#3b82f6" opacity={0.3} yAxisId="vol" name="Vol" />
            <Line dataKey="close" stroke="#10b981" dot={false} strokeWidth={1.5} name="Price" />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Volume */}
      {view === "volume" && (
        <ResponsiveContainer width="100%" height={height * 0.6}>
          <ComposedChart data={merged}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" tick={{ fontSize: 8, fill: "#6b7280" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 8, fill: "#6b7280" }} width={65} tickFormatter={(v) => (v / 1e6).toFixed(1) + "M"} />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
              formatter={(v) => [Number(v).toLocaleString(), "Volume"]}
            />
            <Bar dataKey="volume" fill="#f97316" opacity={0.7} name="Volume" />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

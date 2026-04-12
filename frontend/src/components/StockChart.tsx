"use client";

import { useState, useEffect } from "react";
import {
  ComposedChart, Line, Bar, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from "recharts";
import type { ChartData } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  symbol: string;
  interval?: string;
  height?: number;
}

export default function StockChart({ symbol, interval = "1day", height = 400 }: Props) {
  const [chart, setChart] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndicator, setActiveIndicator] = useState<string>("price");

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/api/chart/${encodeURIComponent(symbol)}?interval=${interval}&outputsize=60`)
      .then((r) => r.json())
      .then((d) => {
        setChart(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symbol, interval]);

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-background rounded-lg" style={{ height }}>
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[10px] text-muted mt-2">Loading chart...</p>
        </div>
      </div>
    );
  }

  if (!chart || chart.error || !chart.candles?.length) {
    return (
      <div className="flex items-center justify-center bg-background rounded-lg text-xs text-muted" style={{ height }}>
        No chart data available
      </div>
    );
  }

  // Merge candle data with indicators
  const merged = chart.candles.map((c, i) => {
    const rsi = chart.rsi?.[i];
    const macd = chart.macd?.[i];
    const bb = chart.bollinger?.[i];
    const ema20 = chart.ema20?.[i];
    const ema50 = chart.ema50?.[i];

    return {
      date: c.date.slice(5), // MM-DD
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      rsi: rsi?.value,
      macd_val: macd?.macd,
      macd_signal: macd?.signal,
      macd_hist: macd?.histogram,
      bb_upper: bb?.upper,
      bb_middle: bb?.middle,
      bb_lower: bb?.lower,
      ema20: ema20?.value,
      ema50: ema50?.value,
    };
  });

  const lastCandle = chart.candles[chart.candles.length - 1];
  const firstCandle = chart.candles[0];
  const priceChange = lastCandle.close - firstCandle.close;
  const pctChange = ((priceChange / firstCandle.close) * 100).toFixed(2);
  const isUp = priceChange >= 0;

  const indicators = [
    { id: "price", label: "Price" },
    { id: "bollinger", label: "Bollinger" },
    { id: "ema", label: "EMA 20/50" },
    { id: "rsi", label: "RSI" },
    { id: "macd", label: "MACD" },
    { id: "volume", label: "Volume" },
  ];

  return (
    <div className="bg-card rounded-xl border border-border p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold">{symbol.replace(".NS", "")}</span>
          <span className="text-lg font-black">
            ₹{lastCandle.close.toLocaleString("en-IN")}
          </span>
          <span className={`text-xs font-semibold ${isUp ? "text-green" : "text-red"}`}>
            {isUp ? "+" : ""}{priceChange.toFixed(2)} ({isUp ? "+" : ""}{pctChange}%)
          </span>
        </div>
        <div className="flex gap-1">
          {indicators.map((ind) => (
            <button
              key={ind.id}
              onClick={() => setActiveIndicator(ind.id)}
              className={`text-[10px] px-2 py-1 rounded font-semibold transition-colors ${
                activeIndicator === ind.id
                  ? "bg-accent text-white"
                  : "bg-background text-muted hover:text-foreground"
              }`}
            >
              {ind.label}
            </button>
          ))}
        </div>
      </div>

      {/* Price Chart */}
      {(activeIndicator === "price" || activeIndicator === "bollinger" || activeIndicator === "ema") && (
        <ResponsiveContainer width="100%" height={height * 0.6}>
          <ComposedChart data={merged}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b7280" }} interval="preserveStartEnd" />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "#6b7280" }} width={60} />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: "#6b7280" }}
            />

            {activeIndicator === "bollinger" && (
              <>
                <Area dataKey="bb_upper" stroke="#3b82f6" fill="none" strokeDasharray="3 3" dot={false} />
                <Area dataKey="bb_lower" stroke="#3b82f6" fill="none" strokeDasharray="3 3" dot={false} />
                <Line dataKey="bb_middle" stroke="#3b82f680" dot={false} strokeWidth={1} />
              </>
            )}

            {activeIndicator === "ema" && (
              <>
                <Line dataKey="ema20" stroke="#f59e0b" dot={false} strokeWidth={1.5} name="EMA 20" />
                <Line dataKey="ema50" stroke="#8b5cf6" dot={false} strokeWidth={1.5} name="EMA 50" />
              </>
            )}

            <Line
              dataKey="close"
              stroke={isUp ? "#10b981" : "#ef4444"}
              dot={false}
              strokeWidth={2}
              name="Price"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* RSI Chart */}
      {activeIndicator === "rsi" && (
        <ResponsiveContainer width="100%" height={height * 0.6}>
          <ComposedChart data={merged}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b7280" }} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#6b7280" }} width={35} />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 11 }}
            />
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Overbought", fill: "#ef4444", fontSize: 9 }} />
            <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" label={{ value: "Oversold", fill: "#10b981", fontSize: 9 }} />
            <Line dataKey="rsi" stroke="#f59e0b" dot={false} strokeWidth={2} name="RSI" />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* MACD Chart */}
      {activeIndicator === "macd" && (
        <ResponsiveContainer width="100%" height={height * 0.6}>
          <ComposedChart data={merged}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b7280" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} width={45} />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 11 }}
            />
            <ReferenceLine y={0} stroke="#6b7280" />
            <Bar
              dataKey="macd_hist"
              name="Histogram"
              fill="#3b82f6"
              opacity={0.5}
            />
            <Line dataKey="macd_val" stroke="#10b981" dot={false} strokeWidth={1.5} name="MACD" />
            <Line dataKey="macd_signal" stroke="#ef4444" dot={false} strokeWidth={1.5} name="Signal" />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Volume Chart */}
      {activeIndicator === "volume" && (
        <ResponsiveContainer width="100%" height={height * 0.6}>
          <ComposedChart data={merged}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b7280" }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} width={55} />
            <Tooltip
              contentStyle={{ background: "#111827", border: "1px solid #1f2937", borderRadius: 8, fontSize: 11 }}
              formatter={(val) => [Number(val).toLocaleString("en-IN"), "Volume"]}
            />
            <Bar dataKey="volume" fill="#3b82f6" opacity={0.6} name="Volume" />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

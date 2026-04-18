// Shared crypto formatting helpers.

export function precisionFor(price: number): number {
  const p = Math.abs(price);
  if (p >= 1000) return 2;
  if (p >= 10) return 3;
  if (p >= 1) return 4;
  if (p >= 0.01) return 5;
  if (p >= 0.0001) return 7;
  return 10;
}

export function fmtUSD(value: number | null | undefined, ref?: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const prec = precisionFor(ref ?? value);
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: Math.min(prec, 2),
    maximumFractionDigits: prec,
  })}`;
}

export function fmtPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function fmtLargeUSD(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const v = Math.abs(value);
  if (v >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

export function shortSymbol(symbol: string): string {
  return symbol.replace(/USDT$/, "");
}

export function signalColor(signal: string): string {
  switch (signal) {
    case "STRONG_BUY": return "text-green-400 bg-green-500/10 border-green-500/30";
    case "BUY":        return "text-green-300 bg-green-500/5 border-green-500/20";
    case "SELL":       return "text-red-300 bg-red-500/5 border-red-500/20";
    case "STRONG_SELL":return "text-red-400 bg-red-500/10 border-red-500/30";
    default:           return "text-gray-300 bg-slate-700/40 border-slate-600";
  }
}

export function changeColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-gray-400";
  if (value > 0) return "text-green-400";
  if (value < 0) return "text-red-400";
  return "text-gray-400";
}

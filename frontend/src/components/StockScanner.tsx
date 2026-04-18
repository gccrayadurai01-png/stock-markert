"use client";

import { useState } from "react";
import type { StockAnalysis } from "@/lib/types";
import StockChart from "./StockChart";
import InvestorSwitcher from "./InvestorSwitcher";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  stocks: StockAnalysis[];
  title: string;
  onStockClick?: (symbol: string) => void;
  expandedStock?: string | null;
}

const SIGNAL_COLORS: Record<string, string> = {
  STRONG_BUY: "bg-green text-white",
  BUY: "bg-green/20 text-green",
  NEUTRAL: "bg-muted/20 text-muted",
  SELL: "bg-red/20 text-red",
  STRONG_SELL: "bg-red text-white",
  NO_DATA: "bg-muted/10 text-muted",
};

const VOTE_BAR_COLORS = { BUY: "bg-green", SELL: "bg-red", NEUTRAL: "bg-yellow" };

// ── Take Trade Modal ───────────────────────────────────────────────────
function TakeTradeModal({
  stock,
  onClose,
  onSuccess,
}: {
  stock: StockAnalysis;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    symbol:      stock.symbol.replace(".NS", "").replace(".BO", ""),
    name:        stock.name || stock.symbol.replace(".NS", ""),
    entry_price: stock.price ?? 0,
    stop_loss:   stock.stop_loss ?? 0,
    target_1:    stock.target_1 ?? 0,
    target_2:    stock.target_2 ?? 0,
    quantity:    1,
    type:        "Intraday",
    notes:       "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Auto-calculate quantity based on ₹5,000 risk per trade
  const riskPerShare = form.entry_price - form.stop_loss;
  const suggestedQty = riskPerShare > 0 ? Math.max(1, Math.floor(5000 / riskPerShare)) : 1;

  const pnlIfT1 = ((form.target_1 - form.entry_price) * form.quantity).toFixed(2);
  const pnlIfSL = ((form.stop_loss - form.entry_price) * form.quantity).toFixed(2);
  const rrRatio = riskPerShare > 0 ? ((form.target_1 - form.entry_price) / riskPerShare).toFixed(1) : "—";

  async function submit() {
    setSaving(true);
    try {
      await fetch(`${API}/api/manual-trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol:      form.symbol,
          name:        form.name,
          entry_price: Number(form.entry_price),
          stop_loss:   Number(form.stop_loss),
          target_1:    Number(form.target_1),
          target_2:    Number(form.target_2),
          quantity:    Number(form.quantity),
          type:        form.type,
          notes:       form.notes,
          source:      "Main Dashboard Scanner",
          signal:      stock.signal,
          score:       stock.score,
          rsi:         stock.rsi,
        }),
      });
      setSaved(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1000);
    } catch { /* ignore */ }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-black text-foreground">📌 Take Trade</h2>
            <p className="text-[10px] text-muted mt-0.5">{form.name} — recorded in My Trades</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg font-bold">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Pre-filled summary */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-background rounded-lg p-2">
              <div className="text-[9px] text-muted uppercase font-bold">Entry</div>
              <div className="text-sm font-black text-foreground">₹{Number(form.entry_price).toLocaleString("en-IN")}</div>
            </div>
            <div className="bg-red/10 rounded-lg p-2">
              <div className="text-[9px] text-red uppercase font-bold">Stop Loss</div>
              <div className="text-sm font-black text-red">₹{Number(form.stop_loss).toLocaleString("en-IN")}</div>
            </div>
            <div className="bg-green/10 rounded-lg p-2">
              <div className="text-[9px] text-green uppercase font-bold">Target 1</div>
              <div className="text-sm font-black text-green">₹{Number(form.target_1).toLocaleString("en-IN")}</div>
            </div>
          </div>

          {/* R:R ratio */}
          <div className="flex items-center gap-3 bg-accent/10 border border-accent/20 rounded-lg px-3 py-2">
            <span className="text-xs font-black text-accent">R:R {rrRatio}</span>
            <span className="text-[10px] text-muted">|</span>
            <span className="text-[10px] text-green">Profit if T1: ₹{pnlIfT1}</span>
            <span className="text-[10px] text-muted">|</span>
            <span className="text-[10px] text-red">Loss if SL: ₹{pnlIfSL}</span>
          </div>

          {/* Editable fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted font-bold uppercase block mb-1">Entry Price</label>
              <input type="number" value={form.entry_price}
                onChange={e => setForm(f => ({ ...f, entry_price: Number(e.target.value) }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-bold text-foreground" />
            </div>
            <div>
              <label className="text-[10px] text-muted font-bold uppercase block mb-1">
                Quantity <span className="text-accent">(suggested: {suggestedQty})</span>
              </label>
              <input type="number" value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-bold text-foreground" />
            </div>
            <div>
              <label className="text-[10px] text-muted font-bold uppercase block mb-1">Stop Loss</label>
              <input type="number" value={form.stop_loss}
                onChange={e => setForm(f => ({ ...f, stop_loss: Number(e.target.value) }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-bold text-red" />
            </div>
            <div>
              <label className="text-[10px] text-muted font-bold uppercase block mb-1">Target 1</label>
              <input type="number" value={form.target_1}
                onChange={e => setForm(f => ({ ...f, target_1: Number(e.target.value) }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-bold text-green" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted font-bold uppercase block mb-1">Target 2</label>
              <input type="number" value={form.target_2}
                onChange={e => setForm(f => ({ ...f, target_2: Number(e.target.value) }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-bold text-green" />
            </div>
            <div>
              <label className="text-[10px] text-muted font-bold uppercase block mb-1">Type</label>
              <select value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-bold text-foreground">
                <option>Intraday</option>
                <option>Swing</option>
                <option>Positional</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-muted font-bold uppercase block mb-1">Notes (optional)</label>
            <input type="text" value={form.notes} placeholder="Why are you taking this trade?"
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground" />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm bg-background border border-border text-muted hover:text-foreground transition-all">
              Cancel
            </button>
            <button onClick={submit} disabled={saving || saved}
              className={`flex-1 px-4 py-2.5 rounded-xl font-black text-sm transition-all ${
                saved ? "bg-green text-white" :
                "bg-accent hover:bg-accent/80 text-white shadow-lg shadow-accent/20"
              }`}>
              {saved ? "✅ Trade Recorded!" : saving ? "Saving..." : "📌 TAKE TRADE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────
export default function StockScanner({ stocks, title, onStockClick, expandedStock }: Props) {
  const [internalExpanded, setInternalExpanded] = useState<string | null>(null);
  const [investorData, setInvestorData] = useState<Record<string, any>>({});
  const [loadingInvestors, setLoadingInvestors] = useState<string | null>(null);
  const [tradeModal, setTradeModal] = useState<StockAnalysis | null>(null);
  const [recentTrades, setRecentTrades] = useState<string[]>([]);

  if (!stocks.length) return null;

  const expanded = expandedStock !== undefined ? expandedStock : internalExpanded;

  const handleClick = onStockClick || ((sym: string) => {
    const isExpanding = internalExpanded !== sym;
    setInternalExpanded(isExpanding ? sym : null);
    if (isExpanding && !investorData[sym]) {
      setLoadingInvestors(sym);
      fetch(`/api/stock/${sym}/investor-perspectives`)
        .then((res) => res.json())
        .then((data) => {
          setInvestorData((prev) => ({ ...prev, [sym]: data }));
          setLoadingInvestors(null);
        })
        .catch(() => setLoadingInvestors(null));
    }
  });

  return (
    <section>
      {/* Trade Modal */}
      {tradeModal && (
        <TakeTradeModal
          stock={tradeModal}
          onClose={() => setTradeModal(null)}
          onSuccess={() => setRecentTrades(prev => [...prev, tradeModal!.symbol])}
        />
      )}

      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-lg font-bold">{title}</h2>
        <span className="text-[10px] bg-blue-500/15 text-blue-400 px-2 py-1 rounded-full font-semibold ml-auto">
          Click row to expand · 📌 to take trade
        </span>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-background text-[10px] font-bold text-muted uppercase tracking-wider">
          <div className="col-span-2">Stock</div>
          <div>Price</div>
          <div>Chg%</div>
          <div>Signal</div>
          <div>Score</div>
          <div>RSI</div>
          <div>MACD</div>
          <div>Trend</div>
          <div>EMA</div>
          <div>ADX</div>
          <div>Trade</div>
        </div>

        {/* Rows */}
        {stocks.map((s) => {
          const traded = recentTrades.includes(s.symbol);
          return (
            <div key={s.symbol}>
              <div
                className={`grid grid-cols-12 gap-2 px-3 py-2 border-t border-border/50 items-center text-xs transition-colors ${
                  expanded === s.symbol ? "bg-accent/5 border-l-2 border-l-accent" : "hover:bg-card-hover/30"
                }`}
              >
                {/* Clickable columns (expand) */}
                <div className="col-span-2 cursor-pointer" onClick={() => handleClick(s.symbol)}>
                  <div className="font-semibold text-foreground">{s.name}</div>
                  {traded && <div className="text-[8px] text-green font-bold">✅ traded</div>}
                </div>
                <div className="cursor-pointer font-semibold" onClick={() => handleClick(s.symbol)}>
                  ₹{s.price?.toLocaleString("en-IN")}
                </div>
                <div className={`cursor-pointer ${s.change_percent >= 0 ? "text-green font-semibold" : "text-red font-semibold"}`}
                  onClick={() => handleClick(s.symbol)}>
                  {s.change_percent >= 0 ? "+" : ""}{s.change_percent?.toFixed(2)}%
                </div>
                <div className="cursor-pointer" onClick={() => handleClick(s.symbol)}>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${SIGNAL_COLORS[s.signal] || ""}`}>
                    {s.signal?.replace("_", " ")}
                  </span>
                </div>
                <div className={`cursor-pointer font-bold ${s.score > 0 ? "text-green" : s.score < 0 ? "text-red" : "text-muted"}`}
                  onClick={() => handleClick(s.symbol)}>
                  {s.score > 0 ? "+" : ""}{s.score}
                </div>
                <div className={`cursor-pointer ${s.rsi < 30 ? "text-green font-bold" : s.rsi > 70 ? "text-red font-bold" : "text-muted"}`}
                  onClick={() => handleClick(s.symbol)}>
                  {s.rsi?.toFixed(0)}
                </div>
                <div className={`cursor-pointer ${s.macd_vote === "BUY" ? "text-green" : s.macd_vote === "SELL" ? "text-red" : "text-muted"}`}
                  onClick={() => handleClick(s.symbol)}>
                  {s.macd_vote}
                </div>
                <div className={`cursor-pointer ${s.supertrend_dir === "UP" ? "text-green" : "text-red"}`}
                  onClick={() => handleClick(s.symbol)}>
                  {s.supertrend_dir === "UP" ? "▲ UP" : "▼ DN"}
                </div>
                <div className={`cursor-pointer ${s.ema_align === "BULLISH" ? "text-green" : s.ema_align === "BEARISH" ? "text-red" : "text-yellow"}`}
                  onClick={() => handleClick(s.symbol)}>
                  {s.ema_align}
                </div>
                <div className={`cursor-pointer ${s.adx > 25 ? "font-bold" : "text-muted"}`}
                  onClick={() => handleClick(s.symbol)}>
                  {s.adx?.toFixed(0)}
                </div>

                {/* Take Trade button — last column */}
                <div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setTradeModal(s); }}
                    className={`text-[9px] font-black px-2 py-1 rounded-lg transition-all whitespace-nowrap ${
                      traded
                        ? "bg-green/10 text-green border border-green/30"
                        : "bg-accent/10 text-accent border border-accent/30 hover:bg-accent hover:text-white"
                    }`}
                  >
                    {traded ? "✅" : "📌 BUY"}
                  </button>
                </div>
              </div>

              {/* Expanded Detail View */}
              {expanded === s.symbol && (
                <div className="border-t border-accent/30 bg-accent/5 p-4 space-y-4">
                  {/* Targets + Take Trade CTA */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted">Stop Loss</div>
                      <div className="text-sm font-bold text-red">₹{s.stop_loss?.toLocaleString("en-IN")}</div>
                    </div>
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted">Target 1</div>
                      <div className="text-sm font-bold text-green">₹{s.target_1?.toLocaleString("en-IN")}</div>
                    </div>
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted">Target 2</div>
                      <div className="text-sm font-bold text-green">₹{s.target_2?.toLocaleString("en-IN")}</div>
                    </div>
                    {/* Big Take Trade button in expanded view */}
                    <button
                      onClick={() => setTradeModal(s)}
                      className="bg-accent hover:bg-accent/80 text-white font-black text-sm rounded-lg px-3 py-2 transition-all shadow-lg shadow-accent/20 flex items-center justify-center gap-1"
                    >
                      📌 TAKE TRADE
                    </button>
                  </div>

                  {/* Indicator Details */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase">RSI</div>
                      <div className={`text-sm font-bold ${s.rsi < 30 ? "text-green" : s.rsi > 70 ? "text-red" : "text-foreground"}`}>
                        {s.rsi?.toFixed(1)}
                      </div>
                      <div className="text-[8px] text-muted">{s.rsi < 30 ? "Oversold" : s.rsi > 70 ? "Overbought" : "Neutral"}</div>
                    </div>
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase">MACD</div>
                      <div className={`text-sm font-bold ${s.macd_vote === "BUY" ? "text-green" : s.macd_vote === "SELL" ? "text-red" : "text-foreground"}`}>
                        {s.macd_vote}
                      </div>
                      <div className="text-[8px] text-muted">Signal Line Cross</div>
                    </div>
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase">Supertrend</div>
                      <div className={`text-sm font-bold ${s.supertrend_dir === "UP" ? "text-green" : "text-red"}`}>
                        {s.supertrend_dir}
                      </div>
                      <div className="text-[8px] text-muted">Trend Direction</div>
                    </div>
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase">EMA</div>
                      <div className={`text-sm font-bold ${s.ema_align === "BULLISH" ? "text-green" : s.ema_align === "BEARISH" ? "text-red" : "text-yellow"}`}>
                        {s.ema_align}
                      </div>
                      <div className="text-[8px] text-muted">9/21/50 Alignment</div>
                    </div>
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase">ADX</div>
                      <div className={`text-sm font-bold ${s.adx > 25 ? "text-accent" : "text-muted"}`}>
                        {s.adx?.toFixed(1)}
                      </div>
                      <div className="text-[8px] text-muted">{s.adx > 25 ? "Strong Trend" : "Weak Trend"}</div>
                    </div>
                    <div className="bg-background rounded-lg p-2 text-center">
                      <div className="text-[9px] text-muted uppercase">BB %B</div>
                      <div className="text-sm font-bold text-foreground">{(s.bb_pct * 100)?.toFixed(0)}%</div>
                      <div className="text-[8px] text-muted">{s.bb_pct > 0.8 ? "Near Upper" : s.bb_pct < 0.2 ? "Near Lower" : "Middle"}</div>
                    </div>
                  </div>

                  {/* Votes breakdown */}
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted">Indicator Votes:</span>
                    <span className="text-xs font-bold text-green">{s.votes?.BUY} BUY</span>
                    <span className="text-xs font-bold text-yellow">{s.votes?.NEUTRAL} NEUTRAL</span>
                    <span className="text-xs font-bold text-red">{s.votes?.SELL} SELL</span>
                    {s.volume_spike && <span className="text-[9px] bg-yellow/10 text-yellow px-2 py-0.5 rounded font-bold">VOLUME SPIKE</span>}
                  </div>

                  {/* Investor Perspectives */}
                  {loadingInvestors === s.symbol ? (
                    <div className="border-t border-border/50 pt-4 text-center">
                      <div className="text-sm text-muted animate-pulse">Loading investor perspectives...</div>
                    </div>
                  ) : investorData[s.symbol]?.investor_perspectives ? (
                    <div className="border-2 border-blue-500/40 bg-blue-500/5 rounded-xl p-4 mt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">🧠</span>
                        <h3 className="text-sm font-black text-blue-400 uppercase tracking-wider">Legendary Investor Perspectives</h3>
                        <span className="text-[9px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-bold">Use dropdown below</span>
                      </div>
                      <InvestorSwitcher
                        perspectives={investorData[s.symbol].investor_perspectives}
                        consensus={investorData[s.symbol].consensus}
                      />
                    </div>
                  ) : null}

                  {/* Chart */}
                  <StockChart symbol={s.symbol} interval="1day" height={300} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

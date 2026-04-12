"use client";

import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, BarChart, Bar,
} from "recharts";
import type { TodayPnL, GoalProjection } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MODES = ["intraday", "swing", "positional", "options"];

interface ModeReturn {
  total_return: number;
  total_return_pct: number;
  days: number;
  first_capital: number;
  current_capital: number;
  entries: Array<{ date: string; capital: number; mode: string }>;
}

interface Props {
  capital: number;
  todayPnl: TodayPnL;
  goal: Record<string, number | string>;
  projection: GoalProjection;
}

export default function PortfolioDashboard({ capital, todayPnl, goal, projection }: Props) {
  const [allTrades, setAllTrades] = useState<Array<Record<string, unknown>>>([]);
  const [modeReturns, setModeReturns] = useState<Record<string, ModeReturn>>({});
  const [recordForm, setRecordForm] = useState({ symbol: "", action: "BUY", price: "", shares: "", mode: "intraday" });
  const [capitalForm, setCapitalForm] = useState({ mode: "intraday", capital: "" });
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [showCapitalForm, setShowCapitalForm] = useState(false);
  const [goalCalc, setGoalCalc] = useState({ target: "10000000", investment: "100000", dailyReturn: "1", months: "" });

  useEffect(() => {
    fetch(`${API_BASE}/api/portfolio`)
      .then((r) => r.json())
      .then((d) => setAllTrades(d.all_trades || []))
      .catch(() => {});

    // Fetch returns for all modes
    MODES.forEach((m) => {
      fetch(`${API_BASE}/api/mode/${m}/returns`)
        .then((r) => r.json())
        .then((d) => setModeReturns((prev) => ({ ...prev, [m]: d })))
        .catch(() => {});
    });
  }, []);

  const recordTrade = () => {
    const trade = {
      symbol: recordForm.symbol.toUpperCase() + ".NS",
      action: recordForm.action,
      price: parseFloat(recordForm.price),
      shares: parseInt(recordForm.shares),
      amount: parseFloat(recordForm.price) * parseInt(recordForm.shares),
      mode: recordForm.mode,
    };
    fetch(`${API_BASE}/api/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(trade),
    }).then(() => {
      setShowTradeForm(false);
      setRecordForm({ symbol: "", action: "BUY", price: "", shares: "", mode: "intraday" });
      fetch(`${API_BASE}/api/portfolio`).then((r) => r.json()).then((d) => setAllTrades(d.all_trades || []));
    });
  };

  const recordCapital = () => {
    fetch(`${API_BASE}/api/daily-capital`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: capitalForm.mode, capital: parseFloat(capitalForm.capital) }),
    }).then(() => {
      setShowCapitalForm(false);
      setCapitalForm({ mode: "intraday", capital: "" });
      // Refresh returns
      MODES.forEach((m) => {
        fetch(`${API_BASE}/api/mode/${m}/returns`)
          .then((r) => r.json())
          .then((d) => setModeReturns((prev) => ({ ...prev, [m]: d })));
      });
    });
  };

  const target = Number(goal.target_amount) || 10000000;
  const progressPct = Math.min(100, (capital / target) * 100);
  const pnlColor = todayPnl.realized_pnl >= 0 ? "text-green" : "text-red";

  const totalPnl = allTrades.reduce((sum, t) => {
    if (t.action === "SELL") return sum + (Number(t.pnl) || 0);
    return sum;
  }, 0);
  const winTrades = allTrades.filter((t) => t.action === "SELL" && Number(t.pnl) > 0).length;
  const lossTrades = allTrades.filter((t) => t.action === "SELL" && Number(t.pnl) <= 0).length;
  const winRate = winTrades + lossTrades > 0 ? ((winTrades / (winTrades + lossTrades)) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-black">Portfolio & P&L Tracker</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-[10px] text-muted font-bold uppercase">Capital</div>
          <div className="text-2xl font-black mt-1">₹{capital.toLocaleString("en-IN")}</div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-[10px] text-muted font-bold uppercase">Today P&L</div>
          <div className={`text-2xl font-black mt-1 ${pnlColor}`}>
            {todayPnl.realized_pnl >= 0 ? "+" : ""}₹{todayPnl.realized_pnl.toLocaleString("en-IN")}
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-[10px] text-muted font-bold uppercase">Total P&L</div>
          <div className={`text-2xl font-black mt-1 ${totalPnl >= 0 ? "text-green" : "text-red"}`}>
            {totalPnl >= 0 ? "+" : ""}₹{totalPnl.toLocaleString("en-IN")}
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-[10px] text-muted font-bold uppercase">Win Rate</div>
          <div className="text-2xl font-black mt-1 text-accent">{winRate}%</div>
          <div className="text-[10px] text-muted">{winTrades}W / {lossTrades}L</div>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-[10px] text-muted font-bold uppercase">Total Trades</div>
          <div className="text-2xl font-black mt-1">{allTrades.length}</div>
        </div>
      </div>

      {/* Daily Capital Input */}
      <div className="bg-accent/5 rounded-xl border-2 border-accent/30 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-black text-accent">Daily Capital Input</h3>
            <p className="text-[10px] text-muted">Record your capital for each mode every day to track returns</p>
          </div>
          <button
            onClick={() => setShowCapitalForm(!showCapitalForm)}
            className="bg-accent hover:bg-accent/80 text-white text-xs font-bold px-4 py-2 rounded-lg"
          >
            {showCapitalForm ? "Cancel" : "Enter Today's Capital"}
          </button>
        </div>

        {showCapitalForm && (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div>
              <label className="text-[10px] text-muted block mb-1">Mode</label>
              <select
                value={capitalForm.mode}
                onChange={(e) => setCapitalForm({ ...capitalForm, mode: e.target.value })}
                className="w-full bg-background text-foreground text-xs px-3 py-2 rounded border border-border focus:border-accent outline-none"
              >
                {MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-1">Capital (₹)</label>
              <input
                type="text"
                inputMode="numeric"
                value={capitalForm.capital}
                onChange={(e) => setCapitalForm({ ...capitalForm, capital: e.target.value })}
                placeholder="100000"
                className="w-full bg-background text-foreground text-xs px-3 py-2 rounded border border-border focus:border-accent outline-none"
              />
            </div>
            <div className="flex items-end">
              <button onClick={recordCapital} className="w-full bg-green hover:bg-green/80 text-white text-xs font-bold px-4 py-2 rounded">
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Per-Mode Returns */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {MODES.map((m) => {
          const ret = modeReturns[m];
          const hasData = ret && ret.days > 0;
          const returnColor = ret && ret.total_return >= 0 ? "text-green" : "text-red";

          return (
            <div key={m} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase text-accent">{m}</span>
                <span className="text-[10px] text-muted">{ret?.days || 0} days tracked</span>
              </div>
              {hasData ? (
                <>
                  <div className={`text-xl font-black ${returnColor}`}>
                    {ret.total_return >= 0 ? "+" : ""}₹{ret.total_return.toLocaleString("en-IN")}
                  </div>
                  <div className={`text-xs font-semibold ${returnColor}`}>
                    {ret.total_return_pct >= 0 ? "+" : ""}{ret.total_return_pct}%
                  </div>
                  <div className="text-[10px] text-muted mt-1">
                    ₹{ret.first_capital?.toLocaleString("en-IN")} → ₹{ret.current_capital?.toLocaleString("en-IN")}
                  </div>

                  {/* Mini chart */}
                  {ret.entries && ret.entries.length > 1 && (
                    <div className="mt-2">
                      <ResponsiveContainer width="100%" height={50}>
                        <LineChart data={ret.entries}>
                          <Line dataKey="capital" stroke={ret.total_return >= 0 ? "#10b981" : "#ef4444"} dot={false} strokeWidth={1.5} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-muted mt-2">No data yet. Enter daily capital to track.</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Goal Progress */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-muted uppercase">
            Goal: ₹{capital.toLocaleString("en-IN")} → ₹{target >= 10000000 ? (target / 10000000).toFixed(1) + " Cr" : (target / 100000).toFixed(0) + "L"}
          </span>
          <span className="text-xs font-bold text-accent">{progressPct.toFixed(2)}%</span>
        </div>
        <div className="h-4 bg-background rounded-full overflow-hidden mb-3">
          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="grid grid-cols-4 gap-3 text-center text-xs">
          <div className="bg-background rounded-lg p-2">
            <div className="text-muted">Days</div>
            <div className="font-bold text-lg">{projection.days}</div>
          </div>
          <div className="bg-background rounded-lg p-2">
            <div className="text-muted">Months</div>
            <div className="font-bold text-lg">{projection.months}</div>
          </div>
          <div className="bg-background rounded-lg p-2">
            <div className="text-muted">Daily Target</div>
            <div className="font-bold text-green">₹{projection.daily_target_rupees.toLocaleString("en-IN")}</div>
          </div>
          <div className="bg-background rounded-lg p-2">
            <div className="text-muted">Weekly Target</div>
            <div className="font-bold text-green">₹{projection.weekly_target_rupees.toLocaleString("en-IN")}</div>
          </div>
        </div>
      </div>

      {/* Goal Calculator — realistic projections */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="text-sm font-black mb-3">Goal Calculator — How to reach your target?</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="text-[10px] text-muted block mb-1">Target Amount (₹)</label>
            <input type="text" inputMode="numeric" value={goalCalc.target}
              onChange={(e) => setGoalCalc({ ...goalCalc, target: e.target.value })}
              className="w-full bg-background text-foreground text-sm px-3 py-2 rounded border border-border focus:border-accent outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-1">Starting Capital (₹)</label>
            <input type="text" inputMode="numeric" value={goalCalc.investment}
              onChange={(e) => setGoalCalc({ ...goalCalc, investment: e.target.value })}
              className="w-full bg-background text-foreground text-sm px-3 py-2 rounded border border-border focus:border-accent outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-1">Daily Return %</label>
            <input type="text" inputMode="decimal" value={goalCalc.dailyReturn}
              onChange={(e) => setGoalCalc({ ...goalCalc, dailyReturn: e.target.value })}
              className="w-full bg-background text-foreground text-sm px-3 py-2 rounded border border-border focus:border-accent outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-muted block mb-1">OR fixed months</label>
            <input type="text" inputMode="numeric" value={goalCalc.months}
              onChange={(e) => setGoalCalc({ ...goalCalc, months: e.target.value })}
              placeholder="Leave empty for auto"
              className="w-full bg-background text-foreground text-sm px-3 py-2 rounded border border-border focus:border-accent outline-none" />
          </div>
        </div>

        {(() => {
          const tgt = parseFloat(goalCalc.target) || 10000000;
          const inv = parseFloat(goalCalc.investment) || 100000;
          const dailyPct = parseFloat(goalCalc.dailyReturn) || 1;
          const fixedMonths = parseFloat(goalCalc.months) || 0;

          // Calculate days needed at given daily return
          const dailyMult = 1 + dailyPct / 100;
          const daysNeeded = dailyPct > 0 ? Math.ceil(Math.log(tgt / inv) / Math.log(dailyMult)) : 999999;
          const monthsNeeded = Math.round(daysNeeded / 22 * 10) / 10;
          const yearsNeeded = Math.round(daysNeeded / 252 * 100) / 100;

          // If user specified months, calculate required daily return
          let requiredDaily = dailyPct;
          if (fixedMonths > 0) {
            const tradingDays = fixedMonths * 22;
            requiredDaily = (Math.pow(tgt / inv, 1 / tradingDays) - 1) * 100;
          }

          // Reality check — probability assessment
          let probability = "HIGH";
          let probabilityColor = "text-green";
          let realityCheck = "";
          const effectiveDaily = fixedMonths > 0 ? requiredDaily : dailyPct;

          if (effectiveDaily <= 0.3) {
            probability = "VERY HIGH (85%+)";
            probabilityColor = "text-green";
            realityCheck = "Very achievable with disciplined swing trading. Even index funds + some active trades can do this.";
          } else if (effectiveDaily <= 0.5) {
            probability = "HIGH (65-85%)";
            probabilityColor = "text-green";
            realityCheck = "Achievable with good stock selection and strict risk management. Most consistent traders target this range.";
          } else if (effectiveDaily <= 1.0) {
            probability = "MODERATE (40-65%)";
            probabilityColor = "text-yellow";
            realityCheck = "Requires skilled intraday + swing trading. Possible but demands discipline and no emotional trades.";
          } else if (effectiveDaily <= 2.0) {
            probability = "LOW (15-40%)";
            probabilityColor = "text-yellow";
            realityCheck = "Very aggressive. Needs exceptional market timing and risk management. Most traders lose money at this rate.";
          } else {
            probability = "VERY LOW (<15%)";
            probabilityColor = "text-red";
            realityCheck = "Unrealistic for sustained periods. Even the best traders can't maintain this. Reduce your target or extend timeline.";
          }

          // Monthly investment needed (SIP-style) to reach goal
          const monthlyRate = dailyPct * 22 / 100; // approximate monthly return
          const monthsForSIP = fixedMonths || monthsNeeded;
          let sipMonthly = 0;
          if (monthlyRate > 0 && monthsForSIP > 0) {
            // Future value of annuity formula
            sipMonthly = (tgt - inv * Math.pow(1 + monthlyRate, monthsForSIP)) /
              ((Math.pow(1 + monthlyRate, monthsForSIP) - 1) / monthlyRate);
            if (sipMonthly < 0) sipMonthly = 0;
          }

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-[10px] text-muted">Trading Days</div>
                  <div className="text-2xl font-black">{fixedMonths ? Math.round(fixedMonths * 22) : daysNeeded}</div>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-[10px] text-muted">Months</div>
                  <div className="text-2xl font-black">{fixedMonths || monthsNeeded}</div>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-[10px] text-muted">Years</div>
                  <div className="text-2xl font-black">{fixedMonths ? (fixedMonths / 12).toFixed(1) : yearsNeeded}</div>
                </div>
                <div className="bg-background rounded-lg p-3 text-center">
                  <div className="text-[10px] text-muted">Required Daily %</div>
                  <div className="text-2xl font-black text-accent">{(fixedMonths ? requiredDaily : dailyPct).toFixed(2)}%</div>
                </div>
              </div>

              {/* Probability */}
              <div className="bg-background rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold">Probability of Success</span>
                  <span className={`text-sm font-black ${probabilityColor}`}>{probability}</span>
                </div>
                <p className="text-xs text-muted leading-relaxed">{realityCheck}</p>
              </div>

              {/* Milestones */}
              <div className="bg-background rounded-lg p-4">
                <div className="text-xs font-bold mb-2">Growth Milestones</div>
                <div className="grid grid-cols-5 gap-2 text-center text-[10px]">
                  {[1, 3, 6, 12, 24].map((m) => {
                    const tradingDays = m * 22;
                    const projected = inv * Math.pow(dailyMult, tradingDays);
                    return (
                      <div key={m} className="bg-card rounded-lg p-2">
                        <div className="text-muted">{m}mo</div>
                        <div className="font-bold text-green">₹{projected >= 10000000
                          ? (projected / 10000000).toFixed(1) + "Cr"
                          : projected >= 100000
                          ? (projected / 100000).toFixed(1) + "L"
                          : Math.round(projected).toLocaleString("en-IN")
                        }</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {sipMonthly > 0 && (
                <div className="bg-accent/5 rounded-lg p-3 border border-accent/20">
                  <span className="text-xs text-muted">OR add </span>
                  <span className="text-sm font-black text-accent">₹{Math.round(sipMonthly).toLocaleString("en-IN")}/month</span>
                  <span className="text-xs text-muted"> to reach goal faster (SIP + trading)</span>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Record Trade */}
      <div className="flex items-center gap-3">
        <button onClick={() => setShowTradeForm(!showTradeForm)}
          className="bg-accent hover:bg-accent/80 text-white text-xs font-bold px-4 py-2 rounded-lg">
          {showTradeForm ? "Cancel" : "Record Trade"}
        </button>
      </div>

      {showTradeForm && (
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-bold mb-3">Record a Trade</h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <div>
              <label className="text-[10px] text-muted block mb-1">Symbol</label>
              <input type="text" value={recordForm.symbol}
                onChange={(e) => setRecordForm({ ...recordForm, symbol: e.target.value })}
                placeholder="RELIANCE"
                className="w-full bg-background text-foreground text-xs px-3 py-2 rounded border border-border focus:border-accent outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-1">Action</label>
              <select value={recordForm.action}
                onChange={(e) => setRecordForm({ ...recordForm, action: e.target.value })}
                className="w-full bg-background text-foreground text-xs px-3 py-2 rounded border border-border focus:border-accent outline-none">
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-1">Price</label>
              <input type="text" inputMode="decimal" value={recordForm.price}
                onChange={(e) => setRecordForm({ ...recordForm, price: e.target.value })}
                placeholder="1500"
                className="w-full bg-background text-foreground text-xs px-3 py-2 rounded border border-border focus:border-accent outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-1">Shares</label>
              <input type="text" inputMode="numeric" value={recordForm.shares}
                onChange={(e) => setRecordForm({ ...recordForm, shares: e.target.value })}
                placeholder="10"
                className="w-full bg-background text-foreground text-xs px-3 py-2 rounded border border-border focus:border-accent outline-none" />
            </div>
            <div>
              <label className="text-[10px] text-muted block mb-1">Mode</label>
              <select value={recordForm.mode}
                onChange={(e) => setRecordForm({ ...recordForm, mode: e.target.value })}
                className="w-full bg-background text-foreground text-xs px-3 py-2 rounded border border-border focus:border-accent outline-none">
                {MODES.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={recordTrade} className="w-full bg-green hover:bg-green/80 text-white text-xs font-bold px-4 py-2 rounded">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Positions + Closed Trades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-bold mb-3">Open Positions ({todayPnl.open_positions.length})</h3>
          {todayPnl.open_positions.length === 0 ? (
            <p className="text-xs text-muted">No open positions</p>
          ) : (
            <div className="space-y-2">
              {todayPnl.open_positions.map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-background rounded-lg px-3 py-2">
                  <div>
                    <span className="text-xs font-bold">{p.symbol.replace(".NS", "")}</span>
                    <span className="text-[10px] text-muted ml-2">{p.shares} shares @ ₹{p.buy_price}</span>
                  </div>
                  <span className="text-xs font-bold">₹{p.amount?.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-bold mb-3">Closed Trades ({todayPnl.closed_trades.length})</h3>
          {todayPnl.closed_trades.length === 0 ? (
            <p className="text-xs text-muted">No closed trades</p>
          ) : (
            <div className="space-y-2">
              {todayPnl.closed_trades.map((t, i) => (
                <div key={i} className="flex items-center justify-between bg-background rounded-lg px-3 py-2">
                  <div>
                    <span className="text-xs font-bold">{t.symbol.replace(".NS", "")}</span>
                    <span className="text-[10px] text-muted ml-2">{t.shares} @ ₹{t.buy_price} → ₹{t.sell_price}</span>
                  </div>
                  <span className={`text-xs font-bold ${t.pnl >= 0 ? "text-green" : "text-red"}`}>
                    {t.pnl >= 0 ? "+" : ""}₹{t.pnl.toLocaleString("en-IN")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Trade History */}
      {allTrades.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-bold mb-3">Trade History (last 50)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-muted uppercase border-b border-border">
                  <th className="text-left py-2 px-2">Date</th>
                  <th className="text-left py-2 px-2">Symbol</th>
                  <th className="text-left py-2 px-2">Action</th>
                  <th className="text-left py-2 px-2">Mode</th>
                  <th className="text-right py-2 px-2">Price</th>
                  <th className="text-right py-2 px-2">Shares</th>
                  <th className="text-right py-2 px-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {[...allTrades].reverse().map((t, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-card-hover/30">
                    <td className="py-1.5 px-2 text-muted">{String(t.date || "")}</td>
                    <td className="py-1.5 px-2 font-semibold">{String(t.symbol || "").replace(".NS", "")}</td>
                    <td className="py-1.5 px-2">
                      <span className={`font-bold ${t.action === "BUY" ? "text-green" : "text-red"}`}>{String(t.action)}</span>
                    </td>
                    <td className="py-1.5 px-2 text-accent text-[10px] uppercase">{String(t.mode || "-")}</td>
                    <td className="py-1.5 px-2 text-right">₹{Number(t.price || 0).toLocaleString("en-IN")}</td>
                    <td className="py-1.5 px-2 text-right">{String(t.shares || 0)}</td>
                    <td className="py-1.5 px-2 text-right font-semibold">₹{Number(t.amount || 0).toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

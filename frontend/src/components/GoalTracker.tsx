"use client";

import type { GoalProjection, TodayPnL } from "@/lib/types";

interface Props {
  capital: number;
  goal: Record<string, number | string>;
  projection: GoalProjection;
  todayPnl: TodayPnL;
}

export default function GoalTracker({ capital, goal, projection, todayPnl }: Props) {
  const target = Number(goal.target_amount) || 10000000;
  const progressPct = Math.min(100, (capital / target) * 100);
  const dailyTarget = projection.daily_target_rupees || 0;
  const pnlColor = todayPnl.realized_pnl >= 0 ? "text-green" : "text-red";
  const hitTarget = todayPnl.realized_pnl >= dailyTarget;

  return (
    <section>
      <h2 className="text-lg font-bold mb-3">Goal & P&L Tracker</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Today's P&L */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-xs text-muted font-bold uppercase tracking-wider mb-3">TODAY&apos;S P&L</div>
          <div className={`text-3xl font-black ${pnlColor}`}>
            {todayPnl.realized_pnl >= 0 ? "+" : ""}₹{todayPnl.realized_pnl.toLocaleString("en-IN")}
          </div>
          <div className="flex gap-4 mt-3 text-xs">
            <div>
              <span className="text-muted">Invested: </span>
              <span className="font-semibold">₹{todayPnl.total_invested.toLocaleString("en-IN")}</span>
            </div>
            <div>
              <span className="text-muted">Trades: </span>
              <span className="font-semibold">{todayPnl.trade_count}</span>
            </div>
            <div>
              <span className="text-muted">Open: </span>
              <span className="font-semibold">{todayPnl.open_positions.length}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="text-xs text-muted">Daily target: ₹{dailyTarget.toLocaleString("en-IN")}</div>
            {hitTarget ? (
              <span className="text-[10px] font-bold bg-green/10 text-green px-2 py-0.5 rounded">TARGET HIT</span>
            ) : (
              <span className="text-[10px] font-bold bg-yellow/10 text-yellow px-2 py-0.5 rounded">PENDING</span>
            )}
          </div>
        </div>

        {/* Goal Progress */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="text-xs text-muted font-bold uppercase tracking-wider mb-3">GOAL: ₹{(target / 100000).toFixed(0)}L → ₹{target >= 10000000 ? (target / 10000000).toFixed(1) + " Cr" : (target / 100000).toFixed(0) + "L"}</div>

          {/* Progress bar */}
          <div className="h-3 bg-background rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted mb-3">
            <span>₹{capital.toLocaleString("en-IN")}</span>
            <span>{progressPct.toFixed(2)}%</span>
            <span>₹{target.toLocaleString("en-IN")}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-background rounded-lg p-2 text-center">
              <div className="text-muted">Days</div>
              <div className="font-bold text-lg">{projection.days}</div>
            </div>
            <div className="bg-background rounded-lg p-2 text-center">
              <div className="text-muted">Months</div>
              <div className="font-bold text-lg">{projection.months}</div>
            </div>
            <div className="bg-background rounded-lg p-2 text-center">
              <div className="text-muted">Years</div>
              <div className="font-bold text-lg">{projection.years}</div>
            </div>
          </div>
          <div className="text-[10px] text-muted mt-2 text-center">
            At {Number(goal.daily_target_percent || 1)}% daily return
          </div>
        </div>
      </div>
    </section>
  );
}

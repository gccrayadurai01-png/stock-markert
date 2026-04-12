"use client";

import { useState, useEffect } from "react";
import type {
  AutoTraderData,
  AutoTraderPosition,
  AutoTraderPendingSignal,
  AutoTraderJournalEntry,
} from "@/lib/types";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  initialData?: AutoTraderData;
}

export default function AutoTraderDashboard({ initialData }: Props) {
  const [data, setData] = useState<AutoTraderData | null>(initialData ?? null);
  const [journal, setJournal] = useState<AutoTraderJournalEntry[]>([]);
  const [tab, setTab] = useState<"positions" | "watchlist" | "journal" | "settings">("positions");
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Poll auto trader status every 10 seconds
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch(`${API}/api/auto-trader/status`);
      const d = await res.json();
      setData(d);
    } catch { /* ignore */ }
  }

  async function fetchJournal() {
    try {
      const res = await fetch(`${API}/api/auto-trader/journal?last_n=50`);
      const j = await res.json();
      setJournal(j);
    } catch { /* ignore */ }
  }

  async function toggleAutoTrader() {
    if (!data) return;
    setToggling(true);
    try {
      await fetch(`${API}/api/auto-trader/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !data.enabled }),
      });
      await fetchStatus();
    } catch { /* ignore */ }
    setToggling(false);
  }

  useEffect(() => {
    if (tab === "journal") fetchJournal();
  }, [tab]);

  const enabled = data?.enabled ?? false;
  const running = data?.running ?? false;
  const positions = data?.positions ?? [];
  const pending = data?.pending_signals ?? [];
  const stats = data?.stats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🤖</span>
          <div>
            <h1 className="text-2xl font-black text-foreground">AUTO TRADER</h1>
            <p className="text-xs text-muted">
              Emotionless. Patient. Precise. — Paper Trading Mode
            </p>
          </div>
          {data?.test_mode && (
            <span className="text-[10px] bg-yellow/20 text-yellow px-2 py-1 rounded-full font-bold">
              TEST MODE — Week 1
            </span>
          )}
        </div>

        <button
          onClick={toggleAutoTrader}
          disabled={toggling}
          className={`px-6 py-3 rounded-xl font-black text-sm transition-all ${
            enabled
              ? "bg-green text-white shadow-lg shadow-green/30 animate-pulse"
              : "bg-card border-2 border-border text-muted hover:border-green hover:text-green"
          }`}
        >
          {toggling ? "..." : enabled ? "AUTO: ON" : "AUTO: OFF"}
        </button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatusCard
          label="Status"
          value={running ? "SCANNING" : enabled ? "WAITING" : "OFF"}
          color={running ? "text-green" : "text-muted"}
          pulse={running}
        />
        <StatusCard
          label="Capital"
          value={`₹${(data?.capital ?? 0).toLocaleString("en-IN")}`}
        />
        <StatusCard
          label="Cash"
          value={`₹${(data?.cash_available ?? 0).toLocaleString("en-IN")}`}
        />
        <StatusCard
          label="Positions"
          value={`${positions.length}/${data?.risk_status?.max_positions ?? 5}`}
        />
        <StatusCard
          label="Today P&L"
          value={`₹${(data?.today_pnl ?? 0).toLocaleString("en-IN")}`}
          color={(data?.today_pnl ?? 0) >= 0 ? "text-green" : "text-red"}
        />
        <StatusCard
          label="Total P&L"
          value={`₹${(data?.total_pnl ?? 0).toLocaleString("en-IN")}`}
          color={(data?.total_pnl ?? 0) >= 0 ? "text-green" : "text-red"}
        />
        <StatusCard
          label="Heat"
          value={`${data?.portfolio_heat ?? 0}%`}
          color={(data?.portfolio_heat ?? 0) > 6 ? "text-red" : "text-green"}
        />
      </div>

      {/* Win Rate + Scans */}
      {stats && stats.total_trades > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <div className="text-[10px] text-muted uppercase font-bold">Win Rate</div>
            <div className={`text-xl font-black ${stats.win_rate >= 50 ? "text-green" : "text-red"}`}>
              {stats.win_rate}%
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <div className="text-[10px] text-muted uppercase font-bold">Total Trades</div>
            <div className="text-xl font-black text-foreground">{stats.total_trades}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <div className="text-[10px] text-muted uppercase font-bold">Avg Win</div>
            <div className="text-xl font-black text-green">₹{stats.avg_win?.toLocaleString("en-IN")}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <div className="text-[10px] text-muted uppercase font-bold">Avg Loss</div>
            <div className="text-xl font-black text-red">₹{Math.abs(stats.avg_loss ?? 0).toLocaleString("en-IN")}</div>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 text-center">
            <div className="text-[10px] text-muted uppercase font-bold">Scans</div>
            <div className="text-xl font-black text-accent">{data?.scan_count ?? 0}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border pb-1">
        {(["positions", "watchlist", "journal", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition ${
              tab === t
                ? "bg-accent/10 text-accent border-b-2 border-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t === "positions" && `📊 Positions (${positions.length})`}
            {t === "watchlist" && `👁️ Watchlist (${pending.length})`}
            {t === "journal" && "📝 Journal"}
            {t === "settings" && "⚙️ Settings"}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "positions" && <PositionsTab positions={positions} />}
      {tab === "watchlist" && <WatchlistTab signals={pending} />}
      {tab === "journal" && <JournalTab entries={journal} onRefresh={fetchJournal} />}
      {tab === "settings" && <SettingsTab onSave={fetchStatus} />}

      {/* Last scan */}
      {data?.last_scan && (
        <div className="text-center text-[10px] text-muted">
          Last scan: {new Date(data.last_scan).toLocaleTimeString("en-IN")} — Scan #{data.scan_count}
        </div>
      )}
    </div>
  );
}

// ── Sub Components ────────────────────────────────────────────────────

function StatusCard({
  label, value, color = "text-foreground", pulse = false,
}: {
  label: string; value: string; color?: string; pulse?: boolean;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-3 text-center">
      <div className="text-[9px] text-muted uppercase font-bold tracking-wider">{label}</div>
      <div className={`text-lg font-black ${color} ${pulse ? "animate-pulse" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function PositionsTab({ positions }: { positions: AutoTraderPosition[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!positions.length) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <span className="text-3xl block mb-2">🎯</span>
        <p className="text-sm font-bold text-muted">No open positions</p>
        <p className="text-xs text-muted mt-1">The Master is watching... waiting for perfect confluence (75/100)</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {positions.map((p) => {
        const isProfit = p.unrealized_pnl >= 0;
        const isExpanded = expanded === p.symbol;
        return (
          <div
            key={p.symbol}
            className={`rounded-xl border-2 overflow-hidden ${
              isProfit ? "border-green/30 bg-green/5" : "border-red/30 bg-red/5"
            }`}
          >
            <button
              onClick={() => setExpanded(isExpanded ? null : p.symbol)}
              className="w-full px-4 py-3 flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <div className={`text-xs font-black px-2 py-1 rounded ${isProfit ? "bg-green text-white" : "bg-red text-white"}`}>
                  {p.status}
                </div>
                <div>
                  <div className="font-bold text-foreground">{p.name}</div>
                  <div className="text-[10px] text-muted">{p.symbol.replace(".NS", "")}</div>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div className="text-center">
                  <div className="text-muted">Entry</div>
                  <div className="font-bold">₹{p.entry_price.toLocaleString("en-IN")}</div>
                </div>
                <div className="text-center">
                  <div className="text-muted">Current</div>
                  <div className="font-bold">₹{p.current_price.toLocaleString("en-IN")}</div>
                </div>
                <div className="text-center">
                  <div className="text-muted">P&L</div>
                  <div className={`font-bold ${isProfit ? "text-green" : "text-red"}`}>
                    ₹{p.unrealized_pnl.toLocaleString("en-IN")} ({p.unrealized_pnl_pct.toFixed(1)}%)
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-muted">Trail SL</div>
                  <div className="font-bold text-yellow">₹{p.trailing_stop.toLocaleString("en-IN")}</div>
                </div>
                <div className={`text-center px-3 py-1 rounded-lg ${
                  p.confluence_score >= 85 ? "bg-green/20 text-green" :
                  p.confluence_score >= 75 ? "bg-yellow/20 text-yellow" : "bg-red/20 text-red"
                }`}>
                  <div className="text-[9px] font-bold">CONF</div>
                  <div className="font-black text-lg">{p.confluence_score}</div>
                </div>
                <span className="text-muted">{isExpanded ? "▲" : "▼"}</span>
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-border/50 space-y-3 pt-3">
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-muted">Shares</div>
                    <div className="font-bold">{p.shares}</div>
                  </div>
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-muted">Deployed</div>
                    <div className="font-bold">₹{p.capital_deployed.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-muted">Target 1</div>
                    <div className="font-bold text-green">₹{p.target_1.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="bg-background rounded-lg p-2 text-center">
                    <div className="text-muted">Target 2</div>
                    <div className="font-bold text-green">₹{p.target_2.toLocaleString("en-IN")}</div>
                  </div>
                </div>
                <div className="bg-background rounded-lg p-3">
                  <div className="text-[10px] font-bold text-accent uppercase mb-1">WHY THE MASTER ENTERED</div>
                  <div className="space-y-1">
                    {p.entry_reasoning.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                        <span className="text-green">✓</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-[10px] text-muted">
                  Entered: {new Date(p.entry_time).toLocaleString("en-IN")}
                  {p.partial_exit_done && " | Partial exit done (T1 hit)"}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function WatchlistTab({ signals }: { signals: AutoTraderPendingSignal[] }) {
  if (!signals.length) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <span className="text-3xl block mb-2">👁️</span>
        <p className="text-sm font-bold text-muted">No stocks on watchlist</p>
        <p className="text-xs text-muted mt-1">Stocks approaching confluence threshold will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {signals.map((s) => {
        const pct = Math.min(100, (s.confluence_score / 75) * 100);
        return (
          <div key={s.symbol} className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-bold text-foreground">{s.name}</span>
                <span className="text-xs text-muted ml-2">₹{s.price.toLocaleString("en-IN")}</span>
              </div>
              <div className="text-right">
                <span className={`text-lg font-black ${s.confluence_score >= 70 ? "text-yellow" : "text-muted"}`}>
                  {s.confluence_score}/100
                </span>
                <div className="text-[9px] text-muted">Need 75 to enter</div>
              </div>
            </div>

            {/* Confluence bar */}
            <div className="w-full h-2 bg-background rounded-full overflow-hidden mb-2">
              <div
                className={`h-full rounded-full transition-all ${
                  pct >= 90 ? "bg-green" : pct >= 75 ? "bg-yellow" : "bg-accent"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Met conditions */}
            <div className="flex flex-wrap gap-1 mb-1">
              {s.met_conditions?.slice(0, 4).map((c, i) => (
                <span key={i} className="text-[9px] bg-green/10 text-green px-1.5 py-0.5 rounded">
                  ✓ {c.length > 35 ? c.substring(0, 35) + "..." : c}
                </span>
              ))}
            </div>

            {/* Missing conditions */}
            <div className="flex flex-wrap gap-1">
              {s.missing?.slice(0, 3).map((m, i) => (
                <span key={i} className="text-[9px] bg-red/10 text-red px-1.5 py-0.5 rounded">
                  ✕ {m.length > 35 ? m.substring(0, 35) + "..." : m}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JournalTab({
  entries,
  onRefresh,
}: {
  entries: AutoTraderJournalEntry[];
  onRefresh: () => void;
}) {
  useEffect(() => { onRefresh(); }, []);

  if (!entries.length) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <span className="text-3xl block mb-2">📝</span>
        <p className="text-sm font-bold text-muted">No journal entries yet</p>
        <p className="text-xs text-muted mt-1">Every trade decision will be logged with full reasoning</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.slice().reverse().map((e, i) => {
        const isEntry = e.action === "ENTER";
        const isExit = e.action === "EXIT" || e.action === "PARTIAL_EXIT";
        return (
          <div
            key={i}
            className={`bg-card rounded-lg border p-3 ${
              isEntry ? "border-green/30" : isExit ? "border-red/30" : "border-border"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                  isEntry ? "bg-green text-white" : isExit ? "bg-red text-white" : "bg-muted/20 text-muted"
                }`}>
                  {e.action}
                </span>
                <span className="font-bold text-sm text-foreground">{e.symbol?.replace(".NS", "")}</span>
                {e.confluence_score && (
                  <span className="text-[10px] text-muted">Confluence: {e.confluence_score}/100</span>
                )}
              </div>
              <div className="text-right">
                {e.pnl !== undefined && (
                  <span className={`text-sm font-bold ${(e.pnl ?? 0) >= 0 ? "text-green" : "text-red"}`}>
                    ₹{e.pnl?.toLocaleString("en-IN")} ({e.pnl_pct?.toFixed(1)}%)
                  </span>
                )}
                <div className="text-[9px] text-muted">
                  {new Date(e.timestamp).toLocaleTimeString("en-IN")}
                  {e.hold_duration_minutes ? ` | ${e.hold_duration_minutes}min` : ""}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {e.reasoning?.map((r, j) => (
                <span key={j} className="text-[9px] text-foreground/70 bg-background px-1.5 py-0.5 rounded">
                  {r}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SettingsTab({ onSave }: { onSave: () => void }) {
  const [config, setConfig] = useState<Record<string, number | boolean | string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/auto-trader/config`)
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    await fetch(`${API}/api/auto-trader/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    onSave();
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-4">
      <h3 className="text-sm font-black text-foreground uppercase">Auto Trader Configuration</h3>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <SettingInput label="Capital (₹)" value={config.capital} type="number"
          onChange={(v) => setConfig({ ...config, capital: Number(v) })} />
        <SettingInput label="Max Positions" value={config.max_positions} type="number"
          onChange={(v) => setConfig({ ...config, max_positions: Number(v) })} />
        <SettingInput label="Risk Per Trade (%)" value={config.risk_per_trade} type="number"
          onChange={(v) => setConfig({ ...config, risk_per_trade: Number(v) })} />
        <SettingInput label="Max Portfolio Heat (%)" value={config.max_portfolio_heat} type="number"
          onChange={(v) => setConfig({ ...config, max_portfolio_heat: Number(v) })} />
        <SettingInput label="Min Confluence (0-100)" value={config.min_confluence} type="number"
          onChange={(v) => setConfig({ ...config, min_confluence: Number(v) })} />
        <SettingInput label="Scan Interval (sec)" value={config.scan_interval_seconds} type="number"
          onChange={(v) => setConfig({ ...config, scan_interval_seconds: Number(v) })} />
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={!!config.test_mode}
            onChange={(e) => setConfig({ ...config, test_mode: e.target.checked })}
            className="rounded"
          />
          Test Mode (paper trading only)
        </label>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="bg-accent hover:bg-accent/80 text-white text-xs font-bold px-4 py-2 rounded-lg"
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

function SettingInput({
  label, value, type, onChange,
}: {
  label: string; value: unknown; type: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] text-muted font-semibold uppercase block mb-1">{label}</label>
      <input
        type={type}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-background text-foreground text-xs px-3 py-2 rounded border border-border focus:border-accent outline-none"
      />
    </div>
  );
}

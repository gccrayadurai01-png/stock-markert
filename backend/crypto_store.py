"""
Crypto Auto Trader Data Store — Paper portfolio persistence for crypto.

Isolated from the stock store. All files live in backend/data/crypto/ so
stocks and crypto can never collide. Mirrors auto_store.py API shape so
the rest of the backend can swap between them trivially.
"""
import json
from datetime import datetime, date
from pathlib import Path
from typing import List, Optional, Union

DATA_DIR = Path(__file__).parent / "data" / "crypto"
DATA_DIR.mkdir(parents=True, exist_ok=True)

PORTFOLIO_FILE = DATA_DIR / "portfolio.json"
JOURNAL_FILE = DATA_DIR / "trade_journal.json"
SCAN_LOG_FILE = DATA_DIR / "scan_log.json"
CONFIG_FILE = DATA_DIR / "config.json"
DAILY_FILE = DATA_DIR / "daily_summary.json"
STRATEGY_PERF_FILE = DATA_DIR / "strategy_performance.json"


def _read(path: Path) -> Union[dict, list]:
    if path.exists():
        return json.loads(path.read_text())
    return {} if ("config" in path.name or "portfolio" in path.name) else []


def _write(path: Path, data):
    path.write_text(json.dumps(data, indent=2, default=str))


# ── Config ─────────────────────────────────────────────────────────────

DEFAULT_CONFIG = {
    "enabled": False,
    "capital": 10000,         # USDT (crypto native)
    "max_positions": 8,       # Crypto: more positions allowed (24/7)
    "risk_per_trade": 1.5,    # percent of capital at risk per trade
    "max_portfolio_heat": 10.0,
    "min_confluence": 50,     # Crypto moves faster; lower threshold
    "trailing_sl_atr_multiplier": 2.0,  # Crypto needs wider trail
    "scan_interval_seconds": 120,       # Scan every 2 min
    "test_mode": True,
    "test_mode_start": None,
    "use_ai_confirmation": True,
    # 24/7 markets — no session cutoffs
    # ── 6 Independent Strategies (ANY firing = trade taken) ─────────
    # A = Momentum Breakout       B = Oversold Reversal
    # C = Trend Rider             D = News Catalyst
    # E = SMC/ICT                 F = Sentiment Edge (crypto-only: F&G + funding)
    "active_strategies": ["A", "B", "C", "D", "E", "F"],
    "strategy_mode": "ANY_TRIGGERS",
    "strategy_min_scores": {"A": 55, "B": 55, "C": 55, "D": 50, "E": 55, "F": 60},
}


def load_crypto_config() -> dict:
    cfg = _read(CONFIG_FILE)
    if not cfg:
        cfg = DEFAULT_CONFIG.copy()
        _write(CONFIG_FILE, cfg)
    return {**DEFAULT_CONFIG, **cfg}


def save_crypto_config(config: dict):
    existing = load_crypto_config()
    existing.update(config)
    _write(CONFIG_FILE, existing)


# ── Portfolio ──────────────────────────────────────────────────────────

def init_portfolio(capital: float) -> dict:
    portfolio = {
        "capital": capital,        # USDT
        "cash": capital,           # USDT available
        "positions": [],
        "closed_trades": [],
        "today_pnl": 0,
        "total_pnl": 0,
        "created": datetime.now().isoformat(),
    }
    _write(PORTFOLIO_FILE, portfolio)
    return portfolio


def update_portfolio_capital(new_capital: float):
    p = get_portfolio()
    deployed = sum(
        pos.get("entry_price", 0) * pos.get("units", 0)
        for pos in p.get("positions", [])
        if pos.get("status") in ("OPEN", "PARTIAL_EXIT")
    )
    p["capital"] = new_capital
    p["cash"] = round(max(0, new_capital - deployed), 2)
    _write(PORTFOLIO_FILE, p)


def get_portfolio() -> dict:
    p = _read(PORTFOLIO_FILE)
    if not p:
        cfg = load_crypto_config()
        p = init_portfolio(cfg["capital"])
    return p


def add_position(trade: dict) -> dict:
    p = get_portfolio()
    cost = trade["entry_price"] * trade["units"]
    p["cash"] -= cost
    trade["status"] = "OPEN"
    trade["entry_time"] = datetime.now().isoformat()
    trade["unrealized_pnl"] = 0
    trade["unrealized_pnl_pct"] = 0
    p["positions"].append(trade)
    _write(PORTFOLIO_FILE, p)
    return trade


def close_position(symbol: str, exit_price: float, reason: str, partial: bool = False) -> Optional[dict]:
    p = get_portfolio()
    for i, pos in enumerate(p["positions"]):
        if pos["symbol"] == symbol and pos["status"] in ("OPEN", "PARTIAL_EXIT"):
            if partial and not pos.get("partial_exit_done"):
                exit_units = pos["units"] / 2.0
                remaining = pos["units"] - exit_units
                pnl = (exit_price - pos["entry_price"]) * exit_units

                closed = {**pos}
                closed["exit_price"] = exit_price
                closed["exit_time"] = datetime.now().isoformat()
                closed["exit_reason"] = reason
                closed["units"] = exit_units
                closed["pnl"] = round(pnl, 4)
                closed["pnl_pct"] = round((exit_price / pos["entry_price"] - 1) * 100, 2)
                closed["status"] = "CLOSED"
                p["closed_trades"].append(closed)

                pos["units"] = remaining
                pos["partial_exit_done"] = True
                pos["status"] = "PARTIAL_EXIT"
                p["cash"] += exit_price * exit_units
                p["today_pnl"] = round(p["today_pnl"] + pnl, 4)
                p["total_pnl"] = round(p["total_pnl"] + pnl, 4)
            else:
                pnl = (exit_price - pos["entry_price"]) * pos["units"]
                pos["exit_price"] = exit_price
                pos["exit_time"] = datetime.now().isoformat()
                pos["exit_reason"] = reason
                pos["pnl"] = round(pnl, 4)
                pos["pnl_pct"] = round((exit_price / pos["entry_price"] - 1) * 100, 2)
                pos["status"] = "CLOSED"
                p["cash"] += exit_price * pos["units"]
                p["today_pnl"] = round(p["today_pnl"] + pnl, 4)
                p["total_pnl"] = round(p["total_pnl"] + pnl, 4)
                p["closed_trades"].append(pos)
                p["positions"].pop(i)

            _write(PORTFOLIO_FILE, p)
            return pos
    return None


def update_trailing_stop(symbol: str, new_sl: float):
    p = get_portfolio()
    for pos in p["positions"]:
        if pos["symbol"] == symbol:
            if new_sl > pos.get("trailing_stop", pos["stop_loss"]):
                pos["trailing_stop"] = new_sl
    _write(PORTFOLIO_FILE, p)


def update_position_prices(prices: dict):
    p = get_portfolio()
    for pos in p["positions"]:
        sym = pos["symbol"]
        if sym in prices:
            current = prices[sym]
            pos["current_price"] = current
            pos["unrealized_pnl"] = round((current - pos["entry_price"]) * pos["units"], 4)
            pos["unrealized_pnl_pct"] = round((current / pos["entry_price"] - 1) * 100, 2)
    _write(PORTFOLIO_FILE, p)


def get_open_positions() -> List[dict]:
    return [p for p in get_portfolio()["positions"] if p["status"] in ("OPEN", "PARTIAL_EXIT")]


def get_portfolio_stats() -> dict:
    p = get_portfolio()
    closed = p.get("closed_trades", [])
    if not closed:
        return {
            "total_trades": 0, "winning_trades": 0, "losing_trades": 0,
            "win_rate": 0, "total_pnl": 0, "total_pnl_pct": 0,
            "avg_win": 0, "avg_loss": 0, "best_trade": None, "worst_trade": None,
            "avg_hold_time_minutes": 0, "max_drawdown": 0,
        }
    winners = [t for t in closed if t.get("pnl", 0) > 0]
    losers = [t for t in closed if t.get("pnl", 0) <= 0]
    return {
        "total_trades": len(closed),
        "winning_trades": len(winners),
        "losing_trades": len(losers),
        "win_rate": round(len(winners) / len(closed) * 100, 1) if closed else 0,
        "total_pnl": p.get("total_pnl", 0),
        "total_pnl_pct": round(p.get("total_pnl", 0) / p["capital"] * 100, 2) if p["capital"] else 0,
        "avg_win": round(sum(t["pnl"] for t in winners) / len(winners), 2) if winners else 0,
        "avg_loss": round(sum(t["pnl"] for t in losers) / len(losers), 2) if losers else 0,
        "best_trade": max(closed, key=lambda t: t.get("pnl", 0)) if closed else None,
        "worst_trade": min(closed, key=lambda t: t.get("pnl", 0)) if closed else None,
        "max_drawdown": 0,
    }


# ── Trade Journal ──────────────────────────────────────────────────────

def log_trade_decision(decision: dict):
    journal = _read(JOURNAL_FILE)
    if not isinstance(journal, list):
        journal = []
    decision["timestamp"] = datetime.now().isoformat()
    journal.append(decision)
    _write(JOURNAL_FILE, journal[-500:])


def get_trade_journal(last_n: int = 50) -> List[dict]:
    journal = _read(JOURNAL_FILE)
    if not isinstance(journal, list):
        return []
    return journal[-last_n:]


# ── Scan Log ───────────────────────────────────────────────────────────

def save_scan_result(result: dict):
    logs = _read(SCAN_LOG_FILE)
    if not isinstance(logs, list):
        logs = []
    result["timestamp"] = datetime.now().isoformat()
    logs.append(result)
    _write(SCAN_LOG_FILE, logs[-100:])


def get_pending_signals() -> List[dict]:
    logs = _read(SCAN_LOG_FILE)
    if not isinstance(logs, list) or not logs:
        return []
    return logs[-1].get("pending_signals", [])


def get_scan_history(last_n: int = 20) -> List[dict]:
    logs = _read(SCAN_LOG_FILE)
    if not isinstance(logs, list):
        return []
    return logs[-last_n:]


# ── Daily Summary ──────────────────────────────────────────────────────

def save_daily_summary(ai_summary: Optional[dict] = None):
    p = get_portfolio()
    stats = get_portfolio_stats()
    journal = get_trade_journal(200)

    today_str = date.today().isoformat()
    today_entries = [j for j in journal if j.get("timestamp", "").startswith(today_str)]
    trades_taken = [j for j in today_entries if j.get("action") == "ENTER"]
    trades_exited = [j for j in today_entries if j.get("action") in ("EXIT", "PARTIAL_EXIT")]
    skips = [j for j in today_entries if j.get("action") == "SKIP"]

    scans = get_scan_history(50)
    today_scans = [s for s in scans if s.get("timestamp", "").startswith(today_str)]

    summary = {
        "date": today_str,
        "capital": p["capital"],
        "cash": p["cash"],
        "positions_held": len(p["positions"]),
        "today_pnl": p["today_pnl"],
        "total_pnl": p["total_pnl"],
        "stats": stats,
        "total_scans": len(today_scans),
        "trades_taken": len(trades_taken),
        "trades_exited": len(trades_exited),
        "trades_skipped": len(skips),
        "trade_details": [
            {
                "symbol": t.get("symbol", ""),
                "action": t.get("action", ""),
                "confluence_score": t.get("confluence_score", 0),
                "entry_price": t.get("entry_price", 0),
                "reasoning": t.get("reasoning", []),
            }
            for t in trades_taken
        ],
        "exit_details": [
            {
                "symbol": t.get("symbol", ""),
                "pnl": t.get("pnl", 0),
                "pnl_pct": t.get("pnl_pct", 0),
                "reasoning": t.get("reasoning", []),
            }
            for t in trades_exited
        ],
    }

    if ai_summary:
        summary["ai_summary"] = ai_summary

    summaries = _read(DAILY_FILE)
    if not isinstance(summaries, list):
        summaries = []

    summaries = [s for s in summaries if s.get("date") != today_str]
    summaries.append(summary)
    _write(DAILY_FILE, summaries[-90:])


def get_daily_summaries(last_n: int = 30) -> List[dict]:
    summaries = _read(DAILY_FILE)
    if not isinstance(summaries, list):
        return []
    return summaries[-last_n:]


def get_daily_summary_by_date(target_date: str) -> Optional[dict]:
    summaries = _read(DAILY_FILE)
    if not isinstance(summaries, list):
        return None
    for s in summaries:
        if s.get("date") == target_date:
            return s
    return None


def reset_daily_pnl():
    p = get_portfolio()
    p["today_pnl"] = 0
    _write(PORTFOLIO_FILE, p)


# ── Strategy Performance ──────────────────────────────────────────────

_STRATEGY_EMPTY = lambda: {
    "trades": 0, "wins": 0, "losses": 0,
    "pnl": 0.0, "win_rate": 0.0,
    "avg_win": 0.0, "avg_loss": 0.0,
    "best_pnl": 0.0, "worst_pnl": 0.0,
}


def get_strategy_performance() -> dict:
    data = _read(STRATEGY_PERF_FILE)
    if not isinstance(data, dict):
        return {}
    return data


def record_strategy_trade(strategy_key: str, pnl: float, is_win: bool):
    data = get_strategy_performance()
    if strategy_key not in data:
        data[strategy_key] = _STRATEGY_EMPTY()

    s = data[strategy_key]
    s["trades"] += 1
    s["pnl"] = round(s["pnl"] + pnl, 2)
    if is_win:
        s["wins"] += 1
        if pnl > s["best_pnl"]:
            s["best_pnl"] = round(pnl, 2)
    else:
        s["losses"] += 1
        if pnl < s["worst_pnl"]:
            s["worst_pnl"] = round(pnl, 2)

    s["win_rate"] = round(s["wins"] / s["trades"] * 100, 1) if s["trades"] > 0 else 0.0

    wins_total = [t for t in data.get("_trade_log", []) if t.get("strategy") == strategy_key and t.get("pnl", 0) > 0]
    losses_total = [t for t in data.get("_trade_log", []) if t.get("strategy") == strategy_key and t.get("pnl", 0) <= 0]
    s["avg_win"] = round(sum(t["pnl"] for t in wins_total) / len(wins_total), 2) if wins_total else 0.0
    s["avg_loss"] = round(sum(t["pnl"] for t in losses_total) / len(losses_total), 2) if losses_total else 0.0

    _write(STRATEGY_PERF_FILE, data)


def log_strategy_trade_detail(symbol: str, strategy_key: str, pnl: float,
                               strategies_confirmed: List[str], scores: dict):
    data = _read(STRATEGY_PERF_FILE)
    if not isinstance(data, dict):
        data = {}
    log = data.get("_trade_log", [])
    log.append({
        "symbol": symbol,
        "strategy": strategy_key,
        "pnl": round(pnl, 2),
        "strategies_confirmed": strategies_confirmed,
        "scores": scores,
        "date": date.today().isoformat(),
        "timestamp": datetime.now().isoformat(),
    })
    data["_trade_log"] = log[-500:]
    _write(STRATEGY_PERF_FILE, data)


def reset_strategy_performance():
    _write(STRATEGY_PERF_FILE, {})

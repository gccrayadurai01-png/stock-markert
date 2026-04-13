"""
Auto Trader Data Store — Paper portfolio persistence.
Stores portfolio, trade journal, scan logs, and daily summaries.
"""
import json
import os
from datetime import datetime, date
from pathlib import Path
from typing import List, Optional, Union

DATA_DIR = Path(__file__).parent / "data" / "auto"
DATA_DIR.mkdir(parents=True, exist_ok=True)

PORTFOLIO_FILE = DATA_DIR / "portfolio.json"
JOURNAL_FILE = DATA_DIR / "trade_journal.json"
SCAN_LOG_FILE = DATA_DIR / "scan_log.json"
CONFIG_FILE = DATA_DIR / "config.json"
DAILY_FILE = DATA_DIR / "daily_summary.json"


def _read(path: Path) -> Union[dict, list]:
    if path.exists():
        return json.loads(path.read_text())
    return {} if "config" in path.name or "portfolio" in path.name else []


def _write(path: Path, data):
    path.write_text(json.dumps(data, indent=2, default=str))


# ── Config ─────────────────────────────────────────────────────────────

DEFAULT_CONFIG = {
    "enabled": False,
    "capital": 100000,
    "max_positions": 5,
    "risk_per_trade": 1.5,
    "max_portfolio_heat": 8.0,
    "min_confluence": 60,
    "trailing_sl_atr_multiplier": 1.5,
    "scan_interval_seconds": 150,  # 2.5 minutes
    "test_mode": True,
    "test_mode_start": None,
    "close_positions_time": "15:15",
    "no_new_trades_after": "15:00",
    "use_ai_confirmation": True,
}


def load_auto_config() -> dict:
    cfg = _read(CONFIG_FILE)
    if not cfg:
        cfg = DEFAULT_CONFIG.copy()
        _write(CONFIG_FILE, cfg)
    return {**DEFAULT_CONFIG, **cfg}


def save_auto_config(config: dict):
    existing = load_auto_config()
    existing.update(config)
    _write(CONFIG_FILE, existing)


# ── Portfolio ──────────────────────────────────────────────────────────

def init_portfolio(capital: float) -> dict:
    portfolio = {
        "capital": capital,
        "cash": capital,
        "positions": [],
        "closed_trades": [],
        "today_pnl": 0,
        "total_pnl": 0,
        "created": datetime.now().isoformat(),
    }
    _write(PORTFOLIO_FILE, portfolio)
    return portfolio


def get_portfolio() -> dict:
    p = _read(PORTFOLIO_FILE)
    if not p:
        cfg = load_auto_config()
        p = init_portfolio(cfg["capital"])
    return p


def add_position(trade: dict) -> dict:
    p = get_portfolio()
    cost = trade["entry_price"] * trade["shares"]
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
                # Close 50% on target 1
                exit_shares = pos["shares"] // 2
                remaining = pos["shares"] - exit_shares
                pnl = (exit_price - pos["entry_price"]) * exit_shares

                closed = {**pos}
                closed["exit_price"] = exit_price
                closed["exit_time"] = datetime.now().isoformat()
                closed["exit_reason"] = reason
                closed["shares"] = exit_shares
                closed["pnl"] = round(pnl, 2)
                closed["pnl_pct"] = round((exit_price / pos["entry_price"] - 1) * 100, 2)
                closed["status"] = "CLOSED"
                p["closed_trades"].append(closed)

                pos["shares"] = remaining
                pos["partial_exit_done"] = True
                pos["status"] = "PARTIAL_EXIT"
                p["cash"] += exit_price * exit_shares
                p["today_pnl"] = round(p["today_pnl"] + pnl, 2)
                p["total_pnl"] = round(p["total_pnl"] + pnl, 2)
            else:
                # Full close
                pnl = (exit_price - pos["entry_price"]) * pos["shares"]
                pos["exit_price"] = exit_price
                pos["exit_time"] = datetime.now().isoformat()
                pos["exit_reason"] = reason
                pos["pnl"] = round(pnl, 2)
                pos["pnl_pct"] = round((exit_price / pos["entry_price"] - 1) * 100, 2)
                pos["status"] = "CLOSED"
                p["cash"] += exit_price * pos["shares"]
                p["today_pnl"] = round(p["today_pnl"] + pnl, 2)
                p["total_pnl"] = round(p["total_pnl"] + pnl, 2)
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
                pos["trailing_stop"] = round(new_sl, 2)
    _write(PORTFOLIO_FILE, p)


def update_position_prices(prices: dict):
    """Update current prices and unrealized P&L for all open positions."""
    p = get_portfolio()
    for pos in p["positions"]:
        sym = pos["symbol"]
        if sym in prices:
            current = prices[sym]
            pos["current_price"] = current
            pos["unrealized_pnl"] = round((current - pos["entry_price"]) * pos["shares"], 2)
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
        "total_pnl_pct": round(p.get("total_pnl", 0) / p["capital"] * 100, 2),
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
    # Keep last 500 entries
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
    latest = logs[-1]
    return latest.get("pending_signals", [])


def get_scan_history(last_n: int = 20) -> List[dict]:
    logs = _read(SCAN_LOG_FILE)
    if not isinstance(logs, list):
        return []
    return logs[-last_n:]


# ── Daily Summary ──────────────────────────────────────────────────────

def save_daily_summary():
    p = get_portfolio()
    stats = get_portfolio_stats()
    summary = {
        "date": date.today().isoformat(),
        "capital": p["capital"],
        "cash": p["cash"],
        "positions_held": len(p["positions"]),
        "today_pnl": p["today_pnl"],
        "total_pnl": p["total_pnl"],
        "stats": stats,
    }
    summaries = _read(DAILY_FILE)
    if not isinstance(summaries, list):
        summaries = []
    summaries.append(summary)
    _write(DAILY_FILE, summaries[-90:])


def get_daily_summaries(last_n: int = 30) -> List[dict]:
    summaries = _read(DAILY_FILE)
    if not isinstance(summaries, list):
        return []
    return summaries[-last_n:]


def reset_daily_pnl():
    """Call at start of each trading day."""
    p = get_portfolio()
    p["today_pnl"] = 0
    _write(PORTFOLIO_FILE, p)

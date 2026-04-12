"""
Data Store — persists trades, P&L, config, and goals to JSON files.
No database needed. Files stored in backend/data/ directory.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, date
from typing import Dict, List, Optional

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

TRADES_FILE = os.path.join(DATA_DIR, "trades.json")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
DAILY_LOG_FILE = os.path.join(DATA_DIR, "daily_log.json")
GOALS_FILE = os.path.join(DATA_DIR, "goals.json")
MODE_CONFIG_DIR = os.path.join(DATA_DIR, "modes")
os.makedirs(MODE_CONFIG_DIR, exist_ok=True)


def _load(filepath: str) -> dict:
    try:
        with open(filepath, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save(filepath: str, data: dict):
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2, default=str)


# ── Config ──────────────────────────────────────────────────────────────

def save_config(config: dict):
    existing = _load(CONFIG_FILE)
    existing.update(config)
    existing["last_updated"] = datetime.now().isoformat()
    _save(CONFIG_FILE, existing)


def load_config() -> dict:
    defaults = {
        "capital": 100000,
        "risk_percent": 1.0,
        "max_trades": 3,
        "trading_mode": "intraday",  # intraday, swing, options, positional
        "max_stocks": 3,
    }
    saved = _load(CONFIG_FILE)
    defaults.update(saved)
    return defaults


# ── Trades ──────────────────────────────────────────────────────────────

def save_trade(trade: dict):
    """Save a trade entry (buy or sell)."""
    data = _load(TRADES_FILE)
    if "trades" not in data:
        data["trades"] = []

    trade["timestamp"] = datetime.now().isoformat()
    trade["date"] = date.today().isoformat()
    data["trades"].append(trade)
    _save(TRADES_FILE, data)


def get_trades(day: Optional[str] = None) -> List[dict]:
    """Get trades, optionally filtered by date."""
    data = _load(TRADES_FILE)
    trades = data.get("trades", [])
    if day:
        trades = [t for t in trades if t.get("date") == day]
    return trades


def get_today_trades() -> List[dict]:
    return get_trades(date.today().isoformat())


def get_today_pnl() -> dict:
    """Calculate today's P&L from trades."""
    trades = get_today_trades()
    total_invested = 0
    total_returns = 0
    open_positions = []
    closed_trades = []

    buys = {}
    for t in trades:
        sym = t.get("symbol", "")
        if t.get("action") == "BUY":
            if sym not in buys:
                buys[sym] = []
            buys[sym].append(t)
            total_invested += t.get("amount", 0)
        elif t.get("action") == "SELL" and sym in buys and buys[sym]:
            buy = buys[sym].pop(0)
            pnl = (t.get("price", 0) - buy.get("price", 0)) * buy.get("shares", 0)
            total_returns += pnl
            closed_trades.append({
                "symbol": sym,
                "buy_price": buy.get("price"),
                "sell_price": t.get("price"),
                "shares": buy.get("shares"),
                "pnl": round(pnl, 2),
            })

    # Remaining open positions
    for sym, remaining in buys.items():
        for b in remaining:
            open_positions.append({
                "symbol": sym,
                "buy_price": b.get("price"),
                "shares": b.get("shares"),
                "amount": b.get("amount"),
            })

    return {
        "date": date.today().isoformat(),
        "total_invested": round(total_invested, 2),
        "realized_pnl": round(total_returns, 2),
        "closed_trades": closed_trades,
        "open_positions": open_positions,
        "trade_count": len(trades),
    }


# ── Daily Log ───────────────────────────────────────────────────────────

def save_daily_log(entry: dict):
    """Save end-of-day summary."""
    data = _load(DAILY_LOG_FILE)
    if "logs" not in data:
        data["logs"] = []
    entry["date"] = date.today().isoformat()
    entry["timestamp"] = datetime.now().isoformat()
    data["logs"].append(entry)
    _save(DAILY_LOG_FILE, data)


def get_daily_logs(last_n: int = 30) -> List[dict]:
    data = _load(DAILY_LOG_FILE)
    logs = data.get("logs", [])
    return logs[-last_n:]


# ── Goals ───────────────────────────────────────────────────────────────

def save_goal(goal: dict):
    """Save investment goal (e.g., reach 1 crore)."""
    data = _load(GOALS_FILE)
    data.update(goal)
    data["last_updated"] = datetime.now().isoformat()
    _save(GOALS_FILE, data)


def load_goal() -> dict:
    defaults = {
        "target_amount": 10000000,  # 1 crore
        "current_capital": 100000,
        "daily_target_percent": 1.0,
        "start_date": date.today().isoformat(),
    }
    saved = _load(GOALS_FILE)
    defaults.update(saved)
    return defaults


def calculate_goal_projection(current_capital: float, target: float, daily_pct: float) -> dict:
    """Calculate how many days to reach target with given daily returns."""
    if daily_pct <= 0 or current_capital <= 0 or current_capital >= target:
        return {"days": 0, "months": 0, "achievable": current_capital >= target}

    import math
    daily_mult = 1 + (daily_pct / 100)
    days = math.ceil(math.log(target / current_capital) / math.log(daily_mult))

    return {
        "days": days,
        "months": round(days / 22, 1),  # trading days per month
        "years": round(days / 252, 2),  # trading days per year
        "daily_target_rupees": round(current_capital * daily_pct / 100, 2),
        "weekly_target_rupees": round(current_capital * daily_pct / 100 * 5, 2),
        "achievable": True,
    }


# ── Signals Log ─────────────────────────────────────────────────────────

SIGNALS_FILE = os.path.join(DATA_DIR, "signals_log.json")


def save_signals(signals: dict):
    """Save generated signals for history tracking."""
    data = _load(SIGNALS_FILE)
    if "history" not in data:
        data["history"] = []
    signals["timestamp"] = datetime.now().isoformat()
    data["history"].append(signals)
    # Keep last 100 entries
    data["history"] = data["history"][-100:]
    _save(SIGNALS_FILE, data)


def get_signal_history(last_n: int = 10) -> List[dict]:
    data = _load(SIGNALS_FILE)
    return data.get("history", [])[-last_n:]


# ── Per-Mode Config ────────────────────────────────────────────────────

MODE_DEFAULTS = {
    "intraday": {
        "capital": 100000,
        "risk_percent": 1.5,
        "max_trades": 3,
        "indicators": ["RSI", "MACD", "VWAP", "Supertrend", "EMA", "Volume"],
        "timeframe": "5min",
        "description": "Quick trades, same-day exit",
    },
    "swing": {
        "capital": 200000,
        "risk_percent": 2.0,
        "max_trades": 5,
        "indicators": ["RSI", "MACD", "Bollinger", "EMA", "ADX", "Supertrend"],
        "timeframe": "1day",
        "description": "Hold 2-15 days",
    },
    "positional": {
        "capital": 500000,
        "risk_percent": 3.0,
        "max_trades": 4,
        "indicators": ["EMA", "MACD", "ADX", "RSI", "Bollinger", "OBV"],
        "timeframe": "1week",
        "description": "Hold weeks to months",
    },
    "options": {
        "capital": 50000,
        "risk_percent": 5.0,
        "max_trades": 2,
        "indicators": ["RSI", "VWAP", "Bollinger", "ATR", "Volume", "OBV"],
        "timeframe": "15min",
        "description": "Options trading (high risk)",
    },
}


def save_mode_config(mode: str, config: dict):
    """Save config for a specific trading mode."""
    filepath = os.path.join(MODE_CONFIG_DIR, f"{mode}.json")
    existing = _load(filepath)
    existing.update(config)
    existing["mode"] = mode
    existing["last_updated"] = datetime.now().isoformat()
    _save(filepath, existing)


def load_mode_config(mode: str) -> dict:
    """Load config for a specific trading mode."""
    filepath = os.path.join(MODE_CONFIG_DIR, f"{mode}.json")
    defaults = dict(MODE_DEFAULTS.get(mode, MODE_DEFAULTS["intraday"]))
    defaults["mode"] = mode
    saved = _load(filepath)
    defaults.update(saved)
    return defaults


# ── Daily Capital Tracking ─────────────────────────────────────────────

DAILY_CAPITAL_FILE = os.path.join(DATA_DIR, "daily_capital.json")


def save_daily_capital(entry: dict):
    """Save daily capital input for a mode. entry = {mode, capital, date}"""
    data = _load(DAILY_CAPITAL_FILE)
    if "entries" not in data:
        data["entries"] = []
    entry["timestamp"] = datetime.now().isoformat()
    if "date" not in entry:
        entry["date"] = date.today().isoformat()
    data["entries"].append(entry)
    _save(DAILY_CAPITAL_FILE, data)


def get_daily_capital(mode: Optional[str] = None, last_n: int = 30) -> List[dict]:
    """Get daily capital entries, optionally filtered by mode."""
    data = _load(DAILY_CAPITAL_FILE)
    entries = data.get("entries", [])
    if mode:
        entries = [e for e in entries if e.get("mode") == mode]
    return entries[-last_n:]


def get_mode_returns(mode: str) -> dict:
    """Calculate returns for a mode based on daily capital entries."""
    entries = get_daily_capital(mode)
    if len(entries) < 2:
        return {"total_return": 0, "total_return_pct": 0, "days": len(entries), "entries": entries}

    first_capital = entries[0].get("capital", 0)
    last_capital = entries[-1].get("capital", 0)
    total_return = last_capital - first_capital
    total_return_pct = (total_return / first_capital * 100) if first_capital > 0 else 0

    return {
        "total_return": round(total_return, 2),
        "total_return_pct": round(total_return_pct, 2),
        "days": len(entries),
        "first_capital": first_capital,
        "current_capital": last_capital,
        "entries": entries,
    }

"""Storage for manually taken trades."""
import json, os, uuid
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "auto")
MANUAL_TRADES_FILE = os.path.join(DATA_DIR, "manual_trades.json")

def _read():
    if not os.path.exists(MANUAL_TRADES_FILE):
        return []
    try:
        with open(MANUAL_TRADES_FILE) as f:
            return json.load(f)
    except:
        return []

def _write(trades):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(MANUAL_TRADES_FILE, "w") as f:
        json.dump(trades, f, indent=2)

def save_manual_trade(trade: dict) -> dict:
    trades = _read()
    trade["id"] = str(uuid.uuid4())[:8]
    trade["entry_time"] = datetime.now().isoformat()
    trade["status"] = "OPEN"
    trade["pnl"] = 0.0
    trade["pnl_pct"] = 0.0
    trades.append(trade)
    _write(trades)
    return trade

def get_manual_trades() -> list:
    return _read()

def exit_manual_trade(trade_id: str, exit_price: float, notes: str = "") -> dict:
    trades = _read()
    for t in trades:
        if t["id"] == trade_id:
            entry = t.get("entry_price", exit_price)
            qty = t.get("quantity", 1)
            t["exit_price"] = exit_price
            t["exit_time"] = datetime.now().isoformat()
            t["status"] = "CLOSED"
            t["pnl"] = round((exit_price - entry) * qty, 2)
            t["pnl_pct"] = round(((exit_price - entry) / entry) * 100, 2) if entry else 0
            t["exit_notes"] = notes
            break
    _write(trades)
    return next((t for t in trades if t["id"] == trade_id), {})

def delete_manual_trade(trade_id: str):
    trades = [t for t in _read() if t["id"] != trade_id]
    _write(trades)

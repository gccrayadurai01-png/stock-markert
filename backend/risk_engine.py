"""Risk Engine — position sizing, capital allocation, and risk management."""
from __future__ import annotations

from typing import Dict, List


def calculate_position_size(
    capital: float,
    risk_percent: float,
    entry_price: float,
    stop_loss: float,
) -> dict:
    """
    Calculate position size based on risk per trade.

    Formula:
        risk_amount = capital * (risk_percent / 100)
        risk_per_share = abs(entry_price - stop_loss)
        shares = risk_amount / risk_per_share
        capital_required = shares * entry_price
    """
    if entry_price <= 0 or stop_loss <= 0:
        return {"shares": 0, "capital_required": 0, "risk_amount": 0}

    risk_amount = capital * (risk_percent / 100)
    risk_per_share = abs(entry_price - stop_loss)

    if risk_per_share == 0:
        return {"shares": 0, "capital_required": 0, "risk_amount": risk_amount}

    shares = int(risk_amount / risk_per_share)
    capital_required = round(shares * entry_price, 2)

    return {
        "shares": shares,
        "capital_required": capital_required,
        "risk_amount": round(risk_amount, 2),
        "risk_per_share": round(risk_per_share, 2),
        "risk_reward_t1": 0,  # filled by caller
        "risk_reward_t2": 0,
    }


def calculate_risk_reward(entry: float, stop_loss: float, target: float) -> float:
    """Calculate risk:reward ratio."""
    risk = abs(entry - stop_loss)
    reward = abs(target - entry)
    if risk == 0:
        return 0
    return round(reward / risk, 2)


def allocate_capital(capital: float, signals: List[dict], risk_percent: float = 1.0) -> List[dict]:
    """
    Allocate capital across multiple signals.
    Max 40% of capital in any single trade.
    Total allocation capped at 80% (keep 20% cash buffer).
    """
    max_per_trade = capital * 0.40
    max_total = capital * 0.80
    total_allocated = 0.0

    for signal in signals:
        if total_allocated >= max_total:
            signal["position_size"] = 0
            signal["capital_allocated"] = 0
            signal["shares"] = 0
            continue

        pos = calculate_position_size(
            capital, risk_percent, signal["entry_price"], signal["stop_loss"]
        )

        # Cap at max per trade
        alloc = min(pos["capital_required"], max_per_trade, max_total - total_allocated)
        shares = int(alloc / signal["entry_price"]) if signal["entry_price"] > 0 else 0
        alloc = round(shares * signal["entry_price"], 2)

        signal["shares"] = shares
        signal["capital_allocated"] = alloc
        signal["risk_amount"] = round(shares * pos["risk_per_share"], 2) if pos["risk_per_share"] else 0
        signal["risk_percent_actual"] = round((signal["risk_amount"] / capital) * 100, 2) if capital > 0 else 0

        if signal.get("target_1"):
            signal["rr_t1"] = calculate_risk_reward(
                signal["entry_price"], signal["stop_loss"], signal["target_1"]
            )
        if signal.get("target_2"):
            signal["rr_t2"] = calculate_risk_reward(
                signal["entry_price"], signal["stop_loss"], signal["target_2"]
            )

        total_allocated += alloc

    return signals


def validate_signal(signal: dict) -> List[str]:
    """Validate a trading signal for common mistakes."""
    warnings = []

    entry = signal.get("entry_price", 0)
    sl = signal.get("stop_loss", 0)
    t1 = signal.get("target_1", 0)
    action = signal.get("action", "BUY")

    if action == "BUY":
        if sl >= entry:
            warnings.append("Stop loss must be BELOW entry for BUY signals")
        if t1 and t1 <= entry:
            warnings.append("Target must be ABOVE entry for BUY signals")
        sl_pct = ((entry - sl) / entry) * 100 if entry > 0 else 0
        if sl_pct > 5:
            warnings.append(f"Stop loss is {sl_pct:.1f}% away — too wide, reduces position size")
    elif action == "SELL":
        if sl <= entry:
            warnings.append("Stop loss must be ABOVE entry for SELL signals")
        if t1 and t1 >= entry:
            warnings.append("Target must be BELOW entry for SELL signals")

    return warnings

"""
Crypto SMC/ICT Engine — Smart Money Concepts on crypto pairs.

Reuses the core SMC algorithms (order blocks, FVG, market structure, etc.)
from smc_engine.py, but feeds them 15-minute Binance candles instead of
Yahoo Finance data.

Crypto markets are 24/7 and institutionally traded on Binance/CME — SMC
works exceptionally well because:
  • No gap opens/closes to pollute structure
  • Liquidity zones are very clear on 15m/1h
  • Order blocks form consistently across weekend sessions
"""
from __future__ import annotations

import logging
from typing import List

import httpx

from smc_engine import (
    find_swing_highs,
    find_swing_lows,
    find_order_blocks,
    find_fair_value_gaps,
    detect_market_structure,
    find_liquidity_levels,
    calculate_premium_discount,
)
from crypto_engine import BINANCE_SPOT, HEADERS, _precision_for, SYMBOL_NAMES

logger = logging.getLogger(__name__)


def fetch_crypto_candles(symbol: str, interval: str = "15m", limit: int = 100) -> List[dict]:
    """Fetch 15m (or other) klines from Binance, shaped for SMC algorithms."""
    try:
        r = httpx.get(
            f"{BINANCE_SPOT}/api/v3/klines",
            params={"symbol": symbol, "interval": interval, "limit": limit},
            headers=HEADERS,
            timeout=10,
        )
        if r.status_code != 200:
            return []
        klines = r.json()
    except Exception as e:
        logger.error(f"Crypto SMC candles error {symbol}: {e}")
        return []

    candles = []
    for k in klines:
        try:
            o = float(k[1]); h = float(k[2]); l = float(k[3]); c = float(k[4])
            v = float(k[5])
            candles.append({
                "time":   int(k[0]) // 1000,  # ms → seconds
                "open":   o, "high": h, "low": l, "close": c, "volume": v,
                "body":   abs(c - o),
                "is_bullish": c > o,
            })
        except (ValueError, IndexError):
            continue
    return candles


def _fmt_price(p: float, ref: float) -> str:
    """Format a price appropriately for its magnitude (crypto can be micro)."""
    return f"${p:,.{_precision_for(ref)}f}"


def analyze_crypto_smc(symbol: str, current_price: float = 0, interval: str = "15m") -> dict:
    """
    Full SMC/ICT analysis on a crypto pair. Scores 0–100.
    """
    candles = fetch_crypto_candles(symbol, interval=interval, limit=100)
    if len(candles) < 20:
        return {
            "available": False,
            "symbol": symbol,
            "smc_score": 0,
            "signal": "NO_DATA",
            "reasons": ["Insufficient candle data for SMC analysis"],
            "missing": [],
        }

    current = current_price if current_price else candles[-1]["close"]
    order_blocks = find_order_blocks(candles)
    fvgs         = find_fair_value_gaps(candles)
    structure    = detect_market_structure(candles)
    liquidity    = find_liquidity_levels(candles)
    pd_zone      = calculate_premium_discount(candles)

    score   = 0
    reasons = []
    missing = []

    # ── 1. Market Structure Bias (max 25 pts) ────────────────────────
    trend = structure.get("trend", "NEUTRAL")
    last_event = structure.get("last_event")

    if trend == "BULLISH":
        score += 20
        reasons.append("📈 Bullish market structure (HH + HL)")
    elif trend == "BEARISH":
        score -= 10
        missing.append("📉 Bearish market structure (LH + LL)")
    else:
        missing.append("📊 Neutral structure — no clear trend")

    if last_event:
        t, d = last_event.get("type"), last_event.get("direction")
        if t == "BOS" and d == "BULLISH":
            score += 5
            reasons.append(f"🔼 Bullish BOS: {last_event.get('label', '')}")
        elif t == "CHoCH" and d == "BULLISH":
            score += 8
            reasons.append("🔄 Bullish CHoCH — potential reversal up")
        elif t == "BOS" and d == "BEARISH":
            score -= 5
            missing.append(f"🔽 Bearish BOS: {last_event.get('label', '')}")

    # ── 2. Order Block Proximity (max 25 pts) ──────────────────────
    bullish_obs = [ob for ob in order_blocks if ob["type"] == "BULLISH"]
    bearish_obs = [ob for ob in order_blocks if ob["type"] == "BEARISH"]

    if bullish_obs:
        ob = bullish_obs[0]
        if ob["low"] <= current <= ob["high"] * 1.005:
            score += 25
            reasons.append(f"🟩 Price IN bullish OB {_fmt_price(ob['low'], current)}–{_fmt_price(ob['high'], current)}")
        elif current >= ob["low"] * 0.995 and current <= ob["high"] * 1.02:
            score += 15
            reasons.append(f"🟩 Price near bullish OB {_fmt_price(ob['low'], current)}")
        else:
            missing.append(f"OB at {_fmt_price(ob['low'], current)} not yet tagged")
    else:
        missing.append("No fresh bullish Order Block identified")

    if bearish_obs:
        bob = bearish_obs[0]
        if bob["low"] <= current <= bob["high"] * 1.005:
            score -= 10
            missing.append(f"🟥 Price in bearish OB {_fmt_price(bob['high'], current)}")

    # ── 3. Fair Value Gap (max 20 pts) ────────────────────────────
    bullish_fvg = [f for f in fvgs if f["type"] == "BULLISH"]
    bearish_fvg = [f for f in fvgs if f["type"] == "BEARISH"]

    if bullish_fvg:
        fvg = bullish_fvg[0]
        if fvg["low"] <= current <= fvg["high"]:
            score += 20
            reasons.append(f"⬜ Price filling bullish FVG {_fmt_price(fvg['low'], current)}–{_fmt_price(fvg['high'], current)}")
        elif current < fvg["low"] and (fvg["low"] - current) / current < 0.01:
            score += 10
            reasons.append(f"⬜ Bullish FVG just above {_fmt_price(fvg['low'], current)}")
        else:
            missing.append(f"Bullish FVG at {_fmt_price(fvg['low'], current)} not yet reached")
    else:
        missing.append("No unfilled bullish FVG detected")

    if bearish_fvg:
        fvg = bearish_fvg[0]
        if fvg["low"] <= current <= fvg["high"]:
            score -= 8
            missing.append(f"Bearish FVG supply overhead {_fmt_price(fvg['high'], current)}")

    # ── 4. Premium / Discount Zone (max 15 pts) ───────────────────
    zone = pd_zone.get("zone", "NEUTRAL")
    pct  = pd_zone.get("pct", 50)

    if zone == "DISCOUNT":
        score += 10
        reasons.append(f"💚 DISCOUNT zone ({pct:.0f}% of range) — smart money buy area")
    elif zone == "PREMIUM":
        score -= 5
        missing.append(f"🔴 PREMIUM zone ({pct:.0f}% of range) — avoid longs")

    if pd_zone.get("in_ote_buy"):
        score += 5
        reasons.append("🎯 OTE — 38.2–61.8% retracement (optimal long entry)")

    # ── 5. Liquidity Context (max 15 pts) ────────────────────────
    ssl = liquidity.get("sell_side_liquidity", [])
    bsl = liquidity.get("buy_side_liquidity", [])

    if ssl:
        nearest = ssl[0]
        dist_pct = (nearest - current) / current * 100
        if 0.5 < dist_pct < 5:  # crypto moves wider than stocks
            score += 15
            reasons.append(f"🎯 Sell-side liquidity at {_fmt_price(nearest, current)} ({dist_pct:.1f}% above) — magnet")
        elif dist_pct >= 5:
            score += 5
            reasons.append(f"🎯 Liquidity above {_fmt_price(nearest, current)} ({dist_pct:.1f}% away)")

    if bsl:
        nearest = bsl[0]
        dist_pct = (current - nearest) / current * 100
        if dist_pct < 0.8:
            score -= 5
            missing.append(f"⚠️ Buy-side liquidity just below at {_fmt_price(nearest, current)} — stop hunt risk")

    score = max(0, min(100, score))

    if score >= 65:
        signal = "BULLISH"
    elif score >= 45:
        signal = "NEUTRAL"
    else:
        signal = "BEARISH"

    return {
        "available":        True,
        "symbol":           symbol,
        "name":             SYMBOL_NAMES.get(symbol, symbol.replace("USDT", "")),
        "smc_score":        score,
        "signal":           signal,
        "reasons":          reasons,
        "missing":          missing,
        "structure":        structure,
        "order_blocks":     order_blocks[:3],
        "fair_value_gaps":  fvgs[:3],
        "premium_discount": pd_zone,
        "liquidity":        liquidity,
        "current_price":    current,
        "candles_used":     len(candles),
        "interval":         interval,
    }

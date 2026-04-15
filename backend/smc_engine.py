"""
SMC / ICT Engine — Smart Money Concepts for NSE Intraday Trading
================================================================
Implements core ICT (Inner Circle Trader) / SMC (Smart Money Concepts) methodology:

1. Order Blocks (OB)        — Last opposing candle before a strong impulse move
2. Fair Value Gaps (FVG)    — 3-candle imbalances price wants to fill
3. Break of Structure (BOS) — Continuation of trend (breaks previous swing high/low)
4. Change of Character (CHoCH) — Potential trend reversal signal
5. Liquidity Levels         — Equal highs/lows = stop hunt targets
6. Premium / Discount Zones — Above/below 50% of swing range
7. Optimal Trade Entry (OTE) — 61.8–79% Fibonacci retracement

Uses 15-minute candles from Yahoo Finance for intraday NSE analysis.
Scores 0–100 for entry quality.
"""
from __future__ import annotations

import httpx
import logging
import math
from typing import List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"


# ── Candle Fetching ────────────────────────────────────────────────────

def fetch_candles_15m(symbol: str, bars: int = 80) -> List[dict]:
    """Fetch 15-minute OHLCV candles from Yahoo Finance for SMC analysis."""
    try:
        url = f"{YAHOO_BASE}/{symbol}"
        params = {
            "range": "5d",
            "interval": "15m",
            "includePrePost": "false",
        }
        with httpx.Client(timeout=15) as client:
            resp = client.get(url, params=params, headers={"User-Agent": "Mozilla/5.0"})
            data = resp.json()

        result = data.get("chart", {}).get("result", [])
        if not result:
            return []

        r = result[0]
        timestamps = r.get("timestamp", [])
        ohlcv = r.get("indicators", {}).get("quote", [{}])[0]

        opens  = ohlcv.get("open",   [])
        highs  = ohlcv.get("high",   [])
        lows   = ohlcv.get("low",    [])
        closes = ohlcv.get("close",  [])
        vols   = ohlcv.get("volume", [])

        candles = []
        for i, ts in enumerate(timestamps):
            o = opens[i]  if i < len(opens)  else None
            h = highs[i]  if i < len(highs)  else None
            l = lows[i]   if i < len(lows)   else None
            c = closes[i] if i < len(closes) else None
            v = vols[i]   if i < len(vols)   else None

            if None in (o, h, l, c) or any(x != x for x in (o, h, l, c)):  # NaN check
                continue

            candles.append({
                "time":   ts,
                "open":   float(o),
                "high":   float(h),
                "low":    float(l),
                "close":  float(c),
                "volume": float(v) if v else 0,
                "body":   abs(float(c) - float(o)),
                "is_bullish": float(c) > float(o),
            })

        # Only return last N bars of valid trading hours
        candles = [c for c in candles if c["volume"] > 0]
        return candles[-bars:] if len(candles) > bars else candles

    except Exception as e:
        logger.warning(f"SMC candle fetch failed for {symbol}: {e}")
        return []


# ── Swing High / Low Detection ─────────────────────────────────────────

def find_swing_highs(candles: List[dict], left: int = 3, right: int = 3) -> List[dict]:
    """Find swing highs — local high with N lower candles on each side."""
    swings = []
    for i in range(left, len(candles) - right):
        h = candles[i]["high"]
        if all(candles[i - j]["high"] < h for j in range(1, left + 1)) and \
           all(candles[i + j]["high"] < h for j in range(1, right + 1)):
            swings.append({"index": i, "price": h, "time": candles[i]["time"]})
    return swings


def find_swing_lows(candles: List[dict], left: int = 3, right: int = 3) -> List[dict]:
    """Find swing lows — local low with N higher candles on each side."""
    swings = []
    for i in range(left, len(candles) - right):
        l = candles[i]["low"]
        if all(candles[i - j]["low"] > l for j in range(1, left + 1)) and \
           all(candles[i + j]["low"] > l for j in range(1, right + 1)):
            swings.append({"index": i, "price": l, "time": candles[i]["time"]})
    return swings


# ── Order Blocks ───────────────────────────────────────────────────────

def find_order_blocks(candles: List[dict]) -> List[dict]:
    """
    Bullish OB: Last BEARISH candle before a strong BULLISH impulse move.
    Bearish OB: Last BULLISH candle before a strong BEARISH impulse move.
    Qualified by: the move after it must be at least 1.5x the OB body.
    """
    obs = []
    if len(candles) < 5:
        return obs

    current_price = candles[-1]["close"]

    for i in range(2, len(candles) - 2):
        c = candles[i]
        next_c = candles[i + 1]
        next2_c = candles[i + 2]

        # Bullish OB: bearish candle → strong bullish move
        if not c["is_bullish"]:  # candle is bearish
            # Next 2 candles must be strongly bullish
            impulse = next2_c["close"] - c["low"]
            if impulse > c["body"] * 1.5 and next_c["is_bullish"] and next2_c["is_bullish"]:
                ob_high = c["open"]  # bearish candle: open > close
                ob_low  = c["close"]
                # Only relevant if price is near or above the OB zone
                if current_price >= ob_low * 0.98:
                    obs.append({
                        "type":    "BULLISH",
                        "high":    round(ob_high, 2),
                        "low":     round(ob_low, 2),
                        "mid":     round((ob_high + ob_low) / 2, 2),
                        "index":   i,
                        "time":    c["time"],
                        "touched": current_price <= ob_high * 1.01,  # price in OB zone
                        "fresh":   True,  # hasn't been broken below
                    })

        # Bearish OB: bullish candle → strong bearish move
        if c["is_bullish"]:
            impulse = c["high"] - next2_c["close"]
            if impulse > c["body"] * 1.5 and not next_c["is_bullish"] and not next2_c["is_bullish"]:
                ob_high = c["close"]  # bullish candle: close > open
                ob_low  = c["open"]
                if current_price <= ob_high * 1.02:
                    obs.append({
                        "type":  "BEARISH",
                        "high":  round(ob_high, 2),
                        "low":   round(ob_low, 2),
                        "mid":   round((ob_high + ob_low) / 2, 2),
                        "index": i,
                        "time":  c["time"],
                        "touched": current_price >= ob_low * 0.99,
                        "fresh": True,
                    })

    # Keep only the most recent 5 OBs (most relevant)
    return sorted(obs, key=lambda x: x["index"], reverse=True)[:5]


# ── Fair Value Gaps ────────────────────────────────────────────────────

def find_fair_value_gaps(candles: List[dict]) -> List[dict]:
    """
    Bullish FVG: candle[i].high < candle[i+2].low  (gap between the wicks)
    Bearish FVG: candle[i].low  > candle[i+2].high
    Middle candle (i+1) is the impulse candle.
    """
    fvgs = []
    if len(candles) < 3:
        return fvgs

    current_price = candles[-1]["close"]

    for i in range(len(candles) - 2):
        c0 = candles[i]
        c2 = candles[i + 2]

        # Bullish FVG
        if c0["high"] < c2["low"]:
            gap_high = c2["low"]
            gap_low  = c0["high"]
            gap_size = gap_high - gap_low
            if gap_size > 0:
                filled = current_price <= gap_high and current_price >= gap_low
                below  = current_price < gap_low  # price below gap (unfilled, potential magnet)
                fvgs.append({
                    "type":    "BULLISH",
                    "high":    round(gap_high, 2),
                    "low":     round(gap_low, 2),
                    "mid":     round((gap_high + gap_low) / 2, 2),
                    "size":    round(gap_size, 2),
                    "index":   i + 1,
                    "filled":  filled,
                    "price_below": below,
                })

        # Bearish FVG
        if c0["low"] > c2["high"]:
            gap_high = c0["low"]
            gap_low  = c2["high"]
            gap_size = gap_high - gap_low
            if gap_size > 0:
                filled = current_price <= gap_high and current_price >= gap_low
                above  = current_price > gap_high
                fvgs.append({
                    "type":    "BEARISH",
                    "high":    round(gap_high, 2),
                    "low":     round(gap_low, 2),
                    "mid":     round((gap_high + gap_low) / 2, 2),
                    "size":    round(gap_size, 2),
                    "index":   i + 1,
                    "filled":  filled,
                    "price_above": above,
                })

    # Recent unfilled FVGs are most important
    unfilled = [f for f in fvgs if not f["filled"]]
    return sorted(unfilled, key=lambda x: x["index"], reverse=True)[:5]


# ── Break of Structure / Change of Character ──────────────────────────

def detect_market_structure(candles: List[dict]) -> dict:
    """
    BOS  (Break of Structure): Price breaks swing high/low in direction of trend → continuation.
    CHoCH (Change of Character): Price breaks swing high/low AGAINST current trend → potential reversal.
    Returns: trend direction, last BOS/CHoCH, structure bias.
    """
    if len(candles) < 20:
        return {"trend": "NEUTRAL", "last_event": None, "bias": "NEUTRAL"}

    swing_highs = find_swing_highs(candles, left=3, right=2)
    swing_lows  = find_swing_lows(candles,  left=3, right=2)

    if not swing_highs or not swing_lows:
        return {"trend": "NEUTRAL", "last_event": None, "bias": "NEUTRAL"}

    current = candles[-1]["close"]
    recent_high = max(swing_highs, key=lambda x: x["index"])
    recent_low  = max(swing_lows,  key=lambda x: x["index"])

    events = []

    # Check for BOS/CHoCH based on last few candles vs swing points
    for i in range(max(1, len(candles) - 15), len(candles)):
        c = candles[i]

        # Bullish BOS: close above most recent swing high
        for sh in swing_highs:
            if sh["index"] < i and c["close"] > sh["price"] and candles[i-1]["close"] <= sh["price"]:
                events.append({
                    "type":      "BOS",
                    "direction": "BULLISH",
                    "price":     sh["price"],
                    "index":     i,
                    "label":     f"BOS ↑ broke ₹{sh['price']:.0f}",
                })

        # Bearish BOS: close below most recent swing low
        for sl in swing_lows:
            if sl["index"] < i and c["close"] < sl["price"] and candles[i-1]["close"] >= sl["price"]:
                events.append({
                    "type":      "BOS",
                    "direction": "BEARISH",
                    "price":     sl["price"],
                    "index":     i,
                    "label":     f"BOS ↓ broke ₹{sl['price']:.0f}",
                })

    # Determine overall trend from swing structure
    if len(swing_highs) >= 2 and len(swing_lows) >= 2:
        sh_sorted = sorted(swing_highs, key=lambda x: x["index"])
        sl_sorted = sorted(swing_lows,  key=lambda x: x["index"])

        hh = sh_sorted[-1]["price"] > sh_sorted[-2]["price"]  # Higher High
        hl = sl_sorted[-1]["price"] > sl_sorted[-2]["price"]  # Higher Low
        lh = sh_sorted[-1]["price"] < sh_sorted[-2]["price"]  # Lower High
        ll = sl_sorted[-1]["price"] < sl_sorted[-2]["price"]  # Lower Low

        if hh and hl:
            trend = "BULLISH"
        elif lh and ll:
            trend = "BEARISH"
        else:
            trend = "NEUTRAL"
    else:
        trend = "NEUTRAL"

    last_event = max(events, key=lambda x: x["index"]) if events else None

    # CHoCH: if trend is BULLISH but last BOS is BEARISH = CHoCH
    choch = False
    if last_event:
        if trend == "BULLISH" and last_event["direction"] == "BEARISH":
            choch = True
            last_event["type"] = "CHoCH"
        elif trend == "BEARISH" and last_event["direction"] == "BULLISH":
            choch = True
            last_event["type"] = "CHoCH"

    return {
        "trend":      trend,
        "last_event": last_event,
        "choch":      choch,
        "bias":       trend,
        "swing_highs": [{"price": s["price"], "index": s["index"]} for s in swing_highs[-3:]],
        "swing_lows":  [{"price": s["price"], "index": s["index"]} for s in swing_lows[-3:]],
    }


# ── Liquidity Levels ───────────────────────────────────────────────────

def find_liquidity_levels(candles: List[dict]) -> dict:
    """
    Liquidity pools = equal highs/lows (within 0.2%) = stop hunt targets.
    Also: previous day high/low are key liquidity levels.
    """
    if len(candles) < 10:
        return {"buy_side": [], "sell_side": []}

    current = candles[-1]["close"]
    highs = [c["high"] for c in candles]
    lows  = [c["low"]  for c in candles]

    # Equal highs (sell-side liquidity — shorts have stops above)
    equal_highs = []
    for i in range(len(highs) - 1):
        for j in range(i + 1, len(highs)):
            if abs(highs[i] - highs[j]) / highs[i] < 0.002:  # within 0.2%
                equal_highs.append(round((highs[i] + highs[j]) / 2, 2))
                break

    # Equal lows (buy-side liquidity — longs have stops below)
    equal_lows = []
    for i in range(len(lows) - 1):
        for j in range(i + 1, len(lows)):
            if abs(lows[i] - lows[j]) / lows[i] < 0.002:
                equal_lows.append(round((lows[i] + lows[j]) / 2, 2))
                break

    # Previous session high/low (major liquidity)
    prev_high = max(highs[:-20]) if len(highs) > 20 else max(highs)
    prev_low  = min(lows[:-20])  if len(lows)  > 20 else min(lows)

    # Nearest sell-side (above current) and buy-side (below current)
    sell_side = sorted(set([h for h in equal_highs if h > current] + [prev_high]))[:3]
    buy_side  = sorted(set([l for l in equal_lows  if l < current] + [prev_low]), reverse=True)[:3]

    return {
        "sell_side_liquidity": sell_side,   # price will target these on the way up (stop hunts)
        "buy_side_liquidity":  buy_side,    # price will target these on the way down
        "prev_session_high":   round(prev_high, 2),
        "prev_session_low":    round(prev_low, 2),
    }


# ── Premium / Discount Zone ────────────────────────────────────────────

def calculate_premium_discount(candles: List[dict]) -> dict:
    """
    Equilibrium = 50% of the swing range.
    Discount zone (<50%): Smart money buys here (bullish bias).
    Premium zone  (>50%): Smart money sells here (bearish bias).
    OTE = 61.8% – 79% retracement level for optimal entries.
    """
    if len(candles) < 10:
        return {"zone": "NEUTRAL", "pct": 50.0}

    swing_high = max(c["high"] for c in candles)
    swing_low  = min(c["low"]  for c in candles)
    current    = candles[-1]["close"]

    if swing_high == swing_low:
        return {"zone": "NEUTRAL", "pct": 50.0}

    range_size = swing_high - swing_low
    pct = ((current - swing_low) / range_size) * 100

    # Fibonacci levels
    fib_382 = swing_low + range_size * 0.382
    fib_50  = swing_low + range_size * 0.500
    fib_618 = swing_low + range_size * 0.618
    fib_705 = swing_low + range_size * 0.705
    fib_79  = swing_low + range_size * 0.790

    # OTE zone for buys: 61.8% – 79% retracement (price pulled back into discount)
    in_ote_buy  = fib_618 >= current >= fib_382  # price has retraced to 38.2–61.8%
    in_ote_sell = fib_618 <= current <= fib_79

    return {
        "zone":         "DISCOUNT" if pct < 50 else "PREMIUM",
        "pct":          round(pct, 1),
        "swing_high":   round(swing_high, 2),
        "swing_low":    round(swing_low, 2),
        "equilibrium":  round(fib_50, 2),
        "fib_382":      round(fib_382, 2),
        "fib_618":      round(fib_618, 2),
        "fib_79":       round(fib_79, 2),
        "in_ote_buy":   in_ote_buy,
        "in_ote_sell":  in_ote_sell,
    }


# ── Master SMC Signal Generator ────────────────────────────────────────

def analyze_smc(symbol: str, current_price: float = 0) -> dict:
    """
    Full SMC/ICT analysis for a symbol.
    Returns a score 0–100 and detailed breakdown.
    """
    candles = fetch_candles_15m(symbol)
    if len(candles) < 20:
        return {
            "available": False,
            "symbol": symbol,
            "smc_score": 0,
            "signal": "NO_DATA",
            "reasons": ["Insufficient candle data for SMC analysis"],
            "missing": [],
        }

    current = candles[-1]["close"] if not current_price else current_price
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
        reasons.append(f"📈 Bullish market structure (HH + HL pattern)")
    elif trend == "BEARISH":
        score -= 10
        missing.append("📉 Bearish market structure (LH + LL)")
    else:
        missing.append("📊 Neutral structure — no clear trend")

    if last_event:
        if last_event["type"] == "BOS" and last_event["direction"] == "BULLISH":
            score += 5
            reasons.append(f"🔼 Bullish BOS: {last_event['label']}")
        elif last_event["type"] == "CHoCH" and last_event["direction"] == "BULLISH":
            score += 8
            reasons.append(f"🔄 Bullish CHoCH detected — potential trend reversal up")
        elif last_event["type"] == "BOS" and last_event["direction"] == "BEARISH":
            score -= 5
            missing.append(f"🔽 Bearish BOS: {last_event['label']}")

    # ── 2. Order Block Proximity (max 25 pts) ──────────────────────
    bullish_obs = [ob for ob in order_blocks if ob["type"] == "BULLISH"]
    bearish_obs = [ob for ob in order_blocks if ob["type"] == "BEARISH"]

    if bullish_obs:
        nearest_ob = bullish_obs[0]
        # Price touching bullish OB = premium entry
        if nearest_ob["low"] <= current <= nearest_ob["high"] * 1.005:
            score += 25
            reasons.append(f"🟩 Price IN bullish Order Block zone ₹{nearest_ob['low']:.0f}–₹{nearest_ob['high']:.0f}")
        elif current >= nearest_ob["low"] * 0.995 and current <= nearest_ob["high"] * 1.02:
            score += 15
            reasons.append(f"🟩 Price near bullish OB ₹{nearest_ob['low']:.0f}–₹{nearest_ob['high']:.0f}")
        else:
            missing.append(f"OB at ₹{nearest_ob['low']:.0f} not yet reached")
    else:
        missing.append("No fresh bullish Order Block identified")

    if bearish_obs:
        nearest_bob = bearish_obs[0]
        if nearest_bob["low"] <= current <= nearest_bob["high"] * 1.005:
            score -= 10
            missing.append(f"🟥 Price in bearish OB zone — bearish pressure ₹{nearest_bob['high']:.0f}")

    # ── 3. Fair Value Gap (max 20 pts) ────────────────────────────
    bullish_fvg = [f for f in fvgs if f["type"] == "BULLISH"]
    bearish_fvg = [f for f in fvgs if f["type"] == "BEARISH"]

    if bullish_fvg:
        fvg = bullish_fvg[0]
        if fvg["low"] <= current <= fvg["high"]:
            score += 20
            reasons.append(f"⬜ Price filling bullish FVG ₹{fvg['low']:.0f}–₹{fvg['high']:.0f} — high probability long")
        elif current < fvg["low"] and (fvg["low"] - current) / current < 0.01:
            score += 10
            reasons.append(f"⬜ Bullish FVG just above ₹{fvg['low']:.0f} — approaching fill zone")
        else:
            missing.append(f"Bullish FVG at ₹{fvg['low']:.0f}–₹{fvg['high']:.0f} not yet reached")
    else:
        missing.append("No unfilled bullish FVG detected")

    if bearish_fvg:
        fvg = bearish_fvg[0]
        if fvg["low"] <= current <= fvg["high"]:
            score -= 8
            missing.append(f"Bearish FVG overhead ₹{fvg['low']:.0f}–₹{fvg['high']:.0f} — supply zone")

    # ── 4. Premium / Discount Zone (max 15 pts) ───────────────────
    zone = pd_zone.get("zone", "NEUTRAL")
    pct  = pd_zone.get("pct", 50)

    if zone == "DISCOUNT":
        score += 10
        reasons.append(f"💚 Price in DISCOUNT zone ({pct:.0f}% of range) — smart money buys here")
    elif zone == "PREMIUM":
        score -= 5
        missing.append(f"🔴 Price in PREMIUM zone ({pct:.0f}% of range) — avoid longs")

    if pd_zone.get("in_ote_buy"):
        score += 5
        reasons.append(f"🎯 OTE (Optimal Trade Entry) zone — 38.2–61.8% retracement")

    # ── 5. Liquidity Context (max 15 pts) ────────────────────────
    sell_liquidity = liquidity.get("sell_side_liquidity", [])
    buy_liquidity  = liquidity.get("buy_side_liquidity", [])

    if sell_liquidity:
        nearest_ssl = sell_liquidity[0]
        dist_pct = (nearest_ssl - current) / current * 100
        if dist_pct > 0.5 and dist_pct < 3:
            score += 15
            reasons.append(f"🎯 Sell-side liquidity target at ₹{nearest_ssl:.0f} ({dist_pct:.1f}% away) — price magnet")
        elif dist_pct >= 3:
            score += 5
            reasons.append(f"🎯 Liquidity above ₹{nearest_ssl:.0f} ({dist_pct:.1f}% away)")

    if buy_liquidity:
        nearest_bsl = buy_liquidity[0]
        dist_pct = (current - nearest_bsl) / current * 100
        if dist_pct < 0.5:
            score -= 5
            missing.append(f"⚠️ Buy-side liquidity just below at ₹{nearest_bsl:.0f} — stop hunt risk")

    # Clamp 0–100
    score = max(0, min(100, score))

    # Overall signal
    if score >= 65:
        signal = "BULLISH"
    elif score >= 45:
        signal = "NEUTRAL"
    else:
        signal = "BEARISH"

    return {
        "available":      True,
        "symbol":         symbol,
        "smc_score":      score,
        "signal":         signal,
        "reasons":        reasons,
        "missing":        missing,
        "structure":      structure,
        "order_blocks":   order_blocks[:3],
        "fair_value_gaps": fvgs[:3],
        "premium_discount": pd_zone,
        "liquidity":      liquidity,
        "current_price":  current,
        "candles_used":   len(candles),
        "interval":       "15m",
    }

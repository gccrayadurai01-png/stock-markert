"""
Pro-Grade Technical Analysis Engine
=====================================
12 indicators used by professional Indian traders:

TREND:      EMA(9,21,50,200), Supertrend, ADX
MOMENTUM:   RSI(14), MACD(12,26,9), Stochastic(14,3,3)
VOLATILITY: Bollinger Bands(20,2), ATR(14)
VOLUME:     VWAP, OBV, Volume SMA ratio

Signal scoring system: each indicator votes BUY/SELL/NEUTRAL
Final signal = weighted consensus
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple
import math


def ema(prices: List[float], period: int) -> List[float]:
    """Calculate Exponential Moving Average."""
    if len(prices) < period:
        return [prices[-1]] * len(prices) if prices else []
    k = 2.0 / (period + 1)
    result = [sum(prices[:period]) / period]
    for price in prices[period:]:
        result.append(price * k + result[-1] * (1 - k))
    return result


def sma(prices: List[float], period: int) -> List[float]:
    """Calculate Simple Moving Average."""
    if len(prices) < period:
        return [sum(prices) / len(prices)] * len(prices) if prices else []
    result = []
    for i in range(len(prices) - period + 1):
        result.append(sum(prices[i:i + period]) / period)
    return result


def calc_rsi(prices: List[float], period: int = 14) -> float:
    """RSI — Relative Strength Index (Wilder's smoothing)."""
    if len(prices) < period + 1:
        return 50.0
    deltas = [prices[i] - prices[i - 1] for i in range(1, len(prices))]
    gains = [d if d > 0 else 0 for d in deltas]
    losses = [-d if d < 0 else 0 for d in deltas]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def calc_macd(prices: List[float]) -> Dict:
    """MACD — Moving Average Convergence Divergence (12, 26, 9)."""
    if len(prices) < 26:
        return {"macd": 0, "signal": 0, "histogram": 0, "vote": "NEUTRAL"}

    ema12 = ema(prices, 12)
    ema26 = ema(prices, 26)

    min_len = min(len(ema12), len(ema26))
    macd_line = [ema12[-(min_len - i)] - ema26[-(min_len - i)] for i in range(min_len)]

    if len(macd_line) >= 9:
        signal_line = ema(macd_line, 9)
        histogram = macd_line[-1] - signal_line[-1]
        prev_hist = macd_line[-2] - signal_line[-2] if len(signal_line) >= 2 else 0

        vote = "NEUTRAL"
        if macd_line[-1] > signal_line[-1] and histogram > prev_hist:
            vote = "BUY"
        elif macd_line[-1] < signal_line[-1] and histogram < prev_hist:
            vote = "SELL"

        return {
            "macd": round(macd_line[-1], 4),
            "signal": round(signal_line[-1], 4),
            "histogram": round(histogram, 4),
            "vote": vote,
        }
    return {"macd": 0, "signal": 0, "histogram": 0, "vote": "NEUTRAL"}


def calc_bollinger(prices: List[float], period: int = 20, std_dev: float = 2.0) -> Dict:
    """Bollinger Bands (20, 2)."""
    if len(prices) < period:
        p = prices[-1] if prices else 0
        return {"upper": p, "middle": p, "lower": p, "width": 0, "pct_b": 0.5, "vote": "NEUTRAL"}

    middle = sum(prices[-period:]) / period
    variance = sum((p - middle) ** 2 for p in prices[-period:]) / period
    std = math.sqrt(variance)

    upper = round(middle + std_dev * std, 2)
    lower = round(middle - std_dev * std, 2)
    middle = round(middle, 2)

    current = prices[-1]
    band_width = upper - lower
    pct_b = (current - lower) / band_width if band_width > 0 else 0.5

    vote = "NEUTRAL"
    if current <= lower:
        vote = "BUY"  # Oversold / bounce zone
    elif current >= upper:
        vote = "SELL"  # Overbought / reversal zone

    return {
        "upper": upper, "middle": middle, "lower": lower,
        "width": round(band_width, 2),
        "pct_b": round(pct_b, 3),
        "vote": vote,
    }


def calc_supertrend(highs: List[float], lows: List[float], closes: List[float],
                     period: int = 10, multiplier: float = 3.0) -> Dict:
    """Supertrend indicator (10, 3)."""
    if len(closes) < period + 1:
        return {"value": closes[-1] if closes else 0, "direction": "NEUTRAL", "vote": "NEUTRAL"}

    # ATR
    trs = []
    for i in range(1, len(closes)):
        tr = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
        trs.append(tr)

    atr_values = sma(trs, period)
    if not atr_values:
        return {"value": closes[-1], "direction": "NEUTRAL", "vote": "NEUTRAL"}

    # Supertrend calculation
    upper_band = []
    lower_band = []
    supertrend = []
    direction = []

    for i in range(len(atr_values)):
        idx = i + period  # offset to match price index
        if idx >= len(closes):
            break

        hl2 = (highs[idx] + lows[idx]) / 2
        ub = hl2 + multiplier * atr_values[i]
        lb = hl2 - multiplier * atr_values[i]

        if upper_band:
            ub = min(ub, upper_band[-1]) if closes[idx - 1] <= upper_band[-1] else ub
            lb = max(lb, lower_band[-1]) if closes[idx - 1] >= lower_band[-1] else lb

        upper_band.append(ub)
        lower_band.append(lb)

        if not supertrend:
            supertrend.append(ub)
            direction.append(-1)
        else:
            if supertrend[-1] == upper_band[-2] if len(upper_band) > 1 else True:
                if closes[idx] <= ub:
                    supertrend.append(ub)
                    direction.append(-1)
                else:
                    supertrend.append(lb)
                    direction.append(1)
            else:
                if closes[idx] >= lb:
                    supertrend.append(lb)
                    direction.append(1)
                else:
                    supertrend.append(ub)
                    direction.append(-1)

    if not direction:
        return {"value": closes[-1], "direction": "NEUTRAL", "vote": "NEUTRAL"}

    d = direction[-1]
    return {
        "value": round(supertrend[-1], 2),
        "direction": "UP" if d == 1 else "DOWN",
        "vote": "BUY" if d == 1 else "SELL",
    }


def calc_stochastic(highs: List[float], lows: List[float], closes: List[float],
                     k_period: int = 14, d_period: int = 3) -> Dict:
    """Stochastic Oscillator (%K, %D)."""
    if len(closes) < k_period:
        return {"k": 50, "d": 50, "vote": "NEUTRAL"}

    k_values = []
    for i in range(k_period - 1, len(closes)):
        h = max(highs[i - k_period + 1:i + 1])
        l = min(lows[i - k_period + 1:i + 1])
        if h == l:
            k_values.append(50.0)
        else:
            k_values.append(((closes[i] - l) / (h - l)) * 100)

    d_values = sma(k_values, d_period) if len(k_values) >= d_period else k_values

    k = round(k_values[-1], 2) if k_values else 50
    d = round(d_values[-1], 2) if d_values else 50

    vote = "NEUTRAL"
    if k < 20 and d < 20:
        vote = "BUY"
    elif k > 80 and d > 80:
        vote = "SELL"
    elif k > d and k_values[-1] > (k_values[-2] if len(k_values) > 1 else k):
        vote = "BUY"
    elif k < d:
        vote = "SELL"

    return {"k": k, "d": d, "vote": vote}


def calc_adx(highs: List[float], lows: List[float], closes: List[float],
              period: int = 14) -> Dict:
    """ADX — Average Directional Index (trend strength)."""
    if len(closes) < period + 1:
        return {"adx": 0, "plus_di": 0, "minus_di": 0, "trend_strength": "NONE", "vote": "NEUTRAL"}

    plus_dm = []
    minus_dm = []
    trs = []

    for i in range(1, len(closes)):
        up = highs[i] - highs[i - 1]
        down = lows[i - 1] - lows[i]
        plus_dm.append(up if up > down and up > 0 else 0)
        minus_dm.append(down if down > up and down > 0 else 0)
        trs.append(max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1])))

    if len(trs) < period:
        return {"adx": 0, "plus_di": 0, "minus_di": 0, "trend_strength": "NONE", "vote": "NEUTRAL"}

    # Smoothed values
    atr_s = sum(trs[:period])
    pdm_s = sum(plus_dm[:period])
    mdm_s = sum(minus_dm[:period])

    plus_di_vals = []
    minus_di_vals = []
    dx_vals = []

    for i in range(period, len(trs)):
        atr_s = atr_s - (atr_s / period) + trs[i]
        pdm_s = pdm_s - (pdm_s / period) + plus_dm[i]
        mdm_s = mdm_s - (mdm_s / period) + minus_dm[i]

        pdi = (pdm_s / atr_s) * 100 if atr_s > 0 else 0
        mdi = (mdm_s / atr_s) * 100 if atr_s > 0 else 0
        plus_di_vals.append(pdi)
        minus_di_vals.append(mdi)

        dx = abs(pdi - mdi) / (pdi + mdi) * 100 if (pdi + mdi) > 0 else 0
        dx_vals.append(dx)

    adx = sum(dx_vals[-period:]) / min(period, len(dx_vals)) if dx_vals else 0
    pdi = plus_di_vals[-1] if plus_di_vals else 0
    mdi = minus_di_vals[-1] if minus_di_vals else 0

    if adx < 20:
        strength = "WEAK"
    elif adx < 40:
        strength = "MODERATE"
    elif adx < 60:
        strength = "STRONG"
    else:
        strength = "VERY_STRONG"

    vote = "NEUTRAL"
    if adx > 25 and pdi > mdi:
        vote = "BUY"
    elif adx > 25 and mdi > pdi:
        vote = "SELL"

    return {
        "adx": round(adx, 2),
        "plus_di": round(pdi, 2),
        "minus_di": round(mdi, 2),
        "trend_strength": strength,
        "vote": vote,
    }


def calc_atr(highs: List[float], lows: List[float], closes: List[float],
              period: int = 14) -> float:
    """ATR — Average True Range."""
    if len(closes) < 2:
        return 0.0
    trs = []
    for i in range(1, len(closes)):
        tr = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
        trs.append(tr)
    if len(trs) < period:
        return round(sum(trs) / len(trs), 2) if trs else 0.0
    atr_val = sum(trs[:period]) / period
    for i in range(period, len(trs)):
        atr_val = (atr_val * (period - 1) + trs[i]) / period
    return round(atr_val, 2)


def calc_vwap(highs: List[float], lows: List[float], closes: List[float],
               volumes: List[float]) -> Dict:
    """VWAP — Volume Weighted Average Price."""
    if not volumes or not closes:
        p = closes[-1] if closes else 0
        return {"vwap": p, "vote": "NEUTRAL"}

    typical_prices = [(h + l + c) / 3 for h, l, c in zip(highs, lows, closes)]
    cum_tp_vol = sum(tp * v for tp, v in zip(typical_prices, volumes))
    cum_vol = sum(volumes)

    vwap = round(cum_tp_vol / cum_vol, 2) if cum_vol > 0 else closes[-1]
    current = closes[-1]

    vote = "NEUTRAL"
    pct_from_vwap = ((current - vwap) / vwap) * 100 if vwap > 0 else 0
    if current > vwap and pct_from_vwap < 2:
        vote = "BUY"  # Above VWAP, bullish
    elif current < vwap and pct_from_vwap > -2:
        vote = "SELL"  # Below VWAP, bearish

    return {"vwap": vwap, "pct_from_vwap": round(pct_from_vwap, 2), "vote": vote}


def calc_obv(closes: List[float], volumes: List[float]) -> Dict:
    """OBV — On Balance Volume."""
    if len(closes) < 2:
        return {"obv": 0, "trend": "NEUTRAL", "vote": "NEUTRAL"}

    obv = [0]
    for i in range(1, len(closes)):
        if closes[i] > closes[i - 1]:
            obv.append(obv[-1] + volumes[i])
        elif closes[i] < closes[i - 1]:
            obv.append(obv[-1] - volumes[i])
        else:
            obv.append(obv[-1])

    # OBV trend (compare last vs 5-period SMA)
    obv_sma = sum(obv[-5:]) / min(5, len(obv))
    vote = "NEUTRAL"
    if obv[-1] > obv_sma:
        vote = "BUY"
    elif obv[-1] < obv_sma:
        vote = "SELL"

    return {"obv": obv[-1], "obv_sma": round(obv_sma, 0), "vote": vote}


def calc_ema_crossover(prices: List[float]) -> Dict:
    """EMA Crossover System (9, 21, 50, 200)."""
    ema9 = ema(prices, 9)[-1] if len(prices) >= 9 else prices[-1]
    ema21 = ema(prices, 21)[-1] if len(prices) >= 21 else prices[-1]
    ema50 = ema(prices, 50)[-1] if len(prices) >= 50 else prices[-1]
    ema200 = ema(prices, 200)[-1] if len(prices) >= 200 else prices[-1]

    current = prices[-1]

    # Alignment score
    bullish_count = 0
    if ema9 > ema21:
        bullish_count += 1
    if ema21 > ema50:
        bullish_count += 1
    if current > ema50:
        bullish_count += 1
    if current > ema200:
        bullish_count += 1

    if bullish_count >= 3:
        vote = "BUY"
        alignment = "BULLISH"
    elif bullish_count <= 1:
        vote = "SELL"
        alignment = "BEARISH"
    else:
        vote = "NEUTRAL"
        alignment = "MIXED"

    return {
        "ema9": round(ema9, 2),
        "ema21": round(ema21, 2),
        "ema50": round(ema50, 2),
        "ema200": round(ema200, 2),
        "alignment": alignment,
        "vote": vote,
    }


def calc_volume_analysis(volumes: List[float]) -> Dict:
    """Volume analysis — spike detection and trend."""
    if len(volumes) < 5:
        return {"current": 0, "avg": 0, "ratio": 1.0, "spike": False, "vote": "NEUTRAL"}

    current = volumes[-1]
    avg = sum(volumes[-20:]) / min(20, len(volumes))
    ratio = current / avg if avg > 0 else 1.0

    return {
        "current": int(current),
        "avg": int(avg),
        "ratio": round(ratio, 2),
        "spike": ratio > 1.5,
        "vote": "BUY" if ratio > 2.0 else "NEUTRAL",  # Huge volume = institutional interest
    }


# =========================================================================
# MASTER ANALYSIS — runs all 12 indicators and produces final verdict
# =========================================================================

INDICATOR_WEIGHTS = {
    "ema_crossover": 15,
    "macd": 12,
    "rsi": 10,
    "supertrend": 15,
    "adx": 8,
    "bollinger": 8,
    "stochastic": 7,
    "vwap": 10,
    "obv": 5,
    "volume": 5,
    "atr": 0,  # informational only
}


def full_analysis(
    opens: List[float],
    highs: List[float],
    lows: List[float],
    closes: List[float],
    volumes: List[float],
) -> Dict:
    """
    Run ALL 12 indicators and produce a weighted signal score.
    Score > +30 = STRONG BUY
    Score +10 to +30 = BUY
    Score -10 to +10 = NEUTRAL
    Score -30 to -10 = SELL
    Score < -30 = STRONG SELL
    """
    if not closes or len(closes) < 5:
        return {"score": 0, "signal": "NO_DATA", "indicators": {}}

    rsi = calc_rsi(closes)
    macd = calc_macd(closes)
    bb = calc_bollinger(closes)
    st = calc_supertrend(highs, lows, closes)
    stoch = calc_stochastic(highs, lows, closes)
    adx = calc_adx(highs, lows, closes)
    atr = calc_atr(highs, lows, closes)
    vwap = calc_vwap(highs, lows, closes, volumes)
    obv = calc_obv(closes, volumes)
    ema_sys = calc_ema_crossover(closes)
    vol = calc_volume_analysis(volumes)

    # RSI vote
    rsi_vote = "NEUTRAL"
    if rsi < 30:
        rsi_vote = "BUY"
    elif rsi > 70:
        rsi_vote = "SELL"
    elif rsi < 45:
        rsi_vote = "BUY"  # mild buy zone
    elif rsi > 60:
        rsi_vote = "SELL"  # mild sell zone

    indicators = {
        "rsi": {"value": rsi, "vote": rsi_vote},
        "macd": macd,
        "bollinger": bb,
        "supertrend": st,
        "stochastic": stoch,
        "adx": adx,
        "atr": {"value": atr},
        "vwap": vwap,
        "obv": obv,
        "ema_crossover": ema_sys,
        "volume": vol,
    }

    # Calculate weighted score
    score = 0
    votes = {"BUY": 0, "SELL": 0, "NEUTRAL": 0}

    vote_map = {
        "ema_crossover": ema_sys["vote"],
        "macd": macd["vote"],
        "rsi": rsi_vote,
        "supertrend": st["vote"],
        "adx": adx["vote"],
        "bollinger": bb["vote"],
        "stochastic": stoch["vote"],
        "vwap": vwap["vote"],
        "obv": obv["vote"],
        "volume": vol["vote"],
    }

    for name, vote in vote_map.items():
        weight = INDICATOR_WEIGHTS.get(name, 5)
        if vote == "BUY":
            score += weight
            votes["BUY"] += 1
        elif vote == "SELL":
            score -= weight
            votes["SELL"] += 1
        else:
            votes["NEUTRAL"] += 1

    # Final signal
    if score >= 40:
        signal = "STRONG_BUY"
    elif score >= 15:
        signal = "BUY"
    elif score <= -40:
        signal = "STRONG_SELL"
    elif score <= -15:
        signal = "SELL"
    else:
        signal = "NEUTRAL"

    # Confidence (0–100)
    total_indicators = len(vote_map)
    max_possible = sum(INDICATOR_WEIGHTS[k] for k in vote_map)
    confidence = min(100, int((abs(score) / max_possible) * 100))

    # Stop loss based on ATR
    sl_distance = atr * 1.5
    current_price = closes[-1]
    if signal in ("BUY", "STRONG_BUY"):
        stop_loss = round(current_price - sl_distance, 2)
        target_1 = round(current_price + sl_distance * 2, 2)  # 1:2 R:R
        target_2 = round(current_price + sl_distance * 3, 2)  # 1:3 R:R
    elif signal in ("SELL", "STRONG_SELL"):
        stop_loss = round(current_price + sl_distance, 2)
        target_1 = round(current_price - sl_distance * 2, 2)
        target_2 = round(current_price - sl_distance * 3, 2)
    else:
        stop_loss = round(current_price - sl_distance, 2)
        target_1 = round(current_price + sl_distance, 2)
        target_2 = round(current_price + sl_distance * 2, 2)

    return {
        "score": score,
        "signal": signal,
        "confidence": confidence,
        "votes": votes,
        "stop_loss": stop_loss,
        "target_1": target_1,
        "target_2": target_2,
        "atr": atr,
        "indicators": indicators,
    }

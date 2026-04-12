"""
Chart Engine — Fetches historical OHLCV data for charting.
Uses Yahoo Finance HTTP API (same as market_engine) since it works with NSE stocks.
Calculates indicators from raw data using our technical_engine.
"""
from __future__ import annotations

import httpx
import logging
import math
from typing import Dict, List

logger = logging.getLogger(__name__)

YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"


def fetch_chart_data(
    symbol: str,
    interval: str = "1d",
    range_str: str = "3mo",
    outputsize: int = 60,
) -> Dict:
    """
    Fetch OHLCV + calculated indicators from Yahoo Finance.
    interval: 1d, 5m, 15m, 1wk
    range_str: 1d, 5d, 1mo, 3mo, 6mo, 1y
    """
    # Map user-friendly intervals to Yahoo format
    interval_map = {
        "1day": "1d",
        "5min": "5m",
        "15min": "15m",
        "1week": "1wk",
        "1d": "1d",
        "5m": "5m",
        "15m": "15m",
        "1wk": "1wk",
    }
    yahoo_interval = interval_map.get(interval, "1d")

    # Map interval to appropriate range
    range_map = {
        "5m": "5d",
        "15m": "5d",
        "1d": "3mo",
        "1wk": "1y",
    }
    yahoo_range = range_map.get(yahoo_interval, range_str)

    try:
        url = f"{YAHOO_BASE}/{symbol}"
        params = {
            "range": yahoo_range,
            "interval": yahoo_interval,
            "includePrePost": "false",
        }

        with httpx.Client(timeout=15) as client:
            resp = client.get(url, params=params, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
            })
            data = resp.json()

        result = data.get("chart", {}).get("result", [])
        if not result:
            return {"error": "No data from Yahoo Finance", "candles": []}

        quote = result[0]
        timestamps = quote.get("timestamp", [])
        ohlcv = quote.get("indicators", {}).get("quote", [{}])[0]

        opens = ohlcv.get("open", [])
        highs = ohlcv.get("high", [])
        lows = ohlcv.get("low", [])
        closes = ohlcv.get("close", [])
        volumes = ohlcv.get("volume", [])

        if not closes or not timestamps:
            return {"error": "Empty data", "candles": []}

        # Build candles
        candles = []
        valid_closes = []
        valid_highs = []
        valid_lows = []
        valid_volumes = []

        from datetime import datetime
        for i, ts in enumerate(timestamps):
            if closes[i] is None:
                continue
            dt = datetime.fromtimestamp(ts)
            candles.append({
                "date": dt.strftime("%Y-%m-%d %H:%M") if yahoo_interval in ("5m", "15m") else dt.strftime("%Y-%m-%d"),
                "open": round(opens[i] or closes[i], 2),
                "high": round(highs[i] or closes[i], 2),
                "low": round(lows[i] or closes[i], 2),
                "close": round(closes[i], 2),
                "volume": int(volumes[i] or 0),
            })
            valid_closes.append(closes[i])
            valid_highs.append(highs[i] or closes[i])
            valid_lows.append(lows[i] or closes[i])
            valid_volumes.append(volumes[i] or 0)

        # Calculate indicators from raw data
        rsi_values = _calc_rsi(valid_closes)
        macd_values = _calc_macd(valid_closes)
        bb_values = _calc_bollinger(valid_closes)
        ema20_values = _calc_ema(valid_closes, 20)
        ema50_values = _calc_ema(valid_closes, 50)

        # Align indicators with candles
        rsi_out = []
        macd_out = []
        bb_out = []
        ema20_out = []
        ema50_out = []

        for i, c in enumerate(candles):
            if i < len(rsi_values):
                rsi_out.append({"date": c["date"], "value": round(rsi_values[i], 2) if rsi_values[i] is not None else None})
            if i < len(macd_values):
                macd_out.append({
                    "date": c["date"],
                    "macd": round(macd_values[i]["macd"], 2) if macd_values[i]["macd"] is not None else None,
                    "signal": round(macd_values[i]["signal"], 2) if macd_values[i]["signal"] is not None else None,
                    "histogram": round(macd_values[i]["histogram"], 2) if macd_values[i]["histogram"] is not None else None,
                })
            if i < len(bb_values):
                bb_out.append({
                    "date": c["date"],
                    "upper": round(bb_values[i]["upper"], 2) if bb_values[i]["upper"] is not None else None,
                    "middle": round(bb_values[i]["middle"], 2) if bb_values[i]["middle"] is not None else None,
                    "lower": round(bb_values[i]["lower"], 2) if bb_values[i]["lower"] is not None else None,
                })
            if i < len(ema20_values):
                ema20_out.append({"date": c["date"], "value": round(ema20_values[i], 2) if ema20_values[i] is not None else None})
            if i < len(ema50_values):
                ema50_out.append({"date": c["date"], "value": round(ema50_values[i], 2) if ema50_values[i] is not None else None})

        # Limit output size
        if len(candles) > outputsize:
            candles = candles[-outputsize:]
            rsi_out = rsi_out[-outputsize:]
            macd_out = macd_out[-outputsize:]
            bb_out = bb_out[-outputsize:]
            ema20_out = ema20_out[-outputsize:]
            ema50_out = ema50_out[-outputsize:]

        return {
            "symbol": symbol,
            "name": symbol.replace(".NS", "").replace(".BO", ""),
            "interval": interval,
            "candles": candles,
            "rsi": rsi_out,
            "macd": macd_out,
            "bollinger": bb_out,
            "ema20": ema20_out,
            "ema50": ema50_out,
        }

    except Exception as e:
        logger.error(f"Chart fetch error for {symbol}: {e}")
        return {"error": str(e), "candles": []}


def _calc_ema(data: List[float], period: int) -> List:
    """Calculate EMA."""
    result = [None] * len(data)
    if len(data) < period:
        return result

    # SMA for first value
    sma = sum(data[:period]) / period
    result[period - 1] = sma

    mult = 2 / (period + 1)
    for i in range(period, len(data)):
        result[i] = (data[i] - result[i - 1]) * mult + result[i - 1]

    return result


def _calc_rsi(closes: List[float], period: int = 14) -> List:
    """Calculate RSI."""
    result = [None] * len(closes)
    if len(closes) < period + 1:
        return result

    gains = []
    losses = []
    for i in range(1, len(closes)):
        change = closes[i] - closes[i - 1]
        gains.append(max(0, change))
        losses.append(max(0, -change))

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    if avg_loss == 0:
        result[period] = 100
    else:
        rs = avg_gain / avg_loss
        result[period] = 100 - (100 / (1 + rs))

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            result[i + 1] = 100
        else:
            rs = avg_gain / avg_loss
            result[i + 1] = 100 - (100 / (1 + rs))

    return result


def _calc_macd(closes: List[float], fast: int = 12, slow: int = 26, signal_period: int = 9) -> List[Dict]:
    """Calculate MACD."""
    result = [{"macd": None, "signal": None, "histogram": None}] * len(closes)

    ema_fast = _calc_ema(closes, fast)
    ema_slow = _calc_ema(closes, slow)

    macd_line = []
    for i in range(len(closes)):
        if ema_fast[i] is not None and ema_slow[i] is not None:
            macd_line.append(ema_fast[i] - ema_slow[i])
        else:
            macd_line.append(None)

    # Signal line (EMA of MACD)
    valid_macd = [m for m in macd_line if m is not None]
    if len(valid_macd) >= signal_period:
        signal_ema = _calc_ema(valid_macd, signal_period)

        j = 0
        for i in range(len(closes)):
            if macd_line[i] is not None:
                sig = signal_ema[j] if j < len(signal_ema) else None
                hist = (macd_line[i] - sig) if sig is not None else None
                result[i] = {"macd": macd_line[i], "signal": sig, "histogram": hist}
                j += 1

    return result


def _calc_bollinger(closes: List[float], period: int = 20, std_dev: float = 2.0) -> List[Dict]:
    """Calculate Bollinger Bands."""
    result = [{"upper": None, "middle": None, "lower": None}] * len(closes)

    for i in range(period - 1, len(closes)):
        window = closes[i - period + 1:i + 1]
        sma = sum(window) / period
        variance = sum((x - sma) ** 2 for x in window) / period
        std = math.sqrt(variance)

        result[i] = {
            "upper": sma + std_dev * std,
            "middle": sma,
            "lower": sma - std_dev * std,
        }

    return result


def fetch_intraday_chart(symbol: str) -> Dict:
    return fetch_chart_data(symbol, interval="5m", range_str="1d")


def fetch_swing_chart(symbol: str) -> Dict:
    return fetch_chart_data(symbol, interval="1d", range_str="3mo")


def fetch_positional_chart(symbol: str) -> Dict:
    return fetch_chart_data(symbol, interval="1wk", range_str="1y")

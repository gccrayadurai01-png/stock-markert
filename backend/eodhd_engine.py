"""
EODHD Engine — Free plan integration (20 calls/day max).
Strategy:
  - Market news    → 1 call → cached 2 hours  (≤12 calls/day)
  - Stock EOD data → 1 call per symbol → cached till next day
  - Fundamental    → 1 call per symbol → cached 24 hours

Free plan limits:
  - 20 API calls/day, 20/minute
  - Data: past year EOD (end-of-day prices)
  - No real-time / intraday data
"""
from __future__ import annotations

import os
import time
import logging
import httpx
from typing import Optional

logger = logging.getLogger(__name__)

EODHD_KEY = os.getenv("EODHD_API_KEY", "")
BASE = "https://eodhd.com/api"

# ── In-memory cache ────────────────────────────────────────────────────
_cache: dict = {}


def _get(key: str):
    entry = _cache.get(key)
    if entry and time.time() < entry["expires"]:
        return entry["data"]
    return None


def _set(key: str, data, ttl_seconds: int):
    _cache[key] = {"data": data, "expires": time.time() + ttl_seconds}


def _call(endpoint: str, params: dict) -> Optional[dict | list]:
    """Make a single EODHD API call with error handling."""
    if not EODHD_KEY:
        return None
    params["api_token"] = EODHD_KEY
    params["fmt"] = "json"
    try:
        r = httpx.get(f"{BASE}/{endpoint}", params=params, timeout=10)
        if r.status_code == 200:
            return r.json()
        logger.warning(f"EODHD {endpoint} returned {r.status_code}")
    except Exception as e:
        logger.error(f"EODHD error {endpoint}: {e}")
    return None


# ── Market News (best use of free plan) ───────────────────────────────

def get_market_news(limit: int = 50) -> list[dict]:
    """
    Fetch general market news — 1 API call, cached 2 hours.
    Returns list of { title, date, url, symbols, sentiment }.
    Free plan: covers all major stocks in one call.
    """
    cache_key = f"market_news_{limit}"
    cached = _get(cache_key)
    if cached is not None:
        return cached

    data = _call("news", {"offset": 0, "limit": limit, "s": "NSEI.INDX"})
    if not data or not isinstance(data, list):
        # Fallback: general news without index filter
        data = _call("news", {"offset": 0, "limit": limit})

    if not data:
        return []

    news = []
    for item in data:
        news.append({
            "title":    item.get("title", ""),
            "date":     item.get("date", ""),
            "url":      item.get("link", item.get("url", "")),
            "symbols":  item.get("related", ""),
            "content":  item.get("content", "")[:300] if item.get("content") else "",
            "sentiment": _score_headline(item.get("title", "")),
        })

    _set(cache_key, news, ttl_seconds=7200)  # 2 hour cache
    logger.info(f"✅ EODHD: fetched {len(news)} news items (cached 2h)")
    return news


def get_stock_news(symbol: str, limit: int = 5) -> list[dict]:
    """
    Stock-specific news — 1 call per symbol, cached 1 hour.
    Use sparingly (max 5-10 stocks/day on free plan).
    symbol: e.g. "RELIANCE" (no .NS)
    """
    # EODHD uses .NSE suffix for NSE stocks
    eodhd_sym = symbol.replace(".NS", "").replace(".BO", "") + ".NSE"
    cache_key = f"stock_news_{eodhd_sym}"
    cached = _get(cache_key)
    if cached is not None:
        return cached

    data = _call("news", {"s": eodhd_sym, "offset": 0, "limit": limit})
    if not data or not isinstance(data, list):
        return []

    news = [{"title": i.get("title", ""), "date": i.get("date", ""), "sentiment": _score_headline(i.get("title", ""))} for i in data]
    _set(cache_key, news, ttl_seconds=3600)  # 1 hour cache
    return news


def get_eod_data(symbol: str) -> Optional[dict]:
    """
    End-of-day OHLCV for a stock — cached till midnight.
    symbol: e.g. "RELIANCE" (no .NS suffix)
    Free plan: past year data available.
    """
    eodhd_sym = symbol.replace(".NS", "").replace(".BO", "") + ".NSE"
    cache_key = f"eod_{eodhd_sym}"
    cached = _get(cache_key)
    if cached is not None:
        return cached

    # Get last 5 trading days
    data = _call(f"eod/{eodhd_sym}", {"period": "d", "order": "d"})
    if not data or not isinstance(data, list) or len(data) == 0:
        return None

    latest = data[0]
    result = {
        "symbol": symbol,
        "date":   latest.get("date"),
        "open":   latest.get("open"),
        "high":   latest.get("high"),
        "low":    latest.get("low"),
        "close":  latest.get("close"),
        "volume": latest.get("volume"),
        "adjusted_close": latest.get("adjusted_close"),
    }

    # Cache until next day (86400s)
    _set(cache_key, result, ttl_seconds=86400)
    return result


def get_news_sentiment_for_symbol(symbol: str) -> dict:
    """
    Get sentiment score for a symbol using market news (no extra API call).
    Searches cached market news for mentions of this symbol.
    Returns: { score: 0-100, label: BULLISH/BEARISH/NEUTRAL, count: int }
    """
    sym_short = symbol.replace(".NS", "").replace(".BO", "").upper()
    news = get_market_news()  # uses cache — no API call if cached

    positive_words = ["surge", "rally", "gain", "rise", "up", "jump", "beat", "strong", "buy", "upgrade", "outperform", "high", "record", "profit", "growth"]
    negative_words = ["fall", "drop", "decline", "loss", "down", "weak", "sell", "downgrade", "underperform", "low", "miss", "crash", "cut", "concern", "risk"]

    pos = 0
    neg = 0
    count = 0

    for item in news:
        title = item.get("title", "").upper()
        symbols_str = item.get("symbols", "").upper()
        if sym_short in title or sym_short in symbols_str:
            count += 1
            headline = title.lower()
            for w in positive_words:
                if w in headline:
                    pos += 1
            for w in negative_words:
                if w in headline:
                    neg += 1

    if count == 0:
        return {"score": 50, "label": "NEUTRAL", "count": 0, "headlines": []}

    total = pos + neg
    if total == 0:
        score = 50
    else:
        score = int((pos / total) * 100)

    label = "BULLISH" if score > 60 else "BEARISH" if score < 40 else "NEUTRAL"
    headlines = [i["title"] for i in news if sym_short in i.get("title", "").upper() or sym_short in i.get("symbols", "").upper()][:3]

    return {"score": score, "label": label, "count": count, "headlines": headlines}


def _score_headline(title: str) -> str:
    """Simple keyword sentiment for a single headline."""
    t = title.lower()
    pos = sum(1 for w in ["surge", "rally", "gain", "rise", "jump", "beat", "strong", "profit", "record", "growth", "up"] if w in t)
    neg = sum(1 for w in ["fall", "drop", "loss", "down", "weak", "crash", "cut", "miss", "concern", "risk", "decline"] if w in t)
    if pos > neg:
        return "POSITIVE"
    if neg > pos:
        return "NEGATIVE"
    return "NEUTRAL"


def cache_stats() -> dict:
    """How many items are cached and when they expire."""
    now = time.time()
    return {
        "cached_items": len(_cache),
        "active": sum(1 for v in _cache.values() if v["expires"] > now),
        "expired": sum(1 for v in _cache.values() if v["expires"] <= now),
        "api_key_configured": bool(EODHD_KEY),
    }

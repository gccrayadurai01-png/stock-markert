"""
Crypto Engine — fetches live data from Binance + CoinGecko + runs technical analysis.
No API key needed. 24/7 markets.
"""
from __future__ import annotations

import httpx
import logging
from typing import Dict, List, Optional
from technical_engine import full_analysis, calc_atr

logger = logging.getLogger(__name__)

BINANCE_SPOT = "https://api.binance.com"
BINANCE_FUTURES = "https://fapi.binance.com"
COINGECKO = "https://api.coingecko.com/api/v3"
FNG_URL = "https://api.alternative.me/fng/"

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}

# ── Top 30 liquid USDT pairs (by market cap & Binance volume) ───────────
CRYPTO_UNIVERSE = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
    "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT",
    "LINKUSDT", "UNIUSDT", "ATOMUSDT", "LTCUSDT", "NEARUSDT",
    "APTUSDT", "ARBUSDT", "OPUSDT", "SUIUSDT", "INJUSDT",
    "TIAUSDT", "SEIUSDT", "FILUSDT", "ETCUSDT", "TRXUSDT",
    "TONUSDT", "SHIBUSDT", "PEPEUSDT", "RNDRUSDT", "FETUSDT",
]

# Major market indicators (for overview panel)
INDEX_SYMBOLS = {
    "BTC": "BTCUSDT",
    "ETH": "ETHUSDT",
    "TOTAL_CRYPTO_CAP": None,  # from CoinGecko /global
    "BTC_DOMINANCE": None,     # from CoinGecko /global
}

# Pretty names for UI
SYMBOL_NAMES = {
    "BTCUSDT": "Bitcoin", "ETHUSDT": "Ethereum", "SOLUSDT": "Solana",
    "BNBUSDT": "BNB", "XRPUSDT": "XRP", "ADAUSDT": "Cardano",
    "DOGEUSDT": "Dogecoin", "AVAXUSDT": "Avalanche", "DOTUSDT": "Polkadot",
    "MATICUSDT": "Polygon", "LINKUSDT": "Chainlink", "UNIUSDT": "Uniswap",
    "ATOMUSDT": "Cosmos", "LTCUSDT": "Litecoin", "NEARUSDT": "NEAR",
    "APTUSDT": "Aptos", "ARBUSDT": "Arbitrum", "OPUSDT": "Optimism",
    "SUIUSDT": "Sui", "INJUSDT": "Injective", "TIAUSDT": "Celestia",
    "SEIUSDT": "Sei", "FILUSDT": "Filecoin", "ETCUSDT": "Ethereum Classic",
    "TRXUSDT": "TRON", "TONUSDT": "Toncoin", "SHIBUSDT": "Shiba Inu",
    "PEPEUSDT": "Pepe", "RNDRUSDT": "Render", "FETUSDT": "Fetch.ai",
}


# ── Binance klines (OHLCV candles) ────────────────────────────────────

def _fetch_klines(symbol: str, interval: str = "1h", limit: int = 200) -> Optional[List[list]]:
    """Fetch candlesticks from Binance. No auth needed.
    Returns list of: [open_time, open, high, low, close, volume, ...]
    """
    try:
        r = httpx.get(
            f"{BINANCE_SPOT}/api/v3/klines",
            params={"symbol": symbol, "interval": interval, "limit": limit},
            headers=HEADERS,
            timeout=10,
        )
        if r.status_code != 200:
            logger.warning(f"Binance klines {symbol} status {r.status_code}")
            return None
        return r.json()
    except Exception as e:
        logger.error(f"Binance klines error {symbol}: {e}")
        return None


def _extract_ohlcv(klines: List[list]) -> Dict:
    """Extract OHLCV arrays from Binance klines response."""
    opens = [float(k[1]) for k in klines]
    highs = [float(k[2]) for k in klines]
    lows = [float(k[3]) for k in klines]
    closes = [float(k[4]) for k in klines]
    volumes = [float(k[5]) for k in klines]
    return {
        "opens": opens, "highs": highs, "lows": lows,
        "closes": closes, "volumes": volumes,
    }


def fetch_24hr_ticker(symbol: str) -> Optional[dict]:
    """Fetch 24hr stats for a symbol."""
    try:
        r = httpx.get(
            f"{BINANCE_SPOT}/api/v3/ticker/24hr",
            params={"symbol": symbol},
            headers=HEADERS,
            timeout=8,
        )
        if r.status_code != 200:
            return None
        return r.json()
    except Exception as e:
        logger.error(f"24hr ticker error {symbol}: {e}")
        return None


# ── CoinGecko global & market data ────────────────────────────────────

def fetch_global_data() -> dict:
    """Fetch total market cap, BTC dominance, 24h volume from CoinGecko."""
    try:
        r = httpx.get(f"{COINGECKO}/global", headers=HEADERS, timeout=8)
        if r.status_code != 200:
            return {"total_market_cap_usd": 0, "btc_dominance": 0, "eth_dominance": 0, "total_volume_24h_usd": 0, "active_cryptocurrencies": 0, "market_cap_change_24h_pct": 0}
        data = r.json().get("data", {})
        return {
            "total_market_cap_usd": data.get("total_market_cap", {}).get("usd", 0),
            "total_volume_24h_usd": data.get("total_volume", {}).get("usd", 0),
            "btc_dominance": round(data.get("market_cap_percentage", {}).get("btc", 0), 2),
            "eth_dominance": round(data.get("market_cap_percentage", {}).get("eth", 0), 2),
            "markets": data.get("markets", 0),
            "active_cryptocurrencies": data.get("active_cryptocurrencies", 0),
            "market_cap_change_24h_pct": round(data.get("market_cap_change_percentage_24h_usd", 0), 2),
        }
    except Exception as e:
        logger.error(f"CoinGecko global error: {e}")
        return {"total_market_cap_usd": 0, "btc_dominance": 0, "eth_dominance": 0, "total_volume_24h_usd": 0, "active_cryptocurrencies": 0, "market_cap_change_24h_pct": 0}


def fetch_top_coins(limit: int = 30) -> List[dict]:
    """Top coins by market cap from CoinGecko (for overview)."""
    try:
        r = httpx.get(
            f"{COINGECKO}/coins/markets",
            params={"vs_currency": "usd", "order": "market_cap_desc",
                    "per_page": limit, "page": 1, "sparkline": "false",
                    "price_change_percentage": "1h,24h,7d"},
            headers=HEADERS,
            timeout=10,
        )
        if r.status_code != 200:
            return []
        return r.json()
    except Exception as e:
        logger.error(f"CoinGecko markets error: {e}")
        return []


# ── Fear & Greed Index ───────────────────────────────────────────────

def fetch_fear_greed() -> dict:
    """Crypto Fear & Greed Index from alternative.me (0=extreme fear, 100=extreme greed)."""
    try:
        r = httpx.get(FNG_URL, params={"limit": 1}, headers=HEADERS, timeout=8)
        if r.status_code != 200:
            return {"value": 50, "classification": "Neutral", "available": False}
        d = r.json().get("data", [{}])[0]
        return {
            "value": int(d.get("value", 50)),
            "classification": d.get("value_classification", "Neutral"),
            "timestamp": d.get("timestamp", ""),
            "available": True,
        }
    except Exception as e:
        logger.error(f"F&G error: {e}")
        return {"value": 50, "classification": "Neutral", "available": False}


# ── Binance futures: funding rate & open interest ────────────────────

def fetch_funding_rate(symbol: str) -> dict:
    """Current funding rate and mark price for a perpetual."""
    try:
        r = httpx.get(
            f"{BINANCE_FUTURES}/fapi/v1/premiumIndex",
            params={"symbol": symbol},
            headers=HEADERS,
            timeout=8,
        )
        if r.status_code != 200:
            return {"available": False, "funding_rate": 0, "mark_price": 0}
        d = r.json()
        fr = float(d.get("lastFundingRate", 0))
        return {
            "available": True,
            "funding_rate": fr,
            "funding_rate_pct": round(fr * 100, 4),
            "mark_price": float(d.get("markPrice", 0)),
            "index_price": float(d.get("indexPrice", 0)),
            "next_funding_time": d.get("nextFundingTime", 0),
        }
    except Exception as e:
        logger.debug(f"Funding rate {symbol}: {e}")
        return {"available": False, "funding_rate": 0, "mark_price": 0}


def fetch_open_interest(symbol: str) -> dict:
    """Current open interest for a futures symbol."""
    try:
        r = httpx.get(
            f"{BINANCE_FUTURES}/fapi/v1/openInterest",
            params={"symbol": symbol},
            headers=HEADERS,
            timeout=8,
        )
        if r.status_code != 200:
            return {"available": False, "open_interest": 0}
        d = r.json()
        return {
            "available": True,
            "open_interest": float(d.get("openInterest", 0)),
        }
    except Exception:
        return {"available": False, "open_interest": 0}


# ── Precision helper for micro-price coins (SHIB, PEPE etc.) ──────────

def _precision_for(price: float) -> int:
    """Return decimal places to use for a given price magnitude."""
    if price >= 1000: return 2
    if price >= 10: return 3
    if price >= 1: return 4
    if price >= 0.01: return 5
    if price >= 0.0001: return 7
    return 10


def _round_p(value: float, price_ref: float) -> float:
    return round(value, _precision_for(price_ref))


# ── Per-coin analysis ────────────────────────────────────────────────

def analyze_coin(symbol: str) -> Optional[dict]:
    """Fetch OHLCV + run 12-indicator analysis for one crypto pair.
    Uses 1h candles, 200 periods (enough history for EMA200 bias)."""
    klines = _fetch_klines(symbol, interval="1h", limit=200)
    if not klines or len(klines) < 30:
        return None

    ohlcv = _extract_ohlcv(klines)
    closes = ohlcv["closes"]
    current_raw = closes[-1]
    prec = _precision_for(current_raw)
    current = round(current_raw, prec)
    prev = round(closes[-2], prec) if len(closes) >= 2 else current
    change_pct = round(((current - prev) / prev) * 100, 2) if prev else 0

    # 24h ticker for richer stats (optional)
    ticker = fetch_24hr_ticker(symbol) or {}

    # Full technical analysis (same engine stocks use — pure math works on any OHLCV)
    ta = full_analysis(
        ohlcv["opens"], ohlcv["highs"], ohlcv["lows"],
        ohlcv["closes"], ohlcv["volumes"],
    )

    # Recompute ATR/SL/TP with crypto-appropriate precision (full_analysis rounds to 2 dp)
    atr_raw = calc_atr(ohlcv["highs"], ohlcv["lows"], ohlcv["closes"])
    # Fallback: if ATR is 0 or suspiciously tiny, use 1.5% of price as minimum
    if not atr_raw or atr_raw < current_raw * 0.0015:
        atr_raw = current_raw * 0.015
    # Crypto is more volatile — use 2× ATR for SL, 3×/5× for targets
    sl_dist = atr_raw * 2.0
    if ta["signal"] in ("BUY", "STRONG_BUY"):
        stop_loss = _round_p(current_raw - sl_dist, current_raw)
        target_1 = _round_p(current_raw + sl_dist * 1.5, current_raw)
        target_2 = _round_p(current_raw + sl_dist * 2.5, current_raw)
    elif ta["signal"] in ("SELL", "STRONG_SELL"):
        stop_loss = _round_p(current_raw + sl_dist, current_raw)
        target_1 = _round_p(current_raw - sl_dist * 1.5, current_raw)
        target_2 = _round_p(current_raw - sl_dist * 2.5, current_raw)
    else:
        stop_loss = _round_p(current_raw - sl_dist, current_raw)
        target_1 = _round_p(current_raw + sl_dist * 1.5, current_raw)
        target_2 = _round_p(current_raw + sl_dist * 2.5, current_raw)

    return {
        "symbol": symbol,
        "name": SYMBOL_NAMES.get(symbol, symbol.replace("USDT", "")),
        "price": current,
        "prev_close": prev,
        "change_percent": change_pct,
        "change_24h_pct": round(float(ticker.get("priceChangePercent", change_pct)), 2),
        "high_24h": _round_p(float(ticker.get("highPrice", ohlcv["highs"][-1])), current_raw),
        "low_24h": _round_p(float(ticker.get("lowPrice", ohlcv["lows"][-1])), current_raw),
        "volume_24h_usd": round(float(ticker.get("quoteVolume", 0)), 0),
        "trades_24h": int(ticker.get("count", 0)),
        # Technical analysis fields
        "signal": ta["signal"],
        "score": ta["score"],
        "confidence": ta["confidence"],
        "stop_loss": stop_loss,
        "target_1": target_1,
        "target_2": target_2,
        "atr": _round_p(atr_raw, current_raw),
        "votes": ta["votes"],
        "indicators": ta["indicators"],
    }


def fetch_all_coins(symbols: Optional[List[str]] = None) -> List[dict]:
    """Parallel-fetch all coins and return sorted by score."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    if symbols is None:
        symbols = CRYPTO_UNIVERSE

    results = []
    with ThreadPoolExecutor(max_workers=15) as ex:
        futures = {ex.submit(analyze_coin, s): s for s in symbols}
        for fut in as_completed(futures):
            coin = fut.result()
            if coin:
                results.append(coin)

    results.sort(key=lambda x: x["score"], reverse=True)
    return results


def fetch_market_overview() -> dict:
    """Crypto market overview — BTC, ETH, global cap, dominance, F&G."""
    global_data = fetch_global_data()
    fng = fetch_fear_greed()

    btc_ticker = fetch_24hr_ticker("BTCUSDT") or {}
    eth_ticker = fetch_24hr_ticker("ETHUSDT") or {}

    return {
        "btc_price": round(float(btc_ticker.get("lastPrice", 0)), 2),
        "btc_change_24h": round(float(btc_ticker.get("priceChangePercent", 0)), 2),
        "btc_high_24h": round(float(btc_ticker.get("highPrice", 0)), 2),
        "btc_low_24h": round(float(btc_ticker.get("lowPrice", 0)), 2),
        "eth_price": round(float(eth_ticker.get("lastPrice", 0)), 2),
        "eth_change_24h": round(float(eth_ticker.get("priceChangePercent", 0)), 2),
        "total_market_cap_usd": global_data["total_market_cap_usd"],
        "total_volume_24h_usd": global_data["total_volume_24h_usd"],
        "btc_dominance": global_data.get("btc_dominance", 0),
        "eth_dominance": global_data.get("eth_dominance", 0),
        "market_cap_change_24h_pct": global_data.get("market_cap_change_24h_pct", 0),
        "active_cryptocurrencies": global_data.get("active_cryptocurrencies", 0),
        "fear_greed_value": fng["value"],
        "fear_greed_classification": fng["classification"],
        "market_status": "OPEN",  # crypto is 24/7
    }


def get_buy_candidates(coins: List[dict]) -> List[dict]:
    return [c for c in coins if c["signal"] in ("BUY", "STRONG_BUY")]


def get_sell_candidates(coins: List[dict]) -> List[dict]:
    return [c for c in coins if c["signal"] in ("SELL", "STRONG_SELL")]


def get_top_gainers(coins: List[dict], n: int = 5) -> List[dict]:
    return sorted(coins, key=lambda x: x.get("change_24h_pct", 0), reverse=True)[:n]


def get_top_losers(coins: List[dict], n: int = 5) -> List[dict]:
    return sorted(coins, key=lambda x: x.get("change_24h_pct", 0))[:n]


def fetch_chart_data(symbol: str, interval: str = "1h", limit: int = 100) -> Optional[dict]:
    """Fetch candles for chart rendering. Intervals: 1m,5m,15m,1h,4h,1d."""
    klines = _fetch_klines(symbol, interval=interval, limit=limit)
    if not klines:
        return None

    candles = [
        {
            "date": int(k[0]),  # open time in ms (UTC)
            "open": float(k[1]),
            "high": float(k[2]),
            "low": float(k[3]),
            "close": float(k[4]),
            "volume": float(k[5]),
        }
        for k in klines
    ]
    return {
        "symbol": symbol,
        "name": SYMBOL_NAMES.get(symbol, symbol.replace("USDT", "")),
        "interval": interval,
        "candles": candles,
    }

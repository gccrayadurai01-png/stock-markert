"""Market Engine — fetches live NSE/BSE data + runs 12 pro indicators."""
from __future__ import annotations

import httpx
from typing import Dict, List, Optional
from technical_engine import full_analysis
import logging

logger = logging.getLogger(__name__)

YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}

# ── 100 NSE stocks: Nifty 50 + Nifty Next 50 + key midcaps ──────────────
NIFTY_STOCKS = [
    # ── Nifty 50 (50 stocks) ──
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "HINDUNILVR.NS", "ITC.NS", "SBIN.NS", "BHARTIARTL.NS", "KOTAKBANK.NS",
    "LT.NS", "AXISBANK.NS", "ASIANPAINT.NS", "MARUTI.NS", "SUNPHARMA.NS",
    "TITAN.NS", "WIPRO.NS", "HCLTECH.NS", "BAJFINANCE.NS", "TATAMOTORS.NS",
    "TATASTEEL.NS", "JSWSTEEL.NS", "TECHM.NS", "BEL.NS", "BPCL.NS",
    "NTPC.NS", "ONGC.NS", "ADANIENT.NS", "HINDALCO.NS", "COALINDIA.NS",
    "ULTRACEMCO.NS", "NESTLEIND.NS", "POWERGRID.NS", "BAJAJFINSV.NS", "GRASIM.NS",
    "DIVISLAB.NS", "DRREDDY.NS", "CIPLA.NS", "APOLLOHOSP.NS", "EICHERMOT.NS",
    "HEROMOTOCO.NS", "BAJAJ-AUTO.NS", "TATACONSUM.NS", "HDFCLIFE.NS", "SBILIFE.NS",
    "INDUSINDBK.NS", "BRITANNIA.NS", "M&M.NS", "VEDL.NS", "SHRIRAMFIN.NS",

    # ── Nifty Next 50 / Midcap picks ──
    "ADANIPORTS.NS", "ADANIPOWER.NS", "ADANIGREEN.NS", "ADANITRANS.NS",
    "NAUKRI.NS", "ZOMATO.NS", "PAYTM.NS", "DMART.NS", "IRCTC.NS",
    "PIDILITIND.NS", "BERGEPAINT.NS", "MUTHOOTFIN.NS", "RECLTD.NS", "PFC.NS",
    "HAVELLS.NS", "VOLTAS.NS", "WHIRLPOOL.NS", "CROMPTON.NS", "POLYCAB.NS",
    "MOTHERSON.NS", "BALKRISIND.NS", "MPHASIS.NS", "LTIM.NS", "PERSISTENT.NS",
    "COFORGE.NS", "OFSS.NS", "KPIT.NS", "TATATECH.NS", "TIINDIA.NS",
    "CHOLAFIN.NS", "SBICARD.NS", "IDFCFIRSTB.NS", "BANDHANBNK.NS", "FEDERALBNK.NS",
    "CANBK.NS", "BANKBARODA.NS", "PNB.NS", "UNIONBANK.NS", "INDIANB.NS",
    "GAIL.NS", "IOC.NS", "HINDPETRO.NS", "CONCOR.NS", "SAIL.NS",
    "NMDC.NS", "NATIONALUM.NS", "JINDALSTEL.NS", "WELCORP.NS", "RATNAMANI.NS",
    "ABBOTINDIA.NS", "AUROPHARMA.NS", "TORNTPHARM.NS", "LUPIN.NS", "BIOCON.NS",

    # ── Small-cap / Short-term momentum picks (₹10–₹300 range) ──
    "SUZLON.NS", "YESBANK.NS", "SOUTHINDBANK.NS", "IDBI.NS", "RPOWER.NS",
    "JSWENERGY.NS", "TATAPOWER.NS", "NHPC.NS", "SJVN.NS", "IRFC.NS",
    "NBCC.NS", "RVNL.NS", "IRCON.NS", "HFCL.NS",
    "EASEMYTRIP.NS", "IXIGO.NS", "NYKAA.NS", "HONASA.NS",
]

INDEX_SYMBOLS = {
    "NIFTY_50": "^NSEI",
    "SENSEX": "^BSESN",
    "BANK_NIFTY": "^NSEBANK",
    "INDIA_VIX": "^INDIAVIX",
}


def _fetch_yahoo(symbol: str, range: str = "1mo", interval: str = "1d") -> Optional[dict]:
    """Fetch OHLCV data from Yahoo Finance."""
    try:
        url = YAHOO_CHART_URL.format(symbol=symbol)
        r = httpx.get(
            url,
            params={"range": range, "interval": interval},
            headers=HEADERS,
            follow_redirects=True,
            timeout=10,
        )
        if r.status_code != 200:
            return None
        result = r.json().get("chart", {}).get("result", [])
        return result[0] if result else None
    except Exception as e:
        logger.error(f"Yahoo fetch error {symbol}: {e}")
        return None


def _extract_ohlcv(chart: dict) -> Dict:
    """Extract OHLCV arrays from Yahoo chart response."""
    meta = chart.get("meta", {})
    q = chart.get("indicators", {}).get("quote", [{}])[0]

    opens = [x for x in q.get("open", []) if x is not None]
    highs = [x for x in q.get("high", []) if x is not None]
    lows = [x for x in q.get("low", []) if x is not None]
    closes = [x for x in q.get("close", []) if x is not None]
    volumes = [x for x in q.get("volume", []) if x is not None]

    return {
        "opens": opens, "highs": highs, "lows": lows,
        "closes": closes, "volumes": volumes, "meta": meta,
    }


def fetch_index_data() -> dict:
    """Fetch index levels with full technical analysis."""
    result = {}
    for name, symbol in INDEX_SYMBOLS.items():
        chart = _fetch_yahoo(symbol, range="1mo", interval="1d")
        if not chart:
            result[name] = {"value": 0, "change_percent": 0, "high": 0, "low": 0, "volume": 0}
            continue

        ohlcv = _extract_ohlcv(chart)
        closes = ohlcv["closes"]
        if not closes:
            result[name] = {"value": 0, "change_percent": 0, "high": 0, "low": 0, "volume": 0}
            continue

        current = round(closes[-1], 2)
        prev = round(closes[-2], 2) if len(closes) >= 2 else current
        change = round(((current - prev) / prev) * 100, 2) if prev else 0

        result[name] = {
            "value": current,
            "change_percent": change,
            "high": round(ohlcv["highs"][-1], 2) if ohlcv["highs"] else current,
            "low": round(ohlcv["lows"][-1], 2) if ohlcv["lows"] else current,
            "volume": int(ohlcv["volumes"][-1]) if ohlcv["volumes"] else 0,
        }
    return result


def analyze_stock(symbol: str) -> Optional[dict]:
    """Fetch data and run full 12-indicator analysis on a single stock."""
    chart = _fetch_yahoo(symbol, range="3mo", interval="1d")  # 3 months for EMA200
    if not chart:
        return None

    ohlcv = _extract_ohlcv(chart)
    if not ohlcv["closes"] or len(ohlcv["closes"]) < 5:
        return None

    meta = ohlcv["meta"]
    closes = ohlcv["closes"]
    current = round(closes[-1], 2)
    prev = round(closes[-2], 2) if len(closes) >= 2 else current
    change_pct = round(((current - prev) / prev) * 100, 2) if prev else 0

    # Run full technical analysis
    ta = full_analysis(
        ohlcv["opens"], ohlcv["highs"], ohlcv["lows"],
        ohlcv["closes"], ohlcv["volumes"],
    )

    return {
        "symbol": symbol,
        "name": symbol.replace(".NS", ""),
        "price": current,
        "prev_close": prev,
        "change_percent": change_pct,
        "high": round(ohlcv["highs"][-1], 2) if ohlcv["highs"] else current,
        "low": round(ohlcv["lows"][-1], 2) if ohlcv["lows"] else current,
        "open": round(ohlcv["opens"][-1], 2) if ohlcv["opens"] else current,
        "volume": int(ohlcv["volumes"][-1]) if ohlcv["volumes"] else 0,
        "week_52_high": meta.get("fiftyTwoWeekHigh", 0),
        "week_52_low": meta.get("fiftyTwoWeekLow", 0),
        # Full technical analysis
        "signal": ta["signal"],
        "score": ta["score"],
        "confidence": ta["confidence"],
        "stop_loss": ta["stop_loss"],
        "target_1": ta["target_1"],
        "target_2": ta["target_2"],
        "atr": ta["atr"],
        "votes": ta["votes"],
        "indicators": ta["indicators"],
    }


def fetch_all_stocks(symbols: Optional[List[str]] = None) -> List[dict]:
    """Analyze all stocks in parallel (up to 20 threads) and return sorted by signal strength."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    if symbols is None:
        symbols = NIFTY_STOCKS

    results = []
    # Parallel fetch — 20 workers max so Yahoo doesn't rate-limit us
    with ThreadPoolExecutor(max_workers=20) as ex:
        futures = {ex.submit(analyze_stock, sym): sym for sym in symbols}
        for fut in as_completed(futures):
            stock = fut.result()
            if stock:
                results.append(stock)

    results.sort(key=lambda x: x["score"], reverse=True)
    return results


def get_buy_candidates(stocks: List[dict]) -> List[dict]:
    """Stocks with BUY or STRONG_BUY signal."""
    return [s for s in stocks if s["signal"] in ("BUY", "STRONG_BUY")]


def get_sell_candidates(stocks: List[dict]) -> List[dict]:
    """Stocks with SELL or STRONG_SELL signal."""
    return [s for s in stocks if s["signal"] in ("SELL", "STRONG_SELL")]


def get_top_gainers(stocks: List[dict], n: int = 5) -> List[dict]:
    return sorted(stocks, key=lambda x: x["change_percent"], reverse=True)[:n]


def get_top_losers(stocks: List[dict], n: int = 5) -> List[dict]:
    return sorted(stocks, key=lambda x: x["change_percent"])[:n]

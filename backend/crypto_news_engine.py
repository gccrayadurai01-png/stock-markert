"""
Crypto News Engine — fetches crypto news, classifies sentiment, matches coins.

Sources (all free, no API key required):
  • CryptoPanic public RSS (aggregates CoinDesk, CoinTelegraph, Bitcoin Magazine, etc.)
  • CoinGecko /search/trending — trending coins (Google-Trends-like)
  • Falls back to CoinGecko news endpoint if available

We keep it similar in shape to news_engine.py so the frontend can reuse patterns.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Dict, List

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

CRYPTOPANIC_RSS = "https://cryptopanic.com/news/rss/"
COINGECKO_NEWS = "https://api.coingecko.com/api/v3/news"
COINGECKO_TRENDING = "https://api.coingecko.com/api/v3/search/trending"

HEADERS = {"User-Agent": "Mozilla/5.0 (AI Trading Dashboard)"}

# ── Sentiment keywords tuned for crypto ──────────────────────────────

BULLISH_KEYWORDS = [
    "rally", "surge", "jumps", "gains", "bullish", "breakout", "record high", "all-time high",
    "ath", "pump", "moon", "halving", "etf approval", "institutional", "accumulation",
    "buy", "long", "support", "strong", "recovery", "adoption", "partnership",
    "upgrade", "mainnet", "bitcoin reserve", "whale buying", "strategic reserve",
    "fed cuts", "rate cut", "stimulus", "inflows", "listing", "burn", "deflationary",
]

BEARISH_KEYWORDS = [
    "crash", "plunge", "falls", "drops", "bearish", "breakdown", "sell-off", "dump",
    "hack", "exploit", "rug", "collapse", "bankruptcy", "liquidation", "liquidated",
    "sec charges", "lawsuit", "regulation", "ban", "restrict", "fine", "fraud",
    "short", "downgrade", "outflow", "de-pegging", "depegs", "cascading",
    "rate hike", "inflation", "recession", "war", "contagion", "unstake",
]

# Coin keyword → symbol mapping (for news matching)
COIN_KEYWORDS = {
    "BITCOIN": "BTCUSDT", "BTC": "BTCUSDT",
    "ETHEREUM": "ETHUSDT", "ETH": "ETHUSDT", "ETHER": "ETHUSDT",
    "SOLANA": "SOLUSDT", "SOL": "SOLUSDT",
    "BINANCE COIN": "BNBUSDT", "BNB": "BNBUSDT",
    "XRP": "XRPUSDT", "RIPPLE": "XRPUSDT",
    "CARDANO": "ADAUSDT", "ADA": "ADAUSDT",
    "DOGECOIN": "DOGEUSDT", "DOGE": "DOGEUSDT",
    "AVALANCHE": "AVAXUSDT", "AVAX": "AVAXUSDT",
    "POLKADOT": "DOTUSDT", "DOT": "DOTUSDT",
    "POLYGON": "MATICUSDT", "MATIC": "MATICUSDT",
    "CHAINLINK": "LINKUSDT", "LINK": "LINKUSDT",
    "UNISWAP": "UNIUSDT", "UNI": "UNIUSDT",
    "COSMOS": "ATOMUSDT", "ATOM": "ATOMUSDT",
    "LITECOIN": "LTCUSDT", "LTC": "LTCUSDT",
    "NEAR": "NEARUSDT",
    "APTOS": "APTUSDT", "APT": "APTUSDT",
    "ARBITRUM": "ARBUSDT", "ARB": "ARBUSDT",
    "OPTIMISM": "OPUSDT",
    "SUI": "SUIUSDT",
    "INJECTIVE": "INJUSDT", "INJ": "INJUSDT",
    "CELESTIA": "TIAUSDT", "TIA": "TIAUSDT",
    "SEI": "SEIUSDT",
    "FILECOIN": "FILUSDT", "FIL": "FILUSDT",
    "ETHEREUM CLASSIC": "ETCUSDT", "ETC": "ETCUSDT",
    "TRON": "TRXUSDT", "TRX": "TRXUSDT",
    "TONCOIN": "TONUSDT", "TON": "TONUSDT",
    "SHIBA INU": "SHIBUSDT", "SHIB": "SHIBUSDT",
    "PEPE": "PEPEUSDT",
    "RENDER": "RNDRUSDT", "RNDR": "RNDRUSDT",
    "FETCH": "FETUSDT", "FET": "FETUSDT",
}

# Narrative / sector tags for contextual news
NARRATIVE_KEYWORDS = {
    "DeFi":       ["defi", "uniswap", "aave", "compound", "curve", "yield", "lending"],
    "AI":         ["ai", "artificial intelligence", "fetch", "render", "tao", "agi"],
    "L2":         ["layer 2", "l2", "arbitrum", "optimism", "base", "zk", "rollup"],
    "Memes":      ["meme", "doge", "shib", "pepe", "wif", "bonk"],
    "Gaming":     ["gamefi", "gaming", "axie", "imx", "sandbox"],
    "Regulation": ["sec", "cftc", "regulation", "etf", "lawsuit", "approval", "mica"],
    "Macro":      ["fed", "powell", "rate cut", "rate hike", "inflation", "cpi", "jobs"],
    "On-chain":   ["whale", "accumulation", "outflow", "inflow", "reserves", "supply"],
}


def classify_sentiment(text: str) -> str:
    t = text.lower()
    bull = sum(1 for kw in BULLISH_KEYWORDS if kw in t)
    bear = sum(1 for kw in BEARISH_KEYWORDS if kw in t)
    if bull > bear:
        return "BULLISH"
    if bear > bull:
        return "BEARISH"
    return "NEUTRAL"


def match_coins_in_headline(headline: str) -> List[str]:
    h = headline.upper()
    matched = []
    for kw, sym in COIN_KEYWORDS.items():
        # Word-boundary-ish match so "ETH" doesn't match "ETHERNET"
        if re.search(rf"\b{re.escape(kw)}\b", h) and sym not in matched:
            matched.append(sym)
    return matched


def match_narratives(headline: str) -> List[str]:
    h = headline.lower()
    tags = []
    for tag, kws in NARRATIVE_KEYWORDS.items():
        if any(kw in h for kw in kws):
            tags.append(tag)
    return tags


# ── Fetchers ─────────────────────────────────────────────────────────

def _fetch_cryptopanic() -> List[Dict]:
    """Fetch headlines from CryptoPanic public RSS (free, no key)."""
    try:
        r = httpx.get(CRYPTOPANIC_RSS, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, "xml")
        items = soup.find_all("item")[:25]
        out = []
        for it in items:
            title = (it.find("title").text if it.find("title") else "").strip()
            link = (it.find("link").text if it.find("link") else "").strip()
            pub = (it.find("pubDate").text if it.find("pubDate") else "").strip()
            if not title:
                continue
            out.append({
                "headline": title,
                "source": "CryptoPanic",
                "url": link,
                "published": pub,
                "sentiment": classify_sentiment(title),
                "affected_coins": match_coins_in_headline(title),
                "narratives": match_narratives(title),
            })
        return out
    except Exception as e:
        logger.warning(f"CryptoPanic fetch failed: {e}")
        return []


def _fetch_coingecko_news() -> List[Dict]:
    """CoinGecko provides a news endpoint on /news (public)."""
    try:
        r = httpx.get(COINGECKO_NEWS, headers=HEADERS, timeout=10)
        if r.status_code != 200:
            return []
        items = r.json().get("data", [])[:25]
        out = []
        for it in items:
            title = it.get("title", "")
            if not title:
                continue
            out.append({
                "headline": title,
                "source": it.get("news_site", "CoinGecko"),
                "url": it.get("url", ""),
                "published": it.get("updated_at", ""),
                "sentiment": classify_sentiment(title + " " + it.get("description", "")),
                "affected_coins": match_coins_in_headline(title),
                "narratives": match_narratives(title),
            })
        return out
    except Exception as e:
        logger.debug(f"CoinGecko news skipped: {e}")
        return []


def fetch_trending_coins() -> List[Dict]:
    """Top 7 trending coins on CoinGecko (search-volume based)."""
    try:
        r = httpx.get(COINGECKO_TRENDING, headers=HEADERS, timeout=8)
        if r.status_code != 200:
            return []
        coins = r.json().get("coins", [])[:7]
        return [{
            "id": c.get("item", {}).get("id", ""),
            "name": c.get("item", {}).get("name", ""),
            "symbol": c.get("item", {}).get("symbol", "").upper(),
            "market_cap_rank": c.get("item", {}).get("market_cap_rank"),
            "thumb": c.get("item", {}).get("thumb", ""),
        } for c in coins]
    except Exception:
        return []


def fetch_crypto_news(max_items: int = 30) -> Dict:
    """Return unified news + sentiment snapshot."""
    panic = _fetch_cryptopanic()
    gecko = _fetch_coingecko_news()
    # Dedupe on headline
    seen, merged = set(), []
    for n in (panic + gecko):
        if n["headline"] in seen:
            continue
        seen.add(n["headline"])
        merged.append(n)
        if len(merged) >= max_items:
            break

    bull = sum(1 for n in merged if n["sentiment"] == "BULLISH")
    bear = sum(1 for n in merged if n["sentiment"] == "BEARISH")
    neu = len(merged) - bull - bear

    if bull > bear * 1.3:
        overall = "BULLISH"
    elif bear > bull * 1.3:
        overall = "BEARISH"
    else:
        overall = "NEUTRAL"

    return {
        "news": merged,
        "sentiment": {
            "sentiment": overall,
            "bullish": bull,
            "bearish": bear,
            "neutral": neu,
            "total": len(merged),
        },
        "trending": fetch_trending_coins(),
        "timestamp": datetime.now().isoformat(),
    }


def news_score_for(symbol: str, all_news: List[Dict]) -> Dict:
    """Strategy D input — score news catalyst strength for a given coin."""
    relevant = [n for n in all_news if symbol in n.get("affected_coins", [])]
    if not relevant:
        return {"score": 0, "count": 0, "bullish": 0, "bearish": 0,
                "headlines": [], "dominant": "NEUTRAL"}

    bull = sum(1 for n in relevant if n["sentiment"] == "BULLISH")
    bear = sum(1 for n in relevant if n["sentiment"] == "BEARISH")

    # Score: lean bullish = 40pt base per item, capped
    if bull > bear:
        score = min(60, bull * 20)
        dominant = "BULLISH"
    elif bear > bull:
        score = -min(40, bear * 15)
        dominant = "BEARISH"
    else:
        score = 0
        dominant = "NEUTRAL"

    return {
        "score": score,
        "count": len(relevant),
        "bullish": bull,
        "bearish": bear,
        "headlines": [n["headline"] for n in relevant[:3]],
        "dominant": dominant,
    }

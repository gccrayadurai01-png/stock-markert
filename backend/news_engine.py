"""News & Sentiment Engine — fetches market news, classifies sentiment, matches stocks."""
from __future__ import annotations

import httpx
import os
import logging
from typing import Dict, List
from datetime import datetime
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")
NEWS_API_URL = "https://newsapi.org/v2/everything"

SCRAPE_SOURCES = [
    {
        "name": "Moneycontrol",
        "url": "https://www.moneycontrol.com/news/business/markets/",
        "selector": "li.clearfix h2 a",
    },
    {
        "name": "Economic Times",
        "url": "https://economictimes.indiatimes.com/markets/stocks/news",
        "selector": "div.eachStory h3 a",
    },
]

BULLISH_KEYWORDS = [
    "rally", "surge", "jumps", "gains", "bullish", "breakout", "record high",
    "upgrade", "buy", "outperform", "beat", "strong", "recovery", "boom",
    "rate cut", "stimulus", "inflow", "dii buying", "hikes stake",
    "listing push", "outperformers", "upside", "52-week high",
]

BEARISH_KEYWORDS = [
    "crash", "plunge", "falls", "drops", "bearish", "breakdown", "sell-off",
    "downgrade", "sell", "underperform", "miss", "weak", "recession", "crisis",
    "rate hike", "inflation", "fii selling", "outflow", "war", "sanctions",
    "cuts stake", "52-week low", "penalty", "fraud", "ban",
]

# Stock name → symbol mapping for news matching
STOCK_KEYWORDS = {
    "RELIANCE": "RELIANCE.NS", "TCS": "TCS.NS", "HDFC": "HDFCBANK.NS",
    "INFOSYS": "INFY.NS", "INFY": "INFY.NS", "ICICI": "ICICIBANK.NS",
    "HUL": "HINDUNILVR.NS", "HINDUSTAN UNILEVER": "HINDUNILVR.NS",
    "ITC": "ITC.NS", "SBI": "SBIN.NS", "STATE BANK": "SBIN.NS",
    "BHARTI": "BHARTIARTL.NS", "AIRTEL": "BHARTIARTL.NS",
    "KOTAK": "KOTAKBANK.NS", "L&T": "LT.NS", "LARSEN": "LT.NS",
    "AXIS": "AXISBANK.NS", "ASIAN PAINT": "ASIANPAINT.NS",
    "MARUTI": "MARUTI.NS", "SUN PHARMA": "SUNPHARMA.NS",
    "TITAN": "TITAN.NS", "WIPRO": "WIPRO.NS", "HCL": "HCLTECH.NS",
    "BAJAJ FINANCE": "BAJFINANCE.NS", "BAJFINANCE": "BAJFINANCE.NS",
    "TATA MOTORS": "TATAMOTORS.NS", "TATA STEEL": "TATASTEEL.NS",
    "TATASTEEL": "TATASTEEL.NS", "JSW": "JSWSTEEL.NS",
    "TECH MAHINDRA": "TECHM.NS", "BEL": "BEL.NS", "BPCL": "BPCL.NS",
    "NTPC": "NTPC.NS", "ONGC": "ONGC.NS", "ADANI": "ADANIENT.NS",
    "HINDALCO": "HINDALCO.NS", "COAL INDIA": "COALINDIA.NS",
    "TATA": "TATASTEEL.NS", "NIFTY": None, "SENSEX": None,
    "BANK NIFTY": None, "MARKET": None,
}

# Sector keywords for sector-level news
SECTOR_KEYWORDS = {
    "IT": ["IT", "tech", "software", "TCS", "Infosys", "Wipro", "HCL", "Tech Mahindra"],
    "Banking": ["bank", "HDFC", "ICICI", "SBI", "Axis", "Kotak", "RBI", "credit", "NPA"],
    "Pharma": ["pharma", "drug", "Sun Pharma", "healthcare", "FDA"],
    "Auto": ["auto", "Maruti", "Tata Motors", "vehicle", "EV", "electric"],
    "Metal": ["steel", "metal", "Tata Steel", "JSW", "Hindalco", "aluminium", "iron"],
    "Oil & Gas": ["oil", "gas", "ONGC", "BPCL", "crude", "petrol", "diesel"],
    "FMCG": ["FMCG", "HUL", "ITC", "consumer", "food"],
    "Infra": ["infra", "L&T", "construction", "road", "railway"],
}


def classify_sentiment(text: str) -> str:
    text_lower = text.lower()
    bull_score = sum(1 for kw in BULLISH_KEYWORDS if kw in text_lower)
    bear_score = sum(1 for kw in BEARISH_KEYWORDS if kw in text_lower)
    if bull_score > bear_score:
        return "BULLISH"
    elif bear_score > bull_score:
        return "BEARISH"
    return "NEUTRAL"


def match_stocks_in_headline(headline: str) -> List[str]:
    """Find which stocks are mentioned in a news headline."""
    headline_upper = headline.upper()
    matched = []
    for keyword, symbol in STOCK_KEYWORDS.items():
        if keyword.upper() in headline_upper and symbol and symbol not in matched:
            matched.append(symbol)
    return matched


def match_sectors_in_headline(headline: str) -> List[str]:
    """Find which sectors are mentioned in a news headline."""
    headline_lower = headline.lower()
    matched = []
    for sector, keywords in SECTOR_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in headline_lower and sector not in matched:
                matched.append(sector)
                break
    return matched


def generate_news_trades(news: List[dict], all_stocks: List[dict]) -> List[dict]:
    """Generate trade suggestions based on news + stock data."""
    stock_map = {s["symbol"]: s for s in all_stocks}
    trades = []
    seen_symbols = set()

    for n in news:
        affected = n.get("affected_stocks", [])
        sentiment = n.get("sentiment", "NEUTRAL")

        # If no direct stock match, try sector matching
        if not affected and sentiment != "NEUTRAL":
            sectors = n.get("affected_sectors", match_sectors_in_headline(n.get("headline", "")))
            if sectors:
                # Pick best stock from matched sector
                for stock in all_stocks[:15]:
                    sym_clean = stock["symbol"].replace(".NS", "").upper()
                    for sector, keywords in SECTOR_KEYWORDS.items():
                        if sector in sectors:
                            for kw in keywords:
                                if kw.upper() == sym_clean or kw.upper() in stock.get("name", "").upper():
                                    if stock["symbol"] not in affected:
                                        affected.append(stock["symbol"])
                                    break

        for sym in affected:
            if sym in seen_symbols or sym not in stock_map:
                continue

            stock = stock_map[sym]
            score = stock.get("score", 0)
            price = stock.get("price", 0)

            # News + indicator alignment = signal
            if sentiment == "BULLISH" and score >= -5:
                action = "BUY"
                trade_type = "SWING" if score > 15 else "INTRADAY"
                if score > 0:
                    reason = f"Bullish news confirms positive indicators (score +{score}). News + technicals aligned."
                else:
                    reason = f"Bullish news despite weak indicators (score {score}). News-driven play — use tight SL."
            elif sentiment == "BEARISH" and score <= 5:
                action = "SELL"
                trade_type = "INTRADAY"
                if score < 0:
                    reason = f"Bearish news confirms negative indicators (score {score}). Exit or short."
                else:
                    reason = f"Bearish news warning despite ok indicators (score +{score}). Watch closely, trail SL."
            else:
                continue

            sl = stock.get("stop_loss", price * 0.98)
            t1 = stock.get("target_1", price * 1.03)
            t2 = stock.get("target_2", price * 1.05)

            trades.append({
                "symbol": sym,
                "name": stock.get("name", sym.replace(".NS", "")),
                "action": action,
                "trade_type": trade_type,
                "price": price,
                "stop_loss": sl,
                "target_1": t1,
                "target_2": t2,
                "reason": reason,
                "news_headline": n.get("headline", ""),
                "news_sentiment": sentiment,
                "indicator_score": score,
                "confidence": min(10, abs(score) // 5 + 3),
                "sectors": match_sectors_in_headline(n.get("headline", "")),
            })
            seen_symbols.add(sym)

    # Sort by confidence
    trades.sort(key=lambda t: t["confidence"], reverse=True)
    return trades[:5]


async def fetch_news_api(query: str = "India stock market NSE") -> List[dict]:
    if not NEWS_API_KEY:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                NEWS_API_URL,
                params={
                    "q": query, "language": "en",
                    "sortBy": "publishedAt", "pageSize": 15,
                    "apiKey": NEWS_API_KEY,
                },
            )
            data = resp.json()
            articles = data.get("articles", [])
            result = []
            for a in articles:
                if not a.get("title"):
                    continue
                headline = a["title"]
                result.append({
                    "headline": headline,
                    "source": a["source"]["name"],
                    "url": a["url"],
                    "published": a["publishedAt"],
                    "sentiment": classify_sentiment(headline),
                    "affected_stocks": match_stocks_in_headline(headline),
                    "affected_sectors": match_sectors_in_headline(headline),
                })
            return result
    except Exception as e:
        logger.error(f"NewsAPI error: {e}")
        return []


async def scrape_headlines() -> List[dict]:
    all_news = []
    async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
        for source in SCRAPE_SOURCES:
            try:
                resp = await client.get(
                    source["url"],
                    headers={"User-Agent": "Mozilla/5.0"},
                )
                soup = BeautifulSoup(resp.text, "html.parser")
                headlines = soup.select(source["selector"])[:10]
                for h in headlines:
                    text = h.get_text(strip=True)
                    if text:
                        all_news.append({
                            "headline": text,
                            "source": source["name"],
                            "url": h.get("href", ""),
                            "published": datetime.now().isoformat(),
                            "sentiment": classify_sentiment(text),
                            "affected_stocks": match_stocks_in_headline(text),
                            "affected_sectors": match_sectors_in_headline(text),
                        })
            except Exception as e:
                logger.error(f"Scrape error ({source['name']}): {e}")
    return all_news


async def fetch_fii_dii_data() -> dict:
    """Scrape FII/DII activity data from Moneycontrol."""
    result = {
        "fii_buy": 0, "fii_sell": 0, "fii_net": 0,
        "dii_buy": 0, "dii_sell": 0, "dii_net": 0,
        "source": "moneycontrol",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "available": False,
    }
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(
                "https://www.moneycontrol.com/stocks/marketstats/fii_dii_activity/index.php",
                headers={"User-Agent": "Mozilla/5.0"},
            )
            soup = BeautifulSoup(resp.text, "html.parser")

            # Try to parse FII/DII table
            tables = soup.find_all("table")
            for table in tables:
                rows = table.find_all("tr")
                for row in rows:
                    cols = row.find_all("td")
                    if len(cols) >= 4:
                        label = cols[0].get_text(strip=True).upper()
                        try:
                            buy_val = float(cols[1].get_text(strip=True).replace(",", ""))
                            sell_val = float(cols[2].get_text(strip=True).replace(",", ""))
                            net_val = float(cols[3].get_text(strip=True).replace(",", ""))
                        except (ValueError, IndexError):
                            continue

                        if "FII" in label or "FPI" in label:
                            result["fii_buy"] = buy_val
                            result["fii_sell"] = sell_val
                            result["fii_net"] = net_val
                            result["available"] = True
                        elif "DII" in label:
                            result["dii_buy"] = buy_val
                            result["dii_sell"] = sell_val
                            result["dii_net"] = net_val
                            result["available"] = True
    except Exception as e:
        logger.warning(f"FII/DII scrape error: {e}")

    # If scraping failed, try headlines for FII/DII info
    if not result["available"]:
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
                resp = await client.get(
                    "https://www.moneycontrol.com/news/business/markets/",
                    headers={"User-Agent": "Mozilla/5.0"},
                )
                soup = BeautifulSoup(resp.text, "html.parser")
                headlines = soup.select("li.clearfix h2 a")
                for h in headlines:
                    text = h.get_text(strip=True).lower()
                    if "fii" in text or "dii" in text or "fpi" in text:
                        result["headline"] = h.get_text(strip=True)
                        result["available"] = True
                        break
        except Exception:
            pass

    return result


async def get_market_news() -> List[dict]:
    news = await fetch_news_api()
    if not news:
        news = await scrape_headlines()
    return news


def get_overall_sentiment(news: List[dict]) -> dict:
    if not news:
        return {"sentiment": "NEUTRAL", "bullish": 0, "bearish": 0, "neutral": 0, "total": 0}
    bull = sum(1 for n in news if n["sentiment"] == "BULLISH")
    bear = sum(1 for n in news if n["sentiment"] == "BEARISH")
    neutral = sum(1 for n in news if n["sentiment"] == "NEUTRAL")
    total = len(news)
    if total > 0 and bull / total > 0.5:
        overall = "BULLISH"
    elif total > 0 and bear / total > 0.5:
        overall = "BEARISH"
    else:
        overall = "NEUTRAL"
    return {"sentiment": overall, "bullish": bull, "bearish": bear, "neutral": neutral, "total": total}

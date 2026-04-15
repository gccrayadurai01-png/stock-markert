"""
AI Orchestrator — Unified single-call analysis engine.
=======================================================
Problem solved: Previously the app made 2–3 separate Claude API calls per stock:
  1. generate_signals()        → market-level trade picks
  2. _get_ai_confirmation()    → per-trade risk gate (85+ confluence)
  3. (investor perspectives)   → was already rule-based, not AI

This module collapses ALL per-stock analysis into ONE structured API call:
  - Technical signal assessment
  - Legendary investor perspectives (Jhunjhunwala, Buffett, Burry, Wood, Lynch)
  - News sentiment interpretation
  - Trade recommendation (entry / target / stop-loss)
  - Risk gate (replaces _get_ai_confirmation)

Cache strategy:
  - Key  = sha256[:16] of (symbol + rounded indicators + sorted news headlines)
  - TTL  = 5 minutes (matches news refresh cadence)
  - Max  = 300 entries (LRU eviction — oldest 20% removed when full)
  - Scope = in-process memory (no Redis needed; cache survives a scan cycle)
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── Cache store ────────────────────────────────────────────────────────────────
_cache: dict[str, tuple[dict, float]] = {}
CACHE_TTL_SECONDS = 300   # 5 min — matches news refresh interval
CACHE_MAX_ENTRIES = 300


def _evict_cache():
    """Remove oldest 20 % of entries when cache is full."""
    if len(_cache) >= CACHE_MAX_ENTRIES:
        sorted_keys = sorted(_cache, key=lambda k: _cache[k][1])
        for k in sorted_keys[: CACHE_MAX_ENTRIES // 5]:
            del _cache[k]


def _cache_key(symbol: str, indicators: dict, news_headlines: list, timeframe: str = "15m") -> str:
    """
    Stable cache key based on symbol + rounded indicator snapshot + top-5 headlines.
    Rounding prevents cache misses from floating-point jitter.
    """
    payload = {
        "symbol": symbol,
        "tf": timeframe,
        # Round to 1 dp to absorb tick-level noise
        "rsi":   round(float(indicators.get("rsi", 0) or 0), 1),
        "macd":  str(indicators.get("macd_vote", "")),
        "st":    str(indicators.get("supertrend_dir", "")),
        "ema":   str(indicators.get("ema_align", "")),
        "adx":   round(float(indicators.get("adx", 0) or 0), 0),
        "bb":    round(float(indicators.get("bb_pct", 0.5) or 0.5), 2),
        "vwap":  str(indicators.get("vwap_vote", "")),
        "price": round(float(indicators.get("price", 0) or 0), 0),  # ₹-level rounding
        "news":  sorted([h[:60] for h in news_headlines[:5]]),       # top-5, first 60 chars
    }
    raw = json.dumps(payload, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def get_cached(key: str) -> Optional[dict]:
    if key in _cache:
        result, ts = _cache[key]
        if time.time() - ts < CACHE_TTL_SECONDS:
            return result
        del _cache[key]
    return None


def set_cache(key: str, result: dict):
    _evict_cache()
    _cache[key] = (result, time.time())


def cache_stats() -> dict:
    now = time.time()
    valid = sum(1 for _, (_, ts) in _cache.items() if now - ts < CACHE_TTL_SECONDS)
    return {"total": len(_cache), "valid": valid, "ttl_seconds": CACHE_TTL_SECONDS}


# ── Anthropic client (shared across module) ────────────────────────────────────
_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    try:
        from anthropic import Anthropic
        key = os.getenv("ANTHROPIC_API_KEY", "")
        if not key:
            env_path = Path(__file__).parent / ".env"
            if env_path.exists():
                for line in env_path.read_text().splitlines():
                    if line.startswith("ANTHROPIC_API_KEY="):
                        key = line.split("=", 1)[1].strip()
        if key and key != "your_anthropic_api_key_here":
            _client = Anthropic(api_key=key)
            logger.info("AI Orchestrator: Anthropic client ready")
            return _client
    except Exception as e:
        logger.warning(f"AI Orchestrator: cannot init client — {e}")
    return None


# ── Unified prompt template ────────────────────────────────────────────────────
_SYSTEM_PROMPT = """You are an elite AI trading analyst combining brutal technical analysis, legendary investor wisdom, and news intelligence.

RULES:
1. Respond ONLY with valid JSON. No markdown fences. No text outside JSON.
2. Be brutally honest. If data says "avoid" — say avoid.
3. Confidence scores are integers 0–100.
4. News sentiment score: 0 (very bearish) → 100 (very bullish), 50 = neutral.
5. Risk gate: set approved=false if RSI>78, ADX<15, supertrend=DOWN + MACD=SELL simultaneously, or news is strongly bearish.
6. All price fields must be realistic numbers (not 0), derived from the given price."""

_ANALYSIS_PROMPT = """\
=== STOCK UNDER ANALYSIS ===
Symbol : {symbol}
Name   : {name}
Price  : ₹{price}
Change : {change_pct}%

=== TECHNICAL INDICATORS ===
RSI           : {rsi}
MACD          : {macd_vote}
Supertrend    : {supertrend}
EMA Alignment : {ema_align}
ADX           : {adx}
Bollinger %B  : {bb_pct}
VWAP          : {vwap_vote}
Volume Spike  : {volume_spike}
Stochastic K  : {stoch_k}
Score         : {ind_score}/110
Buy/Sell/Neut : {buy_votes}/{sell_votes}/{neutral_votes}
ATR           : {atr}
Stop Loss     : ₹{stop_loss} (indicator-derived)
Target 1      : ₹{target_1}
Target 2      : ₹{target_2}

=== CONFLUENCE CONTEXT ===
Overall confluence: {confluence}/110
Conditions met   : {reasons}
Conditions missing: {missing}

=== RECENT NEWS (most relevant to this stock) ===
{news_section}

=== MARKET CONTEXT ===
Market sentiment : {market_sentiment}
User capital     : ₹{capital}
Risk per trade   : {risk_pct}%

Respond with this EXACT JSON structure (all fields required):
{{
  "symbol": "{symbol}",
  "technicalSignal": {{
    "signal": "STRONG_BUY|BUY|NEUTRAL|SELL|STRONG_SELL",
    "confidence": 0,
    "summary": "2-sentence brutal assessment of what the indicators say"
  }},
  "investorPerspectives": [
    {{"investor": "Rakesh Jhunjhunwala", "view": "BULLISH|BEARISH|NEUTRAL", "reasoning": "one concise sentence"}},
    {{"investor": "Warren Buffett",      "view": "BULLISH|BEARISH|NEUTRAL", "reasoning": "one concise sentence"}},
    {{"investor": "Michael Burry",       "view": "BULLISH|BEARISH|NEUTRAL", "reasoning": "one concise sentence"}},
    {{"investor": "Cathie Wood",         "view": "BULLISH|BEARISH|NEUTRAL", "reasoning": "one concise sentence"}},
    {{"investor": "Peter Lynch",         "view": "BULLISH|BEARISH|NEUTRAL", "reasoning": "one concise sentence"}}
  ],
  "newsSentiment": {{
    "score": 50,
    "label": "BULLISH|BEARISH|NEUTRAL",
    "summary": "one sentence: how current news affects this specific stock"
  }},
  "tradeRecommendation": {{
    "action": "BUY|SELL|SKIP",
    "entry": 0.0,
    "target1": 0.0,
    "target2": 0.0,
    "stopLoss": 0.0,
    "capitalPct": 20,
    "reasoning": "1-2 sentences: brutal honest case for this trade (or why to skip)"
  }},
  "riskAnalysis": {{
    "riskLevel": "LOW|MEDIUM|HIGH|EXTREME",
    "confluenceScore": {confluence},
    "approved": true,
    "summary": "one sentence: primary risk factor for this trade"
  }}
}}"""


def _build_news_section(symbol: str, all_news: list) -> str:
    """Filter news relevant to this stock and format for prompt."""
    sym_base = symbol.replace(".NS", "").replace(".BO", "").lower()
    relevant = []
    for item in all_news:
        headline = item.get("headline", "")
        affected = [s.lower() for s in item.get("affected_stocks", [])]
        if sym_base in headline.lower() or any(sym_base in s for s in affected):
            relevant.append(item)

    # Fall back to top market headlines if no stock-specific news
    if not relevant:
        relevant = all_news[:5]

    lines = []
    for item in relevant[:6]:
        sentiment = item.get("sentiment", "NEUTRAL")
        emoji = "📈" if sentiment == "BULLISH" else "📉" if sentiment == "BEARISH" else "➖"
        lines.append(f"{emoji} [{sentiment}] {item.get('headline', '')}")
    return "\n".join(lines) if lines else "No recent news found for this stock."


def _flatten_indicators(stock: dict) -> dict:
    """
    Flatten nested indicators dict from market_engine into a flat dict
    so the cache key and prompt builder can use simple key lookups.
    """
    ind = stock.get("indicators", {})
    return {
        "price":         stock.get("price", 0),
        "rsi":           ind.get("rsi", {}).get("value", "N/A"),
        "macd_vote":     ind.get("macd", {}).get("vote", "N/A"),
        "supertrend_dir":ind.get("supertrend", {}).get("direction", "N/A"),
        "ema_align":     ind.get("ema_crossover", {}).get("alignment", "N/A"),
        "adx":           ind.get("adx", {}).get("adx", "N/A"),
        "bb_pct":        ind.get("bollinger", {}).get("pct_b", 0.5),
        "vwap_vote":     ind.get("vwap", {}).get("vote", "N/A"),
        "volume_spike":  ind.get("volume", {}).get("spike", False),
        "stoch_k":       ind.get("stochastic", {}).get("k", "N/A"),
        "atr":           stock.get("atr", 0),
        "stop_loss":     stock.get("stop_loss", 0),
        "target_1":      stock.get("target_1", 0),
        "target_2":      stock.get("target_2", 0),
        "ind_score":     stock.get("score", 0),
        "buy_votes":     stock.get("votes", {}).get("BUY", 0),
        "sell_votes":    stock.get("votes", {}).get("SELL", 0),
        "neutral_votes": stock.get("votes", {}).get("NEUTRAL", 0),
    }


# ── Public API ─────────────────────────────────────────────────────────────────

def analyze_stock(
    stock: dict,
    all_news: list,
    market_sentiment: str = "NEUTRAL",
    confluence: int = 0,
    reasons: list = None,
    missing: list = None,
    capital: float = 100_000,
    risk_pct: float = 1.5,
    timeframe: str = "15m",
    force_refresh: bool = False,
) -> dict:
    """
    Single-call unified stock analysis.

    Parameters
    ----------
    stock           : Stock dict from market_engine (includes 'indicators' sub-dict)
    all_news        : List of news dicts from news_engine
    market_sentiment: Overall market sentiment string
    confluence      : Pre-computed confluence score (0–110) from multi-strategy eval
    reasons         : List of conditions that are met (from strategy evaluation)
    missing         : List of conditions that are missing
    capital         : User's trading capital in ₹
    risk_pct        : Risk per trade as % of capital
    timeframe       : Candle interval string (for cache key)
    force_refresh   : Bypass cache and call AI fresh

    Returns
    -------
    Unified analysis dict with keys:
        symbol, technicalSignal, investorPerspectives, newsSentiment,
        tradeRecommendation, riskAnalysis, _cached, _cache_key
    """
    symbol = stock.get("symbol", "")
    flat_ind = _flatten_indicators(stock)
    news_headlines = [n.get("headline", "") for n in all_news]

    # ── Cache lookup ───────────────────────────────────────────────────────
    key = _cache_key(symbol, flat_ind, news_headlines, timeframe)
    if not force_refresh:
        cached = get_cached(key)
        if cached:
            logger.debug(f"[Orchestrator] Cache HIT for {symbol} ({key})")
            return {**cached, "_cached": True, "_cache_key": key}

    logger.info(f"[Orchestrator] Cache MISS — calling AI for {symbol}")

    client = _get_client()
    if not client:
        logger.warning(f"[Orchestrator] No AI client — returning fallback for {symbol}")
        return _fallback_analysis(stock, flat_ind, all_news, market_sentiment, confluence, key)

    # ── Build prompt ───────────────────────────────────────────────────────
    news_section = _build_news_section(symbol, all_news)
    prompt = _ANALYSIS_PROMPT.format(
        symbol=symbol,
        name=stock.get("name", symbol),
        price=f"{flat_ind['price']:.2f}",
        change_pct=f"{stock.get('change_percent', 0):.2f}",
        rsi=flat_ind["rsi"],
        macd_vote=flat_ind["macd_vote"],
        supertrend=flat_ind["supertrend_dir"],
        ema_align=flat_ind["ema_align"],
        adx=flat_ind["adx"],
        bb_pct=flat_ind["bb_pct"],
        vwap_vote=flat_ind["vwap_vote"],
        volume_spike=flat_ind["volume_spike"],
        stoch_k=flat_ind["stoch_k"],
        ind_score=flat_ind["ind_score"],
        buy_votes=flat_ind["buy_votes"],
        sell_votes=flat_ind["sell_votes"],
        neutral_votes=flat_ind["neutral_votes"],
        atr=flat_ind["atr"],
        stop_loss=flat_ind["stop_loss"],
        target_1=flat_ind["target_1"],
        target_2=flat_ind["target_2"],
        confluence=confluence,
        reasons=json.dumps(reasons or []),
        missing=json.dumps(missing or []),
        news_section=news_section,
        market_sentiment=market_sentiment,
        capital=f"{capital:,.0f}",
        risk_pct=risk_pct,
    )

    # ── Single AI call ─────────────────────────────────────────────────────
    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()

        # Strip accidental markdown fences
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        result = json.loads(text)
        result["_cached"] = False
        result["_cache_key"] = key
        set_cache(key, {k: v for k, v in result.items() if not k.startswith("_")})
        logger.info(
            f"[Orchestrator] ✅ {symbol} → "
            f"signal={result.get('technicalSignal', {}).get('signal')} "
            f"approved={result.get('riskAnalysis', {}).get('approved')} "
            f"(cache key {key})"
        )
        return result

    except json.JSONDecodeError as e:
        logger.error(f"[Orchestrator] JSON parse error for {symbol}: {e}")
        return _fallback_analysis(stock, flat_ind, all_news, market_sentiment, confluence, key)
    except Exception as e:
        logger.error(f"[Orchestrator] AI call failed for {symbol}: {e}")
        return _fallback_analysis(stock, flat_ind, all_news, market_sentiment, confluence, key)


def _fallback_analysis(
    stock: dict, flat_ind: dict, all_news: list,
    market_sentiment: str, confluence: int, cache_key: str,
) -> dict:
    """
    Rule-based fallback when AI is unavailable.
    Mirrors the AI output schema so callers don't need to branch.
    """
    symbol = stock.get("symbol", "")
    score = flat_ind["ind_score"]
    rsi = flat_ind.get("rsi") or 50
    supertrend = flat_ind.get("supertrend_dir", "")
    macd = flat_ind.get("macd_vote", "")

    if score >= 40:
        sig = "STRONG_BUY"
        action = "BUY"
    elif score >= 15:
        sig = "BUY"
        action = "BUY"
    elif score <= -40:
        sig = "STRONG_SELL"
        action = "SELL"
    elif score <= -15:
        sig = "SELL"
        action = "SELL"
    else:
        sig = "NEUTRAL"
        action = "SKIP"

    # Simple risk gate mirrors the AI rule described in system prompt
    try:
        rsi_val = float(rsi)
    except (ValueError, TypeError):
        rsi_val = 50.0
    adx_val = flat_ind.get("adx")
    try:
        adx_float = float(adx_val) if adx_val not in (None, "N/A") else 20.0
    except (ValueError, TypeError):
        adx_float = 20.0

    approved = not (
        rsi_val > 78 or
        adx_float < 15 or
        (supertrend == "DOWN" and macd == "SELL")
    )

    # News sentiment quick count
    relevant_news = [
        n for n in all_news[:10]
        if symbol.replace(".NS", "").lower() in n.get("headline", "").lower()
    ] or all_news[:5]
    bull_news = sum(1 for n in relevant_news if n.get("sentiment") == "BULLISH")
    bear_news = sum(1 for n in relevant_news if n.get("sentiment") == "BEARISH")
    news_label = "BULLISH" if bull_news > bear_news else ("BEARISH" if bear_news > bull_news else "NEUTRAL")
    news_score = 50 + (bull_news - bear_news) * 10

    price = flat_ind["price"] or stock.get("price", 0)

    return {
        "symbol": symbol,
        "technicalSignal": {
            "signal": sig,
            "confidence": min(100, max(0, int(confluence))),
            "summary": f"Indicator score {score}/110. {flat_ind['buy_votes']} BUY vs {flat_ind['sell_votes']} SELL votes. AI unavailable — rule-based fallback.",
        },
        "investorPerspectives": [
            {"investor": inv, "view": "NEUTRAL", "reasoning": "AI unavailable — perspective not computed"}
            for inv in ["Rakesh Jhunjhunwala", "Warren Buffett", "Michael Burry", "Cathie Wood", "Peter Lynch"]
        ],
        "newsSentiment": {
            "score": max(0, min(100, news_score)),
            "label": news_label,
            "summary": f"{bull_news} bullish vs {bear_news} bearish headlines. AI unavailable.",
        },
        "tradeRecommendation": {
            "action": action,
            "entry": round(price, 2),
            "target1": round(flat_ind["target_1"] or price * 1.02, 2),
            "target2": round(flat_ind["target_2"] or price * 1.04, 2),
            "stopLoss": round(flat_ind["stop_loss"] or price * 0.98, 2),
            "capitalPct": 20,
            "reasoning": f"Indicator-based. Score {score}. Confluence {confluence}/110.",
        },
        "riskAnalysis": {
            "riskLevel": "HIGH" if not approved else ("LOW" if score >= 40 else "MEDIUM"),
            "confluenceScore": confluence,
            "approved": approved,
            "summary": "AI offline — indicator-only risk gate applied.",
        },
        "_cached": False,
        "_cache_key": cache_key,
    }


# ── Convenience helpers consumed by auto_trader.py ────────────────────────────

def is_trade_approved(orchestration_result: dict) -> bool:
    """Extract the risk gate decision from orchestration result."""
    return orchestration_result.get("riskAnalysis", {}).get("approved", True)


def get_investor_perspectives_legacy(orchestration_result: dict) -> list:
    """
    Convert orchestrator's investorPerspectives to the format
    expected by existing frontend types (InvestorPerspective[]).
    """
    perspectives = orchestration_result.get("investorPerspectives", [])
    legacy = []
    for p in perspectives:
        view = p.get("view", "NEUTRAL")
        signal = "BUY" if view == "BULLISH" else ("SELL" if view == "BEARISH" else "HOLD")
        legacy.append({
            "investor": p.get("investor", ""),
            "signal": signal,
            "confidence": orchestration_result.get("technicalSignal", {}).get("confidence", 50),
            "reasoning": p.get("reasoning", ""),
            "style": _investor_style(p.get("investor", "")),
        })
    return legacy


def _investor_style(name: str) -> str:
    styles = {
        "Rakesh Jhunjhunwala": "Growth/Momentum",
        "Warren Buffett": "Value/Long-term",
        "Michael Burry": "Contrarian/Value",
        "Cathie Wood": "Disruptive/Growth",
        "Peter Lynch": "Growth at Reasonable Price",
    }
    return styles.get(name, "Mixed")

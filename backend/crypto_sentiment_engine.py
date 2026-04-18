"""
Crypto Sentiment Engine — Strategy F (Sentiment Edge).

Combines:
  • Crypto Fear & Greed Index (0-100) — contrarian indicator
  • Binance funding rates — crowd positioning
  • Open interest changes — conviction behind moves
  • BTC dominance — altseason detection

Rules of thumb (battle-tested):
  • F&G ≤ 25 (extreme fear)   → contrarian BUY setup
  • F&G ≥ 75 (extreme greed)  → caution / distribution zone
  • Very negative funding (< -0.03%) → shorts crowded, short squeeze risk (bullish for spot)
  • Very positive funding (> +0.08%) → longs crowded, flush risk (bearish)
  • BTC.D dropping + BTC stable/up → alt season (favor alts)
"""
from __future__ import annotations

import logging
from typing import Dict, List, Tuple

from crypto_engine import fetch_fear_greed, fetch_funding_rate, fetch_global_data

logger = logging.getLogger(__name__)


def classify_fng(value: int) -> Dict:
    """Classify fear/greed reading into actionable bias."""
    if value <= 20:
        return {"label": "EXTREME_FEAR", "bias": "BUY_CONTRARIAN", "strength": 2,
                "note": "Historical bottoms have occurred at F&G ≤ 20. Strong contrarian BUY zone."}
    if value <= 35:
        return {"label": "FEAR", "bias": "BUY_LEANING", "strength": 1,
                "note": "Market fearful. Accumulation zone for strong coins."}
    if value <= 55:
        return {"label": "NEUTRAL", "bias": "NEUTRAL", "strength": 0,
                "note": "Market balanced. Trade fundamentals not sentiment."}
    if value <= 75:
        return {"label": "GREED", "bias": "SELL_LEANING", "strength": 1,
                "note": "Greed building. Tighten stops; avoid chasing breakouts."}
    return {"label": "EXTREME_GREED", "bias": "SELL_CONTRARIAN", "strength": 2,
            "note": "Euphoria zone. Distribution is likely. Avoid longs; consider profit-taking."}


def classify_funding(fr_pct: float) -> Dict:
    """Classify funding rate (percent per 8h interval)."""
    if fr_pct < -0.03:
        return {"label": "NEGATIVE_EXTREME", "bias": "BUY_SQUEEZE",
                "note": f"Funding {fr_pct:.3f}% — shorts crowded. Short-squeeze setup."}
    if fr_pct < -0.01:
        return {"label": "NEGATIVE", "bias": "BUY_LEANING",
                "note": f"Funding {fr_pct:.3f}% — bearish positioning."}
    if fr_pct <= 0.02:
        return {"label": "NEUTRAL", "bias": "NEUTRAL",
                "note": f"Funding {fr_pct:.3f}% — balanced."}
    if fr_pct <= 0.08:
        return {"label": "POSITIVE", "bias": "SELL_LEANING",
                "note": f"Funding {fr_pct:.3f}% — longs expensive."}
    return {"label": "POSITIVE_EXTREME", "bias": "SELL_FLUSH",
            "note": f"Funding {fr_pct:.3f}% — longs overextended. Long-flush setup."}


def strategy_f_score(symbol: str) -> Dict:
    """
    Strategy F — Sentiment Edge.
    Returns 0-100 score favoring contrarian entries during extreme sentiment.
    """
    fng = fetch_fear_greed()
    funding = fetch_funding_rate(symbol)

    score = 0
    reasons: List[str] = []
    missing: List[str] = []

    # ── F&G component (max 55 pts) ─────────────────────────────────
    if fng["available"]:
        v = fng["value"]
        f_cls = classify_fng(v)
        if f_cls["bias"] == "BUY_CONTRARIAN":
            score += 55
            reasons.append(f"😱 F&G = {v} EXTREME FEAR — {f_cls['note']}")
        elif f_cls["bias"] == "BUY_LEANING":
            score += 30
            reasons.append(f"😨 F&G = {v} FEAR — accumulation zone")
        elif f_cls["bias"] == "NEUTRAL":
            score += 10
            missing.append(f"F&G = {v} NEUTRAL — no edge")
        elif f_cls["bias"] == "SELL_LEANING":
            score -= 15
            missing.append(f"🟡 F&G = {v} GREED — tighten stops")
        else:  # SELL_CONTRARIAN
            score -= 35
            missing.append(f"🔴 F&G = {v} EXTREME GREED — distribution zone, avoid longs")
    else:
        missing.append("F&G unavailable")

    # ── Funding rate component (max 35 pts) ──────────────────────
    if funding.get("available"):
        fr_pct = funding.get("funding_rate_pct", 0)
        f_cls = classify_funding(fr_pct)
        if f_cls["bias"] == "BUY_SQUEEZE":
            score += 35
            reasons.append(f"🔥 Funding {fr_pct:.3f}% — short squeeze setup")
        elif f_cls["bias"] == "BUY_LEANING":
            score += 15
            reasons.append(f"📉 Funding negative {fr_pct:.3f}% — bearish crowd = contrarian bull")
        elif f_cls["bias"] == "NEUTRAL":
            pass
        elif f_cls["bias"] == "SELL_LEANING":
            score -= 10
            missing.append(f"🟠 Funding {fr_pct:.3f}% — longs crowded")
        else:  # SELL_FLUSH
            score -= 25
            missing.append(f"⚠️ Funding {fr_pct:.3f}% — long flush risk")
    else:
        missing.append("Funding rate unavailable (not a perpetual)")

    # Clamp
    score = max(0, min(100, score))

    # Signal
    if score >= 70:
        signal = "BULLISH"
    elif score >= 50:
        signal = "LEANING_BULLISH"
    elif score >= 30:
        signal = "NEUTRAL"
    else:
        signal = "BEARISH"

    return {
        "available": True,
        "symbol": symbol,
        "score": score,
        "signal": signal,
        "reasons": reasons,
        "missing": missing,
        "fear_greed": fng,
        "funding": funding,
    }


def market_sentiment_overview() -> Dict:
    """Cross-market sentiment snapshot (for overview banner)."""
    fng = fetch_fear_greed()
    global_data = fetch_global_data()
    btc_funding = fetch_funding_rate("BTCUSDT")
    eth_funding = fetch_funding_rate("ETHUSDT")

    fng_class = classify_fng(fng["value"]) if fng["available"] else {"bias": "NEUTRAL"}

    # Altseason heuristic: BTC dominance < 48% and trending down
    btc_d = global_data.get("btc_dominance", 50)
    altseason = "ACTIVE" if btc_d < 48 else ("APPROACHING" if btc_d < 53 else "OFF")

    # Overall market bias
    if fng_class["bias"] == "BUY_CONTRARIAN":
        overall = "STRONG_BUY_CONTRARIAN"
        narrative = "Extreme fear — historically a strong contrarian accumulation zone"
    elif fng_class["bias"] == "BUY_LEANING":
        overall = "BUY_LEANING"
        narrative = "Market fearful — selective accumulation warranted"
    elif fng_class["bias"] == "SELL_CONTRARIAN":
        overall = "EXIT_RISK"
        narrative = "Euphoria — reduce leverage and take profit"
    elif fng_class["bias"] == "SELL_LEANING":
        overall = "CAUTION"
        narrative = "Greed building — tighten stops"
    else:
        overall = "NEUTRAL"
        narrative = "Market balanced — trade individual setups"

    return {
        "fear_greed_value": fng["value"] if fng["available"] else None,
        "fear_greed_label": fng.get("classification", "N/A"),
        "fear_greed_bias": fng_class["bias"],
        "btc_dominance": btc_d,
        "eth_dominance": global_data.get("eth_dominance", 0),
        "altseason": altseason,
        "btc_funding_pct": btc_funding.get("funding_rate_pct", 0),
        "eth_funding_pct": eth_funding.get("funding_rate_pct", 0),
        "market_cap_change_24h_pct": global_data.get("market_cap_change_24h_pct", 0),
        "overall_bias": overall,
        "narrative": narrative,
    }

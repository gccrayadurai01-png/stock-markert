"""
AI Signal Engine — Jhunjhunwala-style brutal trading brain.
Combines 12 technical indicators + news + fundamentals + legendary investor perspectives.
No sugarcoating. Data-driven decisions only.

Architecture note (prompt batching):
  generate_signals() makes ONE market-level Claude call to pick the best trades.
  After that, for each recommended trade we call ai_orchestrator.analyze_stock()
  which is ALSO one call per stock — but results are CACHED (5-min TTL) so
  repeated scans within the same candle window hit the cache, not the API.
  This replaces the old pattern of calling analyze_through_investor_lenses()
  (rule-based, no AI) as a post-processing step.
"""
from __future__ import annotations

import os
import json
import logging
from typing import List
from pathlib import Path
from anthropic import Anthropic
from ai_orchestrator import (
    analyze_stock as orchestrate_stock,
    get_investor_perspectives_legacy,
    cache_stats,
)

logger = logging.getLogger(__name__)

client = None


def get_overall_sentiment_str(news: list) -> str:
    """Collapse news list into a single sentiment label for prompt injection."""
    bull = sum(1 for n in news if n.get("sentiment") == "BULLISH")
    bear = sum(1 for n in news if n.get("sentiment") == "BEARISH")
    if bull > bear * 1.5:
        return "BULLISH"
    if bear > bull * 1.5:
        return "BEARISH"
    return "NEUTRAL"

def _load_api_key() -> str:
    """Load API key from env or .env file."""
    key = os.getenv("ANTHROPIC_API_KEY", "")
    if key and key != "your_anthropic_api_key_here":
        return key
    # Try loading from .env file directly
    env_path = Path(__file__).parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                val = line.split("=", 1)[1].strip()
                if val and val != "your_anthropic_api_key_here":
                    return val
    return ""


def get_client() -> Anthropic:
    global client
    if client is None:
        key = _load_api_key()
        if key:
            client = Anthropic(api_key=key)
            logger.info("Anthropic client initialized with API key")
        else:
            raise ValueError("No ANTHROPIC_API_KEY found")
    return client


SYSTEM_PROMPT = """You are a BRUTAL, no-nonsense AI Trading Brain modeled after Rakesh Jhunjhunwala's approach.

RULES:
1. You ONLY respond with valid JSON. No markdown. No explanation outside JSON.
2. You are BRUTALLY honest. If data says don't trade — say "SIT ON CASH".
3. You NEVER recommend more stocks than the user's max_trades setting.
4. Every signal MUST have stop_loss and targets calculated from ATR.
5. You combine TECHNICAL INDICATORS + NEWS + FUNDAMENTALS.
6. Confidence must be 1-10. Only 8+ means "deploy capital".
7. You REJECT trades where risk:reward < 1:2.
8. You tell the user EXACTLY how much money to put in each trade.

INDICATOR INTERPRETATION:
- STRONG_BUY (score 40+): Deploy full position. High conviction.
- BUY (score 15-40): Deploy 50-70% position. Moderate conviction.
- NEUTRAL: NO TRADE. Cash is a position.
- SELL (score -15 to -40): Exit longs. Consider short if options available.
- STRONG_SELL (score -40): Exit immediately. Short aggressively.

CAPITAL ALLOCATION:
- Max 3-5 stocks. Never spread too thin.
- Strongest signal gets most capital.
- Always keep 20-30% as cash buffer.
- Position size = (capital * risk%) / (entry - stop_loss)

JHUNJHUNWALA PRINCIPLES:
- "Buy right and sit tight" — don't overtrade
- Trend is your friend — trade with the trend, never against
- Cut losers fast, let winners run
- Contrarian at extremes — buy when blood is on streets
- Focus on QUALITY stocks with high liquidity

Output this exact JSON:
{
  "market_verdict": "BULLISH/BEARISH/NEUTRAL/DANGEROUS",
  "verdict_reason": "One brutal sentence about market condition",
  "action_plan": "What to do RIGHT NOW in 2-3 sentences. Be specific.",
  "recommended_trades": [
    {
      "stock_name": "Company Name",
      "symbol": "SYMBOL.NS",
      "action": "BUY/SELL",
      "trade_type": "INTRADAY/SWING/POSITIONAL",
      "entry_price": 0.0,
      "stop_loss": 0.0,
      "target_1": 0.0,
      "target_2": 0.0,
      "capital_to_deploy": 0.0,
      "shares_to_buy": 0,
      "confidence": 8,
      "reason": "Brutal honest reason combining indicators + news",
      "risk": "What will kill this trade",
      "indicator_summary": "Which indicators agree and disagree"
    }
  ],
  "avoid_stocks": [
    {
      "symbol": "SYMBOL.NS",
      "reason": "Why to avoid"
    }
  ],
  "exit_signals": [
    {
      "symbol": "SYMBOL.NS",
      "reason": "Why to exit NOW",
      "urgency": "HIGH/MEDIUM"
    }
  ],
  "sectors": [
    {"name": "Sector", "verdict": "STRONG/WEAK/AVOID", "reason": "Why"}
  ],
  "macro_impact": [
    {"event": "Event", "impact": "Impact on trading today", "severity": "HIGH/MEDIUM/LOW"}
  ],
  "emotion_warnings": [
    {"type": "FOMO/REVENGE/GREED/FEAR", "message": "Brutal warning"}
  ],
  "key_levels": {
    "nifty_support": 0, "nifty_resistance": 0,
    "banknifty_support": 0, "banknifty_resistance": 0
  },
  "pre_market_plan": "What to do BEFORE market opens",
  "first_30_min_plan": "What to do in first 30 minutes after open"
}"""


async def generate_signals(
    market_data: dict,
    news: list,
    user_capital: float,
    config: dict = None,
) -> dict:
    """Send indicator data + news to Claude and get brutal trading signals."""
    if config is None:
        config = {}

    max_trades = config.get("max_trades", 3)
    risk_pct = config.get("risk_percent", 1.0)
    trading_mode = config.get("trading_mode", "intraday")

    try:
        ai = get_client()

        # Build the data payload
        buy_candidates = [s for s in market_data.get("all_stocks", []) if s.get("signal") in ("BUY", "STRONG_BUY")]
        sell_candidates = [s for s in market_data.get("all_stocks", []) if s.get("signal") in ("SELL", "STRONG_SELL")]

        # Summarize indicators for top candidates
        def summarize_stock(s: dict) -> dict:
            ind = s.get("indicators", {})
            return {
                "symbol": s["symbol"],
                "name": s["name"],
                "price": s["price"],
                "change": s["change_percent"],
                "signal": s["signal"],
                "score": s["score"],
                "confidence": s["confidence"],
                "stop_loss": s["stop_loss"],
                "target_1": s["target_1"],
                "target_2": s["target_2"],
                "atr": s["atr"],
                "rsi": ind.get("rsi", {}).get("value"),
                "macd_vote": ind.get("macd", {}).get("vote"),
                "supertrend": ind.get("supertrend", {}).get("direction"),
                "ema_alignment": ind.get("ema_crossover", {}).get("alignment"),
                "adx": ind.get("adx", {}).get("adx"),
                "adx_trend": ind.get("adx", {}).get("trend_strength"),
                "bb_pct": ind.get("bollinger", {}).get("pct_b"),
                "vwap_vote": ind.get("vwap", {}).get("vote"),
                "volume_spike": ind.get("volume", {}).get("spike"),
                "stoch_k": ind.get("stochastic", {}).get("k"),
                "votes": s.get("votes"),
            }

        user_message = f"""TRADING MODE: {trading_mode.upper()}
USER CAPITAL: ₹{user_capital:,.0f}
RISK PER TRADE: {risk_pct}%
MAX TRADES: {max_trades}

=== INDEX DATA ===
{json.dumps(market_data.get('indices', {}), indent=2)}

=== BUY CANDIDATES (indicators say BUY) — pick BEST {max_trades} max ===
{json.dumps([summarize_stock(s) for s in buy_candidates[:10]], indent=2)}

=== SELL CANDIDATES (indicators say SELL) ===
{json.dumps([summarize_stock(s) for s in sell_candidates[:5]], indent=2)}

=== TOP MOVERS (biggest % change today) ===
{json.dumps([summarize_stock(s) for s in market_data.get('all_stocks', [])[:10]], indent=2)}

=== NEWS (affects trading decisions) ===
{json.dumps(news[:12], indent=2)}

INSTRUCTIONS:
- Pick MAXIMUM {max_trades} stocks to trade. Quality over quantity.
- Calculate exact shares to buy: shares = (capital * {risk_pct}%) / (entry - stop_loss)
- Capital per trade: distribute ₹{user_capital:,.0f} across {max_trades} trades max.
- Keep 20-30% cash.
- If no good setups: say "SIT ON CASH" and recommend 0 trades.
- Be BRUTAL. No hopium. Only data-backed trades."""

        response = ai.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        result = json.loads(text)

        # ─── POST-PROCESS: Enrich trades via unified orchestrator ───────────
        # One cached AI call per trade gives investor perspectives + news sentiment
        # + risk assessment in a single round-trip (cache hit = zero extra API calls).
        recommended_trades = result.get("recommended_trades", [])
        stock_lookup = {s["symbol"]: s for s in market_data.get("all_stocks", [])}
        overall_sentiment = get_overall_sentiment_str(news)

        for trade in recommended_trades:
            symbol = trade.get("symbol", "")
            stock = stock_lookup.get(symbol)
            if not stock:
                continue

            orch = orchestrate_stock(
                stock=stock,
                all_news=news,
                market_sentiment=overall_sentiment,
                confluence=int(trade.get("confidence", 5) * 11),  # scale 1-10 → approx 0-110
                capital=user_capital,
                risk_pct=config.get("risk_percent", 1.5),
            )

            # Attach AI investor perspectives (legacy format for frontend)
            trade["investor_perspectives"] = get_investor_perspectives_legacy(orch)

            # Build consensus summary from orchestrator output
            persp = orch.get("investorPerspectives", [])
            bullish_count = sum(1 for p in persp if p.get("view") == "BULLISH")
            bearish_count = sum(1 for p in persp if p.get("view") == "BEARISH")
            trade["investor_consensus"] = {
                "bullish_count": bullish_count,
                "bearish_count": bearish_count,
                "neutral_count": len(persp) - bullish_count - bearish_count,
                "avg_confidence": orch.get("technicalSignal", {}).get("confidence", 50),
                "confidence_boost": bullish_count * 2,
                "aggregate_signal": "BULLISH" if bullish_count > bearish_count else (
                    "BEARISH" if bearish_count > bullish_count else "NEUTRAL"
                ),
                "aggregate_confidence": orch.get("technicalSignal", {}).get("confidence", 50),
                "key_insight": orch.get("newsSentiment", {}).get("summary", ""),
            }

            # Boost confidence based on investor agreement
            original_conf = trade.get("confidence", 5)
            if bullish_count >= 3:
                trade["confidence"] = min(10, original_conf + 1)
                trade["reason"] += f"\n\n✅ INVESTOR CONSENSUS: {bullish_count}/5 legends bullish — {orch.get('newsSentiment', {}).get('summary', '')}"

        result["recommended_trades"] = recommended_trades
        stats = cache_stats()
        logger.info(f"[AI Engine] Orchestrator cache: {stats['valid']}/{stats['total']} valid entries")
        return result

    except json.JSONDecodeError as e:
        logger.error(f"AI returned invalid JSON: {e}")
        return _fallback_signals(market_data, user_capital, max_trades, risk_pct, trading_mode)
    except Exception as e:
        logger.error(f"AI engine error: {e}")
        return _fallback_signals(market_data, user_capital, max_trades, risk_pct, trading_mode)


def _fallback_signals(market_data: dict, capital: float, max_trades: int, risk_pct: float, trading_mode: str = "intraday") -> dict:
    """Generate signals purely from indicator scores when AI unavailable."""
    all_stocks = market_data.get("all_stocks", [])
    buy_candidates = sorted(
        [s for s in all_stocks if s.get("signal") in ("BUY", "STRONG_BUY")],
        key=lambda x: x["score"],
        reverse=True,
    )[:max_trades]

    sell_candidates = [s for s in all_stocks if s.get("signal") in ("SELL", "STRONG_SELL")][:3]

    capital_per_trade = (capital * 0.7) / max(1, len(buy_candidates))  # 70% deployed max
    risk_amount = capital * risk_pct / 100

    recommended = []
    for s in buy_candidates:
        entry = s["price"]
        sl = s["stop_loss"]
        risk_per_share = abs(entry - sl) if abs(entry - sl) > 0 else entry * 0.02
        shares = int(risk_amount / risk_per_share)
        deploy = round(min(shares * entry, capital_per_trade), 2)
        shares = max(1, int(deploy / entry))  # recalc shares based on capped deploy

        ind = s.get("indicators", {})
        rsi_val = ind.get("rsi", {}).get("value", 0)
        macd_vote = ind.get("macd", {}).get("vote", "N/A")
        supertrend = ind.get("supertrend", {}).get("direction", "N/A")
        ema_align = ind.get("ema_crossover", {}).get("alignment", "N/A")
        adx_val = ind.get("adx", {}).get("adx", 0)
        bb_pct = ind.get("bollinger", {}).get("pct_b", 0.5)
        vwap = ind.get("vwap", {}).get("vote", "N/A")
        stoch = ind.get("stochastic", {}).get("k", 50)

        # Build detailed indicator explanation
        insights = []
        if rsi_val < 30:
            insights.append(f"RSI={rsi_val:.0f} — OVERSOLD, strong bounce potential")
        elif rsi_val < 45:
            insights.append(f"RSI={rsi_val:.0f} — approaching oversold, accumulation zone")
        elif rsi_val > 70:
            insights.append(f"RSI={rsi_val:.0f} — OVERBOUGHT, be cautious")
        else:
            insights.append(f"RSI={rsi_val:.0f} — neutral zone")

        if macd_vote == "BUY":
            insights.append("MACD crossed ABOVE signal line — bullish momentum building")
        elif macd_vote == "SELL":
            insights.append("MACD crossed BELOW signal line — bearish warning")

        if supertrend == "UP":
            insights.append("Supertrend is UP — price above trend support")
        else:
            insights.append("Supertrend is DOWN — price below trend, risky buy")

        if ema_align == "BULLISH":
            insights.append("EMA 9/21/50 aligned BULLISH — all moving averages confirm uptrend")
        elif ema_align == "BEARISH":
            insights.append("EMA alignment BEARISH — price below key averages, counter-trend trade")
        else:
            insights.append("EMA mixed — no clear trend from moving averages")

        if adx_val > 25:
            insights.append(f"ADX={adx_val:.0f} — STRONG trend in play")
        else:
            insights.append(f"ADX={adx_val:.0f} — weak trend, choppy market")

        if bb_pct < 0.2:
            insights.append(f"Bollinger %B={bb_pct:.0%} — near lower band, potential reversal")
        elif bb_pct > 0.8:
            insights.append(f"Bollinger %B={bb_pct:.0%} — near upper band, may face resistance")

        # ─── ORCHESTRATOR: unified investor perspectives (fallback path, no AI) ──
        # In fallback mode we use orchestrator's _fallback_analysis (rule-based)
        # so investor perspectives are always present with the right schema.
        orch = orchestrate_stock(
            stock=s,
            all_news=[],          # no news in fallback path
            market_sentiment="NEUTRAL",
            confluence=s.get("score", 0),
        )
        investor_perspectives = get_investor_perspectives_legacy(orch)
        bullish_investors = [p["investor"] for p in investor_perspectives if "BUY" in p.get("signal", "")]
        bullish_count = len(bullish_investors)

        base_confidence = min(10, max(1, s["score"] // 5))
        final_confidence = min(10, base_confidence + bullish_count * 0.2)

        if bullish_investors:
            insights.append(f"\n💡 Bullish: {', '.join(bullish_investors)}")

        cap_pct = round(deploy / capital * 100, 1)
        reason = (
            f"Deploy ₹{deploy:,.0f} ({cap_pct}% of capital) on {shares} shares. "
            f"Score +{s['score']} with {s['votes']['BUY']} BUY vs {s['votes']['SELL']} SELL indicators. "
            f"Risk ₹{risk_per_share * shares:,.0f} per trade ({risk_pct}% of capital)."
        )

        risk_text = []
        if ema_align == "BEARISH":
            risk_text.append("EMA alignment is bearish — counter-trend trade, use tight SL")
        if adx_val < 20:
            risk_text.append("Low ADX = no clear trend, higher chance of false signal")
        if rsi_val > 65:
            risk_text.append("RSI near overbought — limited upside before pullback")
        if not risk_text:
            risk_text.append("Standard risk. Respect stop loss at all times.")

        recommended.append({
            "stock_name": s["name"],
            "symbol": s["symbol"],
            "action": "BUY",
            "trade_type": trading_mode.upper() if trading_mode in ("intraday", "swing", "positional") else "INTRADAY",
            "entry_price": entry,
            "stop_loss": sl,
            "target_1": s["target_1"],
            "target_2": s["target_2"],
            "capital_to_deploy": deploy,
            "shares_to_buy": shares,
            "confidence": int(final_confidence),
            "reason": reason,
            "risk": " | ".join(risk_text),
            "indicator_summary": " | ".join(insights),
            "investor_perspectives": investor_perspectives,
        })

    avoid = []
    for s in sell_candidates:
        avoid.append({
            "symbol": s["symbol"],
            "reason": f"SELL signal. Score={s['score']}. {s['votes']['SELL']} indicators bearish.",
        })

    return {
        "market_verdict": "NEUTRAL",
        "verdict_reason": "AI engine offline. Using pure indicator-based analysis. Trade with caution.",
        "action_plan": f"{'Deploy capital in top ' + str(len(recommended)) + ' indicator-driven picks.' if recommended else 'No strong signals. SIT ON CASH.'}",
        "recommended_trades": recommended,
        "avoid_stocks": avoid,
        "exit_signals": [],
        "sectors": [],
        "macro_impact": [],
        "emotion_warnings": [
            {"type": "CAUTION", "message": "AI brain offline. Indicators only. Reduce position size by 50%."}
        ],
        "key_levels": {},
        "pre_market_plan": "Check news before market opens. Wait for first 15 mins to confirm direction.",
        "first_30_min_plan": "Let market settle. If index confirms trend, enter top picks. If choppy, wait.",
    }

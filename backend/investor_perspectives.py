"""
Investor Perspectives Engine
─────────────────────────────────────────────────────────────────────────────
Applies legendary investor decision-making frameworks to enhance trading signals.
Combines Rakesh Jhunjhunwala, Warren Buffett, Michael Burry, and other perspectives.

USAGE: investor_insights = analyze_through_investor_lenses(stock_data, indicators)
       This boosts confidence when multiple investors align on the same trade.
"""
from __future__ import annotations

import json
from typing import Optional


class InvestorPerspective:
    """Base class for investor analysis frameworks."""

    def __init__(self, name: str, investing_style: str):
        self.name = name
        self.investing_style = investing_style
        self.signal = None
        self.confidence = 0
        self.reasoning = []

    def analyze(self, stock: dict, indicators: dict) -> dict:
        """Override in subclasses."""
        raise NotImplementedError

    def get_insight(self) -> dict:
        return {
            "investor": self.name,
            "signal": self.signal,
            "confidence": self.confidence,
            "reasoning": " | ".join(self.reasoning),
            "style": self.investing_style
        }


class RakeshJhunjhunwala(InvestorPerspective):
    """
    The Big Bull of India
    ─────────────────────
    Focus: Margin of Safety (30%+), high ROE (>20%), growth CAGR (>20%), quality management
    Favors: Indian high-growth sectors, emerging market plays
    """

    def __init__(self):
        super().__init__(
            "Rakesh Jhunjhunwala",
            "Big Bull investor: Margin of safety, high ROE, growth, India-focused"
        )

    def analyze(self, stock: dict, indicators: dict) -> dict:
        self.reasoning = []
        self.signal = "NEUTRAL"
        self.confidence = 0

        price = stock.get("price", 0)
        rsi = indicators.get("rsi", {}).get("value", 50)
        macd_vote = indicators.get("macd", {}).get("vote", 0)
        volume_spike = indicators.get("volume", {}).get("spike", False)

        # Growth assessment (no real financials, use technical proxies)
        # In a real system, we'd have P/E, ROE, revenue CAGR, etc.

        # Strong Buy Signal (RSI < 40, MACD bullish, volume spike)
        if rsi < 40 and macd_vote > 0 and volume_spike:
            self.reasoning.append("Oversold (RSI<40) + MACD bullish crossover + volume spike — Strong conviction buy")
            self.signal = "STRONG_BUY"
            self.confidence = 85

        # Buy Signal
        elif rsi < 50 and macd_vote > 0:
            self.reasoning.append("Approaching oversold territory with positive momentum")
            self.signal = "BUY"
            self.confidence = 70

        # Sell Signal (RSI > 60, MACD bearish)
        elif rsi > 60 and macd_vote < 0:
            self.reasoning.append("Overbought (RSI>60) + MACD bearish divergence")
            self.signal = "SELL"
            self.confidence = 65

        # Strong Sell
        elif rsi > 70 and macd_vote < 0:
            self.reasoning.append("Severely overbought (RSI>70) + momentum turning negative")
            self.signal = "STRONG_SELL"
            self.confidence = 80

        else:
            self.reasoning.append(f"Neutral zone — RSI={rsi:.0f}, waiting for margin of safety setup")
            self.signal = "HOLD"
            self.confidence = 40

        # Add India-specific commentary for NSE/BSE stocks
        if stock.get("symbol", "").endswith((".NS", ".BO")):
            self.reasoning.append("✓ Indian stock — domestic growth story preferred")

        return self.get_insight()


class WarrenBuffett(InvestorPerspective):
    """
    The Oracle of Omaha
    ───────────────────
    Focus: Quality business, economic moat, fair price, long-term hold, consistent earnings
    Favors: Stable, profitable companies with competitive advantages
    """

    def __init__(self):
        super().__init__(
            "Warren Buffett",
            "Quality investor: Moat, fair price, long-term, consistent earnings"
        )

    def analyze(self, stock: dict, indicators: dict) -> dict:
        self.reasoning = []
        self.signal = "HOLD"
        self.confidence = 50

        rsi = indicators.get("rsi", {}).get("value", 50)
        macd_vote = indicators.get("macd", {}).get("vote", 0)
        bb_pct = indicators.get("bollinger", {}).get("pct_b", 0.5)

        # Only buy quality at fair prices (middle Bollinger Band)
        # Avoid buying at extremes

        if bb_pct < 0.2 and rsi > 30 and macd_vote > 0:
            # Price near lower band, but not oversold panic
            self.reasoning.append("Quality pullback to fair value, moat likely intact")
            self.signal = "BUY"
            self.confidence = 75

        elif bb_pct > 0.8 and rsi > 60:
            # Overvalued — avoid
            self.reasoning.append("Trading above fair value — premium has compressed margins of safety")
            self.signal = "SELL"
            self.confidence = 70

        elif 0.3 < bb_pct < 0.7 and rsi > 40 and rsi < 70:
            # In fair zone
            self.reasoning.append("Within fair value range — hold quality, awaiting better entry")
            self.signal = "HOLD"
            self.confidence = 60

        else:
            self.reasoning.append("Wait for price to return to intrinsic value range")
            self.signal = "HOLD"
            self.confidence = 40

        # Conservative tone
        self.reasoning.append("Buffett principle: 'It's far better to buy a wonderful company at a fair price'")

        return self.get_insight()


class MichaelBurry(InvestorPerspective):
    """
    The Big Short Contrarian
    ────────────────────────
    Focus: Deep value, shorts, finds the next crash, contrarian bets
    Favors: Overvalued bubbles to short, severely undervalued opportunities
    """

    def __init__(self):
        super().__init__(
            "Michael Burry",
            "Contrarian: Finds shorts, deep value, tail risk, asymmetric bets"
        )

    def analyze(self, stock: dict, indicators: dict) -> dict:
        self.reasoning = []
        self.signal = "HOLD"
        self.confidence = 40

        rsi = indicators.get("rsi", {}).get("value", 50)
        macd_vote = indicators.get("macd", {}).get("vote", 0)
        bb_pct = indicators.get("bollinger", {}).get("pct_b", 0.5)
        change_percent = stock.get("change_percent", 0)

        # Burry hunts two extremes: severe shorts OR deep value

        # Deep value opportunity (extreme oversold + momentum turning)
        if rsi < 30 and macd_vote > 0 and bb_pct < 0.1:
            self.reasoning.append("Extreme capitulation setup — contrarian long with asymmetric upside")
            self.signal = "BUY"
            self.confidence = 85

        # Short opportunity (severe bubble, disconnected from fundamentals)
        elif rsi > 75 and macd_vote < 0 and bb_pct > 0.9 and change_percent > 15:
            self.reasoning.append("Classic bubble formation — spike on volume with no fundamental support")
            self.signal = "SHORT"
            self.confidence = 80

        # Moderate opportunities
        elif rsi < 40 and macd_vote > 0:
            self.reasoning.append("Value setup forming — monitor for confirmation")
            self.signal = "BUY"
            self.confidence = 60

        elif rsi > 65 and macd_vote < 0:
            self.reasoning.append("Weakness at resistance — short risk/reward favorable")
            self.signal = "SELL"
            self.confidence = 65

        else:
            self.reasoning.append("No clear asymmetric setup — staying on sidelines")
            self.signal = "HOLD"
            self.confidence = 30

        self.reasoning.append("Burry mantra: 'Crash positions when risk/reward is asymmetrically in your favor'")

        return self.get_insight()


class CathieWood(InvestorPerspective):
    """
    Queen of Growth Investing
    ────────────────────────
    Focus: Disruptive tech, innovation, high growth, long-term thesis
    Favors: Emerging tech, blockchain, AI, biotech with 10-year upside
    """

    def __init__(self):
        super().__init__(
            "Cathie Wood",
            "Growth investor: Disruptive innovation, long horizon, high growth sectors"
        )

    def analyze(self, stock: dict, indicators: dict) -> dict:
        self.reasoning = []
        self.signal = "HOLD"
        self.confidence = 50

        rsi = indicators.get("rsi", {}).get("value", 50)
        macd_vote = indicators.get("macd", {}).get("vote", 0)
        volume_spike = indicators.get("volume", {}).get("spike", False)

        # Growth investors buy dips in high-quality growth stocks

        if rsi < 50 and macd_vote > 0 and volume_spike:
            self.reasoning.append("Growth dip buy — strong conviction on disruptive theme")
            self.signal = "BUY"
            self.confidence = 80

        elif rsi < 40 and macd_vote >= 0:
            self.reasoning.append("Capitulation in quality growth — aggressive accumulation")
            self.signal = "BUY"
            self.confidence = 85

        elif rsi > 70 and macd_vote < 0:
            self.reasoning.append("Extended move — take profits on strength, but believe in 5-10yr thesis")
            self.signal = "SELL"
            self.confidence = 55

        else:
            self.reasoning.append("Waiting for pullback in disruptive innovation theme")
            self.signal = "HOLD"
            self.confidence = 45

        self.reasoning.append("Wood thesis: 'Innovation compounds exponentially over decades'")

        return self.get_insight()


class PeterLynch(InvestorPerspective):
    """
    10-Bagger Investor
    ──────────────────
    Focus: Understandable businesses, growth not priced in, 10x upside potential
    Favors: Boring companies with explosive growth ahead
    """

    def __init__(self):
        super().__init__(
            "Peter Lynch",
            "Find 10-baggers: Understandable, hidden growth, cheap relative to potential"
        )

    def analyze(self, stock: dict, indicators: dict) -> dict:
        self.reasoning = []
        self.signal = "HOLD"
        self.confidence = 50

        rsi = indicators.get("rsi", {}).get("value", 50)
        macd_vote = indicators.get("macd", {}).get("vote", 0)
        score = stock.get("score", 0)

        # Lynch: Buy boring stocks with strong signals when cheap

        if rsi < 45 and macd_vote > 0 and score >= 30:
            self.reasoning.append("Setup: Boring stock, rising momentum, good technicals = 10-bagger potential")
            self.signal = "BUY"
            self.confidence = 75

        elif rsi < 40 and score >= 35:
            self.reasoning.append("Capitulation in quality names — this is where Lynch finds 10-baggers")
            self.signal = "BUY"
            self.confidence = 80

        elif rsi > 60 and macd_vote < 0:
            self.reasoning.append("Momentum breaking — sell into strength, hunt for next entry")
            self.signal = "SELL"
            self.confidence = 60

        else:
            self.reasoning.append("Tracking for entry — wait for better technicals")
            self.signal = "HOLD"
            self.confidence = 45

        self.reasoning.append("Lynch: 'Buy what you understand, sell when the story fades'")

        return self.get_insight()


def analyze_through_investor_lenses(stock: dict, indicators: dict) -> dict:
    """
    Analyze a single stock through multiple legendary investor frameworks.
    Returns aggregated insights and confidence boost.

    INPUT:
    ------
    stock: dict with keys like symbol, price, change_percent, score, etc.
    indicators: dict with RSI, MACD, Bollinger, Volume, etc.

    OUTPUT:
    -------
    {
        "symbol": "WIPRO.NS",
        "investor_perspectives": [
            {"investor": "Rakesh Jhunjhunwala", "signal": "BUY", "confidence": 70, ...},
            {"investor": "Warren Buffett", "signal": "HOLD", "confidence": 60, ...},
            ...
        ],
        "consensus": {
            "bullish_count": 2,
            "bearish_count": 0,
            "neutral_count": 3,
            "confidence_boost": 15,  # +% added to original signal confidence
            "aggregate_signal": "BUY",
            "aggregate_confidence": 75,
            "key_insight": "Multiple investors see value here...",
        }
    }
    """

    investors = [
        RakeshJhunjhunwala(),
        WarrenBuffett(),
        MichaelBurry(),
        CathieWood(),
        PeterLynch(),
    ]

    perspectives = []
    for investor in investors:
        insight = investor.analyze(stock, indicators)
        perspectives.append(insight)

    # Aggregate consensus
    signals = [p["signal"] for p in perspectives]
    confidences = [p["confidence"] for p in perspectives]

    bullish_count = sum(1 for s in signals if "BUY" in s)
    bearish_count = sum(1 for s in signals if "SELL" in s or "SHORT" in s)
    neutral_count = sum(1 for s in signals if s == "HOLD")

    avg_confidence = sum(confidences) / len(confidences) if confidences else 50

    # Determine aggregate signal
    if bullish_count >= 3:
        aggregate_signal = "STRONG_BUY"
        confidence_boost = 25  # Multiple investors agree
    elif bullish_count >= 2:
        aggregate_signal = "BUY"
        confidence_boost = 15
    elif bearish_count >= 3:
        aggregate_signal = "STRONG_SELL"
        confidence_boost = 25
    elif bearish_count >= 2:
        aggregate_signal = "SELL"
        confidence_boost = 15
    else:
        aggregate_signal = "HOLD"
        confidence_boost = 0

    # Generate key insight
    if bullish_count == len(perspectives):
        key_insight = f"🟢 UNANIMOUS BULLISH — All {len(perspectives)} legendary investors see value"
    elif bearish_count == len(perspectives):
        key_insight = f"🔴 UNANIMOUS BEARISH — All {len(perspectives)} investors warn of danger"
    elif bullish_count > bearish_count:
        key_insight = f"✅ CONSENSUS BULLISH — {bullish_count}/{len(perspectives)} investors bullish. Jhunjhunwala sees margin of safety, Buffett sees fair price."
    elif bearish_count > bullish_count:
        key_insight = f"⚠️ CONSENSUS BEARISH — {bearish_count}/{len(perspectives)} investors cautious. Burry may see short opportunity."
    else:
        key_insight = f"➡️ MIXED VIEW — Investors divided: {bullish_count}B, {bearish_count}S, {neutral_count}N. Lynch hunting for setup, Wood waiting for dip."

    return {
        "symbol": stock.get("symbol", "UNKNOWN"),
        "investor_perspectives": perspectives,
        "consensus": {
            "bullish_count": bullish_count,
            "bearish_count": bearish_count,
            "neutral_count": neutral_count,
            "avg_confidence": round(avg_confidence, 1),
            "confidence_boost": confidence_boost,
            "aggregate_signal": aggregate_signal,
            "aggregate_confidence": min(round(avg_confidence + confidence_boost, 1), 95),
            "key_insight": key_insight,
        }
    }


def boost_ai_signal(original_signal: dict, investor_analysis: dict) -> dict:
    """
    Boost the original AI signal with investor perspective consensus.

    If multiple investors agree, we increase confidence and reinforce the signal.
    If investors disagree, we moderate confidence and ask for more caution.
    """
    consensus = investor_analysis["consensus"]

    original_conf = original_signal.get("confidence", 50)
    signal = original_signal.get("signal", "HOLD")

    # Apply boost based on investor consensus
    if signal in ("BUY", "STRONG_BUY"):
        if consensus["bullish_count"] >= 3:
            # Multiple bullish investors = strong confirmation
            new_conf = min(original_conf + consensus["confidence_boost"], 95)
            reasoning = original_signal.get("reasoning", "")
            reasoning += f"\n\n💡 INVESTOR LENS BOOST: {consensus['key_insight']}"
        else:
            # Mixed view — lower confidence
            new_conf = max(original_conf - 10, 30)
            reasoning = original_signal.get("reasoning", "")
            reasoning += f"\n\n⚠️ MIXED CONSENSUS: Not all legendary investors agree. Exercise caution."

    elif signal in ("SELL", "STRONG_SELL"):
        if consensus["bearish_count"] >= 3:
            new_conf = min(original_conf + consensus["confidence_boost"], 95)
            reasoning = original_signal.get("reasoning", "")
            reasoning += f"\n\n💡 INVESTOR LENS BOOST: {consensus['key_insight']}"
        else:
            new_conf = max(original_conf - 10, 30)
            reasoning = original_signal.get("reasoning", "")
            reasoning += f"\n\n⚠️ MIXED CONSENSUS: Not all investors bearish. Reconsider short."

    else:  # HOLD
        new_conf = original_conf
        reasoning = original_signal.get("reasoning", "")
        reasoning += f"\n\n📊 INVESTOR VIEW: {consensus['key_insight']}"

    # Update signal if needed
    final_signal = consensus["aggregate_signal"] if consensus["bullish_count"] >= 3 or consensus["bearish_count"] >= 3 else signal

    return {
        "original_signal": signal,
        "original_confidence": original_conf,
        "final_signal": final_signal,
        "final_confidence": new_conf,
        "confidence_boost": new_conf - original_conf,
        "reasoning": reasoning,
        "investor_analysis": investor_analysis,
    }

"""
Crypto Investor Perspectives Engine
─────────────────────────────────────────────────────────────────────────────
Applies the decision-making frameworks of legendary crypto investors &
analysts to enhance trading signals. Consensus across multiple lenses
boosts confidence; disagreement flags risk.

Investors modelled (drawn from public positions, tweets, interviews):
  • Michael Saylor     — BTC maximalist, long-duration scarcity thesis
  • Raoul Pal          — Macro liquidity, SOL/SUI/alt exposure
  • Arthur Hayes       — Derivatives / macro / short-term flow
  • Willy Woo          — On-chain technicals, BTC cycles
  • PlanB              — Stock-to-flow BTC model
  • Cathie Wood (ARK)  — Innovation thesis, ETH/network effects
  • Vitalik Buterin    — ETH/L2 fundamentals, adoption
  • CZ (Binance)       — Exchange flow, market structure
"""
from __future__ import annotations

from typing import Dict, List


class CryptoInvestorPerspective:
    def __init__(self, name: str, style: str):
        self.name = name
        self.style = style
        self.signal = "NEUTRAL"
        self.confidence = 0
        self.reasoning: List[str] = []

    def analyze(self, coin: dict, indicators: dict, market_ctx: dict) -> dict:
        raise NotImplementedError

    def get_insight(self) -> dict:
        return {
            "investor": self.name,
            "signal": self.signal,
            "confidence": self.confidence,
            "reasoning": " | ".join(self.reasoning) if self.reasoning else "No strong signal",
            "style": self.style,
        }


# ── 1. Michael Saylor — BTC maximalist ─────────────────────────────

class MichaelSaylor(CryptoInvestorPerspective):
    def __init__(self):
        super().__init__(
            "Michael Saylor",
            "BTC maximalist — 21M supply cap is engineered scarcity. Accumulate on drawdowns."
        )

    def analyze(self, coin, indicators, ctx):
        self.reasoning = []; self.signal = "NEUTRAL"; self.confidence = 0
        sym = coin.get("symbol", "")
        is_btc = sym == "BTCUSDT"
        is_eth = sym == "ETHUSDT"
        change_24h = coin.get("change_24h_pct", 0)
        rsi = indicators.get("rsi", {}).get("value", 50)
        fng = ctx.get("fear_greed_value", 50) or 50

        if is_btc:
            if rsi < 40 or change_24h < -5 or fng < 30:
                self.reasoning.append("BTC on discount — buy dips, never stop accumulating")
                self.signal = "STRONG_BUY"; self.confidence = 92
            elif rsi < 55:
                self.reasoning.append("BTC is the long-duration asset. Accumulate systematically.")
                self.signal = "BUY"; self.confidence = 80
            elif rsi > 75 and fng > 80:
                self.reasoning.append("BTC euphoria — don't chase; next dip will come")
                self.signal = "HOLD"; self.confidence = 55
            else:
                self.reasoning.append("BTC is digital property. Default view: accumulate.")
                self.signal = "BUY"; self.confidence = 65
        elif is_eth:
            self.reasoning.append("Only BTC offers engineered scarcity in Saylor's framework")
            self.signal = "HOLD"; self.confidence = 40
        else:
            self.reasoning.append("Altcoins lack BTC's scarcity & network guarantees")
            self.signal = "HOLD"; self.confidence = 30
        return self.get_insight()


# ── 2. Raoul Pal — Macro liquidity / SOL-SUI-alts ──────────────────

class RaoulPal(CryptoInvestorPerspective):
    def __init__(self):
        super().__init__(
            "Raoul Pal",
            "Macro global liquidity — crypto is the fastest liquidity expression. SOL/SUI/ETH tilt."
        )

    def analyze(self, coin, indicators, ctx):
        self.reasoning = []; self.signal = "NEUTRAL"; self.confidence = 0
        sym = coin.get("symbol", "")
        alt_favs = {"SOLUSDT", "SUIUSDT", "ETHUSDT", "DOGEUSDT", "RNDRUSDT", "FETUSDT"}
        rsi = indicators.get("rsi", {}).get("value", 50)
        macd = indicators.get("macd", {}).get("vote", "NEUTRAL")
        altseason = ctx.get("altseason", "OFF")
        btc_d = ctx.get("btc_dominance", 50) or 50

        if sym in alt_favs:
            if altseason in ("ACTIVE", "APPROACHING") and macd == "BUY":
                self.reasoning.append(f"Altseason {altseason} — favored alt on the list. Ride the liquidity wave.")
                self.signal = "STRONG_BUY"; self.confidence = 85
            elif rsi < 45 and macd == "BUY":
                self.reasoning.append("Macro liquidity tailwind + momentum turning up")
                self.signal = "BUY"; self.confidence = 72
            elif btc_d > 55:
                self.reasoning.append("BTC.D high — alts bleed until rotation comes")
                self.signal = "HOLD"; self.confidence = 50
            else:
                self.reasoning.append("Core exponential-age portfolio holding")
                self.signal = "BUY"; self.confidence = 60
        elif sym == "BTCUSDT":
            self.reasoning.append("BTC tracks global liquidity — the base bet")
            self.signal = "BUY"; self.confidence = 68
        else:
            self.reasoning.append("Not in core thesis — deploy size only on favored alts")
            self.signal = "HOLD"; self.confidence = 35
        return self.get_insight()


# ── 3. Arthur Hayes — Derivatives / macro / short-term ─────────────

class ArthurHayes(CryptoInvestorPerspective):
    def __init__(self):
        super().__init__(
            "Arthur Hayes",
            "Derivatives macro — funding, liquidity, central bank pivots. Trade the flush."
        )

    def analyze(self, coin, indicators, ctx):
        self.reasoning = []; self.signal = "NEUTRAL"; self.confidence = 0
        rsi = indicators.get("rsi", {}).get("value", 50)
        funding = ctx.get("funding_rate_pct", 0) or 0
        fng = ctx.get("fear_greed_value", 50) or 50

        if funding < -0.03 and rsi < 40:
            self.reasoning.append(f"Funding {funding:.3f}% + RSI {rsi:.0f} — shorts trapped. Squeeze setup.")
            self.signal = "STRONG_BUY"; self.confidence = 88
        elif funding > 0.08 and rsi > 70:
            self.reasoning.append(f"Funding {funding:.3f}% + RSI {rsi:.0f} — longs trapped. Flush incoming.")
            self.signal = "STRONG_SELL"; self.confidence = 82
        elif fng < 25:
            self.reasoning.append("Extreme fear — buy when credit spreads widen and fear peaks")
            self.signal = "BUY"; self.confidence = 70
        elif fng > 80:
            self.reasoning.append("Euphoria — take chips off table ahead of the inevitable flush")
            self.signal = "SELL"; self.confidence = 65
        else:
            self.reasoning.append("No asymmetric derivatives edge. Stay nimble.")
            self.signal = "HOLD"; self.confidence = 45
        return self.get_insight()


# ── 4. Willy Woo — On-chain / BTC cycles ───────────────────────────

class WillyWoo(CryptoInvestorPerspective):
    def __init__(self):
        super().__init__(
            "Willy Woo",
            "On-chain analyst — cycles, NVT, realized cap. Bottoms form at capitulation."
        )

    def analyze(self, coin, indicators, ctx):
        self.reasoning = []; self.signal = "NEUTRAL"; self.confidence = 0
        sym = coin.get("symbol", "")
        rsi = indicators.get("rsi", {}).get("value", 50)
        bb_vote = indicators.get("bollinger", {}).get("vote", "NEUTRAL")
        fng = ctx.get("fear_greed_value", 50) or 50
        change_24h = coin.get("change_24h_pct", 0)

        if sym == "BTCUSDT":
            if rsi < 30 and bb_vote == "BUY" and fng < 25:
                self.reasoning.append("Capitulation print — historically the best risk/reward zone for BTC")
                self.signal = "STRONG_BUY"; self.confidence = 90
            elif change_24h < -7:
                self.reasoning.append("Flush bar — smart money scales in on panic")
                self.signal = "BUY"; self.confidence = 75
            elif rsi > 80:
                self.reasoning.append("Euphoria — cycle tops are usually marked by overbought reads")
                self.signal = "SELL"; self.confidence = 65
            else:
                self.reasoning.append("Cycle context neutral — no signal")
                self.signal = "HOLD"; self.confidence = 50
        else:
            # For alts, on-chain is less reliable; default to BTC-correlated view
            self.reasoning.append("Altcoin on-chain less reliable — follow BTC structure")
            self.signal = "HOLD"; self.confidence = 40
        return self.get_insight()


# ── 5. PlanB — Stock-to-Flow / BTC halving ─────────────────────────

class PlanB(CryptoInvestorPerspective):
    def __init__(self):
        super().__init__(
            "PlanB",
            "S2F model — BTC scarcity drives price post-halving. Long-horizon only."
        )

    def analyze(self, coin, indicators, ctx):
        self.reasoning = []; self.signal = "NEUTRAL"; self.confidence = 0
        sym = coin.get("symbol", "")
        change_24h = coin.get("change_24h_pct", 0)
        rsi = indicators.get("rsi", {}).get("value", 50)

        if sym == "BTCUSDT":
            if change_24h < -5 or rsi < 35:
                self.reasoning.append("Below S2F fair value — accumulate for post-halving expansion")
                self.signal = "STRONG_BUY"; self.confidence = 85
            elif rsi < 60:
                self.reasoning.append("Tracking S2F model — on trend, keep stacking")
                self.signal = "BUY"; self.confidence = 70
            else:
                self.reasoning.append("Above S2F expected — hold, don't chase")
                self.signal = "HOLD"; self.confidence = 50
        else:
            self.reasoning.append("Model is BTC-only")
            self.signal = "HOLD"; self.confidence = 30
        return self.get_insight()


# ── 6. Cathie Wood (ARK) — Innovation thesis ───────────────────────

class CathieWoodARK(CryptoInvestorPerspective):
    def __init__(self):
        super().__init__(
            "Cathie Wood (ARK)",
            "Disruptive innovation — network effects, developer growth, exponential curves."
        )

    def analyze(self, coin, indicators, ctx):
        self.reasoning = []; self.signal = "NEUTRAL"; self.confidence = 0
        sym = coin.get("symbol", "")
        innovation_set = {"BTCUSDT", "ETHUSDT", "SOLUSDT", "RNDRUSDT", "FETUSDT",
                           "ARBUSDT", "OPUSDT", "LINKUSDT", "INJUSDT"}
        rsi = indicators.get("rsi", {}).get("value", 50)
        macd = indicators.get("macd", {}).get("vote", "NEUTRAL")

        if sym in innovation_set:
            if rsi < 45 and macd == "BUY":
                self.reasoning.append("Innovation pick on sale with momentum turning up")
                self.signal = "STRONG_BUY"; self.confidence = 82
            elif macd == "BUY":
                self.reasoning.append("On the innovation platform — accumulate")
                self.signal = "BUY"; self.confidence = 70
            elif rsi > 75:
                self.reasoning.append("Overextended short-term; trim and re-add on dip")
                self.signal = "HOLD"; self.confidence = 50
            else:
                self.reasoning.append("Long-term innovation exposure maintained")
                self.signal = "BUY"; self.confidence = 60
        else:
            self.reasoning.append("Not on innovation list — legacy or meme exposure")
            self.signal = "HOLD"; self.confidence = 35
        return self.get_insight()


# ── 7. Vitalik Buterin — ETH/L2 fundamentals ───────────────────────

class VitalikView(CryptoInvestorPerspective):
    def __init__(self):
        super().__init__(
            "Vitalik Buterin (view)",
            "ETH + L2 fundamentals — validator decentralization, rollup adoption, real utility."
        )

    def analyze(self, coin, indicators, ctx):
        self.reasoning = []; self.signal = "NEUTRAL"; self.confidence = 0
        sym = coin.get("symbol", "")
        eth_stack = {"ETHUSDT", "ARBUSDT", "OPUSDT", "MATICUSDT"}
        rsi = indicators.get("rsi", {}).get("value", 50)

        if sym in eth_stack:
            if rsi < 40:
                self.reasoning.append("ETH-ecosystem discount — utility adoption continues regardless of price")
                self.signal = "BUY"; self.confidence = 75
            elif rsi > 75:
                self.reasoning.append("Speculation outpacing fundamentals — slow down")
                self.signal = "HOLD"; self.confidence = 50
            else:
                self.reasoning.append("Core L1/L2 exposure aligned with long-term vision")
                self.signal = "BUY"; self.confidence = 65
        elif sym == "SOLUSDT":
            self.reasoning.append("Competing L1 — useful but centralization concerns remain")
            self.signal = "HOLD"; self.confidence = 50
        else:
            self.reasoning.append("Outside ETH thesis — not an endorsement")
            self.signal = "HOLD"; self.confidence = 35
        return self.get_insight()


# ── 8. CZ — Market structure / exchange flow ──────────────────────

class CZView(CryptoInvestorPerspective):
    def __init__(self):
        super().__init__(
            "CZ (view)",
            "Market structure — liquidity on top pairs, narrative rotations, user adoption."
        )

    def analyze(self, coin, indicators, ctx):
        self.reasoning = []; self.signal = "NEUTRAL"; self.confidence = 0
        sym = coin.get("symbol", "")
        top_tier = {"BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"}
        vol_spike = indicators.get("volume", {}).get("spike", False)
        macd = indicators.get("macd", {}).get("vote", "NEUTRAL")
        rsi = indicators.get("rsi", {}).get("value", 50)

        if sym in top_tier:
            if vol_spike and macd == "BUY":
                self.reasoning.append("Top-tier liquidity + volume expansion — institutional flow likely")
                self.signal = "STRONG_BUY"; self.confidence = 80
            elif macd == "BUY":
                self.reasoning.append("Quality pair with constructive tape")
                self.signal = "BUY"; self.confidence = 68
            elif rsi > 78:
                self.reasoning.append("Deep liquidity = cleaner reversals; tighten stops at extremes")
                self.signal = "HOLD"; self.confidence = 50
            else:
                self.reasoning.append("Liquid & ranging — trade the range, not the narrative")
                self.signal = "HOLD"; self.confidence = 50
        elif sym == "BNBUSDT":
            self.reasoning.append("BNB benefits from exchange volume & burns")
            self.signal = "BUY"; self.confidence = 65
        else:
            if vol_spike:
                self.reasoning.append("Volume spike on tier-2 — narrative rotation may be live")
                self.signal = "BUY"; self.confidence = 60
            else:
                self.reasoning.append("Secondary liquidity — wait for volume confirmation")
                self.signal = "HOLD"; self.confidence = 40
        return self.get_insight()


# ── Aggregator ────────────────────────────────────────────────────

def analyze_through_crypto_investor_lenses(coin: dict, indicators: dict,
                                            market_ctx: dict | None = None) -> dict:
    """Run all 8 crypto investor lenses and aggregate consensus."""
    if market_ctx is None:
        market_ctx = {}

    investors = [
        MichaelSaylor(), RaoulPal(), ArthurHayes(), WillyWoo(),
        PlanB(), CathieWoodARK(), VitalikView(), CZView(),
    ]

    perspectives = [inv.analyze(coin, indicators, market_ctx) for inv in investors]

    signals = [p["signal"] for p in perspectives]
    confidences = [p["confidence"] for p in perspectives]

    bullish_count = sum(1 for s in signals if "BUY" in s)
    bearish_count = sum(1 for s in signals if "SELL" in s)
    neutral_count = sum(1 for s in signals if s == "HOLD")

    avg_conf = sum(confidences) / len(confidences) if confidences else 50
    total = len(perspectives)

    # Aggregate signal
    if bullish_count >= 5:
        agg = "STRONG_BUY"; boost = 25
    elif bullish_count >= 3:
        agg = "BUY"; boost = 15
    elif bearish_count >= 5:
        agg = "STRONG_SELL"; boost = 25
    elif bearish_count >= 3:
        agg = "SELL"; boost = 15
    else:
        agg = "HOLD"; boost = 0

    # Key insight
    if bullish_count == total:
        key = f"🟢 UNANIMOUS BULLISH — all {total} crypto legends align"
    elif bullish_count >= 5:
        key = f"✅ STRONG CONSENSUS BULLISH — {bullish_count}/{total} bullish. Saylor stacking, Woo capitulation, Pal liquidity."
    elif bearish_count >= 5:
        key = f"🔴 STRONG CONSENSUS BEARISH — {bearish_count}/{total} bearish. Hayes sees long-flush, Woo sees euphoria."
    elif bullish_count > bearish_count:
        key = f"🟢 Leaning bullish — {bullish_count}B / {bearish_count}S / {neutral_count}N"
    elif bearish_count > bullish_count:
        key = f"🟠 Leaning bearish — {bearish_count}S / {bullish_count}B / {neutral_count}N"
    else:
        key = f"➡️ MIXED — investors split: {bullish_count}B / {bearish_count}S / {neutral_count}N"

    return {
        "symbol": coin.get("symbol", "UNKNOWN"),
        "investor_perspectives": perspectives,
        "consensus": {
            "bullish_count": bullish_count,
            "bearish_count": bearish_count,
            "neutral_count": neutral_count,
            "avg_confidence": round(avg_conf, 1),
            "confidence_boost": boost,
            "aggregate_signal": agg,
            "aggregate_confidence": min(round(avg_conf + boost, 1), 95),
            "key_insight": key,
        },
    }

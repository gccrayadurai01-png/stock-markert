"""
CRYPTO AUTO TRADER ENGINE — 24/7 Emotionless Master Trader
==========================================================
Mirrors the NSE AutoTrader architecture but adapted for crypto:

 - 24/7 markets (no session cutoffs, no EOD force-close)
 - 6 independent strategies A-F (F = Sentiment Edge, crypto-only)
 - Binance spot + futures data (klines, funding rate, open interest)
 - CoinGecko + CryptoPanic news
 - Crypto Fear & Greed Index (alternative.me)
 - 8 crypto investor perspectives (Saylor, Pal, Hayes, Woo, PlanB, ARK, Vitalik, CZ)
 - Fractional USDT units (not integer shares)
 - Wider ATR stops (2× vs 1.5× for stocks) — crypto is more volatile

Strategies:
 A — Momentum Breakout       (RSI + MACD + Volume + Supertrend)
 B — Oversold Reversal       (RSI<38 + BB lower + Stochastic oversold)
 C — Trend Rider             (ADX>25 + EMA aligned + OBV + VWAP)
 D — News Catalyst           (bullish crypto news + investor consensus + volume)
 E — SMC / ICT               (order blocks + FVG + structure on 15m)
 F — Sentiment Edge (crypto) (Fear & Greed contrarian + funding rate)

ANY strategy firing = trade taken. No ALL-REQUIRED gating.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from concurrent.futures import ThreadPoolExecutor

from crypto_engine import fetch_all_coins, SYMBOL_NAMES, _precision_for
from crypto_news_engine import fetch_crypto_news, news_score_for
from crypto_sentiment_engine import strategy_f_score, market_sentiment_overview
from crypto_smc_engine import analyze_crypto_smc
from crypto_investor_perspectives import analyze_through_crypto_investor_lenses
from crypto_store import (
    load_crypto_config, get_portfolio, add_position, close_position,
    update_trailing_stop, update_position_prices, get_open_positions,
    log_trade_decision, save_scan_result, save_daily_summary,
    reset_daily_pnl, get_portfolio_stats,
    get_strategy_performance, record_strategy_trade, log_strategy_trade_detail,
)

logger = logging.getLogger(__name__)
executor = ThreadPoolExecutor(max_workers=3)


def _get_anthropic_client():
    """Load Anthropic client (AI confirmation + daily summary)."""
    try:
        from anthropic import Anthropic
        key = os.getenv("ANTHROPIC_API_KEY", "")
        if not key:
            env_path = Path(__file__).parent / ".env"
            if env_path.exists():
                for line in env_path.read_text().splitlines():
                    if line.startswith("ANTHROPIC_API_KEY="):
                        key = line.split("=", 1)[1].strip()
        if key:
            return Anthropic(api_key=key)
    except Exception as e:
        logger.warning(f"Could not init Anthropic for crypto trader: {e}")
    return None


def _fmt_usd(value: float, ref: float = 1.0) -> str:
    """Magnitude-aware USD formatter for crypto prices."""
    prec = _precision_for(ref if ref else value)
    return f"${value:,.{prec}f}"


class CryptoAutoTrader:
    """24/7 crypto master trader — 6 independent strategies, paper trading."""

    STRATEGY_META = {
        "A": {"name": "Momentum Breakout",   "emoji": "🚀", "min_score": 55, "color": "green"},
        "B": {"name": "Oversold Reversal",   "emoji": "📉", "min_score": 55, "color": "blue"},
        "C": {"name": "Trend Rider",         "emoji": "🏄", "min_score": 55, "color": "yellow"},
        "D": {"name": "News Catalyst",       "emoji": "📰", "min_score": 50, "color": "purple"},
        "E": {"name": "SMC / ICT",           "emoji": "🧠", "min_score": 55, "color": "red"},
        "F": {"name": "Sentiment Edge",      "emoji": "😱", "min_score": 60, "color": "orange"},
    }

    def __init__(self, config: dict):
        self.config = config
        self.running = False
        self.last_scan: Optional[datetime] = None
        self.scan_count = 0
        self.last_scan_data: dict = {}
        self._task: Optional[asyncio.Task] = None
        # Cached intelligence
        self._cached_news: List[dict] = []
        self._cached_news_time: Optional[datetime] = None
        self._cached_sentiment: dict = {}
        self._cached_market_overview: dict = {}
        self._ai_client = _get_anthropic_client()

    # ── Lifecycle ─────────────────────────────────────────────────────

    async def start(self):
        self.running = True
        self.scan_count = 0
        reset_daily_pnl()
        logger.info("🪙🤖 CRYPTO AUTO TRADER ACTIVATED — 24/7 mode, scanning…")
        self._task = asyncio.ensure_future(self._scan_loop())

    async def stop(self):
        self.running = False
        if self._task:
            self._task.cancel()
        # Crypto markets don't close — but when user stops, save summary
        ai_summary = await self._generate_daily_summary()
        save_daily_summary(ai_summary)
        logger.info("🪙🤖 CRYPTO AUTO TRADER STOPPED. Summary saved.")

    async def _scan_loop(self):
        interval = self.config.get("scan_interval_seconds", 120)
        while self.running:
            try:
                await self.scan_cycle()
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"🪙🤖 Scan loop error: {e}", exc_info=True)
                await asyncio.sleep(30)

    # ── Main scan cycle ───────────────────────────────────────────────

    async def scan_cycle(self):
        start_time = time.time()
        self.scan_count += 1
        logger.info(f"🪙🤖 Crypto scan #{self.scan_count} starting…")

        try:
            loop = asyncio.get_event_loop()

            # 1. Fetch all coins + indicators (parallel via thread pool)
            all_coins = await loop.run_in_executor(executor, fetch_all_coins)
            if not all_coins:
                logger.warning("🪙🤖 No coin data — skipping scan")
                return

            # 2. Refresh news every 5 min
            await self._refresh_news()

            # 3. Refresh market sentiment overview
            try:
                self._cached_market_overview = await loop.run_in_executor(
                    executor, market_sentiment_overview
                )
            except Exception as e:
                logger.debug(f"Market overview fetch failed: {e}")

            # 4. Update open position prices
            prices = {c["symbol"]: c["price"] for c in all_coins if c.get("price")}
            update_position_prices(prices)

            # 5. Check exits FIRST
            await self._check_exits(all_coins)

            # 6. Risk check
            risk = self._check_risk_limits()

            # 7. Evaluate entries
            pending_signals = []
            entries_made = 0

            if risk["can_trade"]:
                for coin in all_coins:
                    strategy_results = await self._evaluate_all_strategies(coin)
                    if not strategy_results:
                        continue

                    fired = sorted([sid for sid, r in strategy_results.items() if r["fires"]])
                    all_scores = {sid: r["score"] for sid, r in strategy_results.items()}

                    if fired:
                        combo_key = "+".join(fired)
                        best_id = max(fired, key=lambda sid: strategy_results[sid]["score"])
                        best = strategy_results[best_id]
                        best_score = best["score"]

                        all_reasons = []
                        for sid in fired:
                            all_reasons.extend(strategy_results[sid]["reasons"])

                        combo_name = " + ".join(strategy_results[sid]["name"] for sid in fired)
                        combo_emoji = "".join(strategy_results[sid]["emoji"] for sid in fired)

                        entry_analysis = {
                            "confluence": best_score,
                            "reasons": all_reasons,
                            "missing": best["missing"],
                            "strategy_id": best_id,
                            "strategy_key": combo_key,
                            "strategy_name": combo_name,
                            "strategy_emoji": combo_emoji,
                            "strategies_confirmed": fired,
                            "strategy_scores": all_scores,
                        }

                        ai_reasoning = "Auto-approved — high confidence score"
                        if best_score >= 70:
                            logger.info(
                                f"✅ Crypto auto-approved {coin['symbol']} "
                                f"score={best_score}/100 (AI skipped)"
                            )
                        elif self.config.get("use_ai_confirmation", True):
                            try:
                                ai_result = await self._get_ai_confirmation(coin, entry_analysis)
                                ai_reasoning = ai_result.get("reasoning", "AI advisory check done")
                                if not ai_result.get("confirmed", True):
                                    ai_reasoning = (
                                        f"⚠️ AI note: {ai_result.get('reasoning','')} "
                                        f"(trade proceeds on score)"
                                    )
                            except Exception as e:
                                logger.warning(f"AI confirm error {coin['symbol']}: {e}")

                        trade = self._execute_entry(coin, entry_analysis)
                        if trade:
                            entries_made += 1
                            log_trade_decision({
                                "action": "ENTER",
                                "symbol": coin["symbol"],
                                "name": coin.get("name", ""),
                                "confluence_score": best_score,
                                "entry_price": trade["entry_price"],
                                "stop_loss": trade["stop_loss"],
                                "target_1": trade["target_1"],
                                "units": trade["units"],
                                "reasoning": all_reasons,
                                "ai_confirmation": ai_reasoning,
                                "strategy_key": combo_key,
                                "strategy_name": combo_name,
                                "strategy_scores": all_scores,
                                "strategies_confirmed": fired,
                                "indicator_snapshot": self._snapshot(coin),
                            })
                            logger.info(
                                f"🪙🤖{combo_emoji} CRYPTO TRADE [{combo_key}] {combo_name} "
                                f"on {coin['symbol']} @ {_fmt_usd(coin.get('price',0), coin.get('price',0))} "
                                f"| Score: {best_score}/100"
                            )
                    else:
                        # Watchlist (close-but-no-fire)
                        best_near = max(
                            strategy_results.items(),
                            key=lambda x: x[1]["score"],
                            default=(None, {"score": 0}),
                        )
                        near_id, near_res = best_near
                        if near_id and near_res["score"] >= 35:
                            pending_signals.append({
                                "symbol": coin["symbol"],
                                "name": coin.get("name", ""),
                                "price": coin.get("price", 0),
                                "confluence_score": near_res["score"],
                                "strategy_id": near_id,
                                "strategy_key": near_id,
                                "strategy_name": near_res["name"],
                                "missing": near_res["missing"][:3],
                                "met_conditions": near_res["reasons"][:4],
                                "strategy_scores": all_scores,
                                "strategies_confirmed": [],
                            })

            # 8. Save scan
            elapsed = round(time.time() - start_time, 1)
            portfolio = get_portfolio()
            save_scan_result({
                "scan_number": self.scan_count,
                "coins_scanned": len(all_coins),
                "entries_made": entries_made,
                "open_positions": len(get_open_positions()),
                "pending_signals": pending_signals[:10],
                "risk_status": risk,
                "elapsed_seconds": elapsed,
                "today_pnl": portfolio.get("today_pnl", 0),
                "news_count": len(self._cached_news),
                "market_sentiment": self._cached_sentiment.get("sentiment", "N/A"),
                "fear_greed": self._cached_market_overview.get("fear_greed_value"),
            })

            self.last_scan = datetime.now()
            self.last_scan_data = {
                "pending_signals": pending_signals[:10],
                "scan_count": self.scan_count,
                "entries_made": entries_made,
                "news_sentiment": self._cached_sentiment.get("sentiment", "N/A"),
            }

            logger.info(
                f"🪙🤖 Crypto scan #{self.scan_count} done in {elapsed}s — "
                f"{entries_made} entries, {len(get_open_positions())} open, "
                f"{len(pending_signals)} watching | "
                f"F&G: {self._cached_market_overview.get('fear_greed_value','?')} "
                f"News: {self._cached_sentiment.get('sentiment', 'N/A')}"
            )

        except Exception as e:
            logger.error(f"🪙🤖 Scan cycle error: {e}", exc_info=True)

    # ── News intelligence ────────────────────────────────────────────

    async def _refresh_news(self):
        now = datetime.now()
        if self._cached_news_time and (now - self._cached_news_time).total_seconds() < 300:
            return
        try:
            loop = asyncio.get_event_loop()
            data = await loop.run_in_executor(executor, fetch_crypto_news)
            self._cached_news = data.get("news", [])
            self._cached_sentiment = data.get("sentiment", {})
            self._cached_news_time = now
            logger.info(
                f"🪙📰 Crypto news refreshed: {len(self._cached_news)} articles, "
                f"Sentiment: {self._cached_sentiment.get('sentiment','N/A')}"
            )
        except Exception as e:
            logger.warning(f"🪙🤖 News fetch failed: {e}")

    def _get_coin_news(self, symbol: str) -> dict:
        """Per-coin news score (Strategy D input)."""
        return news_score_for(symbol, self._cached_news)

    # ── AI confirmation ──────────────────────────────────────────────

    async def _get_ai_confirmation(self, coin: dict, analysis: dict) -> dict:
        if not self._ai_client:
            return {"confirmed": True, "reasoning": "AI unavailable — proceeding on indicators"}

        try:
            ind = coin.get("indicators", {})
            news_info = self._get_coin_news(coin["symbol"])
            fng = self._cached_market_overview.get("fear_greed_value", "?")

            prompt = f"""You are a TRADING ASSISTANT for a crypto paper trading system.
A borderline crypto trade scored {analysis['confluence']}/100. Give your opinion — PAPER TRADING, be permissive.

COIN: {coin.get('name', '')} ({coin['symbol']})
PRICE: {_fmt_usd(coin.get('price', 0), coin.get('price', 0))}
CHANGE 24h: {coin.get('change_24h_pct', 0):.2f}%

WHY BUY:
{json.dumps(analysis['reasons'][:8], indent=2)}

WHAT'S MISSING:
{json.dumps(analysis.get('missing', [])[:5], indent=2)}

KEY INDICATORS:
- RSI: {ind.get('rsi', {}).get('value', 'N/A')}
- MACD: {ind.get('macd', {}).get('vote', 'N/A')}
- Supertrend: {ind.get('supertrend', {}).get('direction', 'N/A')}
- ADX: {ind.get('adx', {}).get('adx', 'N/A')}
- Volume: {ind.get('volume', {}).get('ratio', 'N/A')}x

MARKET CONTEXT:
- Fear & Greed: {fng}
- News sentiment: {news_info.get('dominant','NEUTRAL')} ({news_info.get('count',0)} coin-specific)
- Overall crypto news: {self._cached_sentiment.get('sentiment','N/A')}

Rules:
- confirmed=true if setup looks reasonable for paper trade
- Only reject on CLEAR bearish signal or obvious trap
- Respond ONLY with JSON: {{"confirmed": true, "reasoning": "one sentence"}}"""

            loop = asyncio.get_event_loop()

            def _call_ai():
                resp = self._ai_client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=200,
                    messages=[{"role": "user", "content": prompt}],
                )
                text = resp.content[0].text.strip()
                if text.startswith("```"):
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                    text = text.strip()
                return json.loads(text)

            result = await loop.run_in_executor(executor, _call_ai)
            logger.info(
                f"🪙🧠 AI review {coin['symbol']}: "
                f"{'✅' if result.get('confirmed') else '❌'} {result.get('reasoning','')}"
            )
            return result
        except Exception as e:
            logger.warning(f"🪙🤖 AI confirmation failed: {e}")
            return {"confirmed": True, "reasoning": f"AI error: {e} — proceeding on score"}

    # ── Strategy evaluation ──────────────────────────────────────────

    async def _evaluate_all_strategies(self, coin: dict) -> Optional[dict]:
        ind = coin.get("indicators", {})
        if not ind:
            return None
        symbol = coin.get("symbol", "")

        # Skip if already holding
        for pos in get_open_positions():
            if pos["symbol"] == symbol:
                return None

        active = self.config.get("active_strategies", ["A", "B", "C", "D", "E", "F"])
        min_scores = self.config.get("strategy_min_scores", {})
        results = {}

        if "A" in active:
            score, reasons, missing = self._score_strategy_A(coin, ind)
            thr = min_scores.get("A", self.STRATEGY_META["A"]["min_score"])
            results["A"] = {"score": score, "fires": score >= thr,
                            "reasons": reasons, "missing": missing,
                            "name": "Momentum Breakout", "emoji": "🚀", "threshold": thr}

        if "B" in active:
            score, reasons, missing = self._score_strategy_B(coin, ind)
            thr = min_scores.get("B", self.STRATEGY_META["B"]["min_score"])
            results["B"] = {"score": score, "fires": score >= thr,
                            "reasons": reasons, "missing": missing,
                            "name": "Oversold Reversal", "emoji": "📉", "threshold": thr}

        if "C" in active:
            score, reasons, missing = self._score_strategy_C(coin, ind)
            thr = min_scores.get("C", self.STRATEGY_META["C"]["min_score"])
            results["C"] = {"score": score, "fires": score >= thr,
                            "reasons": reasons, "missing": missing,
                            "name": "Trend Rider", "emoji": "🏄", "threshold": thr}

        if "D" in active:
            score, reasons, missing = self._score_strategy_D(coin, ind, symbol)
            thr = min_scores.get("D", self.STRATEGY_META["D"]["min_score"])
            results["D"] = {"score": score, "fires": score >= thr,
                            "reasons": reasons, "missing": missing,
                            "name": "News Catalyst", "emoji": "📰", "threshold": thr}

        if "E" in active:
            score, reasons, missing = await self._score_strategy_E(symbol, coin.get("price", 0))
            thr = min_scores.get("E", self.STRATEGY_META["E"]["min_score"])
            results["E"] = {"score": score, "fires": score >= thr,
                            "reasons": reasons, "missing": missing,
                            "name": "SMC / ICT", "emoji": "🧠", "threshold": thr}

        if "F" in active:
            score, reasons, missing = await self._score_strategy_F(symbol)
            thr = min_scores.get("F", self.STRATEGY_META["F"]["min_score"])
            results["F"] = {"score": score, "fires": score >= thr,
                            "reasons": reasons, "missing": missing,
                            "name": "Sentiment Edge", "emoji": "😱", "threshold": thr}

        return results if results else None

    # ── Strategy A: Momentum Breakout ────────────────────────────────

    def _score_strategy_A(self, coin: dict, ind: dict) -> tuple:
        score = 0
        reasons, missing = [], []

        rsi = ind.get("rsi", {}).get("value", 50)
        macd_vote = ind.get("macd", {}).get("vote", "NEUTRAL")
        supertrend = ind.get("supertrend", {}).get("direction", "")
        ema_align = ind.get("ema_crossover", {}).get("alignment", "NEUTRAL")
        vwap_vote = ind.get("vwap", {}).get("vote", "NEUTRAL")
        vol_spike = ind.get("volume", {}).get("spike", False)
        vol_ratio = ind.get("volume", {}).get("ratio", 1.0)
        adx_val = ind.get("adx", {}).get("adx", 0)
        votes = coin.get("votes", {})
        buy_votes = votes.get("BUY", 0)

        # RSI momentum zone (30 pts)
        if 50 <= rsi <= 65:
            score += 30; reasons.append(f"[A] RSI {rsi:.0f} — crypto momentum zone")
        elif 45 <= rsi < 50:
            score += 15; reasons.append(f"[A] RSI {rsi:.0f} — approaching momentum")
        elif 65 < rsi <= 75:   # crypto runs hotter than stocks
            score += 12; reasons.append(f"[A] RSI {rsi:.0f} — strong (still tradeable in crypto)")
        elif rsi > 78:
            score -= 5; missing.append(f"[A] RSI {rsi:.0f} — overbought, wait for pullback")
        else:
            missing.append(f"[A] RSI {rsi:.0f} — below momentum zone")

        # MACD bullish (25 pts)
        if macd_vote == "BUY":
            score += 25; reasons.append("[A] MACD bullish crossover")
        else:
            missing.append("[A] MACD not bullish yet")

        # Volume spike — crypto is volume-driven (20 pts)
        if vol_spike:
            score += 20; reasons.append(f"[A] Volume spike {vol_ratio:.1f}x — breakout confirmed")
        elif vol_ratio >= 1.4:
            score += 10; reasons.append(f"[A] Above-avg volume {vol_ratio:.1f}x")
        elif vol_ratio >= 1.1:
            score += 4
        else:
            missing.append(f"[A] Low volume {vol_ratio:.1f}x — weak breakout")

        # Supertrend UP (15 pts)
        if supertrend == "UP":
            score += 15; reasons.append("[A] Supertrend bullish")
        else:
            missing.append("[A] Supertrend not UP")

        # VWAP / EMA (10 pts)
        if vwap_vote == "BUY" or ema_align == "BULLISH":
            score += 10; reasons.append("[A] Above VWAP / EMA bullish aligned")
        else:
            missing.append("[A] Below VWAP / EMA not aligned")

        # ADX bonus
        if adx_val >= 30:
            score += 5; reasons.append(f"[A] Strong trend ADX {adx_val:.0f}")

        # Vote bonus
        if buy_votes >= 7:
            score += 5; reasons.append(f"[A] {buy_votes}/12 indicators say BUY")

        return max(0, min(100, score)), reasons, missing

    # ── Strategy B: Oversold Reversal ────────────────────────────────

    def _score_strategy_B(self, coin: dict, ind: dict) -> tuple:
        score = 0
        reasons, missing = [], []

        rsi = ind.get("rsi", {}).get("value", 50)
        bb_pct = ind.get("bollinger", {}).get("pct_b", 0.5)
        stoch_k = ind.get("stochastic", {}).get("k", 50)
        stoch_d = ind.get("stochastic", {}).get("d", 50)
        macd_vote = ind.get("macd", {}).get("vote", "NEUTRAL")
        vol_ratio = ind.get("volume", {}).get("ratio", 1.0)
        vol_spike = ind.get("volume", {}).get("spike", False)
        obv_trend = ind.get("obv", {}).get("trend", "NEUTRAL")
        supertrend = ind.get("supertrend", {}).get("direction", "")

        # RSI oversold (35 pts) — crypto drops harder, so <30 is common
        if rsi < 22:
            score += 35; reasons.append(f"[B] RSI {rsi:.0f} — EXTREMELY oversold, strong bounce setup")
        elif rsi < 28:
            score += 30; reasons.append(f"[B] RSI {rsi:.0f} — deeply oversold")
        elif rsi < 35:
            score += 22; reasons.append(f"[B] RSI {rsi:.0f} — oversold zone")
        elif rsi < 42:
            score += 8; reasons.append(f"[B] RSI {rsi:.0f} — approaching oversold")
        else:
            missing.append(f"[B] RSI {rsi:.0f} — not oversold (need < 35)")

        # Bollinger lower (25 pts)
        if bb_pct <= 0.10:
            score += 25; reasons.append(f"[B] At/below Bollinger lower ({bb_pct:.0%}) — reversal zone")
        elif bb_pct <= 0.20:
            score += 18; reasons.append(f"[B] Near Bollinger lower ({bb_pct:.0%})")
        elif bb_pct <= 0.30:
            score += 8; reasons.append(f"[B] Approaching lower band ({bb_pct:.0%})")
        else:
            missing.append(f"[B] Not near lower BB ({bb_pct:.0%})")

        # Stochastic oversold (20 pts)
        if stoch_k is not None and stoch_d is not None:
            if stoch_k < 20 and stoch_d < 20:
                score += 20; reasons.append(f"[B] Stochastic deeply oversold K:{stoch_k:.0f} D:{stoch_d:.0f}")
            elif stoch_k < 25:
                score += 12; reasons.append(f"[B] Stochastic oversold K:{stoch_k:.0f}")
            elif stoch_k < 35:
                score += 5
            else:
                missing.append(f"[B] Stochastic not oversold K:{stoch_k:.0f}")

        # Volume on reversal (15 pts)
        if vol_spike:
            score += 15; reasons.append("[B] Volume spike — reversal candle forming")
        elif vol_ratio >= 1.3:
            score += 7; reasons.append(f"[B] Elevated volume {vol_ratio:.1f}x")
        else:
            missing.append(f"[B] Low volume {vol_ratio:.1f}x — reversal unconfirmed")

        # MACD early cross
        if macd_vote == "BUY":
            score += 5; reasons.append("[B] MACD starting bullish cross — reversal confirming")

        # OBV divergence (smart money accumulating)
        if obv_trend == "RISING":
            score += 5; reasons.append("[B] OBV rising — smart money accumulating")

        # Supertrend flip
        if supertrend == "UP" and rsi < 40:
            score += 5; reasons.append("[B] Supertrend flipped UP while oversold — strong reversal")

        return max(0, min(100, score)), reasons, missing

    # ── Strategy C: Trend Rider ──────────────────────────────────────

    def _score_strategy_C(self, coin: dict, ind: dict) -> tuple:
        score = 0
        reasons, missing = [], []

        rsi = ind.get("rsi", {}).get("value", 50)
        adx_val = ind.get("adx", {}).get("adx", 0)
        supertrend = ind.get("supertrend", {}).get("direction", "")
        ema_align = ind.get("ema_crossover", {}).get("alignment", "NEUTRAL")
        vwap_vote = ind.get("vwap", {}).get("vote", "NEUTRAL")
        obv_trend = ind.get("obv", {}).get("trend", "NEUTRAL")
        vol_ratio = ind.get("volume", {}).get("ratio", 1.0)
        vol_spike = ind.get("volume", {}).get("spike", False)
        macd_vote = ind.get("macd", {}).get("vote", "NEUTRAL")

        # ADX (30 pts)
        if adx_val >= 40:
            score += 30; reasons.append(f"[C] ADX {adx_val:.0f} — VERY strong trend")
        elif adx_val >= 30:
            score += 22; reasons.append(f"[C] ADX {adx_val:.0f} — strong trend")
        elif adx_val >= 25:
            score += 14; reasons.append(f"[C] ADX {adx_val:.0f} — confirmed trend")
        elif adx_val >= 20:
            score += 5
        else:
            missing.append(f"[C] ADX {adx_val:.0f} — no clear trend")

        # Supertrend + EMA (25 pts)
        if supertrend == "UP" and ema_align == "BULLISH":
            score += 25; reasons.append("[C] Supertrend UP + EMA aligned bullish")
        elif supertrend == "UP":
            score += 15; reasons.append("[C] Supertrend UP")
        elif ema_align == "BULLISH":
            score += 10; reasons.append("[C] EMA aligned bullish")
        else:
            missing.append("[C] No trend alignment")

        # OBV (20 pts)
        if obv_trend == "RISING":
            score += 20; reasons.append("[C] OBV rising — institutional accumulation")
        elif obv_trend == "NEUTRAL":
            score += 5
        else:
            missing.append("[C] OBV declining — smart money exiting")

        # VWAP + RSI healthy (15 pts)
        if vwap_vote == "BUY" and 45 <= rsi <= 72:
            score += 15; reasons.append(f"[C] Above VWAP, RSI {rsi:.0f} — healthy trend")
        elif vwap_vote == "BUY":
            score += 8
        else:
            missing.append(f"[C] Below VWAP or RSI {rsi:.0f} unfavorable")

        # MACD (10 pts)
        if macd_vote == "BUY":
            score += 10; reasons.append("[C] MACD confirms bullish trend")
        else:
            missing.append("[C] MACD not confirming trend")

        # Volume bonus
        if vol_spike or vol_ratio >= 1.3:
            score += 5; reasons.append(f"[C] Volume {vol_ratio:.1f}x confirms trend")

        return max(0, min(100, score)), reasons, missing

    # ── Strategy D: News Catalyst ────────────────────────────────────

    def _score_strategy_D(self, coin: dict, ind: dict, symbol: str) -> tuple:
        score = 0
        reasons, missing = [], []

        rsi = ind.get("rsi", {}).get("value", 50)
        macd_vote = ind.get("macd", {}).get("vote", "NEUTRAL")
        vol_spike = ind.get("volume", {}).get("spike", False)
        vol_ratio = ind.get("volume", {}).get("ratio", 1.0)
        supertrend = ind.get("supertrend", {}).get("direction", "")

        # News score (40 pts)
        news = self._get_coin_news(symbol)
        if news["count"] > 0:
            if news["dominant"] == "BULLISH":
                pts = min(40, 20 + news["bullish"] * 6)
                score += pts
                h = news["headlines"][0][:70] if news["headlines"] else "positive coverage"
                reasons.append(f"[D] {news['count']} bullish news articles: {h}")
            elif news["dominant"] == "BEARISH":
                score -= 20; missing.append(f"[D] {news['count']} bearish news — avoid")
            else:
                score += 5; reasons.append(f"[D] {news['count']} neutral mentions")
        else:
            # Market-level sentiment fallback
            market_sent = self._cached_sentiment.get("sentiment", "NEUTRAL")
            if market_sent == "BULLISH":
                score += 10; reasons.append("[D] Bullish overall crypto sentiment")
            elif market_sent == "BEARISH":
                score -= 5; missing.append("[D] Bearish overall crypto sentiment")
            else:
                missing.append("[D] No coin-specific news catalyst")

        # Investor perspectives (30 pts)
        try:
            investor_data = analyze_through_crypto_investor_lenses(coin, ind)
            bullish_count = investor_data.get("consensus", {}).get("bullish_count", 0)
            total = investor_data.get("consensus", {}).get("total_count", 8)
            key_insight = investor_data.get("consensus", {}).get("key_insight", "")

            if bullish_count >= 6:
                score += 30; reasons.append(f"[D] {bullish_count}/{total} crypto investors bullish! {key_insight}")
            elif bullish_count >= 4:
                score += 22; reasons.append(f"[D] {bullish_count}/{total} investors bullish: {key_insight}")
            elif bullish_count >= 3:
                score += 14; reasons.append(f"[D] {bullish_count}/{total} investors bullish")
            elif bullish_count >= 2:
                score += 6; reasons.append(f"[D] {bullish_count}/{total} see potential")
            else:
                missing.append(f"[D] Only {bullish_count}/{total} investors bullish")
        except Exception as e:
            missing.append(f"[D] Investor perspectives unavailable: {e}")

        # Volume confirmation (20 pts)
        if vol_spike:
            score += 20; reasons.append(f"[D] Volume spike {vol_ratio:.1f}x — news moving price")
        elif vol_ratio >= 1.5:
            score += 10; reasons.append(f"[D] Elevated volume {vol_ratio:.1f}x on news")
        elif vol_ratio >= 1.2:
            score += 4
        else:
            missing.append(f"[D] Volume {vol_ratio:.1f}x — news not confirmed by volume")

        # Technical gate (10 pts)
        if rsi <= 72 and macd_vote != "SELL":
            score += 10; reasons.append(f"[D] Technical gate OK — RSI {rsi:.0f}")
        elif rsi > 80:
            score -= 10; missing.append(f"[D] RSI {rsi:.0f} overbought — news priced in")

        # Supertrend bonus
        if supertrend == "UP":
            score += 5; reasons.append("[D] Supertrend UP — news aligned with trend")

        return max(0, min(100, score)), reasons, missing

    # ── Strategy E: SMC / ICT ────────────────────────────────────────

    async def _score_strategy_E(self, symbol: str, current_price: float) -> tuple:
        try:
            loop = asyncio.get_event_loop()
            smc = await loop.run_in_executor(
                executor, lambda: analyze_crypto_smc(symbol, current_price)
            )
        except Exception as e:
            return 0, [], [f"[E] SMC data unavailable: {e}"]

        if not smc.get("available", True):
            return 0, [], ["[E] Not enough 15m candle data for SMC"]

        raw_score = smc.get("smc_score", 0)
        reasons = [f"[E] {r}" for r in smc.get("reasons", [])]
        missing = [f"[E] {m}" for m in smc.get("missing", [])]
        return max(0, min(100, raw_score)), reasons, missing

    # ── Strategy F: Sentiment Edge (crypto-only) ─────────────────────

    async def _score_strategy_F(self, symbol: str) -> tuple:
        """Fear & Greed contrarian + funding rate — crypto-specific edge."""
        try:
            loop = asyncio.get_event_loop()
            senti = await loop.run_in_executor(
                executor, lambda: strategy_f_score(symbol)
            )
        except Exception as e:
            return 0, [], [f"[F] Sentiment data unavailable: {e}"]

        if not senti.get("available", True):
            return 0, [], ["[F] Sentiment data unavailable"]

        raw_score = senti.get("score", 0)
        reasons = [f"[F] {r}" for r in senti.get("reasons", [])]
        missing = [f"[F] {m}" for m in senti.get("missing", [])]
        return max(0, min(100, raw_score)), reasons, missing

    # ── Entry execution ──────────────────────────────────────────────

    def _execute_entry(self, coin: dict, analysis: dict) -> Optional[dict]:
        price = coin.get("price", 0)
        if price <= 0:
            return None

        stop_loss = coin.get("stop_loss", price * 0.95)   # 5% default SL for crypto
        target_1 = coin.get("target_1", price * 1.05)
        target_2 = coin.get("target_2", price * 1.10)
        atr = coin.get("atr", price * 0.03)

        pos_info = self._calculate_position_size(price, stop_loss, analysis["confluence"])
        if pos_info["units"] <= 0:
            return None

        strategy_key = "+".join(sorted(analysis.get("strategies_confirmed", [])))
        trade = {
            "symbol": coin["symbol"],
            "name": coin.get("name", SYMBOL_NAMES.get(coin["symbol"], coin["symbol"])),
            "entry_price": price,
            "units": pos_info["units"],
            "capital_deployed": round(price * pos_info["units"], 2),
            "stop_loss": stop_loss,
            "trailing_stop": stop_loss,
            "target_1": target_1,
            "target_2": target_2,
            "target_1_hit": False,
            "partial_exit_done": False,
            "confluence_score": analysis["confluence"],
            "entry_reasoning": analysis["reasons"],
            "atr": atr,
            "current_price": price,
            "strategy_key": strategy_key,
            "strategies_confirmed": analysis.get("strategies_confirmed", []),
            "strategy_scores": analysis.get("strategy_scores", {}),
        }

        added = add_position(trade)
        logger.info(
            f"🪙💰 CRYPTO ENTRY: {coin['symbol']} @ {_fmt_usd(price, price)} | "
            f"Units: {pos_info['units']:.6f} | SL: {_fmt_usd(stop_loss, price)} | "
            f"T1: {_fmt_usd(target_1, price)} | Score: {analysis['confluence']}/100"
        )
        return added

    # ── Exit logic ───────────────────────────────────────────────────

    async def _check_exits(self, all_coins: list):
        positions = get_open_positions()
        if not positions:
            return

        coin_map = {c["symbol"]: c for c in all_coins}

        for pos in positions:
            sym = pos["symbol"]
            coin = coin_map.get(sym)
            if not coin:
                continue

            current = coin.get("price", 0)
            if current <= 0:
                continue

            entry = pos["entry_price"]
            trailing_sl = pos.get("trailing_stop", pos["stop_loss"])
            atr = pos.get("atr", entry * 0.03)
            ind = coin.get("indicators", {})

            exit_reason = None
            partial = False

            # 1. Trailing stop hit
            if current <= trailing_sl:
                exit_reason = f"Trailing stop hit @ {_fmt_usd(trailing_sl, entry)} (current: {_fmt_usd(current, entry)})"

            # 2. Target 1 hit — partial exit
            elif current >= pos["target_1"] and not pos.get("partial_exit_done"):
                exit_reason = f"Target 1 hit @ {_fmt_usd(pos['target_1'], entry)}"
                partial = True

            # 3. Target 2 hit — full exit
            elif current >= pos["target_2"]:
                exit_reason = f"Target 2 hit @ {_fmt_usd(pos['target_2'], entry)}"

            # 4. Reversal signal
            elif ind:
                macd_vote = ind.get("macd", {}).get("vote", "")
                rsi = ind.get("rsi", {}).get("value", 50)
                if macd_vote == "SELL" and rsi > 70:
                    exit_reason = f"Reversal: MACD SELL + RSI {rsi:.0f}"

            # 5. Circuit breaker — crypto can drop hard (5% cutoff vs 3% for stocks)
            if current < entry * 0.95:
                pnl_pct = (current / entry - 1) * 100
                if pnl_pct < -5:
                    exit_reason = f"Circuit breaker: position down {pnl_pct:.1f}%"

            if exit_reason:
                pnl = round((current - entry) * pos["units"], 4)
                close_position(sym, current, exit_reason, partial=partial)
                log_trade_decision({
                    "action": "PARTIAL_EXIT" if partial else "EXIT",
                    "symbol": sym,
                    "exit_price": current,
                    "entry_price": entry,
                    "pnl": pnl,
                    "pnl_pct": round((current / entry - 1) * 100, 2),
                    "reasoning": [exit_reason],
                    "hold_duration_minutes": self._hold_minutes(pos.get("entry_time")),
                    "strategy_key": pos.get("strategy_key", ""),
                })
                strategy_key = pos.get("strategy_key", "")
                if strategy_key:
                    record_strategy_trade(strategy_key, pnl, pnl > 0)
                    log_strategy_trade_detail(
                        sym, strategy_key, pnl,
                        pos.get("strategies_confirmed", []),
                        pos.get("strategy_scores", {}),
                    )
                logger.info(f"🪙🚪 EXIT: {sym} @ {_fmt_usd(current, entry)} — {exit_reason}")
            else:
                # Trail the stop — wider multiplier for crypto (default 2.0)
                multiplier = self.config.get("trailing_sl_atr_multiplier", 2.0)
                new_sl = current - (atr * multiplier)
                if new_sl > trailing_sl:
                    update_trailing_stop(sym, new_sl)

    async def _force_close_all(self, reason: str):
        positions = get_open_positions()
        for pos in positions:
            current = pos.get("current_price", pos["entry_price"])
            close_position(pos["symbol"], current, reason)
            log_trade_decision({
                "action": "EXIT",
                "symbol": pos["symbol"],
                "exit_price": current,
                "entry_price": pos["entry_price"],
                "pnl": round((current - pos["entry_price"]) * pos["units"], 4),
                "reasoning": [reason],
            })
            logger.info(
                f"🪙🚪 FORCE EXIT: {pos['symbol']} @ "
                f"{_fmt_usd(current, pos['entry_price'])} — {reason}"
            )

    # ── Risk management ──────────────────────────────────────────────

    def _check_risk_limits(self) -> dict:
        portfolio = get_portfolio()
        positions = get_open_positions()

        max_pos = self.config.get("max_positions", 8)
        max_heat = self.config.get("max_portfolio_heat", 10.0)
        capital = portfolio.get("capital", 10000)
        today_pnl = portfolio.get("today_pnl", 0)

        # 1. Max positions
        if len(positions) >= max_pos:
            return {"can_trade": False, "reason": f"Max positions reached ({max_pos})"}

        # 2. Daily loss circuit breaker (5% of capital — crypto is more volatile)
        if today_pnl < -(capital * 0.05):
            return {"can_trade": False, "reason": f"Daily loss breaker: ${today_pnl:.0f}"}

        # 3. Portfolio heat
        total_risk = 0
        for pos in positions:
            risk = (pos["entry_price"] - pos.get("trailing_stop", pos["stop_loss"])) * pos["units"]
            total_risk += max(0, risk)
        heat_pct = (total_risk / capital) * 100 if capital > 0 else 0
        if heat_pct >= max_heat:
            return {"can_trade": False, "reason": f"Portfolio heat too high: {heat_pct:.1f}%"}

        # 4. Cash reserve (15%)
        cash = portfolio.get("cash", 0)
        if cash < capital * 0.15:
            return {"can_trade": False, "reason": f"Cash reserve too low: ${cash:.0f}"}

        return {
            "can_trade": True,
            "reason": "All clear — crypto 24/7",
            "positions": len(positions),
            "max_positions": max_pos,
            "portfolio_heat": round(heat_pct, 1),
            "cash_available": round(cash, 2),
        }

    def _calculate_position_size(self, entry: float, stop_loss: float, confluence: int) -> dict:
        portfolio = get_portfolio()
        capital = portfolio.get("capital", 10000)
        risk_pct = self.config.get("risk_per_trade", 1.5)

        risk_per_unit = abs(entry - stop_loss)
        if risk_per_unit <= 0:
            risk_per_unit = entry * 0.03

        risk_amount = capital * (risk_pct / 100)

        # Confidence scaling
        if confluence >= 85:
            size_mult = 1.0
        elif confluence >= 70:
            size_mult = 0.75
        else:
            size_mult = 0.5

        # Fractional units allowed (6 decimal places is Binance min lot-ish)
        units = (risk_amount * size_mult) / risk_per_unit

        # Cap at 20% of capital per position
        max_cost = capital * 0.20
        max_units = max_cost / entry if entry > 0 else 0
        units = min(units, max_units)

        # Cap at available cash
        cash = portfolio.get("cash", 0)
        max_from_cash = cash / entry if entry > 0 else 0
        units = min(units, max_from_cash)

        # Round to 6 decimals (micro-cap coins need fractional)
        units = round(max(0, units), 6)

        return {
            "units": units,
            "capital_needed": round(units * entry, 2),
            "risk_amount": round(risk_per_unit * units, 2),
        }

    # ── Daily summary ────────────────────────────────────────────────

    async def _generate_daily_summary(self) -> dict:
        from crypto_store import get_trade_journal, get_scan_history
        from datetime import date

        today_str = date.today().isoformat()
        portfolio = get_portfolio()
        stats = get_portfolio_stats()
        journal = get_trade_journal(200)
        scans = get_scan_history(50)

        today_journal = [j for j in journal if j.get("timestamp", "").startswith(today_str)]
        today_scans = [s for s in scans if s.get("timestamp", "").startswith(today_str)]
        trades_taken = [j for j in today_journal if j.get("action") == "ENTER"]
        trades_exited = [j for j in today_journal if j.get("action") in ("EXIT", "PARTIAL_EXIT")]

        news_headlines = [n.get("headline", "") for n in self._cached_news[:10]]
        market_sentiment = self._cached_sentiment.get("sentiment", "N/A")
        fng_value = self._cached_market_overview.get("fear_greed_value", "?")
        fng_label = self._cached_market_overview.get("fear_greed_label", "N/A")

        base_summary = {
            "date": today_str,
            "market_sentiment": market_sentiment,
            "fear_greed_value": fng_value,
            "fear_greed_label": fng_label,
            "news_headlines": news_headlines[:5],
            "total_scans": len(today_scans),
            "trades_count": len(trades_taken),
            "exits_count": len(trades_exited),
            "today_pnl": portfolio.get("today_pnl", 0),
        }

        if self._ai_client:
            try:
                trade_details = ""
                for t in trades_taken:
                    trade_details += (
                        f"\n  - {t.get('symbol', '?')}: Confluence "
                        f"{t.get('confluence_score', 0)}/100, "
                        f"Reasons: {', '.join(t.get('reasoning', [])[:3])}"
                    )
                if not trades_taken:
                    trade_details = "\n  No trades were taken."

                exit_details = ""
                for t in trades_exited:
                    exit_details += (
                        f"\n  - {t.get('symbol', '?')}: P&L ${t.get('pnl', 0):.2f} "
                        f"({t.get('pnl_pct', 0):.1f}%), "
                        f"Reason: {', '.join(t.get('reasoning', [])[:2])}"
                    )

                prompt = f"""You are a daily analyst for a 24/7 crypto auto-trading system. Write a concise recap for {today_str}.

TODAY'S DATA (24h window):
- Scans: {len(today_scans)}
- Trades taken: {len(trades_taken)}
- Trades exited: {len(trades_exited)}
- Today P&L: ${portfolio.get('today_pnl', 0):.2f}
- Market sentiment: {market_sentiment}
- Fear & Greed: {fng_value} ({fng_label})
- BTC dominance: {self._cached_market_overview.get('btc_dominance','?')}%
- Altseason: {self._cached_market_overview.get('altseason','?')}

TRADES:{trade_details}

EXITS:{exit_details}

TOP NEWS:
{chr(10).join(f'- {h}' for h in news_headlines[:7])}

PORTFOLIO: Capital ${portfolio.get('capital', 0):,.2f}, Cash ${portfolio.get('cash', 0):,.2f}

Respond ONLY with JSON (no markdown):
{{
  "market_recap": "2-3 sentence crypto market recap",
  "why_trades": "Why trades were/weren't taken (confluence, missing conditions)",
  "strategies_analysis": "Which of A-F strategies worked and why",
  "big_news": ["top 3 news items with 1-line analysis"],
  "sentiment_analysis": "Fear & Greed + funding rate interpretation",
  "tomorrow_outlook": "What to watch in the next 24h",
  "risk_notes": "Risk warnings",
  "grade": "A/B/C/D/F grade for today"
}}"""

                loop = asyncio.get_event_loop()

                def _call_ai():
                    resp = self._ai_client.messages.create(
                        model="claude-sonnet-4-20250514",
                        max_tokens=800,
                        messages=[{"role": "user", "content": prompt}],
                    )
                    text = resp.content[0].text.strip()
                    if text.startswith("```"):
                        text = text.split("```")[1]
                        if text.startswith("json"):
                            text = text[4:]
                        text = text.strip()
                    return json.loads(text)

                ai_result = await loop.run_in_executor(executor, _call_ai)
                base_summary["ai_analysis"] = ai_result
                logger.info(f"🪙📊 AI crypto summary: Grade {ai_result.get('grade','?')}")
            except Exception as e:
                logger.warning(f"Crypto AI summary failed: {e}")
                base_summary["ai_analysis"] = self._fallback_summary(
                    market_sentiment, trades_taken, news_headlines, portfolio, fng_value, fng_label
                )
        else:
            base_summary["ai_analysis"] = self._fallback_summary(
                market_sentiment, trades_taken, news_headlines, portfolio, fng_value, fng_label
            )

        return base_summary

    def _fallback_summary(self, sentiment, trades, news, portfolio, fng_val, fng_label) -> dict:
        return {
            "market_recap": f"Crypto sentiment {sentiment}. F&G {fng_val} ({fng_label}). "
                           f"{len(trades)} trades. P&L ${portfolio.get('today_pnl', 0):.2f}.",
            "why_trades": "Trades driven by confluence across 6 strategies." if trades
                         else "No coins reached the minimum confluence threshold today.",
            "strategies_analysis": "Enable Claude AI for detailed analysis.",
            "big_news": news[:3] if news else ["No news captured."],
            "sentiment_analysis": f"F&G {fng_val} ({fng_label}) — "
                                 f"{'contrarian buy zone' if isinstance(fng_val, int) and fng_val <= 25 else 'neutral/greed zone'}.",
            "tomorrow_outlook": "Monitor BTC dominance and funding rates for altseason rotation.",
            "risk_notes": "Crypto is 24/7 — positions stay open across your sleep cycle.",
            "grade": "N/A",
        }

    # ── Helpers ──────────────────────────────────────────────────────

    def _hold_minutes(self, entry_time_str: Optional[str]) -> int:
        if not entry_time_str:
            return 0
        try:
            t = datetime.fromisoformat(entry_time_str)
            return int((datetime.now() - t).total_seconds() / 60)
        except Exception:
            return 0

    def _snapshot(self, coin: dict) -> dict:
        ind = coin.get("indicators", {})
        news_info = self._get_coin_news(coin.get("symbol", ""))
        return {
            "price": coin.get("price"),
            "change_percent": coin.get("change_percent"),
            "change_24h_pct": coin.get("change_24h_pct"),
            "score": coin.get("score"),
            "signal": coin.get("signal"),
            "votes": coin.get("votes"),
            # 12 indicators
            "rsi": ind.get("rsi", {}).get("value"),
            "macd_vote": ind.get("macd", {}).get("vote"),
            "macd_histogram": ind.get("macd", {}).get("histogram"),
            "supertrend": ind.get("supertrend", {}).get("direction"),
            "ema_align": ind.get("ema_crossover", {}).get("alignment"),
            "adx": ind.get("adx", {}).get("adx"),
            "adx_trend": ind.get("adx", {}).get("trend_strength"),
            "bb_pct": ind.get("bollinger", {}).get("pct_b"),
            "stochastic_k": ind.get("stochastic", {}).get("k"),
            "stochastic_d": ind.get("stochastic", {}).get("d"),
            "volume_spike": ind.get("volume", {}).get("spike"),
            "volume_ratio": ind.get("volume", {}).get("ratio"),
            "vwap_vote": ind.get("vwap", {}).get("vote"),
            "obv_trend": ind.get("obv", {}).get("trend"),
            # Crypto-specific context
            "news_dominant": news_info.get("dominant"),
            "news_count": news_info.get("count"),
            "news_headlines": news_info.get("headlines", [])[:2],
            "market_sentiment": self._cached_sentiment.get("sentiment"),
            "fear_greed": self._cached_market_overview.get("fear_greed_value"),
            "fear_greed_label": self._cached_market_overview.get("fear_greed_label"),
            "btc_dominance": self._cached_market_overview.get("btc_dominance"),
            "altseason": self._cached_market_overview.get("altseason"),
            "snapshot_time": datetime.now().isoformat(),
        }

    def get_status(self) -> dict:
        portfolio = get_portfolio()
        positions = get_open_positions()
        stats = get_portfolio_stats()
        risk = self._check_risk_limits()

        return {
            "enabled": True,
            "running": self.running,
            "test_mode": self.config.get("test_mode", True),
            "scan_count": self.scan_count,
            "last_scan": self.last_scan.isoformat() if self.last_scan else None,
            "positions": positions,
            "pending_signals": self.last_scan_data.get("pending_signals", []),
            "capital": portfolio.get("capital", 0),
            "cash_available": round(portfolio.get("cash", 0), 2),
            "today_pnl": portfolio.get("today_pnl", 0),
            "total_pnl": portfolio.get("total_pnl", 0),
            "portfolio_heat": risk.get("portfolio_heat", 0),
            "stats": stats,
            "risk_status": risk,
            "intelligence": {
                "news_articles": len(self._cached_news),
                "market_sentiment": self._cached_sentiment.get("sentiment", "N/A"),
                "news_last_updated": (
                    self._cached_news_time.isoformat() if self._cached_news_time else None
                ),
                "ai_enabled": self._ai_client is not None and self.config.get("use_ai_confirmation", True),
                "indicators_active": 12,
                "investor_perspectives": 8,
                "market_overview": self._cached_market_overview,
            },
            "strategy_config": {
                "active_strategies": self.config.get("active_strategies", ["A", "B", "C", "D", "E", "F"]),
                "strategy_mode": "ANY_TRIGGERS",
                "strategy_min_scores": self.config.get("strategy_min_scores", {}),
            },
            "strategy_performance": self._get_strategy_performance_summary(),
            "scan_interval_seconds": self.config.get("scan_interval_seconds", 120),
        }

    def _get_strategy_performance_summary(self) -> dict:
        try:
            perf = get_strategy_performance()
            return {k: v for k, v in perf.items() if not k.startswith("_")}
        except Exception:
            return {}

"""
AUTO TRADER ENGINE — The Emotionless Master Trader (ULTIMATE)
==============================================================
No human emotions. Pure intelligence. Patient. Precise.
Uses EVERY available intelligence source:

 1. 12 Technical Indicators (RSI, MACD, Bollinger, EMA, Supertrend, ADX,
    Stochastic, VWAP, Volume, OBV, ATR)
 2. 5 Legendary Investor Perspectives (Jhunjhunwala, Buffett, Burry, Wood, Lynch)
 3. Live News Sentiment (Moneycontrol, ET, NewsAPI)
 4. Claude AI Final Confirmation (for high-confluence trades)

Confluence scoring: 0-110 across 9 factors.
Only trades when confluence >= 75/110.

Risk management: position sizing, trailing stops, portfolio heat,
daily circuit breaker, time-based exits.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timedelta
from typing import Optional, List
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from market_engine import fetch_all_stocks
from investor_perspectives import analyze_through_investor_lenses
from news_engine import get_market_news, classify_sentiment, match_stocks_in_headline, get_overall_sentiment, fetch_fii_dii_data
from auto_store import (
    load_auto_config, get_portfolio, add_position, close_position,
    update_trailing_stop, update_position_prices, get_open_positions,
    log_trade_decision, save_scan_result, save_daily_summary,
    reset_daily_pnl, get_portfolio_stats,
    get_strategy_performance, record_strategy_trade, log_strategy_trade_detail,
)
from smc_engine import analyze_smc

logger = logging.getLogger(__name__)
executor = ThreadPoolExecutor(max_workers=3)


def _get_anthropic_client():
    """Get Anthropic client for Claude AI confirmation."""
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
        logger.warning(f"Could not init Anthropic client: {e}")
    return None


class AutoTrader:
    """The ULTIMATE Master — uses ALL intelligence to trade."""

    def __init__(self, config: dict):
        self.config = config
        self.running = False
        self.last_scan: Optional[datetime] = None
        self.scan_count = 0
        self.last_scan_data: dict = {}
        self._task: Optional[asyncio.Task] = None
        # Cached intelligence from latest scan
        self._cached_news: List[dict] = []
        self._cached_news_time: Optional[datetime] = None
        self._cached_sentiment: dict = {}
        self._ai_client = _get_anthropic_client()

    async def start(self):
        self.running = True
        self.scan_count = 0
        reset_daily_pnl()
        logger.info("🤖 AUTO TRADER ACTIVATED — The Master is watching...")
        self._task = asyncio.ensure_future(self._scan_loop())

    async def stop(self):
        self.running = False
        if self._task:
            self._task.cancel()
        # End of day: close all positions and save summary
        await self._force_close_all("End of day / Auto trader stopped")
        ai_summary = await self._generate_daily_summary()
        save_daily_summary(ai_summary)
        logger.info("🤖 AUTO TRADER STOPPED — Master rests.")

    async def _scan_loop(self):
        """Main loop: scan every N seconds during market hours."""
        interval = self.config.get("scan_interval_seconds", 150)
        while self.running:
            try:
                if self._is_market_hours():
                    await self.scan_cycle()
                elif self._is_after_close():
                    # Market closed — stop for the day
                    await self._force_close_all("Market closed — force exit")
                    ai_summary = await self._generate_daily_summary()
                    save_daily_summary(ai_summary)
                    logger.info("🤖 Market closed. Daily summary saved. Sleeping until tomorrow.")
                    self.running = False
                    break
                else:
                    logger.info("🤖 Waiting for market open...")

                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"🤖 Scan error: {e}", exc_info=True)
                await asyncio.sleep(30)

    async def scan_cycle(self):
        """One full scan: fetch data + news, evaluate entries, check exits."""
        start_time = time.time()
        self.scan_count += 1
        logger.info(f"🤖 Scan #{self.scan_count} starting — FULL INTELLIGENCE MODE...")

        try:
            loop = asyncio.get_event_loop()

            # 1. Fetch all stocks with indicators (in thread pool)
            all_stocks = await loop.run_in_executor(executor, fetch_all_stocks)

            if not all_stocks:
                logger.warning("🤖 No stock data received, skipping scan")
                return

            # 2. Fetch fresh news (every 5 minutes max to avoid rate limits)
            await self._refresh_news()

            # 3. Update current prices for open positions
            prices = {s["symbol"]: s["price"] for s in all_stocks if s.get("price")}
            update_position_prices(prices)

            # 4. Check exits for open positions FIRST (before entries)
            await self._check_exits(all_stocks)

            # 5. Risk check — can we take new trades?
            risk = self._check_risk_limits()

            # 6. Evaluate entries — INDEPENDENT STRATEGY MODE
            # ANY strategy firing = take the trade (no more ALL_REQUIRED)
            pending_signals = []
            entries_made = 0

            if risk["can_trade"]:
                for stock in all_stocks:
                    strategy_results = await self._evaluate_all_strategies(stock)
                    if not strategy_results:
                        continue

                    # Collect ALL strategies that fire (for combo tracking)
                    fired = sorted([sid for sid, r in strategy_results.items() if r["fires"]])
                    all_scores = {sid: r["score"] for sid, r in strategy_results.items()}

                    if fired:
                        # Combo key: "A", "B", "A+B", "A+B+C", etc.
                        combo_key = "+".join(fired)

                        # Best single strategy (highest score) drives entry logic
                        best_id = max(fired, key=lambda sid: strategy_results[sid]["score"])
                        best = strategy_results[best_id]
                        best_score = best["score"]

                        # Merge reasons from ALL firing strategies
                        all_reasons = []
                        for sid in fired:
                            all_reasons.extend(strategy_results[sid]["reasons"])

                        # Combo name for display
                        combo_name = " + ".join(
                            strategy_results[sid]["name"] for sid in fired
                        )
                        combo_emoji = "".join(strategy_results[sid]["emoji"] for sid in fired)

                        entry_analysis = {
                            "confluence": best_score,
                            "reasons": all_reasons,
                            "missing": best["missing"],
                            "strategy_id": best_id,
                            "strategy_key": combo_key,      # e.g. "A+B"
                            "strategy_name": combo_name,    # e.g. "Momentum + Reversal"
                            "strategy_emoji": combo_emoji,
                            "strategies_confirmed": fired,
                            "strategy_scores": all_scores,
                        }

                        # AI confirmation for high-score trades (score >= 80)
                        ai_reasoning = "N/A"
                        if best_score >= 80 and self.config.get("use_ai_confirmation", True):
                            try:
                                ai_result = await self._get_ai_confirmation(stock, entry_analysis)
                                if not ai_result.get("confirmed", True):
                                    ai_reasoning = ai_result.get("reasoning", "Rejected")
                                    pending_signals.append({
                                        "symbol": stock["symbol"],
                                        "name": stock.get("name", ""),
                                        "price": stock.get("price", 0),
                                        "confluence_score": best_score,
                                        "strategy_id": best_id,
                                        "strategy_key": combo_key,
                                        "strategy_name": combo_name,
                                        "missing": [f"AI rejected: {ai_reasoning}"],
                                        "met_conditions": all_reasons[:4],
                                        "strategy_scores": all_scores,
                                        "strategies_confirmed": fired,
                                    })
                                    continue
                                ai_reasoning = ai_result.get("reasoning", "Approved")
                            except Exception as e:
                                logger.warning(f"AI confirmation error for {stock['symbol']}: {e}")

                        # EXECUTE PAPER TRADE
                        trade = self._execute_entry(stock, entry_analysis)
                        if trade:
                            entries_made += 1
                            log_trade_decision({
                                "action": "ENTER",
                                "symbol": stock["symbol"],
                                "name": stock.get("name", ""),
                                "confluence_score": best_score,
                                "entry_price": trade["entry_price"],
                                "stop_loss": trade["stop_loss"],
                                "target_1": trade["target_1"],
                                "shares": trade["shares"],
                                "reasoning": all_reasons,
                                "ai_confirmation": ai_reasoning,
                                "strategy_key": combo_key,
                                "strategy_name": combo_name,
                                "strategy_scores": all_scores,
                                "strategies_confirmed": fired,
                                "indicator_snapshot": self._snapshot(stock),
                            })
                            logger.info(
                                f"🤖{combo_emoji} TRADE [{combo_key}] {combo_name} fired on "
                                f"{stock['symbol']} @ ₹{stock.get('price',0):.0f} | Score: {best_score}/100"
                            )

                    else:
                        # No strategy fires — check watchlist (getting close)
                        best_near = max(
                            strategy_results.items(),
                            key=lambda x: x[1]["score"],
                            default=(None, {"score": 0})
                        )
                        near_id, near_res = best_near
                        if near_id and near_res["score"] >= 35:
                            pending_signals.append({
                                "symbol": stock["symbol"],
                                "name": stock.get("name", ""),
                                "price": stock.get("price", 0),
                                "confluence_score": near_res["score"],
                                "strategy_id": near_id,
                                "strategy_key": near_id,
                                "strategy_name": near_res["name"],
                                "missing": near_res["missing"][:3],
                                "met_conditions": near_res["reasons"][:4],
                                "strategy_scores": all_scores,
                                "strategies_confirmed": [],
                            })

            # 7. Save scan result
            elapsed = round(time.time() - start_time, 1)
            portfolio = get_portfolio()
            save_scan_result({
                "scan_number": self.scan_count,
                "stocks_scanned": len(all_stocks),
                "entries_made": entries_made,
                "open_positions": len(get_open_positions()),
                "pending_signals": pending_signals[:10],
                "risk_status": risk,
                "elapsed_seconds": elapsed,
                "today_pnl": portfolio.get("today_pnl", 0),
                "news_count": len(self._cached_news),
                "market_sentiment": self._cached_sentiment.get("sentiment", "N/A"),
            })

            self.last_scan = datetime.now()
            self.last_scan_data = {
                "pending_signals": pending_signals[:10],
                "scan_count": self.scan_count,
                "entries_made": entries_made,
                "news_sentiment": self._cached_sentiment.get("sentiment", "N/A"),
            }

            logger.info(
                f"🤖 Scan #{self.scan_count} done in {elapsed}s — "
                f"{entries_made} entries, {len(get_open_positions())} open positions, "
                f"{len(pending_signals)} watching | "
                f"News: {self._cached_sentiment.get('sentiment', 'N/A')} "
                f"({len(self._cached_news)} articles)"
            )

        except Exception as e:
            logger.error(f"🤖 Scan cycle error: {e}", exc_info=True)

    # ── NEWS INTELLIGENCE ─────────────────────────────────────────────────

    async def _refresh_news(self):
        """Fetch fresh news every 5 minutes."""
        now = datetime.now()
        if self._cached_news_time and (now - self._cached_news_time).total_seconds() < 300:
            return  # Use cached news
        try:
            self._cached_news = await get_market_news()
            self._cached_sentiment = get_overall_sentiment(self._cached_news)
            self._cached_news_time = now
            logger.info(
                f"🤖📰 News refreshed: {len(self._cached_news)} articles, "
                f"Sentiment: {self._cached_sentiment.get('sentiment', 'N/A')}"
            )
        except Exception as e:
            logger.warning(f"🤖 News fetch failed: {e}")

    def _get_stock_news_sentiment(self, symbol: str) -> dict:
        """Get news sentiment for a specific stock."""
        if not self._cached_news:
            return {"sentiment": "NEUTRAL", "bullish": 0, "bearish": 0, "headlines": []}

        symbol_clean = symbol.replace(".NS", "").upper()
        stock_news = []
        for n in self._cached_news:
            affected = n.get("affected_stocks", [])
            headline = n.get("headline", "")
            # Direct match or keyword in headline
            if symbol in affected or symbol_clean in headline.upper():
                stock_news.append(n)

        if not stock_news:
            # Check sector-level sentiment as fallback
            return {
                "sentiment": self._cached_sentiment.get("sentiment", "NEUTRAL"),
                "bullish": 0, "bearish": 0,
                "headlines": [],
                "market_level": True,
            }

        bull = sum(1 for n in stock_news if n.get("sentiment") == "BULLISH")
        bear = sum(1 for n in stock_news if n.get("sentiment") == "BEARISH")

        if bull > bear:
            sent = "BULLISH"
        elif bear > bull:
            sent = "BEARISH"
        else:
            sent = "NEUTRAL"

        return {
            "sentiment": sent,
            "bullish": bull,
            "bearish": bear,
            "headlines": [n.get("headline", "") for n in stock_news[:3]],
            "market_level": False,
        }

    # ── CLAUDE AI CONFIRMATION ────────────────────────────────────────────

    async def _get_ai_confirmation(self, stock: dict, analysis: dict) -> dict:
        """Ask Claude AI to confirm/reject a high-confluence trade.
        Only called for confluence >= 85 to save API credits."""
        if not self._ai_client:
            return {"confirmed": True, "reasoning": "AI unavailable — proceeding on indicators"}

        try:
            ind = stock.get("indicators", {})
            news_info = self._get_stock_news_sentiment(stock["symbol"])

            prompt = f"""You are a RISK MANAGER for an automated paper trading system.
A trade has scored {analysis['confluence']}/110 confluence. Review and APPROVE or REJECT.

STOCK: {stock.get('name', '')} ({stock['symbol']})
PRICE: ₹{stock.get('price', 0):.2f}
CHANGE: {stock.get('change_percent', 0):.2f}%

CONFLUENCE REASONS (why system wants to buy):
{json.dumps(analysis['reasons'], indent=2)}

MISSING CONDITIONS:
{json.dumps(analysis.get('missing', []), indent=2)}

KEY INDICATORS:
- RSI: {ind.get('rsi', {}).get('value', 'N/A')}
- MACD: {ind.get('macd', {}).get('vote', 'N/A')}
- Supertrend: {ind.get('supertrend', {}).get('direction', 'N/A')}
- ADX: {ind.get('adx', {}).get('adx', 'N/A')}
- Volume Spike: {ind.get('volume', {}).get('spike', 'N/A')}

NEWS SENTIMENT: {news_info.get('sentiment', 'N/A')}
NEWS HEADLINES: {json.dumps(news_info.get('headlines', [])[:3])}

MARKET SENTIMENT: {self._cached_sentiment.get('sentiment', 'N/A')}

Respond ONLY with JSON: {{"confirmed": true/false, "reasoning": "one sentence why"}}"""

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
            logger.info(f"🤖🧠 AI review for {stock['symbol']}: {'✅ APPROVED' if result.get('confirmed') else '❌ REJECTED'} — {result.get('reasoning', '')}")
            return result

        except Exception as e:
            logger.warning(f"🤖 AI confirmation failed: {e} — proceeding with trade")
            return {"confirmed": True, "reasoning": f"AI error: {e} — proceeding on indicators"}

    # ── 4 INDEPENDENT STRATEGIES ──────────────────────────────────────────
    # Each strategy fires on its own. ANY one passing = trade taken.
    #
    #  A — Momentum Breakout   : RSI building + MACD BUY + Volume spike + Supertrend UP
    #  B — Oversold Reversal   : RSI < 38 + BB lower band + Stochastic oversold
    #  C — Trend Rider         : ADX > 25 + EMA aligned + Supertrend + OBV rising
    #  D — News + Smart Money  : Bullish stock news + Investor consensus + Volume
    # ─────────────────────────────────────────────────────────────────────

    STRATEGY_META = {
        "A": {"name": "Momentum Breakout",  "emoji": "🚀", "min_score": 45, "color": "green"},
        "B": {"name": "Oversold Reversal",  "emoji": "📉", "min_score": 40, "color": "blue"},
        "C": {"name": "Trend Rider",        "emoji": "🏄", "min_score": 45, "color": "yellow"},
        "D": {"name": "News Catalyst",      "emoji": "📰", "min_score": 35, "color": "purple"},
        "E": {"name": "SMC / ICT",          "emoji": "🧠", "min_score": 50, "color": "red"},
    }

    async def _evaluate_all_strategies(self, stock: dict) -> Optional[dict]:
        """
        Evaluate all 4 strategies INDEPENDENTLY.
        Returns dict of strategy results. Any strategy that fires (score >= min) triggers a trade.
        Only the BEST scoring strategy is used if multiple fire on the same stock.
        """
        ind = stock.get("indicators", {})
        if not ind:
            return None
        symbol = stock.get("symbol", "")

        # Skip if already holding this stock
        for pos in get_open_positions():
            if pos["symbol"] == symbol:
                return None

        active = self.config.get("active_strategies", ["A", "B", "C", "D"])
        # Dynamic min scores — read from config, fall back to STRATEGY_META defaults
        min_scores = self.config.get("strategy_min_scores", {})
        results = {}

        if "A" in active:
            score, reasons, missing = self._score_strategy_A(stock, ind)
            threshold = min_scores.get("A", self.STRATEGY_META["A"]["min_score"])
            fires = score >= threshold
            results["A"] = {"score": score, "fires": fires, "reasons": reasons, "missing": missing,
                            "name": "Momentum Breakout", "emoji": "🚀", "threshold": threshold}

        if "B" in active:
            score, reasons, missing = self._score_strategy_B(stock, ind)
            threshold = min_scores.get("B", self.STRATEGY_META["B"]["min_score"])
            fires = score >= threshold
            results["B"] = {"score": score, "fires": fires, "reasons": reasons, "missing": missing,
                            "name": "Oversold Reversal", "emoji": "📉", "threshold": threshold}

        if "C" in active:
            score, reasons, missing = self._score_strategy_C(stock, ind)
            threshold = min_scores.get("C", self.STRATEGY_META["C"]["min_score"])
            fires = score >= threshold
            results["C"] = {"score": score, "fires": fires, "reasons": reasons, "missing": missing,
                            "name": "Trend Rider", "emoji": "🏄", "threshold": threshold}

        if "D" in active:
            score, reasons, missing = self._score_strategy_D(stock, ind, symbol)
            threshold = min_scores.get("D", self.STRATEGY_META["D"]["min_score"])
            fires = score >= threshold
            results["D"] = {"score": score, "fires": fires, "reasons": reasons, "missing": missing,
                            "name": "News Catalyst", "emoji": "📰", "threshold": threshold}

        if "E" in active:
            score, reasons, missing = await self._score_strategy_E(symbol, stock.get("price", 0))
            threshold = min_scores.get("E", self.STRATEGY_META["E"]["min_score"])
            fires = score >= threshold
            results["E"] = {"score": score, "fires": fires, "reasons": reasons, "missing": missing,
                            "name": "SMC / ICT", "emoji": "🧠", "threshold": threshold}

        return results if results else None

    async def _score_strategy_E(self, symbol: str, current_price: float) -> tuple:
        """
        Strategy E — SMC / ICT (Smart Money Concepts)
        Looks for: Bullish market structure (HH+HL) + Price at Order Block +
                   Fair Value Gap pull-back + Discount zone + BOS/CHoCH signal
        Uses 15-minute candles for intraday precision.
        Score: 0-100
        """
        try:
            from smc_engine import analyze_smc
            loop = asyncio.get_event_loop()
            smc = await loop.run_in_executor(executor, lambda: analyze_smc(symbol, current_price))
        except Exception as e:
            return 0, [], [f"[E] SMC data unavailable: {e}"]

        if not smc.get("available", True) or smc.get("smc_score", 0) == 0:
            if not smc.get("available"):
                return 0, [], ["[E] Not enough 15m candle data for SMC"]

        raw_score = smc.get("smc_score", 0)
        raw_reasons = [f"[E] {r}" for r in smc.get("reasons", [])]
        raw_missing = [f"[E] {m}" for m in smc.get("missing", [])]

        return max(0, min(100, raw_score)), raw_reasons, raw_missing

    def _score_strategy_A(self, stock: dict, ind: dict) -> tuple:
        """
        Strategy A — MOMENTUM BREAKOUT
        Looks for: RSI building momentum (50-68) + MACD bullish cross +
                   Volume spike confirming breakout + Supertrend/VWAP bullish
        Score: 0-100
        """
        score = 0
        reasons = []
        missing = []

        rsi = ind.get("rsi", {}).get("value", 50)
        macd_vote = ind.get("macd", {}).get("vote", "NEUTRAL")
        supertrend = ind.get("supertrend", {}).get("direction", "")
        ema_align = ind.get("ema_crossover", {}).get("alignment", "NEUTRAL")
        vwap_vote = ind.get("vwap", {}).get("vote", "NEUTRAL")
        vol_spike = ind.get("volume", {}).get("spike", False)
        vol_ratio = ind.get("volume", {}).get("ratio", 1.0)
        adx_val = ind.get("adx", {}).get("adx", 0)
        votes = stock.get("votes", {})
        buy_votes = votes.get("BUY", 0)

        # RSI in momentum zone (not overbought, building steam) — 30 pts
        if 50 <= rsi <= 65:
            score += 30; reasons.append(f"[A] RSI {rsi:.0f} — momentum building")
        elif 45 <= rsi < 50:
            score += 15; reasons.append(f"[A] RSI {rsi:.0f} — approaching momentum zone")
        elif 65 < rsi <= 72:
            score += 10; reasons.append(f"[A] RSI {rsi:.0f} — strong but watch overbought")
        elif rsi > 72:
            score -= 5;  missing.append(f"[A] RSI {rsi:.0f} — overbought, skip")
        else:
            missing.append(f"[A] RSI {rsi:.0f} — below momentum zone")

        # MACD bullish crossover — 25 pts
        if macd_vote == "BUY":
            score += 25; reasons.append("[A] MACD bullish crossover confirmed")
        else:
            missing.append("[A] MACD not bullish yet")

        # Volume spike = institutional participation — 20 pts
        if vol_spike:
            score += 20; reasons.append(f"[A] Volume spike {vol_ratio:.1f}x — breakout confirmed")
        elif vol_ratio >= 1.4:
            score += 10; reasons.append(f"[A] Above-avg volume {vol_ratio:.1f}x")
        elif vol_ratio >= 1.1:
            score += 4;  reasons.append(f"[A] Slight volume pickup {vol_ratio:.1f}x")
        else:
            missing.append(f"[A] Low volume {vol_ratio:.1f}x — weak breakout")

        # Supertrend UP — 15 pts
        if supertrend == "UP":
            score += 15; reasons.append("[A] Supertrend bullish")
        else:
            missing.append("[A] Supertrend not UP")

        # VWAP + EMA alignment — 10 pts
        if vwap_vote == "BUY" or ema_align == "BULLISH":
            score += 10; reasons.append("[A] Price above VWAP / EMA aligned bullish")
        else:
            missing.append("[A] Below VWAP / EMA not aligned")

        # ADX trend strength bonus — up to 5 pts extra
        if adx_val >= 30:
            score += 5; reasons.append(f"[A] Strong trend ADX {adx_val:.0f}")

        # BUY vote bonus
        if buy_votes >= 7:
            score += 5; reasons.append(f"[A] {buy_votes}/12 indicators say BUY")

        return max(0, min(100, score)), reasons, missing

    def _score_strategy_B(self, stock: dict, ind: dict) -> tuple:
        """
        Strategy B — OVERSOLD REVERSAL
        Looks for: RSI deeply oversold (<38) + Bollinger lower band +
                   Stochastic oversold + potential bounce setup
        Score: 0-100
        """
        score = 0
        reasons = []
        missing = []

        rsi = ind.get("rsi", {}).get("value", 50)
        bb_pct = ind.get("bollinger", {}).get("pct_b", 0.5)
        stoch_k = ind.get("stochastic", {}).get("k", 50)
        stoch_d = ind.get("stochastic", {}).get("d", 50)
        macd_vote = ind.get("macd", {}).get("vote", "NEUTRAL")
        vol_ratio = ind.get("volume", {}).get("ratio", 1.0)
        vol_spike = ind.get("volume", {}).get("spike", False)
        obv_trend = ind.get("obv", {}).get("trend", "NEUTRAL")
        supertrend = ind.get("supertrend", {}).get("direction", "")
        votes = stock.get("votes", {})
        buy_votes = votes.get("BUY", 0)

        # RSI oversold — core signal — 35 pts
        if rsi < 25:
            score += 35; reasons.append(f"[B] RSI {rsi:.0f} — EXTREMELY oversold, high bounce potential")
        elif rsi < 30:
            score += 30; reasons.append(f"[B] RSI {rsi:.0f} — deeply oversold")
        elif rsi < 38:
            score += 22; reasons.append(f"[B] RSI {rsi:.0f} — oversold zone")
        elif rsi < 45:
            score += 8;  reasons.append(f"[B] RSI {rsi:.0f} — approaching oversold")
        else:
            missing.append(f"[B] RSI {rsi:.0f} — not oversold (need < 38)")

        # Bollinger Band lower touch — 25 pts
        if bb_pct <= 0.10:
            score += 25; reasons.append(f"[B] At/below Bollinger lower band ({bb_pct:.0%}) — strong reversal zone")
        elif bb_pct <= 0.20:
            score += 18; reasons.append(f"[B] Near Bollinger lower band ({bb_pct:.0%})")
        elif bb_pct <= 0.30:
            score += 8;  reasons.append(f"[B] Approaching lower band ({bb_pct:.0%})")
        else:
            missing.append(f"[B] Not near lower Bollinger band ({bb_pct:.0%})")

        # Stochastic oversold — 20 pts
        if stoch_k is not None and stoch_d is not None:
            if stoch_k < 20 and stoch_d < 20:
                score += 20; reasons.append(f"[B] Stochastic deeply oversold K:{stoch_k:.0f} D:{stoch_d:.0f}")
            elif stoch_k < 25:
                score += 12; reasons.append(f"[B] Stochastic oversold K:{stoch_k:.0f}")
            elif stoch_k < 35:
                score += 5;  reasons.append(f"[B] Stochastic low K:{stoch_k:.0f}")
            else:
                missing.append(f"[B] Stochastic not oversold K:{stoch_k:.0f}")

        # Volume — reversal needs volume — 15 pts
        if vol_spike:
            score += 15; reasons.append(f"[B] Volume spike — reversal candle forming")
        elif vol_ratio >= 1.3:
            score += 7;  reasons.append(f"[B] Elevated volume {vol_ratio:.1f}x")
        else:
            missing.append(f"[B] Low volume {vol_ratio:.1f}x — reversal unconfirmed")

        # MACD starting to cross (early signal) — 5 pts bonus
        if macd_vote == "BUY":
            score += 5; reasons.append("[B] MACD starting bullish cross — reversal confirming")

        # OBV divergence bonus — institutions accumulating
        if obv_trend == "RISING":
            score += 5; reasons.append("[B] OBV rising — smart money accumulating")

        # Supertrend bonus (if flipping from DOWN to UP in oversold = strong)
        if supertrend == "UP" and rsi < 40:
            score += 5; reasons.append("[B] Supertrend flipped UP while oversold — strong reversal")

        return max(0, min(100, score)), reasons, missing

    def _score_strategy_C(self, stock: dict, ind: dict) -> tuple:
        """
        Strategy C — TREND RIDER
        Looks for: Strong confirmed trend (ADX > 25) + all trend indicators aligned +
                   Institutional participation (OBV + Volume) + Price above VWAP
        Score: 0-100
        """
        score = 0
        reasons = []
        missing = []

        rsi = ind.get("rsi", {}).get("value", 50)
        adx_val = ind.get("adx", {}).get("adx", 0)
        adx_trend = ind.get("adx", {}).get("trend_strength", "")
        supertrend = ind.get("supertrend", {}).get("direction", "")
        ema_align = ind.get("ema_crossover", {}).get("alignment", "NEUTRAL")
        vwap_vote = ind.get("vwap", {}).get("vote", "NEUTRAL")
        obv_trend = ind.get("obv", {}).get("trend", "NEUTRAL")
        vol_ratio = ind.get("volume", {}).get("ratio", 1.0)
        vol_spike = ind.get("volume", {}).get("spike", False)
        macd_vote = ind.get("macd", {}).get("vote", "NEUTRAL")

        # ADX — trend strength is THE core of this strategy — 30 pts
        if adx_val >= 40:
            score += 30; reasons.append(f"[C] ADX {adx_val:.0f} — VERY strong trend")
        elif adx_val >= 30:
            score += 22; reasons.append(f"[C] ADX {adx_val:.0f} — strong trend")
        elif adx_val >= 25:
            score += 14; reasons.append(f"[C] ADX {adx_val:.0f} — confirmed trend")
        elif adx_val >= 20:
            score += 5;  reasons.append(f"[C] ADX {adx_val:.0f} — developing trend")
        else:
            missing.append(f"[C] ADX {adx_val:.0f} — no clear trend (need > 25)")

        # Supertrend + EMA both bullish — 25 pts
        if supertrend == "UP" and ema_align == "BULLISH":
            score += 25; reasons.append("[C] Supertrend UP + EMA perfectly aligned bullish")
        elif supertrend == "UP":
            score += 15; reasons.append("[C] Supertrend UP (EMA not fully aligned)")
        elif ema_align == "BULLISH":
            score += 10; reasons.append("[C] EMA aligned bullish")
        else:
            missing.append("[C] No trend alignment — Supertrend/EMA not bullish")

        # OBV rising = institutional accumulation — 20 pts
        if obv_trend == "RISING":
            score += 20; reasons.append("[C] OBV rising — institutional accumulation confirmed")
        elif obv_trend == "NEUTRAL":
            score += 5;  reasons.append("[C] OBV neutral")
        else:
            missing.append("[C] OBV declining — smart money exiting")

        # VWAP + RSI in healthy range — 15 pts
        if vwap_vote == "BUY" and 45 <= rsi <= 68:
            score += 15; reasons.append(f"[C] Above VWAP, RSI {rsi:.0f} — healthy trend")
        elif vwap_vote == "BUY":
            score += 8;  reasons.append(f"[C] Above VWAP, RSI {rsi:.0f}")
        else:
            missing.append(f"[C] Below VWAP or RSI {rsi:.0f} unfavorable")

        # MACD confirms trend direction — 10 pts
        if macd_vote == "BUY":
            score += 10; reasons.append("[C] MACD confirms bullish trend")
        else:
            missing.append("[C] MACD not confirming trend")

        # Volume confirms institutional trend — bonus
        if vol_spike or vol_ratio >= 1.3:
            score += 5; reasons.append(f"[C] Volume {vol_ratio:.1f}x confirms trend move")

        return max(0, min(100, score)), reasons, missing

    def _score_strategy_D(self, stock: dict, ind: dict, symbol: str) -> tuple:
        """
        Strategy D — NEWS CATALYST
        Looks for: Stock-specific bullish news + Legendary investor consensus +
                   Volume spike (news-driven) + Basic technical not bearish
        Score: 0-100
        """
        score = 0
        reasons = []
        missing = []

        rsi = ind.get("rsi", {}).get("value", 50)
        macd_vote = ind.get("macd", {}).get("vote", "NEUTRAL")
        vol_spike = ind.get("volume", {}).get("spike", False)
        vol_ratio = ind.get("volume", {}).get("ratio", 1.0)
        supertrend = ind.get("supertrend", {}).get("direction", "")

        # ── News sentiment (stock-specific) — 40 pts ──
        news_data = self._get_stock_news_sentiment(symbol)
        news_sent = news_data.get("sentiment", "NEUTRAL")
        is_specific = not news_data.get("market_level", True)

        if is_specific and news_sent == "BULLISH":
            bull_count = news_data.get("bullish", 1)
            headlines = news_data.get("headlines", [])
            pts = min(40, 25 + bull_count * 5)
            score += pts
            h = headlines[0][:60] if headlines else "bullish news"
            reasons.append(f"[D] Stock-specific bullish news ({bull_count} articles): {h}")
        elif not is_specific and news_sent == "BULLISH":
            score += 12; reasons.append("[D] Bullish market-wide sentiment")
        elif is_specific and news_sent == "BEARISH":
            score -= 20; missing.append("[D] Bearish stock-specific news — avoid")
        elif news_sent == "BEARISH":
            score -= 8;  missing.append("[D] Bearish market sentiment")
        else:
            missing.append("[D] No significant news catalyst")

        # ── Investor Perspectives (legendary investors agree) — 30 pts ──
        try:
            from investor_perspectives import analyze_through_investor_lenses
            investor_data = analyze_through_investor_lenses(stock, ind)
            bullish_count = investor_data.get("consensus", {}).get("bullish_count", 0)
            key_insight = investor_data.get("consensus", {}).get("key_insight", "")

            if bullish_count >= 5:
                score += 30; reasons.append(f"[D] All 5 legendary investors bullish! {key_insight}")
            elif bullish_count >= 4:
                score += 22; reasons.append(f"[D] {bullish_count}/5 investors bullish: {key_insight}")
            elif bullish_count >= 3:
                score += 14; reasons.append(f"[D] {bullish_count}/5 investors bullish")
            elif bullish_count >= 2:
                score += 6;  reasons.append(f"[D] {bullish_count}/5 investors see potential")
            else:
                missing.append(f"[D] Only {bullish_count}/5 investors bullish")
        except Exception:
            missing.append("[D] Could not compute investor perspectives")

        # ── Volume spike = news is moving the stock — 20 pts ──
        if vol_spike:
            score += 20; reasons.append(f"[D] Volume spike {vol_ratio:.1f}x — news is moving the stock!")
        elif vol_ratio >= 1.5:
            score += 10; reasons.append(f"[D] Elevated volume {vol_ratio:.1f}x on news")
        elif vol_ratio >= 1.2:
            score += 4;  reasons.append(f"[D] Slightly elevated volume {vol_ratio:.1f}x")
        else:
            missing.append(f"[D] Volume {vol_ratio:.1f}x — news not confirmed by volume")

        # ── Basic technical gate — 10 pts ──
        # Don't buy into overbought on news (gap-up trap)
        if rsi <= 68 and macd_vote != "SELL":
            score += 10; reasons.append(f"[D] Technical gate OK — RSI {rsi:.0f}, MACD not bearish")
        elif rsi > 75:
            score -= 10; missing.append(f"[D] RSI {rsi:.0f} overbought — news already priced in")

        # Supertrend bonus
        if supertrend == "UP":
            score += 5; reasons.append("[D] Supertrend UP — news aligned with trend")

        return max(0, min(100, score)), reasons, missing

    def _score_investor_perspectives(self, stock: dict, ind: dict) -> tuple:
        """Legacy method — used for backward compat. Use _score_strategy_D instead."""
        reasons = []
        missing = []
        investor_data = {}
        try:
            from investor_perspectives import analyze_through_investor_lenses
            data = analyze_through_investor_lenses(stock, ind)
            bullish = data.get("consensus", {}).get("bullish_count", 0)
            investor_data = {
                "bullish_count": bullish,
                "key_insight": data.get("consensus", {}).get("key_insight", ""),
                "perspectives": [
                    {"investor": p["investor"], "signal": p["signal"]}
                    for p in data.get("investor_perspectives", [])
                ],
            }
            if bullish >= 4:   reasons.append(f"[B] Strong investor consensus: {bullish}/5 bullish")
            elif bullish >= 3: reasons.append(f"[B] Good investor consensus: {bullish}/5 bullish")
            elif bullish >= 2: reasons.append(f"[B] Mixed: {bullish}/5 bullish")
            else:              missing.append(f"[B] Weak investor consensus: {bullish}/5 bullish")
            return bullish, reasons, missing, investor_data
        except Exception:
            missing.append("[B] Could not compute investor perspectives")
            return 0, reasons, missing, investor_data

    def _score_news(self, symbol: str) -> tuple:
        """Strategy C: News sentiment score. Returns (score 0-10, reasons, missing, sentiment)."""
        reasons = []
        missing = []
        news_data = self._get_stock_news_sentiment(symbol)
        news_sent = news_data.get("sentiment", "NEUTRAL")
        is_specific = not news_data.get("market_level", True)

        if is_specific:
            if news_sent == "BULLISH":
                headlines = news_data.get("headlines", [])
                score = 10
                reasons.append(f"[C] Bullish stock news ({news_data['bullish']} articles): {headlines[0][:55] if headlines else ''}")
            elif news_sent == "BEARISH":
                score = -10
                missing.append(f"[C] Bearish stock news ({news_data['bearish']} articles)")
            else:
                score = 2; reasons.append("[C] Neutral stock news")
        else:
            if news_sent == "BULLISH":   score = 5;  reasons.append("[C] Bullish market sentiment")
            elif news_sent == "BEARISH": score = -3; missing.append("[C] Bearish market sentiment")
            else:                        score = 0

        return score, reasons, missing, news_sent

    # ── ENTRY LOGIC ────────────────────────────────────────────────────

    def _evaluate_entry(self, stock: dict) -> Optional[dict]:
        """Score a stock for entry. Returns confluence score + reasons."""
        ind = stock.get("indicators", {})
        if not ind:
            return None

        symbol = stock.get("symbol", "")

        # Skip if already holding
        for pos in get_open_positions():
            if pos["symbol"] == symbol:
                return None

        score = 0
        reasons = []
        missing = []

        # 1. Indicator score (max 20 pts)
        stock_score = stock.get("score", 0)
        if stock_score >= 30:
            score += 20
            reasons.append(f"Strong indicator score: {stock_score}")
        elif stock_score >= 20:
            score += 12
            reasons.append(f"Good indicator score: {stock_score}")
        elif stock_score >= 10:
            score += 5
            reasons.append(f"Moderate indicator score: {stock_score}")
        else:
            missing.append(f"Weak indicator score: {stock_score}")

        # 2. Vote consensus (max 15 pts)
        votes = stock.get("votes", {})
        buy_votes = votes.get("BUY", 0)
        total_votes = buy_votes + votes.get("SELL", 0) + votes.get("NEUTRAL", 0)
        if total_votes > 0:
            if buy_votes >= 8:
                score += 15
                reasons.append(f"Strong consensus: {buy_votes}/{total_votes} BUY")
            elif buy_votes >= 7:
                score += 12
                reasons.append(f"Good consensus: {buy_votes}/{total_votes} BUY")
            elif buy_votes >= 6:
                score += 8
                reasons.append(f"Moderate consensus: {buy_votes}/{total_votes} BUY")
            elif buy_votes >= 5:
                score += 5
                reasons.append(f"Slight BUY lean: {buy_votes}/{total_votes} BUY")
            elif buy_votes >= 4:
                score += 3
                reasons.append(f"Weak BUY lean: {buy_votes}/{total_votes} BUY")
            else:
                missing.append(f"No BUY consensus: {buy_votes}/{total_votes} BUY")

        # 3. RSI zone (max 10 pts)
        rsi = ind.get("rsi", {}).get("value", 50)
        if rsi < 30:
            score += 8
            reasons.append(f"RSI deeply oversold: {rsi:.0f} — strong bounce potential")
        elif 30 <= rsi <= 45:
            score += 10
            reasons.append(f"RSI sweet spot (oversold bounce): {rsi:.0f}")
        elif 45 < rsi <= 55:
            score += 7
            reasons.append(f"RSI neutral accumulation zone: {rsi:.0f}")
        elif 55 < rsi <= 65:
            score += 4
            reasons.append(f"RSI rising momentum: {rsi:.0f}")
        elif 65 < rsi <= 75:
            score += 1
            missing.append(f"RSI elevated ({rsi:.0f}) — momentum may slow")
        else:
            score -= 3
            missing.append(f"RSI overbought: {rsi:.0f} — high reversal risk")

        # 4. Supertrend + EMA alignment (max 10 pts)
        supertrend = ind.get("supertrend", {}).get("direction", "")
        ema_align = ind.get("ema_crossover", {}).get("alignment", "")
        if supertrend == "UP" and ema_align == "BULLISH":
            score += 10
            reasons.append("Supertrend UP + EMA Bullish alignment")
        elif supertrend == "UP":
            score += 5
            reasons.append("Supertrend UP")
            missing.append(f"EMA not aligned: {ema_align}")
        elif ema_align == "BULLISH":
            score += 5
            reasons.append("EMA Bullish")
            missing.append("Supertrend not UP")
        else:
            missing.append("No trend alignment")

        # 5. MACD + ADX (max 10 pts)
        macd_vote = ind.get("macd", {}).get("vote", "")
        adx_val = ind.get("adx", {}).get("adx", 0)
        if macd_vote == "BUY" and adx_val > 25:
            score += 10
            reasons.append(f"MACD bullish + ADX strong trend ({adx_val:.0f})")
        elif macd_vote == "BUY":
            score += 5
            reasons.append("MACD bullish crossover")
            missing.append(f"ADX weak: {adx_val:.0f}")
        elif adx_val > 25:
            score += 3
            missing.append("MACD not bullish")
        else:
            missing.append("No MACD/ADX confirmation")

        # 6. Volume confirmation (max 10 pts)
        vol_spike = ind.get("volume", {}).get("spike", False)
        vol_ratio = ind.get("volume", {}).get("ratio", 1.0)
        if vol_spike:
            score += 10
            reasons.append(f"Volume spike confirmed (ratio: {vol_ratio:.1f}x)")
        elif vol_ratio > 1.3:
            score += 5
            reasons.append(f"Above-average volume ({vol_ratio:.1f}x)")
        else:
            missing.append(f"Low volume: {vol_ratio:.1f}x")

        # 7. Investor consensus (max 15 pts)
        investor_summary = {}
        try:
            investor_data = analyze_through_investor_lenses(stock, ind)
            bullish = investor_data.get("consensus", {}).get("bullish_count", 0)
            investor_summary = {
                "bullish_count": bullish,
                "key_insight": investor_data.get("consensus", {}).get("key_insight", ""),
                "perspectives": [
                    {"investor": p["investor"], "signal": p["signal"]}
                    for p in investor_data.get("investor_perspectives", [])
                ],
            }
            if bullish >= 4:
                score += 15
                reasons.append(f"Strong investor consensus: {bullish}/5 bullish")
            elif bullish >= 3:
                score += 10
                reasons.append(f"Good investor consensus: {bullish}/5 bullish")
            elif bullish >= 2:
                score += 5
                reasons.append(f"Mixed investor consensus: {bullish}/5 bullish")
            else:
                missing.append(f"Weak investor consensus: {bullish}/5 bullish")
        except Exception:
            missing.append("Could not compute investor perspectives")

        # 8. Bollinger Band position (bonus pts)
        bb_pct = ind.get("bollinger", {}).get("pct_b", 0.5)
        if bb_pct < 0.2:
            score += 3
            reasons.append(f"Near Bollinger lower band ({bb_pct:.0%})")
        elif bb_pct > 0.8:
            score -= 5
            missing.append(f"Near Bollinger upper band ({bb_pct:.0%}) — risky entry")

        # 9. NEWS SENTIMENT (max 10 pts) — NEW INTELLIGENCE FACTOR
        news_data = self._get_stock_news_sentiment(symbol)
        news_sent = news_data.get("sentiment", "NEUTRAL")
        is_stock_specific = not news_data.get("market_level", True)

        if is_stock_specific:
            # Stock-specific news — stronger signal
            if news_sent == "BULLISH":
                score += 10
                headlines = news_data.get("headlines", [])
                reasons.append(f"📰 Bullish news ({news_data['bullish']} articles): {headlines[0][:60] if headlines else 'positive coverage'}")
            elif news_sent == "BEARISH":
                score -= 10
                headlines = news_data.get("headlines", [])
                missing.append(f"📰 Bearish news ({news_data['bearish']} articles): {headlines[0][:60] if headlines else 'negative coverage'}")
            else:
                reasons.append("📰 Neutral stock news — no headwind")
        else:
            # Market-level sentiment — weaker signal
            if news_sent == "BULLISH":
                score += 5
                reasons.append("📰 Bullish market sentiment (overall)")
            elif news_sent == "BEARISH":
                score -= 3
                missing.append("📰 Bearish market sentiment — trade cautiously")
            # NEUTRAL market = no adjustment

        # Clamp
        score = max(0, min(110, score))

        return {
            "confluence": score,
            "reasons": reasons,
            "missing": missing,
            "news_sentiment": news_sent,
            "investor_data": investor_summary,
        }

    def _execute_entry(self, stock: dict, analysis: dict) -> Optional[dict]:
        """Execute a paper trade entry."""
        price = stock.get("price", 0)
        if price <= 0:
            return None

        stop_loss = stock.get("stop_loss", price * 0.97)
        target_1 = stock.get("target_1", price * 1.03)
        target_2 = stock.get("target_2", price * 1.05)
        atr = stock.get("atr", price * 0.02)

        # Position sizing
        pos_info = self._calculate_position_size(price, stop_loss, analysis["confluence"])
        if pos_info["shares"] <= 0:
            return None

        strategy_key = "+".join(sorted(analysis.get("strategies_confirmed", [])))
        trade = {
            "symbol": stock["symbol"],
            "name": stock.get("name", stock["symbol"]),
            "entry_price": price,
            "shares": pos_info["shares"],
            "capital_deployed": round(price * pos_info["shares"], 2),
            "stop_loss": round(stop_loss, 2),
            "trailing_stop": round(stop_loss, 2),
            "target_1": round(target_1, 2),
            "target_2": round(target_2, 2),
            "target_1_hit": False,
            "partial_exit_done": False,
            "confluence_score": analysis["confluence"],
            "entry_reasoning": analysis["reasons"],
            "atr": round(atr, 2),
            "current_price": price,
            # Strategy attribution
            "strategy_key": strategy_key,
            "strategies_confirmed": analysis.get("strategies_confirmed", []),
            "strategy_scores": analysis.get("strategy_scores", {}),
        }

        added = add_position(trade)
        logger.info(
            f"🤖💰 ENTRY: {stock['symbol']} @ ₹{price} | "
            f"Shares: {pos_info['shares']} | SL: ₹{stop_loss:.0f} | "
            f"T1: ₹{target_1:.0f} | Confluence: {analysis['confluence']}/100"
        )
        return added

    # ── EXIT LOGIC ─────────────────────────────────────────────────────

    async def _check_exits(self, all_stocks: list):
        """Check all open positions for exit signals."""
        positions = get_open_positions()
        if not positions:
            return

        stock_map = {s["symbol"]: s for s in all_stocks}
        now = datetime.now()

        for pos in positions:
            sym = pos["symbol"]
            stock = stock_map.get(sym)
            if not stock:
                continue

            current = stock.get("price", 0)
            if current <= 0:
                continue

            entry = pos["entry_price"]
            trailing_sl = pos.get("trailing_stop", pos["stop_loss"])
            atr = pos.get("atr", entry * 0.02)
            ind = stock.get("indicators", {})

            exit_reason = None
            partial = False

            # 1. Trailing stop hit
            if current <= trailing_sl:
                exit_reason = f"Trailing stop hit @ ₹{trailing_sl:.0f} (current: ₹{current:.0f})"

            # 2. Target 1 hit — partial exit
            elif current >= pos["target_1"] and not pos.get("partial_exit_done"):
                exit_reason = f"Target 1 hit @ ₹{pos['target_1']:.0f}"
                partial = True

            # 3. Target 2 hit — full exit
            elif current >= pos["target_2"]:
                exit_reason = f"Target 2 hit @ ₹{pos['target_2']:.0f}"

            # 4. Reversal signal: MACD flips + RSI overbought
            elif ind:
                macd_vote = ind.get("macd", {}).get("vote", "")
                rsi = ind.get("rsi", {}).get("value", 50)
                if macd_vote == "SELL" and rsi > 65:
                    exit_reason = f"Reversal signal: MACD SELL + RSI {rsi:.0f}"

            # 5. Time-based exit before market close
            close_time = self.config.get("close_positions_time", "15:15")
            h, m = map(int, close_time.split(":"))
            if now.hour > h or (now.hour == h and now.minute >= m):
                exit_reason = f"Time-based exit: approaching market close ({close_time})"

            # 6. Circuit breaker: position loss > 3%
            if current < entry * 0.97:
                pnl_pct = (current / entry - 1) * 100
                if pnl_pct < -3:
                    exit_reason = f"Circuit breaker: position down {pnl_pct:.1f}%"

            if exit_reason:
                pnl = round((current - entry) * pos["shares"], 2)
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
                # Track strategy performance
                strategy_key = pos.get("strategy_key", "")
                if strategy_key:
                    record_strategy_trade(strategy_key, pnl, pnl > 0)
                    log_strategy_trade_detail(sym, strategy_key, pnl,
                        pos.get("strategies_confirmed", []),
                        pos.get("strategy_scores", {}))
                logger.info(f"🤖🚪 EXIT: {sym} @ ₹{current:.0f} — {exit_reason}")
            else:
                # Update trailing stop (move up, never down)
                multiplier = self.config.get("trailing_sl_atr_multiplier", 1.5)
                new_sl = current - (atr * multiplier)
                if new_sl > trailing_sl:
                    update_trailing_stop(sym, new_sl)

    async def _force_close_all(self, reason: str):
        """Close all open positions immediately."""
        positions = get_open_positions()
        for pos in positions:
            current = pos.get("current_price", pos["entry_price"])
            close_position(pos["symbol"], current, reason)
            log_trade_decision({
                "action": "EXIT",
                "symbol": pos["symbol"],
                "exit_price": current,
                "entry_price": pos["entry_price"],
                "pnl": round((current - pos["entry_price"]) * pos["shares"], 2),
                "reasoning": [reason],
            })
            logger.info(f"🤖🚪 FORCE EXIT: {pos['symbol']} @ ₹{current:.0f} — {reason}")

    # ── RISK MANAGEMENT ────────────────────────────────────────────────

    def _check_risk_limits(self) -> dict:
        """Can we take a new trade?"""
        portfolio = get_portfolio()
        positions = get_open_positions()
        now = datetime.now()

        max_pos = self.config.get("max_positions", 5)
        max_heat = self.config.get("max_portfolio_heat", 8.0)
        capital = portfolio.get("capital", 100000)
        today_pnl = portfolio.get("today_pnl", 0)

        # 1. Max positions
        if len(positions) >= max_pos:
            return {"can_trade": False, "reason": f"Max positions reached ({max_pos})"}

        # 2. No new trades after cutoff
        cutoff = self.config.get("no_new_trades_after", "14:30")
        h, m = map(int, cutoff.split(":"))
        if now.hour > h or (now.hour == h and now.minute >= m):
            return {"can_trade": False, "reason": f"No new trades after {cutoff}"}

        # 3. Daily loss circuit breaker (3% of capital)
        if today_pnl < -(capital * 0.03):
            return {"can_trade": False, "reason": f"Daily loss circuit breaker: ₹{today_pnl:.0f}"}

        # 4. Portfolio heat (total risk exposure)
        total_risk = 0
        for pos in positions:
            risk = (pos["entry_price"] - pos.get("trailing_stop", pos["stop_loss"])) * pos["shares"]
            total_risk += max(0, risk)
        heat_pct = (total_risk / capital) * 100 if capital > 0 else 0
        if heat_pct >= max_heat:
            return {"can_trade": False, "reason": f"Portfolio heat too high: {heat_pct:.1f}%"}

        # 5. Min cash reserve (20%)
        cash = portfolio.get("cash", 0)
        if cash < capital * 0.20:
            return {"can_trade": False, "reason": f"Cash reserve too low: ₹{cash:.0f}"}

        return {
            "can_trade": True,
            "reason": "All clear",
            "positions": len(positions),
            "max_positions": max_pos,
            "portfolio_heat": round(heat_pct, 1),
            "cash_available": round(cash, 0),
        }

    def _calculate_position_size(self, entry: float, stop_loss: float, confluence: int) -> dict:
        """Position sizing based on risk and confidence."""
        portfolio = get_portfolio()
        capital = portfolio.get("capital", 100000)
        risk_pct = self.config.get("risk_per_trade", 1.5)

        risk_per_share = abs(entry - stop_loss)
        if risk_per_share <= 0:
            risk_per_share = entry * 0.02

        # Risk amount
        risk_amount = capital * (risk_pct / 100)

        # Confidence scaling
        if confluence >= 90:
            size_mult = 1.0
        elif confluence >= 80:
            size_mult = 0.75
        else:
            size_mult = 0.5

        shares = int((risk_amount * size_mult) / risk_per_share)

        # Cap at 25% of capital
        max_cost = capital * 0.25
        max_shares = int(max_cost / entry) if entry > 0 else 0
        shares = min(shares, max_shares)

        # Cap at available cash
        cash = portfolio.get("cash", 0)
        max_from_cash = int(cash / entry) if entry > 0 else 0
        shares = min(shares, max_from_cash)

        return {
            "shares": max(0, shares),
            "capital_needed": round(shares * entry, 2),
            "risk_amount": round(risk_per_share * shares, 2),
        }

    # ── DAILY SUMMARY GENERATION ────────────────────────────────────────

    async def _generate_daily_summary(self) -> dict:
        """Generate an AI-powered daily summary at end of day."""
        from auto_store import get_trade_journal, get_scan_history, get_portfolio_stats
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

        # Fetch FII/DII data
        fii_dii = {}
        try:
            fii_dii = await fetch_fii_dii_data()
        except Exception as e:
            logger.warning(f"FII/DII fetch failed for summary: {e}")

        # Gather news headlines
        news_headlines = [n.get("headline", "") for n in self._cached_news[:10]]
        market_sentiment = self._cached_sentiment.get("sentiment", "N/A")

        # Build base summary (without AI)
        base_summary = {
            "date": today_str,
            "market_sentiment": market_sentiment,
            "news_headlines": news_headlines[:5],
            "fii_dii": fii_dii,
            "total_scans": len(today_scans),
            "trades_count": len(trades_taken),
            "exits_count": len(trades_exited),
            "today_pnl": portfolio.get("today_pnl", 0),
        }

        # Try AI-powered summary
        if self._ai_client:
            try:
                fii_dii_text = ""
                if fii_dii.get("available"):
                    if fii_dii.get("headline"):
                        fii_dii_text = f"FII/DII News: {fii_dii['headline']}"
                    else:
                        fii_dii_text = (
                            f"FII: Buy ₹{fii_dii['fii_buy']:.0f}Cr, Sell ₹{fii_dii['fii_sell']:.0f}Cr, "
                            f"Net ₹{fii_dii['fii_net']:.0f}Cr | "
                            f"DII: Buy ₹{fii_dii['dii_buy']:.0f}Cr, Sell ₹{fii_dii['dii_sell']:.0f}Cr, "
                            f"Net ₹{fii_dii['dii_net']:.0f}Cr"
                        )

                trade_details = ""
                if trades_taken:
                    for t in trades_taken:
                        trade_details += f"\n  - {t.get('symbol', '?')}: Confluence {t.get('confluence_score', 0)}/110, Reasons: {', '.join(t.get('reasoning', [])[:3])}"
                else:
                    trade_details = "\n  No trades were taken today."

                exit_details = ""
                if trades_exited:
                    for t in trades_exited:
                        exit_details += f"\n  - {t.get('symbol', '?')}: P&L ₹{t.get('pnl', 0):.0f} ({t.get('pnl_pct', 0):.1f}%), Reason: {', '.join(t.get('reasoning', [])[:2])}"

                prompt = f"""You are a daily market analyst for an auto-trading system. Generate a concise daily trading summary for {today_str}.

TODAY'S DATA:
- Total scans: {len(today_scans)}
- Trades taken: {len(trades_taken)}
- Trades exited: {len(trades_exited)}
- Today P&L: ₹{portfolio.get('today_pnl', 0):.0f}
- Market sentiment: {market_sentiment}

TRADES:{trade_details}

EXITS:{exit_details}

TOP NEWS HEADLINES:
{chr(10).join(f'- {h}' for h in news_headlines[:7])}

FII/DII FLOWS:
{fii_dii_text if fii_dii_text else 'Data not available'}

PORTFOLIO: Capital ₹{portfolio.get('capital', 0):,.0f}, Cash ₹{portfolio.get('cash', 0):,.0f}

Respond ONLY with JSON (no markdown):
{{
  "market_recap": "2-3 sentence market recap for today",
  "why_trades": "Why trades were/weren't taken today (be specific about confluence scores, missing conditions)",
  "strategies_analysis": "Which strategies worked/didn't work and why",
  "big_news": ["top 3 impactful news items with 1-line analysis each"],
  "fii_dii_analysis": "1-2 sentence analysis of FII/DII flows and their impact",
  "tomorrow_outlook": "What to watch for tomorrow",
  "risk_notes": "Any risk warnings or observations",
  "grade": "A/B/C/D/F grade for today's trading performance"
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
                logger.info(f"🤖📊 AI daily summary generated: Grade {ai_result.get('grade', '?')}")

            except Exception as e:
                logger.warning(f"AI daily summary generation failed: {e}")
                base_summary["ai_analysis"] = {
                    "market_recap": f"Market sentiment was {market_sentiment}. {len(trades_taken)} trades taken, P&L: ₹{portfolio.get('today_pnl', 0):.0f}.",
                    "why_trades": f"{'Trades taken based on confluence scoring.' if trades_taken else 'No stocks met the minimum confluence threshold today.'}",
                    "strategies_analysis": "AI analysis unavailable — summary based on raw data.",
                    "big_news": news_headlines[:3] if news_headlines else ["No major news captured today."],
                    "fii_dii_analysis": fii_dii_text if fii_dii_text else "FII/DII data not available.",
                    "tomorrow_outlook": "Review market conditions at open.",
                    "risk_notes": "N/A",
                    "grade": "N/A",
                }
        else:
            # No AI client — build basic summary
            base_summary["ai_analysis"] = {
                "market_recap": f"Market sentiment: {market_sentiment}. Scans: {len(today_scans)}. Trades: {len(trades_taken)}. P&L: ₹{portfolio.get('today_pnl', 0):.0f}.",
                "why_trades": f"{'Trades triggered by confluence scoring system.' if trades_taken else 'No stocks reached the minimum confluence threshold.'}",
                "strategies_analysis": "Enable Claude AI for detailed strategy analysis.",
                "big_news": news_headlines[:3] if news_headlines else ["No news data captured."],
                "fii_dii_analysis": "Enable Claude AI for FII/DII analysis.",
                "tomorrow_outlook": "Check pre-market data tomorrow.",
                "risk_notes": "N/A",
                "grade": "N/A",
            }

        base_summary["fii_dii"] = fii_dii
        return base_summary

    # ── HELPERS ────────────────────────────────────────────────────────

    def _is_market_hours(self) -> bool:
        now = datetime.now()
        if now.weekday() >= 5:
            return False
        market_open = now.replace(hour=9, minute=15, second=0)
        market_close = now.replace(hour=15, minute=30, second=0)
        return market_open <= now <= market_close

    def _is_after_close(self) -> bool:
        now = datetime.now()
        return now.hour >= 15 and now.minute >= 30

    def _hold_minutes(self, entry_time_str: Optional[str]) -> int:
        if not entry_time_str:
            return 0
        try:
            entry_time = datetime.fromisoformat(entry_time_str)
            return int((datetime.now() - entry_time).total_seconds() / 60)
        except Exception:
            return 0

    def _snapshot(self, stock: dict) -> dict:
        """Capture FULL indicator + news state at trade time."""
        ind = stock.get("indicators", {})
        news_data = self._get_stock_news_sentiment(stock.get("symbol", ""))
        return {
            "price": stock.get("price"),
            "change_percent": stock.get("change_percent"),
            "score": stock.get("score"),
            "signal": stock.get("signal"),
            "votes": stock.get("votes"),
            # All 12 indicators
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
            # News at time of trade
            "news_sentiment": news_data.get("sentiment"),
            "news_headlines": news_data.get("headlines", [])[:2],
            "market_sentiment": self._cached_sentiment.get("sentiment"),
            # Timestamp
            "snapshot_time": datetime.now().isoformat(),
        }

    def get_status(self) -> dict:
        """Current auto trader status for API/WebSocket."""
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
            "cash_available": round(portfolio.get("cash", 0), 0),
            "today_pnl": portfolio.get("today_pnl", 0),
            "total_pnl": portfolio.get("total_pnl", 0),
            "portfolio_heat": risk.get("portfolio_heat", 0),
            "stats": stats,
            "risk_status": risk,
            # Intelligence status
            "intelligence": {
                "news_articles": len(self._cached_news),
                "market_sentiment": self._cached_sentiment.get("sentiment", "N/A"),
                "news_last_updated": self._cached_news_time.isoformat() if self._cached_news_time else None,
                "ai_enabled": self._ai_client is not None and self.config.get("use_ai_confirmation", True),
                "indicators_active": 12,
                "investor_perspectives": 5,
            },
            # Strategy config + live performance
            "strategy_config": {
                "active_strategies": self.config.get("active_strategies", ["A", "B", "C", "D", "E"]),
                "strategy_mode": "ANY_TRIGGERS",
                "strategy_min_scores": self.config.get("strategy_min_scores", {}),
            },
            "strategy_performance": self._get_strategy_performance_summary(),
        }

    def _get_strategy_performance_summary(self) -> dict:
        """Return performance stats for each strategy and combo."""
        try:
            from auto_store import get_strategy_performance
            perf = get_strategy_performance()
            # Remove internal _trade_log key
            return {k: v for k, v in perf.items() if not k.startswith("_")}
        except Exception:
            return {}

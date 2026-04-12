"""
AUTO TRADER ENGINE — The Emotionless Master Trader
===================================================
No human emotions. Pure intelligence. Patient. Precise.
Waits for perfect confluence, then strikes.

Uses 12 technical indicators + 5 legendary investor perspectives
+ news sentiment to score opportunities 0-100.
Only trades when confluence >= 75/100.

Risk management: position sizing, trailing stops, portfolio heat,
daily circuit breaker, time-based exits.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timedelta
from typing import Optional, List
from concurrent.futures import ThreadPoolExecutor

from market_engine import fetch_all_stocks
from investor_perspectives import analyze_through_investor_lenses
from auto_store import (
    load_auto_config, get_portfolio, add_position, close_position,
    update_trailing_stop, update_position_prices, get_open_positions,
    log_trade_decision, save_scan_result, save_daily_summary,
    reset_daily_pnl, get_portfolio_stats,
)

logger = logging.getLogger(__name__)
executor = ThreadPoolExecutor(max_workers=2)


class AutoTrader:
    """The Master — continuous market scanner and paper trader."""

    def __init__(self, config: dict):
        self.config = config
        self.running = False
        self.last_scan: Optional[datetime] = None
        self.scan_count = 0
        self.last_scan_data: dict = {}
        self._task: Optional[asyncio.Task] = None

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
        save_daily_summary()
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
                    save_daily_summary()
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
        """One full scan: fetch data, evaluate entries, check exits."""
        start_time = time.time()
        self.scan_count += 1
        logger.info(f"🤖 Scan #{self.scan_count} starting...")

        try:
            # 1. Fetch all stocks with indicators (in thread pool)
            loop = asyncio.get_event_loop()
            all_stocks = await loop.run_in_executor(executor, fetch_all_stocks)

            if not all_stocks:
                logger.warning("🤖 No stock data received, skipping scan")
                return

            # 2. Update current prices for open positions
            prices = {s["symbol"]: s["price"] for s in all_stocks if s.get("price")}
            update_position_prices(prices)

            # 3. Check exits for open positions FIRST (before entries)
            await self._check_exits(all_stocks)

            # 4. Risk check — can we take new trades?
            risk = self._check_risk_limits()

            # 5. Evaluate entries
            pending_signals = []
            entries_made = 0

            if risk["can_trade"]:
                for stock in all_stocks:
                    result = self._evaluate_entry(stock)
                    if result:
                        if result["confluence"] >= self.config.get("min_confluence", 75):
                            # EXECUTE PAPER TRADE
                            trade = self._execute_entry(stock, result)
                            if trade:
                                entries_made += 1
                                log_trade_decision({
                                    "action": "ENTER",
                                    "symbol": stock["symbol"],
                                    "name": stock.get("name", ""),
                                    "confluence_score": result["confluence"],
                                    "entry_price": trade["entry_price"],
                                    "stop_loss": trade["stop_loss"],
                                    "target_1": trade["target_1"],
                                    "shares": trade["shares"],
                                    "reasoning": result["reasons"],
                                    "indicator_snapshot": self._snapshot(stock),
                                })
                        elif result["confluence"] >= 55:
                            # Near threshold — add to watchlist
                            pending_signals.append({
                                "symbol": stock["symbol"],
                                "name": stock.get("name", ""),
                                "price": stock.get("price", 0),
                                "confluence_score": result["confluence"],
                                "missing": result.get("missing", []),
                                "met_conditions": result.get("reasons", []),
                            })

            # 6. Save scan result
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
            })

            self.last_scan = datetime.now()
            self.last_scan_data = {
                "pending_signals": pending_signals[:10],
                "scan_count": self.scan_count,
                "entries_made": entries_made,
            }

            logger.info(
                f"🤖 Scan #{self.scan_count} done in {elapsed}s — "
                f"{entries_made} entries, {len(get_open_positions())} open positions, "
                f"{len(pending_signals)} watching"
            )

        except Exception as e:
            logger.error(f"🤖 Scan cycle error: {e}", exc_info=True)

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
                score += 10
                reasons.append(f"Good consensus: {buy_votes}/{total_votes} BUY")
            elif buy_votes >= 6:
                score += 5
                reasons.append(f"Moderate consensus: {buy_votes}/{total_votes} BUY")
            else:
                missing.append(f"Weak consensus: {buy_votes}/{total_votes} BUY")

        # 3. RSI zone (max 10 pts)
        rsi = ind.get("rsi", {}).get("value", 50)
        if 30 <= rsi <= 45:
            score += 10
            reasons.append(f"RSI in sweet spot (oversold bounce): {rsi:.0f}")
        elif 45 < rsi <= 55:
            score += 5
            reasons.append(f"RSI neutral zone: {rsi:.0f}")
        elif rsi < 30:
            score += 7
            reasons.append(f"RSI deeply oversold: {rsi:.0f}")
        else:
            missing.append(f"RSI too high: {rsi:.0f}")

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
        try:
            investor_data = analyze_through_investor_lenses(stock, ind)
            bullish = investor_data.get("consensus", {}).get("bullish_count", 0)
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

        # Clamp
        score = max(0, min(100, score))

        return {
            "confluence": score,
            "reasons": reasons,
            "missing": missing,
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
                close_position(sym, current, exit_reason, partial=partial)
                log_trade_decision({
                    "action": "PARTIAL_EXIT" if partial else "EXIT",
                    "symbol": sym,
                    "exit_price": current,
                    "entry_price": entry,
                    "pnl": round((current - entry) * pos["shares"], 2),
                    "pnl_pct": round((current / entry - 1) * 100, 2),
                    "reasoning": [exit_reason],
                    "hold_duration_minutes": self._hold_minutes(pos.get("entry_time")),
                })
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
        """Capture indicator state at trade time."""
        ind = stock.get("indicators", {})
        return {
            "price": stock.get("price"),
            "score": stock.get("score"),
            "signal": stock.get("signal"),
            "rsi": ind.get("rsi", {}).get("value"),
            "macd_vote": ind.get("macd", {}).get("vote"),
            "supertrend": ind.get("supertrend", {}).get("direction"),
            "ema_align": ind.get("ema_crossover", {}).get("alignment"),
            "adx": ind.get("adx", {}).get("adx"),
            "bb_pct": ind.get("bollinger", {}).get("pct_b"),
            "volume_spike": ind.get("volume", {}).get("spike"),
            "volume_ratio": ind.get("volume", {}).get("ratio"),
            "vwap_vote": ind.get("vwap", {}).get("vote"),
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
        }

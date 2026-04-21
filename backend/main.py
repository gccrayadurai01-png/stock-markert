"""
AI Trading Command Center — FastAPI Backend v2
Pro-grade: 12 indicators, news, data persistence, goal tracking.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from market_engine import (
    fetch_index_data, fetch_all_stocks,
    get_buy_candidates, get_sell_candidates,
    get_top_gainers, get_top_losers,
)
from news_engine import get_market_news, get_overall_sentiment, generate_news_trades
from ai_engine import generate_signals
from risk_engine import allocate_capital
from data_store import (
    save_config, load_config, save_trade, get_today_pnl,
    get_today_trades, save_signals, get_signal_history,
    save_goal, load_goal, calculate_goal_projection,
    get_daily_logs, get_trades, save_mode_config, load_mode_config,
    save_daily_capital, get_daily_capital, get_mode_returns,
)
from chart_engine import fetch_chart_data, fetch_intraday_chart, fetch_swing_chart, fetch_positional_chart
from auto_trader import AutoTrader
from auto_store import (
    load_auto_config, save_auto_config,
    load_real_config, save_real_config,
    get_portfolio as get_auto_portfolio, get_open_positions as get_auto_positions,
    get_trade_journal, get_pending_signals, get_scan_history,
    get_portfolio_stats as get_auto_stats, get_daily_summaries,
    get_daily_summary_by_date, update_portfolio_capital,
    get_strategy_performance, reset_strategy_performance,
)

# ── Crypto stack (fully isolated from stock trader) ─────────────────────
from crypto_auto_trader import CryptoAutoTrader
from crypto_store import (
    load_crypto_config, save_crypto_config,
    get_portfolio as get_crypto_portfolio,
    get_open_positions as get_crypto_positions,
    get_trade_journal as get_crypto_journal,
    get_pending_signals as get_crypto_pending,
    get_scan_history as get_crypto_scans,
    get_portfolio_stats as get_crypto_stats,
    get_daily_summaries as get_crypto_daily_summaries,
    get_daily_summary_by_date as get_crypto_daily_summary,
    update_portfolio_capital as update_crypto_capital,
    get_strategy_performance as get_crypto_strategy_perf,
    reset_strategy_performance as reset_crypto_strategy_perf,
)

import manual_trade_store
from forex_engine import get_forex_dashboard
from zerodha_broker import ZerodhaBroker, PaperTradingBroker

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── State ───────────────────────────────────────────────────────────────
latest_dashboard: dict = {}
connected_clients: List[WebSocket] = []
user_config: dict = load_config()
executor = ThreadPoolExecutor(max_workers=4)
auto_trader: Optional[AutoTrader] = None
crypto_trader: Optional[CryptoAutoTrader] = None
broker: Optional[ZerodhaBroker] = None
# Persisted flag — restored from real_trading_config.json on startup so LIVE mode
# survives backend restarts (user explicitly enabled it once, respect that).
real_trading_enabled: bool = bool(load_real_config().get("enabled", False))

# ── Trading Settings (Editable) ────────────────────────────────────────
trading_settings: dict = {
    "paper_trading_capital": 10000,
    "real_trading_capital": 5000,
    "min_balance_limit": 2000,
    "strategy_win_rate_threshold": 60,
    "min_trades_for_selection": 10,
}


# ── Core Analysis Loop ─────────────────────────────────────────────────
async def run_analysis():
    """Main analysis cycle — runs indicators on all stocks, fetches news, generates signals."""
    global latest_dashboard
    logger.info("🔄 Running full market analysis...")

    try:
        loop = asyncio.get_event_loop()

        # 1. Fetch market data with full technical analysis (in thread pool)
        indices = await loop.run_in_executor(executor, fetch_index_data)
        all_stocks = await loop.run_in_executor(executor, fetch_all_stocks)

        market_data = {
            "indices": indices,
            "all_stocks": all_stocks,
            "buy_candidates": get_buy_candidates(all_stocks),
            "sell_candidates": get_sell_candidates(all_stocks),
        }

        # 2. Fetch news
        news = await get_market_news()
        sentiment = get_overall_sentiment(news)

        # 3. Generate AI signals
        capital = user_config.get("capital", 100000)
        ai_output = await generate_signals(market_data, news, capital, user_config)

        # 4. Apply risk engine to recommended trades
        recommended = ai_output.get("recommended_trades", [])
        for t in recommended:
            t["action"] = t.get("action", "BUY")

        # 5. Build dashboard
        nifty = indices.get("NIFTY_50", {})
        sensex = indices.get("SENSEX", {})
        banknifty = indices.get("BANK_NIFTY", {})
        vix = indices.get("INDIA_VIX", {})

        today_pnl = get_today_pnl()
        goal = load_goal()
        goal_projection = calculate_goal_projection(
            capital, goal.get("target_amount", 10000000),
            goal.get("daily_target_percent", 1.0),
        )

        latest_dashboard = {
            "timestamp": datetime.now().isoformat(),
            "market_overview": {
                "nifty_50": nifty.get("value", 0),
                "nifty_50_change": nifty.get("change_percent", 0),
                "nifty_50_high": nifty.get("high", 0),
                "nifty_50_low": nifty.get("low", 0),
                "sensex": sensex.get("value", 0),
                "sensex_change": sensex.get("change_percent", 0),
                "bank_nifty": banknifty.get("value", 0),
                "bank_nifty_change": banknifty.get("change_percent", 0),
                "india_vix": vix.get("value", 0),
                "market_status": "OPEN" if _is_market_open() else "CLOSED",
            },
            # AI signals
            "market_verdict": ai_output.get("market_verdict", "NEUTRAL"),
            "verdict_reason": ai_output.get("verdict_reason", ""),
            "action_plan": ai_output.get("action_plan", ""),
            "pre_market_plan": ai_output.get("pre_market_plan", ""),
            "first_30_min_plan": ai_output.get("first_30_min_plan", ""),
            "recommended_trades": recommended,
            "avoid_stocks": ai_output.get("avoid_stocks", []),
            "exit_signals": ai_output.get("exit_signals", []),
            "sectors": ai_output.get("sectors", []),
            "macro_impact": ai_output.get("macro_impact", []),
            "emotion_warnings": ai_output.get("emotion_warnings", []),
            "key_levels": ai_output.get("key_levels", {}),
            # Raw indicator data
            "all_stocks": [_slim_stock(s) for s in all_stocks],
            "buy_candidates": [_slim_stock(s) for s in get_buy_candidates(all_stocks)],
            "sell_candidates": [_slim_stock(s) for s in get_sell_candidates(all_stocks)],
            "top_gainers": get_top_gainers(all_stocks),
            "top_losers": get_top_losers(all_stocks),
            # News
            "news": news[:10],
            "news_sentiment": sentiment,
            "news_trades": generate_news_trades(news, all_stocks),
            # P&L and goals
            "today_pnl": today_pnl,
            "goal": goal,
            "goal_projection": goal_projection,
            # Config
            "user_capital": capital,
            "risk_per_trade": user_config.get("risk_percent", 1.0),
            "max_trades": user_config.get("max_trades", 3),
            "trading_mode": user_config.get("trading_mode", "intraday"),
        }

        # Save signals for history
        save_signals({
            "market_verdict": ai_output.get("market_verdict"),
            "trades": len(recommended),
            "top_pick": recommended[0]["symbol"] if recommended else "NONE",
        })

        await broadcast(latest_dashboard)
        logger.info(f"✅ Analysis done. {len(recommended)} trades. Verdict: {ai_output.get('market_verdict')}")

    except Exception as e:
        logger.error(f"❌ Analysis error: {e}", exc_info=True)


def _slim_stock(s: dict) -> dict:
    """Return a slimmed version of stock data for frontend."""
    ind = s.get("indicators", {})

    return {
        "symbol": s.get("symbol"),
        "name": s.get("name"),
        "price": s.get("price"),
        "change_percent": s.get("change_percent"),
        "signal": s.get("signal"),
        "score": s.get("score"),
        "confidence": s.get("confidence"),
        "stop_loss": s.get("stop_loss"),
        "target_1": s.get("target_1"),
        "target_2": s.get("target_2"),
        "atr": s.get("atr"),
        "rsi": ind.get("rsi", {}).get("value"),
        "macd_vote": ind.get("macd", {}).get("vote"),
        "supertrend_dir": ind.get("supertrend", {}).get("direction"),
        "ema_align": ind.get("ema_crossover", {}).get("alignment"),
        "adx": ind.get("adx", {}).get("adx"),
        "bb_pct": ind.get("bollinger", {}).get("pct_b"),
        "vwap_vote": ind.get("vwap", {}).get("vote"),
        "volume_spike": ind.get("volume", {}).get("spike"),
        "votes": s.get("votes"),
    }


def _is_market_open() -> bool:
    now = datetime.now()
    if now.weekday() >= 5:
        return False
    market_open = now.replace(hour=9, minute=15, second=0)
    market_close = now.replace(hour=15, minute=30, second=0)
    return market_open <= now <= market_close


async def broadcast(data: dict):
    dead = []
    for ws in connected_clients:
        try:
            await ws.send_json(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        connected_clients.remove(ws)


# ── App Lifecycle ──────────────────────────────────────────────────────
async def _market_hours_refresh_loop():
    """Auto-refresh every 10 minutes ONLY during market hours (9:15 AM - 3:30 PM IST)."""
    while True:
        await asyncio.sleep(600)
        if _is_market_open():
            logger.info("⏰ Market hours auto-refresh (10 min interval)...")
            await run_analysis()
        else:
            logger.debug("⏰ Outside market hours — skipping auto-refresh")


async def _auto_trader_scheduler():
    """
    Auto-start Auto Trader at 9:15 AM IST, auto-stop at 3:30 PM IST.
    Runs every day, Monday–Friday. No manual toggle needed.
    Checks immediately on startup, then every 60 seconds.
    """
    global auto_trader
    logger.info("📅 Auto Trader scheduler running — will start at 9:15 AM, stop at 3:30 PM IST")

    first_run = True
    while True:
        # On first run, check immediately. After that, sleep 60s between checks.
        if not first_run:
            await asyncio.sleep(60)
        first_run = False

        now = datetime.now()
        weekday = now.weekday()  # 0=Mon … 4=Fri, 5=Sat, 6=Sun

        market_open  = now.replace(hour=9,  minute=15, second=0, microsecond=0)
        market_close = now.replace(hour=15, minute=30, second=0, microsecond=0)

        # ── OPEN: start auto trader at 9:15 AM on weekdays ──────────────
        if weekday < 5 and now >= market_open and now < market_close:
            if not auto_trader or not auto_trader.running:
                logger.info("🔔 Market OPEN — Auto Trader starting automatically...")
                cfg = load_auto_config()
                cfg["enabled"] = True
                save_auto_config(cfg)
                auto_trader = AutoTrader(cfg)
                asyncio.create_task(auto_trader.start())
                # Also trigger a fresh analysis
                asyncio.create_task(run_analysis())

        # ── CLOSE: stop auto trader at 3:30 PM ──────────────────────────
        elif auto_trader and auto_trader.running and (now >= market_close or weekday >= 5):
            logger.info("🔔 Market CLOSED — Auto Trader stopping automatically...")
            await auto_trader.stop()
            auto_trader = None
            cfg = load_auto_config()
            cfg["enabled"] = False
            save_auto_config(cfg)


_TOKEN_STORE = Path(__file__).parent / "data" / "auto" / "zerodha_token.json"


def _load_stored_token() -> str:
    """Read the last successfully exchanged access token from the JSON store."""
    try:
        if _TOKEN_STORE.exists():
            data = json.loads(_TOKEN_STORE.read_text())
            return data.get("access_token", "")
    except Exception:
        pass
    return ""


def _save_stored_token(token: str):
    """Persist the access token so it survives process restarts on Render/cloud."""
    try:
        _TOKEN_STORE.parent.mkdir(parents=True, exist_ok=True)
        _TOKEN_STORE.write_text(json.dumps({
            "access_token": token,
            "saved_at": datetime.now().isoformat(),
        }, indent=2))
    except Exception as e:
        logger.warning(f"⚠️ Could not save token to store: {e}")


def _try_connect_broker() -> bool:
    """
    Attempt to connect ZerodhaBroker using credentials from .env / JSON token store.
    Priority: os.environ → JSON token store → .env file.
    Returns True if connected and token is valid.
    Sets the global `broker` variable on success.
    Safe to call multiple times — each call creates a fresh instance.
    """
    global broker
    try:
        api_key    = os.getenv("ZERODHA_API_KEY", "")
        api_secret = os.getenv("ZERODHA_API_SECRET", "")
        # Token priority: env var → JSON store (survives restarts on cloud)
        token = os.getenv("ZERODHA_ACCESS_TOKEN", "")
        if not token:
            token = _load_stored_token()
            if token:
                os.environ["ZERODHA_ACCESS_TOKEN"] = token  # inject so ZerodhaBroker picks it up
                logger.info("🔑 Using stored token from JSON fallback")
        if not all([api_key, api_secret, token]):
            logger.info("🔑 Zerodha creds not set — skipping auto-connect")
            return False

        b = ZerodhaBroker()
        if not b.connected:
            logger.warning("🔴 Zerodha handshake failed on startup — token may be invalid")
            return False

        # Verify token actually works (tokens expire daily ~6 AM IST)
        balance = b.get_balance()
        if balance.get("status") != "success":
            msg = balance.get("message", "unknown")
            logger.warning(
                f"🔴 Zerodha connected but token invalid: {msg}\n"
                "   ➜ Regenerate KITE_ACCESS_TOKEN via Kite login flow then restart."
            )
            return False

        broker = b
        logger.info(
            f"✅ Broker auto-connected on startup — "
            f"balance ₹{balance.get('total_balance', 0):,.2f}"
        )
        return True
    except Exception as e:
        logger.error(f"❌ Broker auto-connect error: {e}")
        return False


async def _broker_reconnect_loop():
    """
    Background task: every 60 s, if real trading is enabled but broker is
    disconnected, try to reconnect automatically.

    This handles two failure modes:
      1. Server restart  — broker global resets to None but token is still valid.
      2. Token expiry    — daily at ~6 AM IST; logs a clear warning so user knows
                           to regenerate via the UI (can't auto-fix without a new
                           Zerodha login-flow token).
    """
    global broker
    await asyncio.sleep(30)  # brief startup grace period
    while True:
        try:
            if real_trading_enabled and (not broker or not broker.connected):
                # Check if it's a real auth failure or just a timeout/network blip
                if broker and not broker.connected and getattr(broker, "_consecutive_failures", 0) < 3:
                    # Connected flag flipped by timeout — don't reconnect, just wait
                    logger.warning("⚠️ Broker flagged disconnected but may be a network blip — waiting")
                else:
                    logger.info("🔄 Broker reconnect: retrying with stored credentials…")
                    connected = await asyncio.get_event_loop().run_in_executor(None, _try_connect_broker)
                    if not connected:
                        logger.warning(
                            "⚠️  Broker reconnect failed. If token expired, go to Dashboard → "
                            "Broker → Login with Zerodha to get a fresh access token."
                        )
                    else:
                        logger.info("✅ Broker reconnected successfully")
        except Exception as e:
            logger.error(f"❌ Broker reconnect loop error: {e}")
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global auto_trader
    # Install real-broker hook for the systematic real-trading engine in auto_trader.
    # Returns the live broker ONLY when (broker connected) AND (real_trading_enabled).
    # This gate is the single source of truth — the engine never opens real orders
    # unless this returns a connected broker.
    import auto_trader as _at
    _at.broker_provider = lambda: (broker if (broker and broker.connected and real_trading_enabled) else None)

    # ── Auto-connect broker on startup ────────────────────────────────────
    # If real_trading_enabled was persisted (user had it ON before restart),
    # immediately try to reconnect using the stored .env token.
    if real_trading_enabled:
        logger.info("🔴 Real trading was enabled — attempting broker auto-connect on startup…")
        await asyncio.get_event_loop().run_in_executor(None, _try_connect_broker)
    else:
        logger.info("🟢 Real trading is OFF — skipping broker auto-connect")

    # Don't run analysis on startup — let the scheduler handle it
    # asyncio.create_task(run_analysis())

    # Start 10-min refresh loop (only active during market hours)
    asyncio.create_task(_market_hours_refresh_loop())

    # Start auto trader scheduler (auto-start 9:15 AM, auto-stop 3:30 PM)
    asyncio.create_task(_auto_trader_scheduler())

    # Keep broker alive — reconnects automatically if dropped
    asyncio.create_task(_broker_reconnect_loop())

    # The scheduler handles starting/stopping — it checks immediately on first run.
    # Do NOT start auto_trader here to avoid the double-start race condition.
    auto_cfg = load_auto_config()
    if _is_market_open():
        logger.info("🔔 Server started during market hours — scheduler will start Auto Trader immediately")
    else:
        logger.info("📅 Market is CLOSED — Auto Trader will start automatically at 9:15 AM IST")

    logger.info("🚀 Trading Command Center started (auto-schedule + 10-min refresh + manual)")
    yield

    if auto_trader:
        await auto_trader.stop()


app = FastAPI(title="AI Trading Command Center v2", version="2.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


# ── REST Endpoints ─────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "running", "name": "AI Trading Command Center v2"}


@app.get("/api/dashboard")
def get_dashboard():
    if not latest_dashboard:
        return {"status": "loading", "message": "Analyzing 30 stocks with 12 indicators... ~60 seconds."}
    return latest_dashboard


@app.get("/api/config")
def get_config():
    return user_config


@app.post("/api/config")
def update_config(config: dict):
    global user_config
    user_config.update(config)
    save_config(user_config)
    return {"status": "saved", "config": user_config}


@app.post("/api/refresh")
async def force_refresh():
    asyncio.create_task(run_analysis())
    return {"status": "refresh_triggered"}


@app.post("/api/trade")
def record_trade(trade: dict):
    """Record a buy/sell trade for P&L tracking."""
    save_trade(trade)
    return {"status": "saved", "pnl": get_today_pnl()}


@app.get("/api/pnl")
def get_pnl():
    return get_today_pnl()


@app.get("/api/trades")
def get_trades():
    return get_today_trades()


@app.get("/api/goal")
def get_goal():
    goal = load_goal()
    proj = calculate_goal_projection(
        user_config.get("capital", 100000),
        goal.get("target_amount", 10000000),
        goal.get("daily_target_percent", 1.0),
    )
    return {"goal": goal, "projection": proj}


@app.post("/api/goal")
def update_goal(goal: dict):
    save_goal(goal)
    return {"status": "saved", "goal": load_goal()}


@app.get("/api/history")
def get_history():
    return get_signal_history()


@app.get("/api/chart/{symbol}")
def get_chart(symbol: str, interval: str = "1day", outputsize: int = 60):
    """Fetch chart data with indicators from Twelve Data."""
    return fetch_chart_data(symbol, interval=interval, outputsize=outputsize)


@app.get("/api/chart/intraday/{symbol}")
def get_intraday_chart(symbol: str):
    return fetch_intraday_chart(symbol)


@app.get("/api/chart/swing/{symbol}")
def get_swing_chart(symbol: str):
    return fetch_swing_chart(symbol)


@app.get("/api/chart/positional/{symbol}")
def get_positional_chart(symbol: str):
    return fetch_positional_chart(symbol)


@app.get("/api/portfolio")
def get_portfolio():
    """Get full portfolio — all trades, P&L, open positions."""
    all_trades = get_trades()
    today = get_today_pnl()
    return {
        "all_trades": all_trades[-50:],
        "today_pnl": today,
        "total_trades": len(all_trades),
    }


@app.get("/api/portfolio/history")
def get_portfolio_history():
    """Get daily P&L history for charting."""
    return get_daily_logs(last_n=90)


@app.get("/api/mode/{mode}/config")
def get_mode_config(mode: str):
    """Get config for a specific trading mode."""
    return load_mode_config(mode)


@app.post("/api/mode/{mode}/config")
def update_mode_config(mode: str, config: dict):
    """Update config for a specific trading mode."""
    save_mode_config(mode, config)
    return {"status": "saved", "mode": mode, "config": load_mode_config(mode)}


@app.post("/api/daily-capital")
def record_daily_capital(entry: dict):
    """Record daily capital invested for a mode."""
    save_daily_capital(entry)
    return {"status": "saved"}


@app.get("/api/daily-capital/{mode}")
def get_daily_capital_for_mode(mode: str):
    return get_daily_capital(mode)


@app.get("/api/mode/{mode}/returns")
def get_returns_for_mode(mode: str):
    return get_mode_returns(mode)


@app.get("/api/news-trades")
def get_news_trades():
    """Get trade suggestions based on news."""
    if not latest_dashboard:
        return []
    return latest_dashboard.get("news_trades", [])


@app.get("/api/stock/{symbol}/investor-perspectives")
def get_stock_investor_perspectives(symbol: str):
    """Get investor perspectives for a specific stock."""
    from investor_perspectives import analyze_through_investor_lenses

    if not latest_dashboard:
        return {"error": "Dashboard not ready"}

    # Find the stock in latest data
    all_stocks = latest_dashboard.get("all_stocks", [])
    for stock in all_stocks:
        if stock.get("symbol") == symbol:
            ind = stock.get("indicators", {})
            investor_analysis = analyze_through_investor_lenses(stock, ind)
            return investor_analysis

    return {"error": f"Stock {symbol} not found"}


# ── Auto Trader Endpoints ─────────────────────────────────────────────

@app.post("/api/auto-trader/toggle")
async def toggle_auto_trader(body: dict):
    """Enable/disable auto trading."""
    global auto_trader
    enabled = body.get("enabled", False)

    if enabled and not auto_trader:
        cfg = load_auto_config()
        cfg["enabled"] = True
        save_auto_config(cfg)
        auto_trader = AutoTrader(cfg)
        asyncio.create_task(auto_trader.start())
        return {"status": "started", "enabled": True}
    elif not enabled and auto_trader:
        await auto_trader.stop()
        auto_trader = None
        cfg = load_auto_config()
        cfg["enabled"] = False
        save_auto_config(cfg)
        return {"status": "stopped", "enabled": False}
    return {"status": "no_change", "enabled": auto_trader is not None}


@app.get("/api/auto-trader/status")
def get_auto_trader_status():
    if auto_trader:
        return auto_trader.get_status()
    return {
        "enabled": False, "running": False, "test_mode": True,
        "positions": [], "pending_signals": [],
        "capital": load_auto_config().get("capital", 100000),
        "cash_available": load_auto_config().get("capital", 100000),
        "today_pnl": 0, "total_pnl": 0, "portfolio_heat": 0,
        "stats": get_auto_stats(), "scan_count": 0,
    }


@app.get("/api/auto-trader/config")
def get_auto_config():
    return load_auto_config()


@app.post("/api/auto-trader/config")
def update_auto_config(config: dict):
    old_cfg = load_auto_config()
    save_auto_config(config)
    new_cfg = load_auto_config()
    # If capital changed, update portfolio cash immediately
    new_capital = new_cfg.get("capital")
    if new_capital and new_capital != old_cfg.get("capital"):
        update_portfolio_capital(new_capital)
    # Push new config to running auto trader
    if auto_trader:
        auto_trader.config = new_cfg
    return {"status": "saved", "config": new_cfg}


@app.get("/api/auto-trader/portfolio")
def get_auto_portfolio_endpoint():
    return get_auto_portfolio()


@app.get("/api/auto-trader/positions")
def get_auto_positions_endpoint():
    return get_auto_positions()


@app.get("/api/auto-trader/journal")
def get_auto_journal(last_n: int = 50):
    return get_trade_journal(last_n)


@app.get("/api/auto-trader/journal/stats")
def get_auto_journal_stats():
    return get_auto_stats()


@app.get("/api/auto-trader/pending-signals")
def get_auto_pending():
    return get_pending_signals()


@app.get("/api/auto-trader/scan-history")
def get_auto_scans(last_n: int = 20):
    return get_scan_history(last_n)


@app.get("/api/auto-trader/performance")
def get_auto_performance():
    return {
        "stats": get_auto_stats(),
        "daily_summaries": get_daily_summaries(30),
    }


@app.get("/api/auto-trader/daily-summaries")
def get_auto_daily_summaries(last_n: int = 30):
    """Get all daily summaries (date-wise)."""
    return get_daily_summaries(last_n)


@app.get("/api/auto-trader/daily-summary/{target_date}")
def get_auto_daily_summary(target_date: str):
    """Get daily summary for a specific date."""
    summary = get_daily_summary_by_date(target_date)
    if summary:
        return summary
    return {"error": f"No summary found for {target_date}"}


@app.get("/api/auto-trader/daily-summary/{target_date}/download")
def download_daily_summary(target_date: str):
    """Download daily summary as CSV."""
    from fastapi.responses import Response

    summary = get_daily_summary_by_date(target_date)
    if not summary:
        return {"error": f"No summary found for {target_date}"}

    ai = summary.get("ai_summary", {}).get("ai_analysis", {})
    if not ai:
        ai = summary.get("ai_analysis", {})

    fii_dii = summary.get("ai_summary", {}).get("fii_dii", summary.get("fii_dii", {}))

    lines = [
        "DAILY TRADING SUMMARY",
        f"Date,{summary.get('date', target_date)}",
        "",
        "PORTFOLIO",
        f"Capital,{summary.get('capital', 0)}",
        f"Cash,{summary.get('cash', 0)}",
        f"Today P&L,{summary.get('today_pnl', 0)}",
        f"Total P&L,{summary.get('total_pnl', 0)}",
        f"Positions Held,{summary.get('positions_held', 0)}",
        "",
        "ACTIVITY",
        f"Total Scans,{summary.get('total_scans', 0)}",
        f"Trades Taken,{summary.get('trades_taken', 0)}",
        f"Trades Exited,{summary.get('trades_exited', 0)}",
        "",
        "AI ANALYSIS",
        f"Grade,{ai.get('grade', 'N/A')}",
        f"Market Recap,\"{ai.get('market_recap', 'N/A')}\"",
        f"Why Trades,\"{ai.get('why_trades', 'N/A')}\"",
        f"Strategies Analysis,\"{ai.get('strategies_analysis', 'N/A')}\"",
        f"Tomorrow Outlook,\"{ai.get('tomorrow_outlook', 'N/A')}\"",
        f"Risk Notes,\"{ai.get('risk_notes', 'N/A')}\"",
        "",
        "BIG NEWS",
    ]
    for i, news in enumerate(ai.get("big_news", []), 1):
        lines.append(f"{i},\"{news}\"")

    lines.append("")
    lines.append("FII/DII FLOWS")
    if fii_dii.get("available"):
        if fii_dii.get("headline"):
            lines.append(f"Headline,\"{fii_dii['headline']}\"")
        else:
            lines.append(f"FII Buy,{fii_dii.get('fii_buy', 0)}")
            lines.append(f"FII Sell,{fii_dii.get('fii_sell', 0)}")
            lines.append(f"FII Net,{fii_dii.get('fii_net', 0)}")
            lines.append(f"DII Buy,{fii_dii.get('dii_buy', 0)}")
            lines.append(f"DII Sell,{fii_dii.get('dii_sell', 0)}")
            lines.append(f"DII Net,{fii_dii.get('dii_net', 0)}")
    else:
        lines.append("Data,Not Available")

    lines.append(f"FII/DII Analysis,\"{ai.get('fii_dii_analysis', 'N/A')}\"")

    lines.append("")
    lines.append("TRADE DETAILS")
    lines.append("Symbol,Action,Confluence,Entry Price,Reasoning")
    for t in summary.get("trade_details", []):
        reasoning = "; ".join(t.get("reasoning", [])[:3])
        lines.append(f"{t.get('symbol', '')},{t.get('action', '')},{t.get('confluence_score', 0)},{t.get('entry_price', 0)},\"{reasoning}\"")

    lines.append("")
    lines.append("EXIT DETAILS")
    lines.append("Symbol,P&L,P&L %,Reasoning")
    for t in summary.get("exit_details", []):
        reasoning = "; ".join(t.get("reasoning", [])[:2])
        lines.append(f"{t.get('symbol', '')},{t.get('pnl', 0)},{t.get('pnl_pct', 0)},\"{reasoning}\"")

    csv_content = "\n".join(lines)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=trading_summary_{target_date}.csv"},
    )


@app.post("/api/auto-trader/generate-summary")
async def generate_daily_summary_now():
    """Manually generate/regenerate today's daily summary."""
    global auto_trader
    if auto_trader:
        ai_summary = await auto_trader._generate_daily_summary()
    else:
        # Create a temporary auto trader to generate summary
        from auto_store import save_daily_summary
        cfg = load_auto_config()
        temp_trader = AutoTrader(cfg)
        temp_trader._cached_news = []
        temp_trader._cached_sentiment = {"sentiment": "N/A"}
        await temp_trader._refresh_news()
        ai_summary = await temp_trader._generate_daily_summary()

    from auto_store import save_daily_summary
    save_daily_summary(ai_summary)
    return {"status": "generated", "summary": ai_summary}


@app.get("/api/auto-trader/strategy-performance")
def get_strategy_perf():
    """Get win rate, P&L, trade count per strategy (A, B, C, D and combinations)."""
    return get_strategy_performance()


@app.post("/api/auto-trader/strategy-performance/reset")
def reset_strategy_perf():
    """Reset all strategy performance data (start fresh)."""
    reset_strategy_performance()
    return {"status": "reset"}


@app.get("/api/auto-trader/journal/by-strategy/{strategy_key}")
def get_journal_by_strategy(strategy_key: str, last_n: int = 100):
    """Get all trade journal entries for a specific strategy key (e.g. 'A', 'A+B', 'E')."""
    all_entries = get_trade_journal(last_n)
    # Filter entries that match this strategy_key
    filtered = [
        e for e in all_entries
        if e.get("strategy_key") == strategy_key
        or e.get("action") in ("EXIT", "PARTIAL_EXIT")  # always include exits for context
    ]
    # For exits, only include ones that follow an entry for this strategy
    # Simpler: just filter ENTER entries + all EXIT entries
    enter_symbols = {e["symbol"] for e in all_entries if e.get("strategy_key") == strategy_key and e.get("action") == "ENTER"}
    result = [
        e for e in all_entries
        if (e.get("strategy_key") == strategy_key and e.get("action") == "ENTER")
        or (e.get("action") in ("EXIT", "PARTIAL_EXIT") and e.get("symbol") in enter_symbols)
    ]
    return result


@app.get("/api/auto-trader/journal/by-date")
def get_journal_by_date(last_n: int = 200):
    """Get all journal entries grouped by date."""
    from collections import defaultdict
    all_entries = get_trade_journal(last_n)
    grouped: dict = defaultdict(list)
    for e in all_entries:
        ts = e.get("timestamp", "")
        date = ts[:10] if ts else "unknown"
        grouped[date].append(e)
    # Build summary per day
    result = []
    for date in sorted(grouped.keys(), reverse=True):
        entries = grouped[date]
        enters = [e for e in entries if e.get("action") == "ENTER"]
        exits = [e for e in entries if e.get("action") in ("EXIT", "PARTIAL_EXIT")]
        day_pnl = sum(e.get("pnl", 0) or 0 for e in exits)
        result.append({
            "date": date,
            "trades_taken": len(enters),
            "trades_exited": len(exits),
            "day_pnl": round(day_pnl, 2),
            "entries": entries,
        })
    return result


@app.post("/api/auto-trader/strategy-config")
def update_strategy_config(body: dict):
    """
    Update active strategies and mode.
    body: { active_strategies: ["A","B","C","D"], strategy_mode: "ALL_REQUIRED"|"ANY_TRIGGERS", smc_min_score: 60 }
    """
    allowed_keys = {"active_strategies", "strategy_mode", "smc_min_score", "smc_on_top_candidates_only"}
    filtered = {k: v for k, v in body.items() if k in allowed_keys}
    save_auto_config(filtered)
    if auto_trader:
        auto_trader.config = load_auto_config()
    return {"status": "saved", "config": load_auto_config()}


# ── Real Trading Config ────────────────────────────────────────────────

@app.get("/api/real-trading/config")
def get_real_trading_config():
    """Get real-trading specific config: active_strategies per id + capitals."""
    return load_real_config()


@app.post("/api/real-trading/config")
def update_real_trading_config(body: dict):
    """
    Update real-trading config.
    Accepts strategy config AND risk/execution settings from the Settings modal.
    """
    allowed = {
        # Strategy allocation
        "active_strategies", "capitals", "strategy_mode", "enabled",
        # Trade limits
        "max_trades_per_day", "max_open_positions",
        # Risk controls
        "max_position_size_pct", "emergency_stop_balance",
        "daily_loss_limit_pct", "risk_per_trade_pct",
        # Paper → Live gate
        "min_paper_win_rate", "min_paper_trades",
        # Execution
        "auto_square_off_time", "allow_premarket",
    }
    filtered = {k: v for k, v in body.items() if k in allowed}
    # Coerce numeric strings (HTML number inputs sometimes post as strings) to proper types
    int_keys  = {"max_trades_per_day", "max_open_positions", "emergency_stop_balance", "min_paper_trades"}
    num_keys  = {"max_position_size_pct", "daily_loss_limit_pct", "risk_per_trade_pct", "min_paper_win_rate"}
    for k in list(filtered.keys()):
        try:
            if k in int_keys:  filtered[k] = int(float(filtered[k]))
            elif k in num_keys: filtered[k] = float(filtered[k])
            elif k == "allow_premarket": filtered[k] = bool(filtered[k])
        except (TypeError, ValueError):
            pass
    new_cfg = save_real_config(filtered)
    logger.info(f"✅ Real trading config saved: { {k: filtered[k] for k in filtered if k not in ('capitals','active_strategies')} }")
    return {"status": "saved", "config": new_cfg}


@app.get("/api/real-trading/status")
def get_real_trading_status():
    """Return real-trading positions + P&L from broker only (no paper data)."""
    global broker, real_trading_enabled
    cfg = load_real_config()

    # Shared scan info — paper & real both consume the SAME scan cycle (every ~180s).
    # This surfaces it so the Real Trading UI can show the scan is running.
    scan_info = {
        "scan_count": 0,
        "last_scan": None,
        "next_scan_eta_seconds": None,
        "scan_interval_seconds": 180,
        "scan_running": False,
        "pending_signals": [],
        "real_watchlist": [],
    }
    if auto_trader:
        try:
            interval = int(auto_trader.config.get("scan_interval_seconds", 180))
            last = auto_trader.last_scan
            eta = None
            if last is not None:
                elapsed = (datetime.now() - last).total_seconds()
                eta = max(0, int(interval - elapsed))
            lsd = auto_trader.last_scan_data or {}
            scan_info.update({
                "scan_count": auto_trader.scan_count,
                "last_scan": last.isoformat() if last else None,
                "next_scan_eta_seconds": eta,
                "scan_interval_seconds": interval,
                "scan_running": auto_trader.running,
                "pending_signals": lsd.get("pending_signals", []),
                "real_watchlist": lsd.get("real_watchlist", []),
            })
        except Exception:
            pass

    base = {
        "config": cfg,
        "real_trading_enabled": real_trading_enabled,
        "connected": False,
        "balance": 0,
        "positions": [],
        "today_pnl": 0,
        "total_pnl": 0,
        "stats": {"total_trades": 0, "win_rate": 0, "avg_win": 0, "avg_loss": 0, "total_pnl": 0},
        "scan": scan_info,
    }

    if not broker or not broker.connected:
        return base

    try:
        balance = broker.get_balance()
        # Detect token-expiry / auth failure (Kite handshake OK but margins() fails)
        if balance.get("status") != "success":
            base["auth_error"] = balance.get("message", "Broker auth failed")
            base["connected"] = False
            return base
        positions_raw = broker.get_positions() or {}
        net_positions = positions_raw.get("net", []) if isinstance(positions_raw, dict) else []

        today_pnl = 0.0
        live_positions = []
        for p in net_positions:
            qty = p.get("quantity", 0)
            if qty == 0:
                continue
            pnl = float(p.get("pnl", 0))
            today_pnl += pnl
            live_positions.append({
                "symbol": p.get("tradingsymbol", ""),
                "quantity": qty,
                "entry_price": float(p.get("average_price", 0)),
                "current_price": float(p.get("last_price", 0)),
                "unrealized_pnl": pnl,
                "strategy": p.get("product", "—"),
            })

        base.update({
            "connected": True,
            "balance": balance.get("available_cash", 0),
            "total_balance": balance.get("total_balance", 0),
            "positions": live_positions,
            "today_pnl": today_pnl,
        })
    except Exception as e:
        logger.error(f"Real trading status fetch failed: {e}")

    return base


@app.get("/api/eodhd/news")
def get_eodhd_news(limit: int = 50):
    """Get market news from EODHD (cached 2 hours — conserves free plan quota)."""
    from eodhd_engine import get_market_news as _eodhd_news, cache_stats
    news = _eodhd_news(limit=limit)
    return {"news": news, "count": len(news), "cache": cache_stats()}


@app.get("/api/eodhd/news/{symbol}")
def get_eodhd_stock_news(symbol: str):
    """Get stock-specific news from EODHD (1 API call — use sparingly)."""
    from eodhd_engine import get_stock_news, get_news_sentiment_for_symbol
    sym = symbol.replace(".NS", "").replace(".BO", "")
    return {
        "symbol": sym,
        "news": get_stock_news(sym),
        "sentiment": get_news_sentiment_for_symbol(sym),
    }


@app.get("/api/eodhd/status")
def get_eodhd_status():
    """EODHD API status and cache stats."""
    from eodhd_engine import cache_stats, EODHD_KEY
    import os
    return {
        "configured": bool(os.getenv("EODHD_API_KEY")),
        "plan": "Free Starter (20 calls/day)",
        "best_for": ["Market news (1 call = 50 items)", "EOD historical data", "Fundamental data"],
        "cache": cache_stats(),
    }


@app.post("/api/auto-trader/smc-analyze/{symbol}")
async def analyze_smc_symbol(symbol: str):
    """Run SMC/ICT analysis on a specific symbol on demand."""
    from smc_engine import analyze_smc
    import asyncio
    from concurrent.futures import ThreadPoolExecutor
    _exec = ThreadPoolExecutor(max_workers=1)
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(_exec, lambda: analyze_smc(symbol))
    return result


# ── Unified AI Orchestrator Endpoints ────────────────────────────────────────


@app.post("/api/analyze/{symbol}")
async def analyze_symbol_unified(symbol: str, body: dict = None):
    """
    Unified single-call AI analysis for a stock symbol.

    Returns ALL dimensions in one response:
      - technicalSignal (signal, confidence, summary)
      - investorPerspectives (5 legendary investors)
      - newsSentiment (score, label, summary)
      - tradeRecommendation (entry, targets, stop-loss, reasoning)
      - riskAnalysis (riskLevel, approved, summary)

    Responses are cached for 5 minutes (keyed by symbol + indicator snapshot + news).
    Pass {"force_refresh": true} in body to bypass cache.
    """
    from ai_orchestrator import analyze_stock as _orch, cache_stats
    from market_engine import fetch_all_stocks
    from news_engine import get_market_news, get_overall_sentiment

    if body is None:
        body = {}

    force_refresh = body.get("force_refresh", False)

    # Normalise symbol
    if not symbol.endswith(".NS") and not symbol.endswith(".BO"):
        symbol = symbol.upper() + ".NS"

    try:
        loop = asyncio.get_event_loop()

        # Fetch stock data (runs all 12 indicators)
        all_stocks = await loop.run_in_executor(executor, fetch_all_stocks)
        stock = next((s for s in all_stocks if s.get("symbol") == symbol), None)

        if not stock:
            return {"error": f"Symbol {symbol} not found", "symbol": symbol}

        news = await get_market_news()
        sentiment = get_overall_sentiment(news)
        market_sentiment = sentiment.get("sentiment", "NEUTRAL") if isinstance(sentiment, dict) else str(sentiment)

        result = await loop.run_in_executor(
            executor,
            lambda: _orch(
                stock=stock,
                all_news=news,
                market_sentiment=market_sentiment,
                confluence=stock.get("score", 0),
                capital=user_config.get("capital", 100_000),
                risk_pct=user_config.get("risk_percent", 1.5),
                force_refresh=force_refresh,
            ),
        )

        result["_orchestrator_cache_stats"] = cache_stats()
        return result

    except Exception as e:
        logger.error(f"/api/analyze/{symbol} error: {e}")
        return {"error": str(e), "symbol": symbol}


@app.get("/api/analyze/cache/stats")
def orchestrator_cache_stats():
    """Return current state of the AI orchestrator in-memory cache."""
    from ai_orchestrator import cache_stats
    return cache_stats()


@app.delete("/api/analyze/cache/clear")
def orchestrator_cache_clear():
    """Flush the entire orchestrator cache (forces fresh AI calls on next analysis)."""
    from ai_orchestrator import _cache
    count = len(_cache)
    _cache.clear()
    return {"cleared": count}


@app.post("/api/auto-trader/scan-now")
async def force_scan_now():
    """Force a scan cycle immediately (for testing outside market hours)."""
    global auto_trader
    if not auto_trader:
        # Start a temporary auto trader for the scan
        cfg = load_auto_config()
        auto_trader = AutoTrader(cfg)
        auto_trader.running = True

    try:
        await auto_trader.scan_cycle()
        return {
            "status": "scan_complete",
            "scan_count": auto_trader.scan_count,
            "last_scan": auto_trader.last_scan.isoformat() if auto_trader.last_scan else None,
            "data": auto_trader.last_scan_data,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ── Manual Trade Endpoints ────────────────────────────────────────────

@app.get("/api/manual-trades")
def list_manual_trades():
    return manual_trade_store.get_manual_trades()

@app.post("/api/manual-trades")
def create_manual_trade(trade: dict):
    return manual_trade_store.save_manual_trade(trade)

@app.post("/api/manual-trades/{trade_id}/exit")
def exit_manual_trade(trade_id: str, body: dict):
    return manual_trade_store.exit_manual_trade(trade_id, body.get("exit_price", 0), body.get("notes", ""))

@app.delete("/api/manual-trades/{trade_id}")
def delete_manual_trade_endpoint(trade_id: str):
    manual_trade_store.delete_manual_trade(trade_id)
    return {"status": "deleted"}


# ══════════════════════════════════════════════════════════════════════
# CRYPTO ENDPOINTS — completely isolated /api/crypto/* namespace
# ══════════════════════════════════════════════════════════════════════

# ── Market data ────────────────────────────────────────────────────────

@app.get("/api/crypto/dashboard")
async def crypto_dashboard():
    """Unified crypto dashboard payload — coins + overview + news + sentiment."""
    from crypto_engine import fetch_all_coins, fetch_market_overview, get_top_gainers, get_top_losers, get_buy_candidates, get_sell_candidates
    from crypto_news_engine import fetch_crypto_news
    from crypto_sentiment_engine import market_sentiment_overview

    loop = asyncio.get_event_loop()
    coins_f = loop.run_in_executor(executor, fetch_all_coins)
    overview_f = loop.run_in_executor(executor, fetch_market_overview)
    news_f = loop.run_in_executor(executor, fetch_crypto_news)
    senti_f = loop.run_in_executor(executor, market_sentiment_overview)

    coins, overview, news_data, senti = await asyncio.gather(
        coins_f, overview_f, news_f, senti_f,
        return_exceptions=True,
    )

    def _fallback(val, default):
        return default if isinstance(val, Exception) else val

    coins = _fallback(coins, [])
    overview = _fallback(overview, {})
    news_data = _fallback(news_data, {"news": [], "sentiment": {}, "trending": []})
    senti = _fallback(senti, {})

    return {
        "coins": coins,
        "overview": overview,
        "sentiment_overview": senti,
        "buy_candidates": get_buy_candidates(coins),
        "sell_candidates": get_sell_candidates(coins),
        "top_gainers": get_top_gainers(coins, 5),
        "top_losers": get_top_losers(coins, 5),
        "news": news_data.get("news", []),
        "news_sentiment": news_data.get("sentiment", {}),
        "trending": news_data.get("trending", []),
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/crypto/overview")
async def crypto_overview():
    from crypto_engine import fetch_market_overview
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, fetch_market_overview)


@app.get("/api/crypto/coins")
async def crypto_coins():
    from crypto_engine import fetch_all_coins
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, fetch_all_coins)


@app.get("/api/crypto/coin/{symbol}")
async def crypto_coin(symbol: str):
    from crypto_engine import analyze_coin
    loop = asyncio.get_event_loop()
    sym = symbol.upper()
    if not sym.endswith("USDT"):
        sym = sym + "USDT"
    result = await loop.run_in_executor(executor, lambda: analyze_coin(sym))
    return result or {"error": f"{sym} not available"}


@app.get("/api/crypto/chart/{symbol}")
async def crypto_chart(symbol: str, interval: str = "1h", limit: int = 100):
    from crypto_engine import fetch_chart_data
    loop = asyncio.get_event_loop()
    sym = symbol.upper()
    if not sym.endswith("USDT"):
        sym = sym + "USDT"
    result = await loop.run_in_executor(
        executor, lambda: fetch_chart_data(sym, interval=interval, limit=limit)
    )
    return result or {"error": f"No chart data for {sym}"}


@app.get("/api/crypto/news")
async def crypto_news(limit: int = 30):
    from crypto_news_engine import fetch_crypto_news
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, lambda: fetch_crypto_news(max_items=limit))


@app.get("/api/crypto/sentiment")
async def crypto_sentiment():
    """F&G, funding rates, BTC dominance, altseason."""
    from crypto_sentiment_engine import market_sentiment_overview
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, market_sentiment_overview)


@app.get("/api/crypto/coin/{symbol}/investors")
async def crypto_coin_investors(symbol: str):
    """Run all 8 crypto investor lenses on a single coin."""
    from crypto_engine import analyze_coin
    from crypto_sentiment_engine import market_sentiment_overview
    from crypto_investor_perspectives import analyze_through_crypto_investor_lenses

    sym = symbol.upper()
    if not sym.endswith("USDT"):
        sym = sym + "USDT"

    loop = asyncio.get_event_loop()
    coin = await loop.run_in_executor(executor, lambda: analyze_coin(sym))
    if not coin:
        return {"error": f"{sym} not available"}

    market_ctx = await loop.run_in_executor(executor, market_sentiment_overview)
    indicators = coin.get("indicators", {})
    result = await loop.run_in_executor(
        executor,
        lambda: analyze_through_crypto_investor_lenses(coin, indicators, market_ctx),
    )
    return {"coin": coin, "analysis": result, "market_context": market_ctx}


@app.post("/api/crypto/smc-analyze/{symbol}")
async def crypto_smc_analyze(symbol: str, interval: str = "15m"):
    from crypto_smc_engine import analyze_crypto_smc
    loop = asyncio.get_event_loop()
    sym = symbol.upper()
    if not sym.endswith("USDT"):
        sym = sym + "USDT"
    return await loop.run_in_executor(
        executor, lambda: analyze_crypto_smc(sym, interval=interval)
    )


# ── Auto trader (mirror of /api/auto-trader/*) ─────────────────────────

@app.post("/api/crypto/auto-trader/toggle")
async def crypto_trader_toggle(body: dict):
    global crypto_trader
    enabled = body.get("enabled", False)

    if enabled and not crypto_trader:
        cfg = load_crypto_config()
        cfg["enabled"] = True
        save_crypto_config(cfg)
        crypto_trader = CryptoAutoTrader(cfg)
        asyncio.create_task(crypto_trader.start())
        return {"status": "started", "enabled": True}
    elif not enabled and crypto_trader:
        await crypto_trader.stop()
        crypto_trader = None
        cfg = load_crypto_config()
        cfg["enabled"] = False
        save_crypto_config(cfg)
        return {"status": "stopped", "enabled": False}
    return {"status": "no_change", "enabled": crypto_trader is not None}


@app.get("/api/crypto/auto-trader/status")
def crypto_trader_status():
    if crypto_trader:
        return crypto_trader.get_status()
    cfg = load_crypto_config()
    return {
        "enabled": False, "running": False, "test_mode": cfg.get("test_mode", True),
        "positions": [], "pending_signals": [],
        "capital": cfg.get("capital", 10000),
        "cash_available": cfg.get("capital", 10000),
        "today_pnl": 0, "total_pnl": 0, "portfolio_heat": 0,
        "stats": get_crypto_stats(), "scan_count": 0,
        "strategy_config": {
            "active_strategies": cfg.get("active_strategies", ["A", "B", "C", "D", "E", "F"]),
            "strategy_mode": cfg.get("strategy_mode", "ANY_TRIGGERS"),
            "strategy_min_scores": cfg.get("strategy_min_scores", {}),
        },
        "scan_interval_seconds": cfg.get("scan_interval_seconds", 120),
    }


@app.get("/api/crypto/auto-trader/config")
def crypto_trader_config():
    return load_crypto_config()


@app.post("/api/crypto/auto-trader/config")
def crypto_trader_save_config(config: dict):
    old_cfg = load_crypto_config()
    save_crypto_config(config)
    new_cfg = load_crypto_config()
    new_capital = new_cfg.get("capital")
    if new_capital and new_capital != old_cfg.get("capital"):
        update_crypto_capital(new_capital)
    if crypto_trader:
        crypto_trader.config = new_cfg
    return {"status": "saved", "config": new_cfg}


@app.post("/api/crypto/auto-trader/strategy-config")
def crypto_trader_strategy_config(body: dict):
    """Update active strategies + thresholds."""
    allowed = {"active_strategies", "strategy_mode", "strategy_min_scores"}
    filtered = {k: v for k, v in body.items() if k in allowed}
    save_crypto_config(filtered)
    if crypto_trader:
        crypto_trader.config = load_crypto_config()
    return {"status": "saved", "config": load_crypto_config()}


@app.get("/api/crypto/auto-trader/portfolio")
def crypto_trader_portfolio():
    return get_crypto_portfolio()


@app.get("/api/crypto/auto-trader/positions")
def crypto_trader_positions():
    return get_crypto_positions()


@app.get("/api/crypto/auto-trader/journal")
def crypto_trader_journal(last_n: int = 50):
    return get_crypto_journal(last_n)


@app.get("/api/crypto/auto-trader/journal/stats")
def crypto_trader_journal_stats():
    return get_crypto_stats()


@app.get("/api/crypto/auto-trader/pending-signals")
def crypto_trader_pending():
    return get_crypto_pending()


@app.get("/api/crypto/auto-trader/scan-history")
def crypto_trader_scans(last_n: int = 20):
    return get_crypto_scans(last_n)


@app.get("/api/crypto/auto-trader/strategy-performance")
def crypto_trader_strategy_performance():
    return get_crypto_strategy_perf()


@app.post("/api/crypto/auto-trader/strategy-performance/reset")
def crypto_trader_strategy_reset():
    reset_crypto_strategy_perf()
    return {"status": "reset"}


@app.get("/api/crypto/auto-trader/performance")
def crypto_trader_performance():
    return {
        "stats": get_crypto_stats(),
        "daily_summaries": get_crypto_daily_summaries(30),
    }


@app.get("/api/crypto/auto-trader/daily-summaries")
def crypto_trader_daily_summaries(last_n: int = 30):
    return get_crypto_daily_summaries(last_n)


@app.get("/api/crypto/auto-trader/daily-summary/{target_date}")
def crypto_trader_daily_summary(target_date: str):
    summary = get_crypto_daily_summary(target_date)
    return summary or {"error": f"No summary found for {target_date}"}


@app.post("/api/crypto/auto-trader/scan-now")
async def crypto_trader_scan_now():
    """Force a scan cycle (works 24/7)."""
    global crypto_trader
    if not crypto_trader:
        cfg = load_crypto_config()
        crypto_trader = CryptoAutoTrader(cfg)
        crypto_trader.running = True
    try:
        await crypto_trader.scan_cycle()
        return {
            "status": "scan_complete",
            "scan_count": crypto_trader.scan_count,
            "last_scan": crypto_trader.last_scan.isoformat() if crypto_trader.last_scan else None,
            "data": crypto_trader.last_scan_data,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/crypto/auto-trader/generate-summary")
async def crypto_trader_generate_summary():
    """Generate AI daily summary on demand (persists via save_daily_summary)."""
    global crypto_trader
    from crypto_store import save_daily_summary as save_crypto_daily
    if not crypto_trader:
        cfg = load_crypto_config()
        crypto_trader = CryptoAutoTrader(cfg)
    try:
        summary = await crypto_trader._generate_daily_summary()
        save_crypto_daily(summary)
        return {"status": "generated", "summary": summary}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/crypto/auto-trader/journal/by-strategy/{strategy_key}")
def crypto_journal_by_strategy(strategy_key: str, last_n: int = 100):
    all_entries = get_crypto_journal(last_n)
    enter_symbols = {
        e["symbol"] for e in all_entries
        if e.get("strategy_key") == strategy_key and e.get("action") == "ENTER"
    }
    return [
        e for e in all_entries
        if (e.get("strategy_key") == strategy_key and e.get("action") == "ENTER")
        or (e.get("action") in ("EXIT", "PARTIAL_EXIT") and e.get("symbol") in enter_symbols)
    ]


@app.get("/api/crypto/auto-trader/journal/by-date")
def crypto_journal_by_date(last_n: int = 200):
    from collections import defaultdict
    all_entries = get_crypto_journal(last_n)
    grouped: dict = defaultdict(list)
    for e in all_entries:
        ts = e.get("timestamp", "")
        d = ts[:10] if ts else "unknown"
        grouped[d].append(e)
    result = []
    for d in sorted(grouped.keys(), reverse=True):
        entries = grouped[d]
        enters = [e for e in entries if e.get("action") == "ENTER"]
        exits = [e for e in entries if e.get("action") in ("EXIT", "PARTIAL_EXIT")]
        day_pnl = sum(e.get("pnl", 0) or 0 for e in exits)
        result.append({
            "date": d,
            "trades_taken": len(enters),
            "trades_exited": len(exits),
            "day_pnl": round(day_pnl, 4),
            "entries": entries,
        })
    return result


# ═════════════════════════════════════════════════════════════════════════
# FOREX TRADING ROUTES — 28 forex pairs, SMC/ICT analysis, economic calendar
# ═════════════════════════════════════════════════════════════════════════

@app.get("/api/forex/dashboard")
def forex_dashboard():
    """Get complete forex trading dashboard with all pairs, news, economic calendar."""
    return get_forex_dashboard()


@app.get("/api/forex/pairs")
def forex_pairs(limit: int = 28):
    """Get all forex pairs with technical analysis."""
    data = get_forex_dashboard()
    return data["pairs"][:limit]


@app.get("/api/forex/overview")
def forex_market_overview():
    """Get major forex pair overview + market sentiment."""
    data = get_forex_dashboard()
    return {
        "overview": data["overview"],
        "sentiment": data["sentiment_overview"],
    }


@app.get("/api/forex/buy-candidates")
def forex_buy_candidates():
    """Get pairs with BUY signals."""
    data = get_forex_dashboard()
    return data["buy_candidates"]


@app.get("/api/forex/sell-candidates")
def forex_sell_candidates():
    """Get pairs with SELL signals."""
    data = get_forex_dashboard()
    return data["sell_candidates"]


@app.get("/api/forex/economic-calendar")
def forex_economic_calendar():
    """Get upcoming economic events that affect forex."""
    data = get_forex_dashboard()
    return data["economic_calendar"]


@app.get("/api/forex/news")
def forex_news():
    """Get forex-related news and sentiment."""
    data = get_forex_dashboard()
    return {
        "news": data["news"],
        "timestamp": data["timestamp"],
    }


# ── Real Trading / Zerodha Broker ──────────────────────────────────────
@app.get("/api/broker/test-connection")
def test_zerodha_connection():
    """Test Zerodha broker connection. Verifies both handshake AND session token validity."""
    global broker
    try:
        broker = ZerodhaBroker()
        if not broker.connected:
            return {
                "status": "error",
                "message": "❌ Zerodha connection failed — check KITE_API_KEY in .env",
                "connected": False,
            }
        # Handshake succeeded; now verify the access_token actually works.
        balance = broker.get_balance()
        if balance.get("status") != "success":
            msg = balance.get("message", "")
            if "access_token" in msg.lower() or "api_key" in msg.lower():
                hint = "Access token expired (Zerodha tokens reset daily ~6:00 AM IST). Regenerate KITE_ACCESS_TOKEN via the Kite login flow."
            else:
                hint = msg or "Broker auth failed"
            return {
                "status": "auth_error",
                "message": f"❌ {hint}",
                "connected": False,
                "reason": msg,
            }
        return {
            "status": "success",
            "message": "✅ Connected to Zerodha Kite API",
            "connected": True,
            "balance": balance.get("total_balance", 0),
            "available_cash": balance.get("available_cash", 0),
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"❌ Error: {str(e)}",
            "connected": False,
        }


@app.get("/api/broker/kite-login-url")
def get_kite_login_url():
    """Return the Kite Connect login URL for the UI to open in a new tab."""
    api_key = os.getenv("ZERODHA_API_KEY")
    if not api_key:
        return {"status": "error", "message": "ZERODHA_API_KEY not set in .env"}
    return {
        "status": "success",
        "url": f"https://kite.zerodha.com/connect/login?api_key={api_key}&v=3",
        "api_key": api_key,
    }


class ExchangeTokenBody(BaseModel):
    request_token: str


@app.post("/api/broker/exchange-token")
def exchange_request_token(body: ExchangeTokenBody):
    """
    Exchange a Kite request_token for an access_token, persist it to .env,
    and re-initialize the broker. Call this after the user logs into Kite
    and pastes the request_token from the redirect URL.
    """
    global broker
    import re as _re

    raw = (body.request_token or "").strip()
    if not raw:
        return {"status": "error", "message": "request_token is required"}

    # Accept either the bare token or the full redirect URL
    m = _re.search(r"request_token=([A-Za-z0-9_-]+)", raw)
    request_token = m.group(1) if m else raw

    api_key = os.getenv("ZERODHA_API_KEY")
    api_secret = os.getenv("ZERODHA_API_SECRET")
    if not api_key or not api_secret:
        return {"status": "error", "message": "ZERODHA_API_KEY / ZERODHA_API_SECRET missing in .env"}

    try:
        from kiteconnect import KiteConnect
        kc = KiteConnect(api_key=api_key)
        session = kc.generate_session(request_token, api_secret=api_secret)
        access_token = session["access_token"]
    except Exception as e:
        return {
            "status": "error",
            "message": f"Exchange failed: {e}. Request tokens are single-use and expire in minutes — regenerate via the Kite login URL and retry immediately.",
        }

    # Persist token — two layers so it survives restarts in all environments:
    # 1. os.environ: immediate (current process)
    # 2. JSON store: survives server restarts on cloud (Render, Railway, etc.)
    # 3. .env file: local dev convenience (best-effort, ignored if read-only)
    os.environ["ZERODHA_ACCESS_TOKEN"] = access_token
    _save_stored_token(access_token)  # cloud-safe persistence
    try:
        env_path = Path(__file__).parent / ".env"
        lines = env_path.read_text().splitlines() if env_path.exists() else []
        replaced = False
        for i, line in enumerate(lines):
            if line.startswith("ZERODHA_ACCESS_TOKEN="):
                lines[i] = f"ZERODHA_ACCESS_TOKEN={access_token}"
                replaced = True
                break
        if not replaced:
            lines.append(f"ZERODHA_ACCESS_TOKEN={access_token}")
        env_path.write_text("\n".join(lines) + "\n")
    except Exception:
        pass  # .env write fails on read-only filesystems (Render free tier) — JSON store covers it

    # Re-initialize the broker with the new token
    try:
        broker = ZerodhaBroker()
        balance = broker.get_balance() if broker.connected else {"status": "error"}
    except Exception as e:
        return {"status": "error", "message": f"Saved token but broker init failed: {e}"}

    if balance.get("status") != "success":
        return {
            "status": "error",
            "message": f"Token saved but still can't fetch balance: {balance.get('message', 'unknown')}",
        }

    return {
        "status": "success",
        "message": "✅ Access token saved. Broker is live.",
        "connected": True,
        "balance": balance.get("total_balance", 0),
        "available_cash": balance.get("available_cash", 0),
    }


@app.get("/api/broker/balance")
def get_broker_balance():
    """Get account balance from Zerodha."""
    global broker
    if not broker or not broker.connected:
        return {
            "status": "error",
            "message": "Broker not connected. Call /api/broker/test-connection first"
        }

    balance = broker.get_balance()
    return balance


@app.get("/api/broker/positions")
def get_broker_positions():
    """Get open positions from Zerodha."""
    global broker
    if not broker or not broker.connected:
        return {
            "status": "error",
            "message": "Broker not connected"
        }

    positions = broker.get_positions()
    return positions


@app.post("/api/broker/toggle-real-trading")
def toggle_real_trading(enable: bool):
    """Toggle between test mode and real trading."""
    global real_trading_enabled

    if enable:
        # Verify broker is connected
        global broker
        if not broker or not broker.connected:
            broker = ZerodhaBroker()
            if not broker.connected:
                return {
                    "status": "error",
                    "message": "❌ Cannot enable real trading - broker not connected"
                }

        real_trading_enabled = True
        save_real_config({"enabled": True})  # persist across backend restarts
        return {
            "status": "success",
            "message": "🔴 REAL TRADING ENABLED - Placing actual trades",
            "real_trading_enabled": True
        }
    else:
        real_trading_enabled = False
        save_real_config({"enabled": False})  # persist across backend restarts
        return {
            "status": "success",
            "message": "🟢 TEST MODE ENABLED - No real trades",
            "real_trading_enabled": False
        }


@app.get("/api/broker/status")
def get_broker_status():
    """Get current broker and trading status."""
    global broker, real_trading_enabled

    if broker and broker.connected:
        balance = broker.get_balance()
        # Session/token validity is proved only by margins() succeeding.
        if balance.get("status") != "success":
            return {
                "status": "auth_error",
                "connected": False,
                "real_trading_enabled": False,
                "balance": 0,
                "total_balance": 0,
                "can_trade": False,
                "trading_reason": balance.get("message", "Broker auth failed"),
                "auth_error": balance.get("message", "Broker auth failed"),
                "mode": "OFFLINE",
            }
        can_trade_result = broker.can_trade()
        return {
            "status": "success",
            "connected": True,
            "real_trading_enabled": real_trading_enabled,
            "balance": balance.get("available_cash", 0),
            "total_balance": balance.get("total_balance", 0),
            "can_trade": can_trade_result.get("can_trade", True),
            "trading_reason": can_trade_result.get("reason", ""),
            "mode": "🔴 LIVE" if real_trading_enabled else "🟢 TEST"
        }
    else:
        return {
            "status": "disconnected",
            "connected": False,
            "real_trading_enabled": False,
            "balance": 0,
            "can_trade": False,
            "mode": "OFFLINE"
        }


@app.get("/api/broker/can-trade")
def check_can_trade():
    """Check if trading should continue based on balance limits."""
    global broker

    if not broker or not broker.connected:
        return {
            "can_trade": False,
            "reason": "Broker not connected"
        }

    return broker.can_trade()


@app.get("/api/settings")
def get_settings():
    """Get current trading settings."""
    global trading_settings
    return {"settings": trading_settings}


@app.post("/api/settings")
def update_settings(new_settings: dict):
    """Update trading settings."""
    global trading_settings

    # Validate and update settings
    for key, value in new_settings.items():
        if key in trading_settings:
            trading_settings[key] = value

    logger.info(f"✅ Settings updated: {trading_settings}")
    return {"status": "success", "settings": trading_settings}


@app.get("/api/auto-trader/select-strategies")
def select_strategies(performance_data: dict = None):
    """
    AI selects best strategies based on performance for real trading.
    Uses: win_rate > STRATEGY_WIN_RATE_THRESHOLD
          trades >= MIN_TRADES_FOR_SELECTION
    """
    import os

    threshold = int(os.getenv("STRATEGY_WIN_RATE_THRESHOLD", "60"))
    min_trades = int(os.getenv("MIN_TRADES_FOR_SELECTION", "10"))

    selected = []
    disabled = []

    if not performance_data:
        return {
            "message": "No performance data provided",
            "selected_strategies": [],
            "disabled_strategies": [],
            "threshold": threshold,
            "min_trades": min_trades
        }

    for strategy_id, perf in performance_data.items():
        trades = perf.get("trades", 0)
        win_rate = perf.get("win_rate", 0)

        if trades >= min_trades and win_rate >= threshold:
            selected.append({
                "strategy": strategy_id,
                "win_rate": win_rate,
                "trades": trades,
                "pnl": perf.get("pnl", 0),
                "reason": f"✅ {win_rate}% win rate with {trades} trades"
            })
        else:
            disabled.append({
                "strategy": strategy_id,
                "win_rate": win_rate,
                "trades": trades,
                "reason": f"❌ Need {threshold}% win rate (has {win_rate}%) or {min_trades} trades (has {trades})"
            })

    return {
        "selected_strategies": selected,
        "disabled_strategies": disabled,
        "total_selected": len(selected),
        "threshold": threshold,
        "min_trades": min_trades,
        "recommendation": f"Use {len(selected)} strategy/strategies in real trading"
    }


# ── WebSocket ──────────────────────────────────────────────────────────
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    connected_clients.append(ws)

    if latest_dashboard:
        await ws.send_json(latest_dashboard)

    try:
        while True:
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "config":
                    global user_config
                    user_config.update(msg.get("data", {}))
                    save_config(user_config)
                elif msg.get("type") == "refresh":
                    asyncio.create_task(run_analysis())
                elif msg.get("type") == "trade":
                    save_trade(msg.get("data", {}))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        connected_clients.remove(ws)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

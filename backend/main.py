"""
AI Trading Command Center — FastAPI Backend v2
Pro-grade: 12 indicators, news, data persistence, goal tracking.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from contextlib import asynccontextmanager
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
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
    get_portfolio as get_auto_portfolio, get_open_positions as get_auto_positions,
    get_trade_journal, get_pending_signals, get_scan_history,
    get_portfolio_stats as get_auto_stats, get_daily_summaries,
    get_daily_summary_by_date, update_portfolio_capital,
    get_strategy_performance, reset_strategy_performance,
)

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── State ───────────────────────────────────────────────────────────────
latest_dashboard: dict = {}
connected_clients: List[WebSocket] = []
user_config: dict = load_config()
executor = ThreadPoolExecutor(max_workers=4)
auto_trader: Optional[AutoTrader] = None


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
    """
    global auto_trader
    logger.info("📅 Auto Trader scheduler running — will start at 9:15 AM, stop at 3:30 PM IST")

    while True:
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

        # Sleep 60 seconds between checks
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global auto_trader
    asyncio.create_task(run_analysis())

    # Start 10-min refresh loop (only active during market hours)
    asyncio.create_task(_market_hours_refresh_loop())

    # Start auto trader scheduler (auto-start 9:15 AM, auto-stop 3:30 PM)
    asyncio.create_task(_auto_trader_scheduler())

    # Also immediately start if we're currently in market hours
    auto_cfg = load_auto_config()
    if _is_market_open():
        logger.info("🔔 Server started during market hours — Auto Trader starting now...")
        auto_cfg["enabled"] = True
        save_auto_config(auto_cfg)
        auto_trader = AutoTrader(auto_cfg)
        asyncio.create_task(auto_trader.start())
    else:
        logger.info(f"📅 Market is CLOSED — Auto Trader will start automatically at 9:15 AM IST")

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

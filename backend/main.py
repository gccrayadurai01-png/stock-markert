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
from typing import List
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

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── State ───────────────────────────────────────────────────────────────
latest_dashboard: dict = {}
connected_clients: List[WebSocket] = []
user_config: dict = load_config()
executor = ThreadPoolExecutor(max_workers=4)


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
@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(run_analysis())
    # No auto-refresh scheduler — manual refresh only to save API credits
    logger.info("🚀 Trading Command Center started (manual refresh mode)")
    yield


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

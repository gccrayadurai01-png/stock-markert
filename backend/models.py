from __future__ import annotations

from pydantic import BaseModel
from typing import Dict, List, Optional
from enum import Enum
from datetime import datetime


class SignalAction(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"
    WATCH = "WATCH"


class SectorStrength(str, Enum):
    STRONG = "STRONG"
    WEAK = "WEAK"
    NEUTRAL = "NEUTRAL"


class Sentiment(str, Enum):
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"
    NEUTRAL = "NEUTRAL"


class StockSignal(BaseModel):
    stock_name: str
    symbol: str
    action: SignalAction
    entry_price: float
    stop_loss: float
    target_1: float
    target_2: Optional[float] = None
    position_size: float = 0.0
    capital_allocated: float = 0.0
    risk_percent: float = 0.0
    confidence: int  # 1-10
    reason: str
    what_could_go_wrong: str


class IntradaySignal(BaseModel):
    stock_name: str
    symbol: str
    action: SignalAction
    entry_price: float
    stop_loss: float
    target: float
    reason: str


class SectorInfo(BaseModel):
    name: str
    strength: SectorStrength
    change_percent: float
    rationale: str


class NewsItem(BaseModel):
    headline: str
    source: str
    sentiment: Sentiment
    impact: str
    url: Optional[str] = None


class MacroEvent(BaseModel):
    event: str
    impact: str
    severity: str  # HIGH, MEDIUM, LOW


class Alert(BaseModel):
    message: str
    severity: str  # CRITICAL, WARNING, INFO
    timestamp: datetime


class EmotionWarning(BaseModel):
    warning_type: str  # FOMO, OVERTRADING, REVENGE, CHASING
    message: str


class MarketOverview(BaseModel):
    nifty_50: float
    nifty_50_change: float
    sensex: float
    sensex_change: float
    bank_nifty: float
    bank_nifty_change: float
    india_vix: float
    market_status: str  # OPEN, CLOSED, PRE_OPEN


class DashboardData(BaseModel):
    timestamp: datetime
    market_overview: MarketOverview
    buy_signals: List[StockSignal]
    sell_signals: List[StockSignal]
    watchlist: List[StockSignal]
    intraday_signals: List[IntradaySignal]
    sectors: List[SectorInfo]
    news: List[NewsItem]
    macro_events: List[MacroEvent]
    alerts: List[Alert]
    emotion_warnings: List[EmotionWarning]
    fii_dii: Dict
    user_capital: float
    risk_per_trade: float


class UserConfig(BaseModel):
    capital: float = 100000.0
    risk_percent: float = 1.0
    max_trades: int = 5

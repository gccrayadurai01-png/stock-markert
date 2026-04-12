export interface InvestorPerspective {
  investor: string;
  signal: string;
  confidence: number;
  reasoning: string;
  style: string;
}

export interface InvestorConsensus {
  bullish_count: number;
  bearish_count: number;
  neutral_count: number;
  avg_confidence: number;
  confidence_boost: number;
  aggregate_signal: string;
  aggregate_confidence: number;
  key_insight: string;
}

export interface RecommendedTrade {
  stock_name: string;
  symbol: string;
  action: "BUY" | "SELL";
  trade_type: "INTRADAY" | "SWING" | "POSITIONAL";
  entry_price: number;
  stop_loss: number;
  target_1: number;
  target_2: number;
  capital_to_deploy: number;
  shares_to_buy: number;
  confidence: number;
  reason: string;
  risk: string;
  indicator_summary: string;
  investor_perspectives?: InvestorPerspective[];
  investor_consensus?: InvestorConsensus;
}

export interface AvoidStock {
  symbol: string;
  reason: string;
}

export interface ExitSignal {
  symbol: string;
  reason: string;
  urgency: "HIGH" | "MEDIUM";
}

export interface SectorInfo {
  name: string;
  verdict: "STRONG" | "WEAK" | "AVOID";
  reason: string;
}

export interface MacroImpact {
  event: string;
  impact: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
}

export interface EmotionWarning {
  type: string;
  message: string;
}

export interface NewsItem {
  headline: string;
  source: string;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  url?: string;
  affected_stocks?: string[];
}

export interface StockAnalysis {
  symbol: string;
  name: string;
  price: number;
  change_percent: number;
  signal: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL" | "NO_DATA";
  score: number;
  confidence: number;
  stop_loss: number;
  target_1: number;
  target_2: number;
  atr: number;
  rsi: number;
  macd_vote: string;
  supertrend_dir: string;
  ema_align: string;
  adx: number;
  bb_pct: number;
  vwap_vote: string;
  volume_spike: boolean;
  votes: { BUY: number; SELL: number; NEUTRAL: number };
  investor_perspectives?: InvestorPerspective[];
  investor_consensus?: InvestorConsensus;
}

export interface MarketOverview {
  nifty_50: number;
  nifty_50_change: number;
  nifty_50_high: number;
  nifty_50_low: number;
  sensex: number;
  sensex_change: number;
  bank_nifty: number;
  bank_nifty_change: number;
  india_vix: number;
  market_status: "OPEN" | "CLOSED" | "PRE_OPEN";
}

export interface GoalProjection {
  days: number;
  months: number;
  years: number;
  daily_target_rupees: number;
  weekly_target_rupees: number;
  achievable: boolean;
}

export interface TodayPnL {
  date: string;
  total_invested: number;
  realized_pnl: number;
  closed_trades: Array<{
    symbol: string;
    buy_price: number;
    sell_price: number;
    shares: number;
    pnl: number;
  }>;
  open_positions: Array<{
    symbol: string;
    buy_price: number;
    shares: number;
    amount: number;
  }>;
  trade_count: number;
}

// Chart types
export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartData {
  symbol: string;
  name: string;
  interval: string;
  candles: Candle[];
  rsi: Array<{ date: string; value: number }>;
  macd: Array<{ date: string; macd: number; signal: number; histogram: number }>;
  bollinger: Array<{ date: string; upper: number; middle: number; lower: number }>;
  ema20: Array<{ date: string; value: number }>;
  ema50: Array<{ date: string; value: number }>;
  error?: string;
}

// Mode config
export interface ModeConfig {
  mode: string;
  capital: number;
  risk_percent: number;
  max_trades: number;
  indicators: string[];
  timeframe: string;
  description: string;
}

// Portfolio
export interface PortfolioTrade {
  symbol: string;
  action: "BUY" | "SELL";
  price: number;
  shares: number;
  amount: number;
  date: string;
  timestamp: string;
  mode?: string;
}

export interface PortfolioData {
  all_trades: PortfolioTrade[];
  today_pnl: TodayPnL;
  total_trades: number;
}

// News-driven trade suggestions
export interface NewsTrade {
  symbol: string;
  name: string;
  action: "BUY" | "SELL";
  trade_type: string;
  price: number;
  stop_loss: number;
  target_1: number;
  target_2: number;
  reason: string;
  news_headline: string;
  news_sentiment: string;
  indicator_score: number;
  confidence: number;
  sectors: string[];
}

// Auto Trader Types
export interface AutoTraderPosition {
  symbol: string;
  name: string;
  entry_price: number;
  entry_time: string;
  shares: number;
  capital_deployed: number;
  stop_loss: number;
  trailing_stop: number;
  target_1: number;
  target_2: number;
  target_1_hit: boolean;
  partial_exit_done: boolean;
  confluence_score: number;
  entry_reasoning: string[];
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  status: "OPEN" | "PARTIAL_EXIT" | "CLOSED";
  atr: number;
}

export interface AutoTraderPendingSignal {
  symbol: string;
  name: string;
  price: number;
  confluence_score: number;
  missing: string[];
  met_conditions: string[];
}

export interface AutoTraderJournalEntry {
  timestamp: string;
  symbol: string;
  action: "ENTER" | "EXIT" | "PARTIAL_EXIT" | "SKIP";
  confluence_score?: number;
  entry_price?: number;
  exit_price?: number;
  pnl?: number;
  pnl_pct?: number;
  reasoning: string[];
  hold_duration_minutes?: number;
}

export interface AutoTraderStats {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  total_pnl_pct: number;
  avg_win: number;
  avg_loss: number;
  best_trade: { symbol: string; pnl: number } | null;
  worst_trade: { symbol: string; pnl: number } | null;
  max_drawdown: number;
}

export interface AutoTraderIntelligence {
  news_articles: number;
  market_sentiment: string;
  news_last_updated: string | null;
  ai_enabled: boolean;
  indicators_active: number;
  investor_perspectives: number;
}

export interface AutoTraderData {
  enabled: boolean;
  running: boolean;
  test_mode: boolean;
  scan_count: number;
  last_scan: string | null;
  positions: AutoTraderPosition[];
  pending_signals: AutoTraderPendingSignal[];
  capital: number;
  cash_available: number;
  today_pnl: number;
  total_pnl: number;
  portfolio_heat: number;
  stats: AutoTraderStats;
  risk_status: { can_trade: boolean; reason: string; max_positions?: number; positions?: number; portfolio_heat?: number; cash_available?: number };
  intelligence?: AutoTraderIntelligence;
}

// Navigation
export type ScreenTab = "dashboard" | "intraday" | "swing" | "positional" | "options" | "portfolio" | "news" | "auto-trader";

export interface DashboardData {
  timestamp: string;
  market_overview: MarketOverview;
  market_verdict: string;
  verdict_reason: string;
  action_plan: string;
  pre_market_plan: string;
  first_30_min_plan: string;
  recommended_trades: RecommendedTrade[];
  avoid_stocks: AvoidStock[];
  exit_signals: ExitSignal[];
  sectors: SectorInfo[];
  macro_impact: MacroImpact[];
  emotion_warnings: EmotionWarning[];
  key_levels: Record<string, number>;
  all_stocks: StockAnalysis[];
  buy_candidates: StockAnalysis[];
  sell_candidates: StockAnalysis[];
  top_gainers: StockAnalysis[];
  top_losers: StockAnalysis[];
  news: NewsItem[];
  news_sentiment: {
    sentiment: string;
    bullish: number;
    bearish: number;
    neutral: number;
    total: number;
  };
  today_pnl: TodayPnL;
  goal: Record<string, number | string>;
  goal_projection: GoalProjection;
  user_capital: number;
  risk_per_trade: number;
  max_trades: number;
  trading_mode: string;
  news_trades: NewsTrade[];
}

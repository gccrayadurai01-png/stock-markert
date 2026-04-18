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
  strategy_key?: string;
  strategy_name?: string;
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
  strategy_config?: StrategyConfig;
  scan_interval_seconds?: number;
}

// ── Strategy / SMC Types ───────────────────────────────────────────────

export type StrategyId = "A" | "B" | "C" | "D";
export type StrategyMode = "ALL_REQUIRED" | "ANY_TRIGGERS";

export interface StrategyPerformance {
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  best_pnl: number;
  worst_pnl: number;
}

export type StrategyTradeLog = Array<{
  symbol: string; strategy: string; pnl: number;
  strategies_confirmed: string[]; scores: Record<string, number>;
  date: string; timestamp: string;
}>;

export interface StrategyPerformanceMap {
  [key: string]: StrategyPerformance;  // "A", "B", "C", "D", "A+B", "A+B+C+D" etc.
}

export interface StrategyConfig {
  active_strategies: StrategyId[];
  strategy_mode: StrategyMode;
  smc_min_score: number;
  smc_on_top_candidates_only?: boolean;
}

export interface SMCOrderBlock {
  type: "BULLISH" | "BEARISH";
  high: number; low: number; mid: number;
  index: number; touched: boolean; fresh: boolean;
}

export interface SMCFairValueGap {
  type: "BULLISH" | "BEARISH";
  high: number; low: number; mid: number;
  size: number; filled: boolean;
}

export interface SMCAnalysis {
  available: boolean;
  symbol: string;
  smc_score: number;
  signal: "BULLISH" | "BEARISH" | "NEUTRAL" | "NO_DATA";
  reasons: string[];
  missing: string[];
  structure?: {
    trend: string; last_event: { type: string; direction: string; label: string } | null;
    choch: boolean; bias: string;
    swing_highs: Array<{ price: number; index: number }>;
    swing_lows: Array<{ price: number; index: number }>;
  };
  order_blocks?: SMCOrderBlock[];
  fair_value_gaps?: SMCFairValueGap[];
  premium_discount?: {
    zone: "PREMIUM" | "DISCOUNT" | "NEUTRAL"; pct: number;
    swing_high: number; swing_low: number; equilibrium: number;
    fib_382: number; fib_618: number; fib_79: number;
    in_ote_buy: boolean; in_ote_sell: boolean;
  };
  liquidity?: {
    sell_side_liquidity: number[]; buy_side_liquidity: number[];
    prev_session_high: number; prev_session_low: number;
  };
  current_price?: number;
  candles_used?: number;
  interval?: string;
}

// Daily Summary Types
export interface DailySummaryAIAnalysis {
  market_recap: string;
  why_trades: string;
  strategies_analysis: string;
  big_news: string[];
  fii_dii_analysis: string;
  tomorrow_outlook: string;
  risk_notes: string;
  grade: string;
}

export interface FIIDIIData {
  fii_buy: number;
  fii_sell: number;
  fii_net: number;
  dii_buy: number;
  dii_sell: number;
  dii_net: number;
  source: string;
  date: string;
  available: boolean;
  headline?: string;
}

export interface DailySummaryTradeDetail {
  symbol: string;
  action: string;
  confluence_score: number;
  entry_price: number;
  reasoning: string[];
}

export interface DailySummaryExitDetail {
  symbol: string;
  pnl: number;
  pnl_pct: number;
  reasoning: string[];
}

export interface DailySummary {
  date: string;
  capital: number;
  cash: number;
  positions_held: number;
  today_pnl: number;
  total_pnl: number;
  total_scans: number;
  trades_taken: number;
  trades_exited: number;
  trades_skipped: number;
  trade_details: DailySummaryTradeDetail[];
  exit_details: DailySummaryExitDetail[];
  stats: AutoTraderStats;
  ai_summary?: {
    ai_analysis: DailySummaryAIAnalysis;
    fii_dii: FIIDIIData;
    market_sentiment: string;
    news_headlines: string[];
  };
  // Also support flat ai_analysis (when generated manually)
  ai_analysis?: DailySummaryAIAnalysis;
  fii_dii?: FIIDIIData;
}

// ══════════════════════════════════════════════════════════════════════
// CRYPTO TYPES — mirrors stock shapes but with crypto-native fields
// ══════════════════════════════════════════════════════════════════════

export type CryptoSignal = "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL" | "NO_DATA";

export interface CryptoAnalysis {
  symbol: string;          // e.g. "BTCUSDT"
  name: string;            // e.g. "Bitcoin"
  price: number;
  prev_close: number;
  change_percent: number;
  change_24h_pct: number;
  high_24h: number;
  low_24h: number;
  volume_24h_usd: number;
  trades_24h: number;
  signal: CryptoSignal;
  score: number;
  confidence: number;
  stop_loss: number;
  target_1: number;
  target_2: number;
  atr: number;
  votes: { BUY: number; SELL: number; NEUTRAL: number };
  indicators: Record<string, unknown>;
}

export interface CryptoMarketOverview {
  btc_price: number;
  btc_change_24h: number;
  btc_high_24h: number;
  btc_low_24h: number;
  eth_price: number;
  eth_change_24h: number;
  total_market_cap_usd: number;
  total_volume_24h_usd: number;
  btc_dominance: number;
  eth_dominance: number;
  market_cap_change_24h_pct: number;
  active_cryptocurrencies: number;
  fear_greed_value: number;
  fear_greed_classification: string;
  market_status: "OPEN";
}

export interface CryptoSentimentOverview {
  fear_greed_value: number | null;
  fear_greed_label: string;
  fear_greed_bias: string;
  btc_dominance: number;
  eth_dominance: number;
  altseason: "ACTIVE" | "APPROACHING" | "OFF";
  btc_funding_pct: number;
  eth_funding_pct: number;
  market_cap_change_24h_pct: number;
  overall_bias: string;
  narrative: string;
}

export interface CryptoNewsItem {
  headline: string;
  source: string;
  url: string;
  published: string;
  sentiment: "BULLISH" | "BEARISH" | "NEUTRAL";
  affected_coins: string[];
  narratives: string[];
}

export interface CryptoTrendingCoin {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number | null;
  thumb: string;
}

export interface CryptoDashboardData {
  coins: CryptoAnalysis[];
  overview: CryptoMarketOverview;
  sentiment_overview: CryptoSentimentOverview;
  buy_candidates: CryptoAnalysis[];
  sell_candidates: CryptoAnalysis[];
  top_gainers: CryptoAnalysis[];
  top_losers: CryptoAnalysis[];
  news: CryptoNewsItem[];
  news_sentiment: {
    sentiment: string;
    bullish: number;
    bearish: number;
    neutral: number;
    total: number;
  };
  trending: CryptoTrendingCoin[];
  timestamp: string;
}

// Chart
export interface CryptoCandle {
  date: number;    // unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CryptoChartData {
  symbol: string;
  name: string;
  interval: string;
  candles: CryptoCandle[];
  error?: string;
}

// Auto trader
export interface CryptoPosition {
  symbol: string;
  name: string;
  entry_price: number;
  entry_time: string;
  units: number;                 // fractional
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
  strategy_key?: string;
  strategies_confirmed?: string[];
  strategy_scores?: Record<string, number>;
}

export interface CryptoPendingSignal {
  symbol: string;
  name: string;
  price: number;
  confluence_score: number;
  strategy_id?: string;
  strategy_key?: string;
  strategy_name?: string;
  missing: string[];
  met_conditions: string[];
  strategy_scores?: Record<string, number>;
  strategies_confirmed?: string[];
}

export interface CryptoJournalEntry {
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
  strategy_key?: string;
  strategy_name?: string;
  units?: number;
  stop_loss?: number;
  target_1?: number;
}

export interface CryptoAutoTraderStats {
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
  avg_hold_time_minutes?: number;
  max_drawdown: number;
}

export type CryptoStrategyId = "A" | "B" | "C" | "D" | "E" | "F";

export interface CryptoStrategyConfig {
  active_strategies: CryptoStrategyId[];
  strategy_mode: "ANY_TRIGGERS" | "ALL_REQUIRED";
  strategy_min_scores: Partial<Record<CryptoStrategyId, number>>;
}

export interface CryptoAutoTraderIntelligence {
  news_articles: number;
  market_sentiment: string;
  news_last_updated: string | null;
  ai_enabled: boolean;
  indicators_active: number;
  investor_perspectives: number;
  market_overview?: CryptoSentimentOverview;
}

export interface CryptoAutoTraderData {
  enabled: boolean;
  running: boolean;
  test_mode: boolean;
  scan_count: number;
  last_scan: string | null;
  positions: CryptoPosition[];
  pending_signals: CryptoPendingSignal[];
  capital: number;
  cash_available: number;
  today_pnl: number;
  total_pnl: number;
  portfolio_heat: number;
  stats: CryptoAutoTraderStats;
  risk_status: {
    can_trade: boolean;
    reason: string;
    max_positions?: number;
    positions?: number;
    portfolio_heat?: number;
    cash_available?: number;
  };
  intelligence?: CryptoAutoTraderIntelligence;
  strategy_config?: CryptoStrategyConfig;
  strategy_performance?: StrategyPerformanceMap;
  scan_interval_seconds?: number;
}

export interface CryptoInvestorPerspective {
  investor: string;
  signal: string;
  confidence: number;
  reasoning: string;
  style: string;
}

export interface CryptoInvestorConsensus {
  bullish_count: number;
  bearish_count: number;
  neutral_count: number;
  total_count: number;
  avg_confidence: number;
  confidence_boost: number;
  aggregate_signal: string;
  key_insight: string;
}

export interface CryptoInvestorAnalysis {
  symbol: string;
  investor_perspectives: CryptoInvestorPerspective[];
  consensus: CryptoInvestorConsensus;
}

// Platform selector
export type Platform = "stocks" | "crypto";

// Navigation
export type ScreenTab = "dashboard" | "intraday" | "swing" | "positional" | "options" | "portfolio" | "news" | "auto-trader";
export type CryptoScreenTab = "dashboard" | "scanner" | "portfolio" | "auto-trader" | "chart" | "news" | "investors" | "strategy-lab";

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

"use client";

import type { CryptoAnalysis } from "@/lib/types";
import { fmtUSD, fmtPct, fmtLargeUSD, signalColor, changeColor, shortSymbol } from "@/lib/cryptoFormat";

interface Props {
  buyCandidates: CryptoAnalysis[];
  sellCandidates?: CryptoAnalysis[];
}

function CoinCard({ coin }: { coin: CryptoAnalysis }) {
  const rr =
    coin.stop_loss && coin.target_1 && coin.price
      ? ((coin.target_1 - coin.price) / (coin.price - coin.stop_loss)).toFixed(1)
      : "—";

  return (
    <div className="bg-card border border-orange-500/20 hover:border-orange-500/50 rounded-2xl p-4 md:p-5 flex flex-col gap-3 transition-all">
      {/* Top row */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xl font-black text-foreground">{shortSymbol(coin.symbol)}</div>
          <div className="text-xs text-muted">{coin.name}</div>
        </div>
        <div className="text-right">
          <span className={`text-[10px] font-black px-2 py-1 rounded border ${signalColor(coin.signal)}`}>
            {coin.signal?.replace("_", " ")}
          </span>
          <div className="text-[10px] text-muted mt-1">Score {coin.score > 0 ? "+" : ""}{coin.score}</div>
        </div>
      </div>

      {/* Price */}
      <div>
        <div className="text-xl font-black">{fmtUSD(coin.price, coin.price)}</div>
        <div className={`text-sm font-semibold ${changeColor(coin.change_24h_pct)}`}>
          {fmtPct(coin.change_24h_pct)} · 24h: {fmtUSD(coin.low_24h, coin.price)} – {fmtUSD(coin.high_24h, coin.price)}
        </div>
      </div>

      {/* SL / T1 / T2 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-red/10 border border-red/20 rounded-lg p-2 text-center">
          <div className="text-[9px] text-red uppercase font-bold">Stop Loss</div>
          <div className="text-xs font-black text-red">{fmtUSD(coin.stop_loss, coin.price)}</div>
        </div>
        <div className="bg-green/10 border border-green/20 rounded-lg p-2 text-center">
          <div className="text-[9px] text-green uppercase font-bold">Target 1</div>
          <div className="text-xs font-black text-green">{fmtUSD(coin.target_1, coin.price)}</div>
        </div>
        <div className="bg-green/10 border border-green/20 rounded-lg p-2 text-center">
          <div className="text-[9px] text-green uppercase font-bold">Target 2</div>
          <div className="text-xs font-black text-green">{fmtUSD(coin.target_2, coin.price)}</div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-xs text-muted">
        <span>R:R <strong className="text-foreground">{rr}</strong></span>
        <span>Conf <strong className="text-foreground">{coin.confidence?.toFixed(0)}%</strong></span>
        <span>Vol <strong className="text-foreground">{fmtLargeUSD(coin.volume_24h_usd)}</strong></span>
      </div>

      {/* Vote bar */}
      {coin.votes && (
        <div className="space-y-1">
          <div className="text-[9px] text-muted font-bold uppercase">
            Indicator Votes: {coin.votes.BUY}B · {coin.votes.NEUTRAL}N · {coin.votes.SELL}S
          </div>
          <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
            {coin.votes.BUY > 0 && (
              <div className="bg-green" style={{ flex: coin.votes.BUY }} />
            )}
            {coin.votes.NEUTRAL > 0 && (
              <div className="bg-yellow" style={{ flex: coin.votes.NEUTRAL }} />
            )}
            {coin.votes.SELL > 0 && (
              <div className="bg-red" style={{ flex: coin.votes.SELL }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CryptoTradeCards({ buyCandidates, sellCandidates = [] }: Props) {
  if (!buyCandidates.length && !sellCandidates.length) return null;

  return (
    <section className="space-y-4">
      {buyCandidates.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3">
            Top Buy Candidates
            <span className="text-[10px] font-normal text-muted ml-2">AI-ranked · auto-trader targets</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {buyCandidates.slice(0, 8).map((c) => (
              <CoinCard key={c.symbol} coin={c} />
            ))}
          </div>
        </div>
      )}

      {sellCandidates.length > 0 && (
        <div>
          <h2 className="text-lg font-bold mb-3">
            Sell / Short Candidates
            <span className="text-[10px] font-normal text-muted ml-2">Weakness detected</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sellCandidates.slice(0, 4).map((c) => (
              <CoinCard key={c.symbol} coin={c} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

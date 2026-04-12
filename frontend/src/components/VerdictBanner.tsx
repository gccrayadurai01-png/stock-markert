"use client";

interface Props {
  verdict: string;
  reason: string;
  actionPlan: string;
  preMarketPlan: string;
  first30MinPlan: string;
}

const VERDICT_STYLES: Record<string, string> = {
  BULLISH: "bg-green/10 border-green/30 text-green",
  BEARISH: "bg-red/10 border-red/30 text-red",
  NEUTRAL: "bg-yellow/10 border-yellow/30 text-yellow",
  DANGEROUS: "bg-red/20 border-red/50 text-red",
};

export default function VerdictBanner({ verdict, reason, actionPlan, preMarketPlan, first30MinPlan }: Props) {
  const style = VERDICT_STYLES[verdict] || VERDICT_STYLES.NEUTRAL;

  return (
    <div className={`rounded-xl border-2 p-5 ${style}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl font-black tracking-tight">{verdict}</span>
        {verdict === "DANGEROUS" && <span className="text-2xl">⚠️</span>}
      </div>
      <p className="text-sm font-semibold mb-3">{reason}</p>

      <div className="bg-background/50 rounded-lg p-3 mb-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">ACTION PLAN</div>
        <p className="text-sm text-foreground">{actionPlan}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {preMarketPlan && (
          <div className="bg-background/50 rounded-lg p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">PRE-MARKET</div>
            <p className="text-xs text-foreground/80">{preMarketPlan}</p>
          </div>
        )}
        {first30MinPlan && (
          <div className="bg-background/50 rounded-lg p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">FIRST 30 MINS</div>
            <p className="text-xs text-foreground/80">{first30MinPlan}</p>
          </div>
        )}
      </div>
    </div>
  );
}

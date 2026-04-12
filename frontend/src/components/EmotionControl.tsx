"use client";

import type { EmotionWarning } from "@/lib/types";

interface Props {
  warnings: EmotionWarning[];
}

const ICON_MAP: Record<string, string> = {
  FOMO: "🚫",
  OVERTRADING: "⚠️",
  REVENGE: "🛑",
  CHASING: "❌",
  CAUTION: "⚡",
};

const STATIC_RULES = [
  { icon: "🎯", text: "Stick to your stop loss — NO exceptions" },
  { icon: "💰", text: "Risk only 1-2% per trade — protect your capital" },
  { icon: "🧘", text: "No emotional decisions — trust the system" },
  { icon: "⏳", text: "Cash is a position — being 30-50% cash is smart" },
  { icon: "📉", text: "If price deviates from entry — DO NOT chase" },
];

export default function EmotionControl({ warnings }: Props) {
  return (
    <section>
      <h2 className="text-lg font-bold mb-3">Emotion Control</h2>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {/* Dynamic warnings */}
        {warnings.length > 0 && (
          <div className="border-b border-border">
            {warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-3 px-4 py-3 bg-red/5 border-b border-red/10 last:border-b-0"
              >
                <span className="text-lg shrink-0">
                  {ICON_MAP[w.type] || "⚠️"}
                </span>
                <div>
                  <div className="text-xs font-bold text-red uppercase tracking-wider">
                    {w.type}
                  </div>
                  <p className="text-xs text-foreground/80 mt-0.5">
                    {w.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Static rules */}
        <div className="divide-y divide-border/50">
          {STATIC_RULES.map((rule, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-base">{rule.icon}</span>
              <span className="text-xs text-foreground/70">{rule.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

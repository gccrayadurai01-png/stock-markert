"use client";

import type { SectorInfo } from "@/lib/types";

interface Props {
  sectors: SectorInfo[];
}

export default function SectorHeatmap({ sectors }: Props) {
  if (!sectors.length) return null;

  return (
    <section>
      <h2 className="text-lg font-bold mb-3">Sector Heatmap</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {sectors.map((s) => {
          const color =
            s.verdict === "STRONG"
              ? "bg-green/10 border-green/30 text-green"
              : s.verdict === "WEAK" || s.verdict === "AVOID"
              ? "bg-red/10 border-red/30 text-red"
              : "bg-yellow/10 border-yellow/30 text-yellow";

          return (
            <div
              key={s.name}
              className={`rounded-xl p-3 border ${color} transition-all hover:scale-[1.02]`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm text-foreground">
                  {s.name}
                </span>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1">
                {s.verdict}
              </div>
              <p className="text-xs text-muted leading-relaxed line-clamp-2">
                {s.reason}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

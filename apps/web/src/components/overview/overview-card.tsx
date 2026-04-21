import React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

type Trend = "up" | "down" | "neutral";

export function OverviewCard({
  title,
  value,
  change,
  icon,
  trend = "neutral",
  subValue,
  showDash,
}: {
  title: string;
  value: string;
  change?: number;
  icon: React.ReactNode;
  trend?: Trend;
  subValue?: string;
  showDash?: boolean;
}) {
  const isPositive = trend === "up";
  const changeColor =
    trend === "neutral"
      ? "text-gray-400 bg-white/5 border-white/10"
      : isPositive
        ? "text-green-400 bg-green-500/10 border-green-500/20"
        : "text-red-400 bg-red-500/10 border-red-500/20";

  return (
    <div className="group bg-white/2 border border-white/5 rounded-2xl p-4 sm:p-6 hover:border-white/10 transition-all relative overflow-hidden">
      <div className="flex items-start justify-between mb-3 sm:mb-4 relative z-10">
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 flex items-center justify-center text-gray-300 border border-white/5 group-hover:border-accent/20 group-hover:text-accent transition-colors">
          {React.cloneElement(icon as React.ReactElement, { size: 18 })}
        </div>
        {(change !== undefined || trend !== "neutral") && (
          <div
            className={`flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg border text-[10px] sm:text-xs font-medium ${changeColor}`}
          >
            {trend === "up" ? (
              <ArrowUpRight size={10} className="sm:w-[12px] sm:h-[12px]" />
            ) : trend === "down" ? (
              <ArrowDownRight size={10} className="sm:w-[12px] sm:h-[12px]" />
            ) : null}
            {showDash
              ? "-"
              : change
                ? `${change > 0 ? "+" : ""}${change}%`
                : "—"}
          </div>
        )}
      </div>

      <div className="relative z-10">
        <div className="text-2xl sm:text-3xl font-bold text-white mb-0.5 sm:mb-1 tracking-tight">
          {value}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider font-medium">
            {title}
          </div>
          {subValue && (
            <>
              <span className="text-gray-700">•</span>
              <span className="text-[10px] sm:text-xs text-gray-500">{subValue}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

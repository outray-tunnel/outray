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
    <div className="group bg-white/2 border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all relative overflow-hidden">
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-300 border border-white/5 group-hover:border-accent/20 group-hover:text-accent transition-colors">
          {icon}
        </div>
        {(change !== undefined || trend !== "neutral") && (
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium ${changeColor}`}
          >
            {trend === "up" ? (
              <ArrowUpRight size={12} />
            ) : trend === "down" ? (
              <ArrowDownRight size={12} />
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
        <div className="text-3xl font-bold text-white mb-1 tracking-tight">
          {value}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">
            {title}
          </div>
          {subValue && (
            <>
              <span className="text-gray-700">•</span>
              <span className="text-xs text-gray-500">{subValue}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

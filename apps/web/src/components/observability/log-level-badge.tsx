import { Bug, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { logLevelDisplay, type LogEvent } from "./logs-data";

const tones = {
  zinc: "border-white/[0.07] bg-white/[0.025] text-zinc-400",
  sky: "border-sky-400/[0.12] bg-sky-400/[0.05] text-sky-300",
  amber: "border-amber-400/[0.12] bg-amber-400/[0.05] text-amber-300",
  rose: "border-rose-400/[0.12] bg-rose-400/[0.05] text-rose-300",
} as const;

/** One severity language for the stream and inspector; raw SDK text stays in context. */
export function LogLevelBadge({
  event,
  preserveSeverityText = false,
}: {
  event: Pick<LogEvent, "level" | "severityText" | "severityNumber">;
  preserveSeverityText?: boolean;
}) {
  const presentation = logLevelDisplay(event);
  const Icon = presentation.level === "debug"
    ? Bug
    : presentation.level === "warn"
      ? TriangleAlert
      : presentation.level === "error"
        ? CircleAlert
        : Info;
  const label = preserveSeverityText && event.severityText?.trim()
    ? event.severityText.trim()
    : presentation.label;

  return (
    <span className={`inline-flex min-h-6 w-fit max-w-full shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${tones[presentation.tone]}`}>
      <Icon size={12} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  );
}

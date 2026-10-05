import { CircleAlert, CircleCheck, CircleHelp } from "lucide-react";
import { traceStatusDisplay } from "./traces-data";

/** A trace's recorded status is not a promise about service health. */
export function TraceStatusBadge({ status }: { status: string }) {
  const presentation = traceStatusDisplay(status);
  const known = presentation.status;
  const Icon = known === "error" ? CircleAlert : known === "ok" ? CircleCheck : CircleHelp;
  const tone = known === "error"
    ? "border-rose-400/[0.12] bg-rose-400/[0.05] text-rose-300"
    : known === "ok"
      ? "border-emerald-400/[0.12] bg-emerald-400/[0.05] text-emerald-300"
      : "border-white/[0.07] bg-white/[0.025] text-zinc-400";
  return <span className={`inline-flex min-h-6 w-fit max-w-full shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${tone}`}><Icon size={12} strokeWidth={1.75} className="shrink-0" aria-hidden="true" /><span>{presentation.label}</span></span>;
}

import { CircleAlert, CircleCheck, CircleHelp, Clock3, OctagonAlert, Pause, VolumeX } from "lucide-react";
import { getEffectiveState, type AlertRecord, type AlertState } from "./alerts-data";

export const ALERT_STATUS = {
  healthy: { label: "Healthy", icon: CircleCheck, tone: "text-emerald-400", surface: "border-emerald-400/15 bg-emerald-400/[0.065]" },
  pending: { label: "Pending", icon: Clock3, tone: "text-amber-300", surface: "border-amber-300/15 bg-amber-300/[0.065]" },
  firing: { label: "Firing", icon: CircleAlert, tone: "text-rose-400", surface: "border-rose-400/15 bg-rose-400/[0.065]" },
  no_data: { label: "No data", icon: CircleHelp, tone: "text-zinc-400", surface: "border-white/[0.08] bg-white/[0.035]" },
  error: { label: "Error", icon: OctagonAlert, tone: "text-rose-300", surface: "border-rose-300/15 bg-rose-300/[0.065]" },
  muted: { label: "Muted", icon: VolumeX, tone: "text-zinc-400", surface: "border-white/[0.08] bg-white/[0.035]" },
  paused: { label: "Paused", icon: Pause, tone: "text-zinc-400", surface: "border-white/[0.08] bg-white/[0.035]" },
} as const;

export function AlertIcon({ alert, size = 18 }: { alert: AlertRecord; size?: number }) {
  const { icon: Icon, tone } = ALERT_STATUS[getEffectiveState(alert)] ?? ALERT_STATUS.no_data;
  return <span className={`inline-flex shrink-0 items-center justify-center ${tone}`}><Icon size={size} strokeWidth={1.8} aria-hidden="true" /></span>;
}

export function AlertStateBadge({ state, icon = true }: { state: AlertState; icon?: boolean }) {
  const { label, icon: Icon, tone, surface } = ALERT_STATUS[state] ?? ALERT_STATUS.no_data;
  return <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] leading-5 ${tone} ${surface}`}>{icon && <Icon size={12} strokeWidth={1.8} aria-hidden="true" />}{label}</span>;
}

export function AlertStatePill({ alert }: { alert: AlertRecord }) {
  return <AlertStateBadge state={getEffectiveState(alert)} />;
}


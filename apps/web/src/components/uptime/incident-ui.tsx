import type { UptimeIncident, UptimeIncidentUpdate } from "./uptime-client";
import { incidentLabel } from "@/lib/uptime/incident-display";

export function IncidentBadge({ incident, updates }: { incident: UptimeIncident; updates?: UptimeIncidentUpdate[] }) {
  const label = incidentLabel(incident, updates);
  const tone = label === "Resolved" ? "bg-emerald-400/[0.07] text-emerald-300" : label === "Draft" ? "bg-white/[0.05] text-zinc-400" : "bg-amber-400/[0.07] text-amber-300";
  return <span className={`inline-flex min-h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs ${tone}`}><span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{label}</span>;
}

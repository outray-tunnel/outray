import { Activity, CircleAlert, CircleCheck, CircleHelp, FilePenLine, SearchCheck, Slash } from "lucide-react";
import type { UptimeIncident, UptimeIncidentStatus, UptimeIncidentUpdate } from "./uptime-client";
import { incidentLabel, publicIncidentStage } from "@/lib/uptime/incident-display";
import { Select } from "@/components/arc/select/select";
import "../outray-arc-theme.css";
import { incidentStageDescriptions } from "./incident-stages";

const incidentStages = ["investigating", "identified", "monitoring", "resolved"] as const;
const presentation = {
  investigating: { label: "Investigating", icon: CircleAlert, className: "text-rose-300 bg-rose-400/[0.09]" },
  identified: { label: "Identified", icon: SearchCheck, className: "text-amber-300 bg-amber-400/[0.09]" },
  monitoring: { label: "Monitoring", icon: Activity, className: "text-blue-300 bg-blue-400/[0.09]" },
  resolved: { label: "Resolved", icon: CircleCheck, className: "text-emerald-300 bg-emerald-400/[0.09]" },
  draft: { label: "Draft", icon: FilePenLine, className: "text-zinc-400 bg-white/[0.05]" },
  down: { label: "Down", icon: CircleAlert, className: "text-rose-300 bg-rose-400/[0.09]" },
  recovered: { label: "Recovered", icon: CircleCheck, className: "text-emerald-300 bg-emerald-400/[0.09]" },
  detected: { label: "Detected issue", icon: CircleHelp, className: "text-amber-300 bg-amber-400/[0.09]" },
  ignored: { label: "Ignored", icon: Slash, className: "text-zinc-400 bg-white/[0.05]" },
} as const;
export type IncidentStage = keyof typeof presentation;

export function StagePill({ stage, compact = false }: { stage: IncidentStage; compact?: boolean }) {
  const item = presentation[stage];
  const Icon = item.icon;
  return <span className={`inline-flex w-fit max-w-full min-h-5 shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] leading-4 ${item.className}`}><Icon size={compact ? 12 : 13} strokeWidth={1.7} aria-hidden="true" />{item.label}</span>;
}

export function IncidentBadge({ incident, updates }: { incident: UptimeIncident; updates?: UptimeIncidentUpdate[] }) {
  const stage = publicIncidentStage(incident, updates);
  const lifecycle = incidentLabel(incident, updates);
  return <span className="inline-flex w-fit flex-wrap items-center gap-1.5"><StagePill stage={stage} compact />{stage !== "draft" && stage !== "ignored" && (stage !== "detected" || incident.status === "resolved") && <span className="text-[10px] text-zinc-500">{lifecycle}</span>}</span>;
}

export function IncidentStatusSelect({ value, onChange, disabled, allowResolved = true, ariaLabel = "Incident status", id, invalid = false, describedBy }: {
  value: UptimeIncidentStatus;
  onChange: (value: UptimeIncidentStatus) => void;
  disabled?: boolean;
  allowResolved?: boolean;
  ariaLabel?: string;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  return <div className="outray-arc-address-filter min-w-0"><Select id={id} label={ariaLabel} value={value} onValueChange={(next) => onChange(next as UptimeIncidentStatus)} disabled={disabled} aria-invalid={invalid} aria-describedby={describedBy}
    options={incidentStages.filter((stage) => allowResolved || stage !== "resolved").map((stage) => {
      const item = presentation[stage]; const Icon = item.icon;
      return { value: stage, label: item.label, description: incidentStageDescriptions[stage], icon: <Icon size={14} className={item.className.split(" ")[0]} aria-hidden="true" /> };
    })} /></div>;
}

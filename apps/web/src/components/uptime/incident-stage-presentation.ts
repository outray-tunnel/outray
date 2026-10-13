import { Activity, CircleAlert, CircleCheck, CircleHelp, FilePenLine, SearchCheck, Slash } from "lucide-react";

export const incidentStagePresentation = {
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

export type IncidentStage = keyof typeof incidentStagePresentation;

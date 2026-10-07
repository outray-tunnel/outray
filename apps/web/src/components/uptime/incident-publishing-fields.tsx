import { useId } from "react";
import { Bell, CircleCheck, Timer } from "lucide-react";
import { Select } from "../arc/select/select";
import { WorkspaceInput } from "../ui/workspace-input";
import styles from "./uptime-ui.module.css";

export type IncidentPublishingMode = "manual" | "after_confirmation" | "automatic";

const modes = [
  { value: "manual", label: "Manual", icon: <Bell size={14} aria-hidden="true" />, description: "Alert the team. You decide when to publish." },
  { value: "after_confirmation", label: "After confirmation", icon: <Timer size={14} aria-hidden="true" />, description: "Publish only when downtime persists." },
  { value: "automatic", label: "Automatic", icon: <CircleCheck size={14} aria-hidden="true" />, description: "Publish after the failure threshold is met." },
];

export function IncidentPublishingFields({ failureThreshold, onFailureThresholdChange, mode, onModeChange,
  publishAfterMinutes, onPublishAfterMinutesChange, disabled = false }: {
  failureThreshold: number;
  onFailureThresholdChange: (value: number) => void;
  mode: IncidentPublishingMode;
  onModeChange: (value: IncidentPublishingMode) => void;
  publishAfterMinutes: number;
  onPublishAfterMinutesChange: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return <fieldset disabled={disabled} className="border-t border-white/[0.07] pt-4">
    <legend className="text-[13px] font-medium text-zinc-200">Incident publishing</legend>
    <p className="mt-1 text-[12px] leading-5 text-zinc-500">Monitor health and public incidents are separate. Choose when customers see an incident.</p>
    <div className={`mt-4 grid gap-4 ${styles.controls}`}>
      <Select label="Confirm Down after" value={String(failureThreshold)} disabled={disabled} onValueChange={(value) => onFailureThresholdChange(Number(value))}
        options={[2, 3, 4, 5].map((count) => ({ value: String(count), label: `${count} failed checks` }))} />
      <Select label="Publish a public incident" value={mode} disabled={disabled} onValueChange={(value) => onModeChange(value as IncidentPublishingMode)} options={modes} />
      {mode === "after_confirmation" && <label htmlFor={`${id}-delay`} className="block text-[12px] text-zinc-300">If still Down after
        <div className="mt-2 flex items-center gap-2"><WorkspaceInput id={`${id}-delay`} className="max-w-24" type="number" min={1} max={60} required value={publishAfterMinutes} onChange={(event) => onPublishAfterMinutesChange(Number(event.target.value))} /><span className="text-[11px] text-zinc-500">minutes after Down is confirmed</span></div>
      </label>}
    </div>
    <p className="mt-3 text-[11px] leading-5 text-zinc-500">Public reports need a published status page and a visible, linked component. Publishing a written update can notify confirmed subscribers; automatic publication alone does not email them.</p>
  </fieldset>;
}

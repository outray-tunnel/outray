import { Select } from "@/components/ui/select";
import { fieldClass, labelClass } from "./uptime-ui";

export type IncidentPublishingMode = "manual" | "after_confirmation" | "automatic";

const modes = [
  { value: "manual", label: "Manual", description: "Notify the team; publish only after acknowledgement." },
  { value: "after_confirmation", label: "After confirmation", description: "Publish if the monitor remains Down for the chosen time." },
  { value: "automatic", label: "Automatic", description: "Publish when the failure threshold is met." },
];

export function IncidentPublishingFields({ failureThreshold, onFailureThresholdChange, mode, onModeChange,
  publishAfterMinutes, onPublishAfterMinutesChange }: {
  failureThreshold: number;
  onFailureThresholdChange: (value: number) => void;
  mode: IncidentPublishingMode;
  onModeChange: (value: IncidentPublishingMode) => void;
  publishAfterMinutes: number;
  onPublishAfterMinutesChange: (value: number) => void;
}) {
  return <fieldset className="md:col-span-2 border-t border-white/[0.07] pt-5">
    <legend className="text-sm font-medium text-zinc-200">Incident publishing</legend>
    <p className="mt-1 text-xs leading-5 text-zinc-500">Checks always determine monitor and component health. These settings control when a public incident report appears.</p>
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <div><span className={labelClass}>Confirm Down after</span><div className="mt-2"><Select ariaLabel="Failed checks to confirm Down" value={String(failureThreshold)} onChange={(value) => onFailureThresholdChange(Number(value))}
        options={[2, 3, 4, 5].map((count) => ({ value: String(count), label: `${count} failed checks` }))} /></div></div>
      <div><span className={labelClass}>Publish a public incident</span><div className="mt-2"><Select ariaLabel="Incident publishing mode" value={mode} onChange={(value) => onModeChange(value as IncidentPublishingMode)} options={modes} /></div></div>
      {mode === "after_confirmation" && <label className={labelClass}>If still Down after
        <div className="mt-2 flex items-center gap-2"><input className={`${fieldClass} w-24`} type="number" min={1} max={60} required value={publishAfterMinutes} onChange={(event) => onPublishAfterMinutesChange(Number(event.target.value))} /><span className="text-xs text-zinc-500">minutes after Down is confirmed</span></div>
      </label>}
    </div>
    <p className="mt-3 text-xs text-zinc-500">Manual is the default. Public reports require a published status page and a linked, visible component. Publishing a team-written update can notify confirmed subscribers; automatic publication alone does not email them.</p>
  </fieldset>;
}

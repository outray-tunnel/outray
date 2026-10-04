import { useId, useState, type FormEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Alert02Icon from "@hugeicons-pro/core-stroke-rounded/Alert02Icon";
import Building03Icon from "@hugeicons-pro/core-stroke-rounded/Building03Icon";
import DatabaseIcon from "@hugeicons-pro/core-stroke-rounded/DatabaseIcon";
import InformationCircleIcon from "@hugeicons-pro/core-stroke-rounded/InformationCircleIcon";
import ListViewIcon from "@hugeicons-pro/core-stroke-rounded/ListViewIcon";
import { Button } from "@/components/arc/button/button";
import { DialogContent } from "@/components/arc/dialog/dialog";
import "../outray-arc-theme.css";

export interface RequestCaptureSettingsModalProps {
  enabled: boolean;
  isLoading: boolean;
  isLoadError: boolean;
  isRetrying: boolean;
  isUpdating: boolean;
  updateError?: string;
  onRetry: () => void;
  onSave: (enabled: boolean) => Promise<void>;
  onCancel: () => void;
}

export type RequestCaptureSettingsFormProps = Pick<
  RequestCaptureSettingsModalProps,
  "enabled" | "isUpdating" | "updateError" | "onSave" | "onCancel"
> &
  Partial<
    Pick<
      RequestCaptureSettingsModalProps,
      "isLoading" | "isLoadError" | "isRetrying" | "onRetry"
    >
  >;

/** The parent owns the Dialog's open state and the persisted setting. */
export function RequestCaptureSettingsModal(
  props: RequestCaptureSettingsModalProps,
) {
  return (
    <DialogContent
      title="Request capture settings"
      description="Choose what OutRay captures for new requests."
      className="outray-arc outray-arc-dialog outray-arc-capture-dialog"
      aria-busy={props.isLoading || props.isUpdating}
      closeDisabled={props.isUpdating}
      onEscapeKeyDown={(event) => {
        if (props.isUpdating) event.preventDefault();
      }}
      onPointerDownOutside={(event) => {
        if (props.isUpdating) event.preventDefault();
      }}
    >
      <RequestCaptureSettingsContent {...props} />
    </DialogContent>
  );
}

export function RequestCaptureSettingsContent(
  props: RequestCaptureSettingsModalProps,
) {
  const settingsReady = !props.isLoading && !props.isLoadError;
  const [hasLoaded, setHasLoaded] = useState(settingsReady);

  // Mount the editor only after the first successful load. Keep it mounted if a
  // later refresh fails so a user's unsaved selection is never discarded.
  if (settingsReady && !hasLoaded) setHasLoaded(true);

  if (!hasLoaded) {
    return props.isLoadError ? (
      <RequestCaptureSettingsLoadError {...props} />
    ) : (
      <RequestCaptureSettingsLoading
        onCancel={props.onCancel}
        isUpdating={props.isUpdating}
      />
    );
  }

  return <RequestCaptureSettingsForm {...props} />;
}

/** Exported separately so the mode choices can be rendered without a portal. */
export function RequestCaptureSettingsForm({
  enabled,
  isUpdating,
  updateError,
  onSave,
  onCancel,
  isLoading = false,
  isLoadError = false,
  isRetrying = false,
  onRetry,
}: RequestCaptureSettingsFormProps) {
  const id = useId();
  const [draftEnabled, setDraftEnabled] = useState(enabled);
  const [saveError, setSaveError] = useState<string>();
  const hasChanges = draftEnabled !== enabled;
  const unavailable = isLoading || isLoadError;
  const error = updateError || saveError;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChanges || isUpdating || unavailable) return;

    setSaveError(undefined);
    try {
      await onSave(draftEnabled);
    } catch {
      // The controller provides the specific error; this also keeps standalone
      // callers from leaving a rejected save without visible feedback.
      setSaveError("Couldn’t save the capture setting. Try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={isUpdating}>
      <p
        id={`${id}-scope`}
        className="mb-5 flex items-center gap-2 text-xs leading-5 text-zinc-500"
      >
        <HugeiconsIcon
          icon={Building03Icon}
          size={15}
          strokeWidth={1.7}
          className="shrink-0"
          aria-hidden="true"
        />
        Applies to all HTTP tunnels in this organization.
      </p>

      <fieldset
        disabled={isUpdating || unavailable}
        aria-describedby={`${id}-scope ${id}-data-note ${id}-effect-note`}
      >
        <legend className="mb-2.5 text-xs text-zinc-400">Capture mode</legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <CaptureModeChoice
            id={`${id}-metadata`}
            name={`${id}-capture-mode`}
            mode="metadata"
            checked={!draftEnabled}
            onSelect={() => setDraftEnabled(false)}
            icon={ListViewIcon}
            title="Metadata only"
            description="Method, path, status and timing."
            detail="Full headers and bodies excluded."
          />
          <CaptureModeChoice
            id={`${id}-full`}
            name={`${id}-capture-mode`}
            mode="full"
            checked={draftEnabled}
            onSelect={() => setDraftEnabled(true)}
            icon={DatabaseIcon}
            title="Full capture"
            description="Metadata, plus request and response headers and bodies."
            detail="Inspect content and replay requests."
          />
        </div>
      </fieldset>

      <div
        id={`${id}-data-note`}
        className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-300/[0.12] bg-amber-300/[0.025] px-3 py-3"
      >
        <HugeiconsIcon
          icon={InformationCircleIcon}
          size={16}
          strokeWidth={1.7}
          className="mt-0.5 shrink-0 text-amber-200/70"
          aria-hidden="true"
        />
        <p className="text-xs leading-[1.55] text-zinc-400">
          <span className="text-amber-100/80">
            Sensitive data may be captured.
          </span>{" "}
          Headers and bodies can contain passwords, tokens, cookies or personal
          data. Enable full capture only when your organization permits storing
          this data.
        </p>
      </div>

      <p
        id={`${id}-effect-note`}
        className="mt-3 text-xs leading-[1.55] text-zinc-500"
      >
        Changes affect future requests only. Turning off full capture does not
        delete existing captures.
      </p>

      <div className="mt-5 flex flex-col gap-3 border-t border-white/[0.07] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          {error ? (
            <p
              id={`${id}-save-error`}
              role="alert"
              className="text-xs leading-5 text-rose-300"
            >
              {error}
            </p>
          ) : isLoadError ? (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="text-xs leading-5 text-rose-300">
                Couldn’t refresh capture settings.
              </p>
              {onRetry && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  loading={isRetrying}
                  disabled={isRetrying}
                  onClick={onRetry}
                >
                  Retry
                </Button>
              )}
            </div>
          ) : isLoading ? (
            <p role="status" className="text-xs leading-5 text-zinc-500">
              Refreshing capture settings…
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={isUpdating}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            loading={isUpdating}
            disabled={(!hasChanges || unavailable) && !isUpdating}
            aria-describedby={error ? `${id}-save-error` : undefined}
          >
            Save changes
          </Button>
        </div>
      </div>
    </form>
  );
}

function CaptureModeChoice({
  id,
  name,
  mode,
  checked,
  onSelect,
  icon,
  title,
  description,
  detail,
}: {
  id: string;
  name: string;
  mode: "metadata" | "full";
  checked: boolean;
  onSelect: () => void;
  icon: typeof ListViewIcon;
  title: string;
  description: string;
  detail: string;
}) {
  return (
    <label htmlFor={id} className="relative min-w-0">
      <input
        id={id}
        name={name}
        type="radio"
        value={mode}
        data-capture-mode={mode}
        checked={checked}
        onChange={onSelect}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description ${id}-detail`}
        className="peer sr-only"
      />
      <span className="flex h-full cursor-pointer flex-col rounded-xl border border-white/[0.09] bg-white/[0.015] p-3.5 transition-colors hover:border-white/20 hover:bg-white/[0.025] peer-checked:border-violet-300/35 peer-checked:bg-violet-300/[0.045] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-violet-400 peer-disabled:cursor-not-allowed peer-disabled:opacity-65 motion-reduce:transition-none">
        <span className="mb-3 flex items-center justify-between gap-3">
          <HugeiconsIcon
            icon={icon}
            size={19}
            strokeWidth={1.7}
            className={checked ? "text-violet-200/80" : "text-zinc-500"}
            aria-hidden="true"
          />
          <span
            className={`flex size-4 items-center justify-center rounded-full border ${checked ? "border-violet-300/80 bg-violet-300/10" : "border-zinc-600"}`}
            aria-hidden="true"
          >
            {checked && (
              <span className="size-1.5 rounded-full bg-violet-200" />
            )}
          </span>
        </span>
        <span
          id={`${id}-title`}
          className="text-[13px] font-medium leading-5 text-zinc-100"
        >
          {title}
        </span>
        <span
          id={`${id}-description`}
          className="mt-1 text-xs leading-[1.55] text-zinc-400"
        >
          {description}
        </span>
        <span
          id={`${id}-detail`}
          className="mt-3 block text-xs leading-[1.55] text-zinc-500"
        >
          {detail}
        </span>
      </span>
    </label>
  );
}

function RequestCaptureSettingsLoading({
  onCancel,
  isUpdating,
}: Pick<RequestCaptureSettingsModalProps, "onCancel" | "isUpdating">) {
  return (
    <div>
      <p role="status" className="sr-only">
        Loading request capture settings…
      </p>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="mb-5 h-5 w-64 max-w-full rounded bg-white/[0.05]" />
        <div className="mb-2.5 h-4 w-24 rounded bg-white/[0.05]" />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-white/[0.09] bg-white/[0.015] p-3.5"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="size-[19px] rounded bg-white/[0.06]" />
                <div className="size-4 rounded-full bg-white/[0.06]" />
              </div>
              <div className="h-5 w-24 rounded bg-white/[0.06]" />
              <div className="mt-1 h-[37px] space-y-1.5 pt-1">
                <div className="h-2.5 w-full rounded bg-white/[0.04]" />
                <div className="h-2.5 w-3/4 rounded bg-white/[0.04]" />
              </div>
              <div className="mt-3 h-[19px] w-4/5 rounded bg-white/[0.04]" />
            </div>
          ))}
        </div>
        <div className="mt-4 h-[100px] rounded-lg border border-white/[0.07] bg-white/[0.015] px-3 py-3 sm:h-[82px]">
          <div className="h-3 w-4/5 rounded bg-white/[0.05]" />
          <div className="mt-2 h-3 w-full rounded bg-white/[0.04]" />
          <div className="mt-2 h-3 w-3/5 rounded bg-white/[0.04]" />
        </div>
        <div className="mt-3 h-[37px] space-y-1.5 pt-1">
          <div className="h-2.5 w-full rounded bg-white/[0.04]" />
          <div className="h-2.5 w-3/4 rounded bg-white/[0.04]" />
        </div>
      </div>
      <UnavailableSettingsActions onCancel={onCancel} isUpdating={isUpdating} />
    </div>
  );
}

function RequestCaptureSettingsLoadError({
  isRetrying,
  isUpdating,
  onRetry,
  onCancel,
}: Pick<
  RequestCaptureSettingsModalProps,
  "isRetrying" | "isUpdating" | "onRetry" | "onCancel"
>) {
  return (
    <div>
      <div className="flex min-h-[330px] flex-col items-center justify-center px-4 text-center">
        <HugeiconsIcon
          icon={Alert02Icon}
          size={24}
          strokeWidth={1.7}
          className="mb-4 text-zinc-500"
          aria-hidden="true"
        />
        <p role="alert" className="text-[13px] leading-5 text-zinc-200">
          Couldn’t load capture settings
        </p>
        <p className="mt-1.5 max-w-64 text-xs leading-5 text-zinc-500">
          Your settings haven’t changed. Try loading them again.
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-4"
          loading={isRetrying}
          disabled={isRetrying || isUpdating}
          onClick={onRetry}
        >
          Try again
        </Button>
      </div>
      <UnavailableSettingsActions onCancel={onCancel} isUpdating={isUpdating} />
    </div>
  );
}

function UnavailableSettingsActions({
  onCancel,
  isUpdating,
}: Pick<RequestCaptureSettingsModalProps, "onCancel" | "isUpdating">) {
  return (
    <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.07] pt-4">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={isUpdating}
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button type="button" size="sm" disabled>
        Save changes
      </Button>
    </div>
  );
}

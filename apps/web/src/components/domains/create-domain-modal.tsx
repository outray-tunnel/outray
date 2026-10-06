import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Globe02Icon from "@hugeicons-pro/core-stroke-rounded/Globe02Icon";
import { isReservedStatusDomain } from "@/lib/reserved-status-domain";
import { Button } from "../arc/button/button";
import { Dialog, DialogContent } from "../arc/dialog/dialog";
import { WorkspaceInput } from "../ui/workspace-input";
import { workspaceInputShellClassName } from "../ui/workspace-input-styles";
import "../outray-arc-theme.css";

export interface CreateDomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (domain: string) => void | Promise<unknown>;
  isPending: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

interface CreateDomainFormProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  isPending: boolean;
  error: string | null;
  inputRef?: RefObject<HTMLInputElement | null>;
  submitRef?: RefObject<HTMLButtonElement | null>;
}

const domainPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function CreateDomainForm({ value, onValueChange, onSubmit, onCancel, isPending, error, inputRef, submitRef }: CreateDomainFormProps) {
  const id = useId();
  const inputId = `create-domain-${id}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const normalized = value.trim().toLowerCase();
  const hasPreview = normalized.split(".").length >= 3 && domainPattern.test(normalized) && !isReservedStatusDomain(normalized);

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} noValidate>
      <label htmlFor={inputId} className="mb-2 block text-[13px] font-normal text-zinc-200">Domain name</label>
      <div className={workspaceInputShellClassName}>
        <span aria-hidden="true" className="shrink-0 border-r border-white/[0.08] pr-3.5 text-zinc-500"><HugeiconsIcon icon={Globe02Icon} size={16} strokeWidth={1.7} /></span>
        <WorkspaceInput
          ref={inputRef}
          variant="bare"
          id={inputId}
          data-outray-composite-input=""
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={isPending}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder="api.example.com"
          aria-invalid={!!error}
          aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
          className="min-w-0 flex-1 font-mono"
        />
      </div>
      <p id={hintId} className="mt-2 text-[12px] leading-5 text-zinc-500">Use a subdomain such as api.example.com, without https:// or a path. Root domains aren’t supported.</p>
      {error && <p id={errorId} role="alert" className="mt-2 text-[12px] leading-5 text-rose-300">{error}</p>}

      <div className="mt-4">
        <p className="text-[11px] text-zinc-500">{hasPreview ? "Domain to add" : "Example domain"}</p>
        <p className="mt-1 break-all font-mono text-[12px] text-zinc-300">{hasPreview ? normalized : "api.example.com"}</p>
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.07] pt-4">
        <Button type="button" variant="secondary" size="md" disabled={isPending} onClick={onCancel}>Cancel</Button>
        <Button ref={submitRef} type="submit" variant="primary" size="md" loading={isPending} disabled={!normalized} aria-describedby={error ? errorId : undefined}>Add domain</Button>
      </div>
    </form>
  );
}

export function CreateDomainModal({ isOpen, onClose, onCreate, isPending, error, setError, triggerRef }: CreateDomainModalProps) {
  const [draft, setDraft] = useState({ isOpen, value: "", submitted: false });
  const submissionLocked = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const submitRef = useRef<HTMLButtonElement | null>(null);
  if (draft.isOpen !== isOpen) {
    setDraft({
      isOpen, value: "", submitted: false,
    });
  }
  const busy = isPending || draft.submitted;

  useEffect(() => { submissionLocked.current = false; }, [isOpen]);

  const dismiss = () => {
    if (!isPending && !submissionLocked.current) {
      setError(null);
      onClose();
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending || submissionLocked.current) return;
    const normalized = draft.value.trim().toLowerCase();
    if (!normalized) {
      setError("Enter a custom domain to add.");
      return;
    }
    if (isReservedStatusDomain(normalized)) {
      setError("status.outray.app and its subdomains are reserved for Uptime status pages.");
      return;
    }
    if (normalized.split(".").length < 3) {
      setError("Only subdomains are allowed. Use an address such as api.example.com.");
      return;
    }
    if (!domainPattern.test(normalized)) {
      setError("Enter a valid domain name, without a URL scheme or path.");
      return;
    }
    setError(null);
    submissionLocked.current = true;
    setDraft((current) => ({ ...current, submitted: true }));
    try {
      await onCreate(normalized);
      setDraft((current) => ({ ...current, value: "" }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not add this domain. Try again.");
    } finally {
      submissionLocked.current = false;
      setDraft((current) => ({ ...current, submitted: false }));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) dismiss(); }}>
      <DialogContent
        title="Add custom domain"
        description="Add a subdomain, set its DNS records, then verify it for tunnel traffic."
        className="outray-arc outray-arc-dialog"
        style={{ width: "min(calc(100vw - 32px), 440px)", "--space-6": "20px", "--text-lg": "18px", "--radius-control": "10px" } as CSSProperties}
        aria-busy={busy}
        closeDisabled={busy}
        onEscapeKeyDown={(event) => { if (isPending || submissionLocked.current) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (isPending || submissionLocked.current) event.preventDefault(); }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          setError(null);
          (inputRef.current?.disabled ? submitRef.current : inputRef.current)?.focus();
        }}
        onCloseAutoFocus={(event) => {
          if (triggerRef?.current) {
            event.preventDefault();
            triggerRef.current.focus();
          }
        }}
      >
        <CreateDomainForm value={draft.value} onValueChange={(next) => { setDraft((current) => ({ ...current, value: next })); setError(null); }} onSubmit={submit} onCancel={dismiss} isPending={busy} error={error} inputRef={inputRef} submitRef={submitRef} />
      </DialogContent>
    </Dialog>
  );
}

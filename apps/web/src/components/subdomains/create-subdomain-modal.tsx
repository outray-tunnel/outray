import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from "react";
import { Button } from "../arc/button/button";
import { Dialog, DialogContent } from "../arc/dialog/dialog";
import "../outray-arc-theme.css";

export interface CreateSubdomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (subdomain: string) => void | Promise<unknown>;
  isPending: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

interface CreateSubdomainFormProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  isPending: boolean;
  error: string | null;
  inputRef?: RefObject<HTMLInputElement | null>;
  submitRef?: RefObject<HTMLButtonElement | null>;
}

export function CreateSubdomainForm({ value, onValueChange, onSubmit, onCancel, isPending, error, inputRef, submitRef }: CreateSubdomainFormProps) {
  const id = useId();
  const inputId = `reserve-subdomain-${id}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const normalized = value.trim().toLowerCase();
  const hasPreview = /^[a-z0-9-]+$/.test(normalized);

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} noValidate>
      <label htmlFor={inputId} className="mb-2 block text-[13px] font-normal text-zinc-200">Subdomain</label>
      <div className="flex h-11 items-center overflow-hidden rounded-lg border border-white/[0.12] bg-[#0a0a0b] transition-colors focus-within:border-white/[0.35] focus-within:ring-1 focus-within:ring-white/[0.12]">
        <input
          ref={inputRef}
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
          placeholder="my-app"
          aria-invalid={!!error}
          aria-describedby={`${hintId}${error ? ` ${errorId}` : ""}`}
          className="h-full min-w-0 flex-1 bg-transparent px-3.5 font-mono text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 disabled:opacity-60"
        />
        <span aria-hidden="true" className="shrink-0 border-l border-white/[0.08] px-3.5 font-mono text-[12px] text-zinc-500">.outray.app</span>
      </div>
      <p id={hintId} className="mt-2 text-[12px] leading-5 text-zinc-500">Use lowercase letters, numbers, and hyphens—for example, my-app.</p>
      {error && <p id={errorId} role="alert" className="mt-2 text-[12px] leading-5 text-rose-300">{error}</p>}

      <div className="mt-4">
        <p className="text-[11px] text-zinc-500">{hasPreview ? "Reserved address" : "Example address"}</p>
        <p className="mt-1 break-all font-mono text-[12px] text-zinc-300">{hasPreview ? normalized : "my-app"}.outray.app</p>
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-white/[0.07] pt-4">
        <Button type="button" variant="secondary" size="md" disabled={isPending} onClick={onCancel}>Cancel</Button>
        <Button ref={submitRef} type="submit" variant="primary" size="md" loading={isPending} disabled={!normalized} aria-describedby={error ? errorId : undefined}>Reserve subdomain</Button>
      </div>
    </form>
  );
}

export function CreateSubdomainModal({ isOpen, onClose, onCreate, isPending, error, setError, triggerRef }: CreateSubdomainModalProps) {
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
      setError("Enter a subdomain to reserve.");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(normalized)) {
      setError("Use lowercase letters, numbers, and hyphens only.");
      return;
    }
    setError(null);
    submissionLocked.current = true;
    setDraft((current) => ({ ...current, submitted: true }));
    try {
      await onCreate(normalized);
      setDraft((current) => ({ ...current, value: "" }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not reserve this subdomain. Try again.");
    } finally {
      submissionLocked.current = false;
      setDraft((current) => ({ ...current, submitted: false }));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) dismiss(); }}>
      <DialogContent
        title="Reserve subdomain"
        description="Keep a predictable address for tunnels in this workspace."
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
        <CreateSubdomainForm value={draft.value} onValueChange={(next) => { setDraft((current) => ({ ...current, value: next })); setError(null); }} onSubmit={submit} onCancel={dismiss} isPending={busy} error={error} inputRef={inputRef} submitRef={submitRef} />
      </DialogContent>
    </Dialog>
  );
}

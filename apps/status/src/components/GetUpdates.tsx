import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "../../../web/src/components/arc/button/button";
import { WorkspaceInput } from "../../../web/src/components/ui/workspace-input";
import { workspaceScopeClassName } from "../../../web/src/components/ui/workspace-scope";
import { submitSubscription } from "./subscription-client";

interface Props {
  pageId: string;
  pageName: string;
  subscribed?: boolean;
}

export default function GetUpdates({ pageId, pageName, subscribed = false }: Props) {
  const [open, setOpen] = useState(subscribed);
  const [sent, setSent] = useState(subscribed);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef(open);
  const submitLock = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const ids = useId();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    if (sent) doneRef.current?.focus({ preventScroll: true });
    else emailRef.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open, sent]);

  useEffect(() => () => {
    requestRef.current?.abort();
    dialogRef.current?.close();
  }, []);

  const requestClose = () => {
    if (!submitLock.current) {
      openRef.current = false;
      setOpen(false);
    }
  };
  const finishClose = () => {
    if (openRef.current) return;
    dialogRef.current?.close();
    triggerRef.current?.focus({ preventScroll: true });
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current || !event.currentTarget.reportValidity()) return;
    submitLock.current = true;
    setSending(true);
    setError(null);
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      await submitSubscription(pageId, emailRef.current?.value ?? "", controller.signal);
      setSent(true);
    } catch (failure) {
      setError(controller.signal.aborted
        ? "The request timed out. Please try again."
        : failure instanceof Error ? failure.message : "We couldn’t request updates. Please try again.");
    } finally {
      window.clearTimeout(timeout);
      requestRef.current = null;
      submitLock.current = false;
      setSending(false);
    }
  };

  return <>
    <span className={`${workspaceScopeClassName} inline-flex shrink-0`}>
      <Button ref={triggerRef} variant="secondary" size="sm" type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={`${ids}-dialog`}
        onClick={() => { setError(null); openRef.current = true; setOpen(true); }}>Get updates</Button>
    </span>
    <dialog ref={dialogRef} id={`${ids}-dialog`} aria-labelledby={`${ids}-heading`} aria-describedby={`${ids}-description`}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-transparent p-0 text-[#f4f4f5] backdrop:bg-transparent [&:not([open])]:hidden"
      onCancel={(event) => { event.preventDefault(); requestClose(); }}>
      <AnimatePresence onExitComplete={finishClose}>
        {open ? <motion.div key="subscription-layer" className="relative flex min-h-full items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.14 }}>
          <motion.div className="fixed inset-0 bg-black/70" aria-hidden="true" onPointerDown={requestClose} />
          <motion.div className={`${workspaceScopeClassName} relative z-10 w-full max-w-[440px] rounded-2xl border border-[#3f3f46] bg-[#18181b] p-6 shadow-[0_24px_70px_#000b]`}
            initial={{ opacity: 0, y: reducedMotion ? 0 : 8, scale: reducedMotion ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reducedMotion ? 0 : 4, scale: reducedMotion ? 1 : 0.99 }}
            transition={{ duration: reducedMotion ? 0 : 0.16, ease: [0.2, 0.8, 0.2, 1] }}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="m-0 text-xl font-semibold tracking-[-0.03em]" id={`${ids}-heading`}>{sent ? "Check your inbox" : "Get incident updates"}</h2>
              <button type="button" className="grid size-9 flex-none place-items-center rounded-lg border-0 bg-transparent text-[#a1a1aa] hover:bg-[#27272a] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close updates" disabled={sending} onClick={requestClose}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
            <p className="mt-3 text-[13px] leading-[1.55] text-[#a1a1aa]" id={`${ids}-description`}>Receive email when the team publishes an incident update for {pageName}. Automatic health changes stay on this page.</p>
            {sent ? <>
              <p className="mt-5 text-[13px] leading-[1.55] text-[#6ee7b7]" role="status">If this address is not already subscribed, check your inbox for a confirmation link. Updates begin only after you confirm your email.</p>
              <div className="mt-6 flex justify-end"><Button ref={doneRef} size="sm" type="button" onClick={requestClose}>Done</Button></div>
            </> : <form className="mt-6" method="post" action="/api/subscribe" onSubmit={submit} aria-busy={sending}>
              <label className="mb-2 block text-xs font-semibold" htmlFor={`${ids}-email`}>Email address</label>
              <WorkspaceInput ref={emailRef} size="compact" className="focus-visible:outline-none!"
                id={`${ids}-email`} name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required disabled={sending}
                aria-invalid={Boolean(error)} aria-describedby={error ? `${ids}-error` : undefined} />
              <input type="hidden" name="pageId" value={pageId} />
              {error ? <p className="mt-3 text-xs leading-normal text-[#fda4af]" id={`${ids}-error`} role="alert">{error}</p> : null}
              <div className="mt-4 flex justify-end"><Button size="sm" type="submit" loading={sending}>{sending ? "Requesting updates…" : "Subscribe to updates"}</Button></div>
              <small className="mt-3 block text-[11px] leading-normal text-[#a1a1aa]">Confirm your email before updates begin. Unsubscribe at any time.</small>
            </form>}
          </motion.div>
        </motion.div> : null}
      </AnimatePresence>
    </dialog>
  </>;
}

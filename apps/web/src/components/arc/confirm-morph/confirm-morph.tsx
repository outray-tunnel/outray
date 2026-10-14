// UIArc registry source: https://uiarc.dev/r/confirm-morph.json.
// Scoped OutRay adaptations preserve upstream morph motion while hardening async deletion.
"use client";

import { useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, Ref } from "react";
import { AnimatePresence, animate, motion, useIsPresent, useMotionValue, useMotionValueEvent, useReducedMotion, useTransform } from "motion/react";
import type { AnimationPlaybackControls, MotionValue, Transition, Variants } from "motion/react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { motionTokens } from "../lib/motion-tokens";
import styles from "./confirm-morph.module.css";

/** Where the control is in its life: resting, asking, working, finished, or failed. */
export type ConfirmMorphState = "idle" | "confirming" | "pending" | "done" | "error";

/** How the question is answered: a press, a press held until the fill completes, or a press followed by a short countdown. */
export type ConfirmMorphMode = "press" | "hold" | "countdown";

/**
 * A button for destructive or important actions that asks in place. Pressing it morphs the same pill into an inline question
 * with Cancel and Confirm, then into a spinner, then into a result with Undo. The width springs to each face while the faces
 * crossfade at their natural width, so text never squashes and nothing around the control jumps. Escape, an outside press,
 * or the timeout all return it to rest.
 * Use it where a modal dialog would be heavy: deleting a project, revoking access, discarding a draft.
 */
export interface ConfirmMorphProps {
  /** The resting label, such as "Delete project". */
  label: ReactNode;
  /** OutRay: keep an icon-only trigger named with its complete resource name. */
  ariaLabel?: string;
  iconOnly?: boolean;
  /** Context and irreversible-action warning announced with the question. */
  description?: ReactNode;
  /** A plain icon before the resting label. */
  icon?: ReactNode;
  /** The question shown while confirming, such as "Delete 3 files?". Defaults to the label with a question mark. */
  prompt?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Shown beside the spinner while `onConfirm` resolves. */
  pendingLabel?: string;
  doneLabel?: string;
  errorLabel?: string;
  retryLabel?: string;
  undoLabel?: string;
  /** Shown beside the spinner while `onUndo` resolves. */
  undoingLabel?: string;
  /**
   * `danger` (default) gives the confirm button the danger colour, for actions that destroy something. `neutral` gives it the
   * accent, for important actions that can be reversed. The resting button is neutral either way.
   */
  tone?: "danger" | "neutral";
  /** `press` confirms on a press. `hold` asks for a press held for `holdDuration`. `countdown` confirms, then counts down `countdown` seconds that Cancel or Escape can still stop. */
  confirmMode?: ConfirmMorphMode;
  /** Milliseconds the confirm button must be held in `hold` mode. */
  holdDuration?: number;
  /** Seconds counted down before the action runs in `countdown` mode. */
  countdown?: number;
  /** Text before the seconds in `countdown` mode, such as "Deleting in". Defaults to the pending label followed by "in". */
  countdownLabel?: string;
  /** Runs on confirm. Return a promise to show the pending face; a rejection shows the error face with Retry. */
  onConfirm?: () => void | Promise<unknown>;
  /** Offering it adds Undo to the result. Return a promise to show a pending face while it runs. */
  onUndo?: () => void | Promise<unknown>;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
  /** Controlled state. Pair it with `onStateChange`. */
  state?: ConfirmMorphState;
  /** Starting state when uncontrolled. */
  defaultState?: ConfirmMorphState;
  onStateChange?: (state: ConfirmMorphState) => void;
  /** Milliseconds before an unanswered question returns to rest. Resting the pointer on the control pauses it. 0 turns it off. */
  confirmTimeout?: number;
  /** Milliseconds a result stays before returning to rest. Resting the pointer on the control pauses it. 0 turns it off. */
  resultTimeout?: number;
  /** A press outside the control cancels an open question. Defaults to true. */
  cancelOnOutsidePress?: boolean;
  disabled?: boolean;
  className?: string;
  /** Receives the root element, which also takes focus while the action is pending. */
  ref?: Ref<HTMLDivElement>;
}

/** A press this soon after the question appears is the tail of the press that opened it, not an answer. */
const ARM_MS = 280;
const { blur } = motionTokens;
type Bezier = [number, number, number, number];
const enter = [...motionTokens.ease.enter] as Bezier;
const standard = [...motionTokens.ease.standard] as Bezier;
/** Duration springs restated as stiffness and damping, so a retarget mid-flight keeps the velocity it already has. */
const physical = ({ visualDuration, bounce }: { visualDuration: number; bounce: number }): Transition => {
  const root = 2 * Math.PI / (visualDuration * 1.2);
  return { type: "spring", stiffness: root * root, damping: 2 * (1 - bounce) * root, mass: 1 };
};
/** Growing follows new content with a little life; shrinking settles without overshoot. */
const GROW = physical(motionTokens.spring.morph), SHRINK = physical(motionTokens.spring.smooth);

const subscribe = () => () => {};
function useReducedFlag() {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return !!useReducedMotion() && hydrated;
}

/*
 * Faces never move and never scale: each one sits at its natural width, centred in the pill, so the baseline stays put and
 * the pill's clip reveals it as the width springs. The old face fades out quickly; the new one's parts arrive in reading
 * order, each clearing a small blur.
 */
const faceVariants: Variants = {
  hidden: { opacity: 1 },
  shown: { opacity: 1, transition: { staggerChildren: motionTokens.stagger.item, delayChildren: .05 } },
  gone: { opacity: 0, filter: `blur(${blur.subtle}px)`, transition: { duration: motionTokens.duration.instant, ease: standard } },
};
const partVariants: Variants = {
  hidden: { opacity: 0, filter: `blur(${blur.soft}px)` },
  shown: { opacity: 1, filter: "blur(0px)", transition: { duration: .26, ease: enter } },
};
const reducedFace: Variants = { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: .14 } }, gone: { opacity: 0, transition: { duration: .1 } } };
const reducedPart: Variants = { hidden: { opacity: 1 }, shown: { opacity: 1 } };

type FaceKey = ConfirmMorphState | "counting";

function Face({ id, reduced, onSize, children, labelledBy }: { id: FaceKey; reduced: boolean; onSize: (id: FaceKey, width: number) => void; children: ReactNode; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const present = useIsPresent();
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !present) return;
    // The incoming face must be independent of the old animated pill width.
    // Bound it against a definite-width row instead, leaving space for sibling
    // actions. Only the prompt/error text shrinks; answer buttons stay visible.
    const root = node.closest?.<HTMLElement>("[data-confirm-morph-root]");
    const boundary = root?.closest<HTMLElement>("[data-confirm-morph-boundary]");
    const group = root?.parentElement;
    const siblings = group
      ? [...group.children].filter((element) => element !== root)
      : [];
    const report = () => {
      if (boundary && group) {
        const rowStyle = getComputedStyle(boundary);
        const pixels = (value: string) => Number.parseFloat(value) || 0;
        const contentWidth = boundary.getBoundingClientRect().width
          - pixels(rowStyle.paddingLeft) - pixels(rowStyle.paddingRight)
          - pixels(rowStyle.borderLeftWidth) - pixels(rowStyle.borderRightWidth);
        const occupiedWidths = siblings.map((element) => element.getBoundingClientRect().width)
          .filter((value) => value > 0);
        const gap = pixels(getComputedStyle(group).columnGap);
        const cap = Math.max(0, contentWidth
          - occupiedWidths.reduce((sum, value) => sum + value, 0)
          - gap * occupiedWidths.length);
        const maxWidth = `${cap}px`;
        if (node.style.maxWidth !== maxWidth) node.style.maxWidth = maxWidth;
      }
      // Preserve fractional widths so the spring lands on the natural face.
      onSize(id, node.getBoundingClientRect().width);
    };
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(node);
    if (boundary) observer.observe(boundary);
    for (const sibling of siblings) observer.observe(sibling);
    return () => observer.disconnect();
  }, [id, onSize, present]);
  return <motion.div ref={ref} className={styles.face} data-face={id} role={labelledBy ? "group" : undefined} aria-labelledby={labelledBy}
    variants={reduced ? reducedFace : faceVariants} initial="hidden" animate="shown" exit="gone" inert={!present || undefined}>{children}</motion.div>;
}

function Part({ reduced, className, children }: { reduced: boolean; className?: string; children: ReactNode }) {
  return <motion.span className={[styles.part, className].filter(Boolean).join(" ")} variants={reduced ? reducedPart : partVariants}>{children}</motion.span>;
}

/** A success disc that pops in with a tick drawing across it, the moment the action lands. */
function Check({ reduced }: { reduced: boolean }) {
  return <svg className={styles.check} viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <motion.circle className={styles.checkDisc} cx="9" cy="9" r="8" style={{ transformOrigin: "9px 9px" }}
      initial={reduced ? false : { scale: .5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ scale: physical(motionTokens.spring.snappy), opacity: { duration: .12 } }} />
    <motion.path className={styles.checkTick} d="M5.6 9.3 7.8 11.4 12.4 6.7" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
      initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .3, ease: enter, delay: .14 }} />
  </svg>;
}

/** A ring that drains with the countdown. */
function Ring({ progress }: { progress: MotionValue<number> }) {
  return <svg className={styles.ring} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle className={styles.ringTrack} cx="8" cy="8" r="6.25" strokeWidth="1.75" />
    <motion.circle className={styles.ringFill} cx="8" cy="8" r="6.25" strokeWidth="1.75" strokeLinecap="round" style={{ pathLength: progress, rotate: -90, transformOrigin: "8px 8px" }} />
  </svg>;
}

/** Seconds that swap in place: the old digit fades up and out, the new one rises in, on tabular figures so the width holds. */
function Seconds({ value, reduced }: { value: number; reduced: boolean }) {
  return <span className={styles.seconds}>
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span key={value} className={styles.digit}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6, filter: `blur(${blur.subtle}px)` }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, filter: `blur(${blur.subtle}px)` }}
        transition={{ duration: .22, ease: enter }}>{value}</motion.span>
    </AnimatePresence>
  </span>;
}

export function ConfirmMorph({
  label, ariaLabel, iconOnly = false, description, icon, prompt, confirmLabel = "Delete", cancelLabel = "Cancel", pendingLabel = "Deleting", doneLabel = "Deleted", errorLabel = "Couldn’t finish",
  retryLabel = "Retry", undoLabel = "Undo", undoingLabel = "Restoring", tone = "danger", confirmMode = "press", holdDuration = 1000, countdown = 3, countdownLabel,
  onConfirm, onUndo, onCancel, onError, state: stateProp, defaultState = "idle", onStateChange, confirmTimeout = 6000, resultTimeout = 5000, cancelOnOutsidePress = true,
  disabled = false, className, ref,
}: ConfirmMorphProps) {
  const reduced = useReducedFlag();
  const uid = useId();
  const promptId = `${uid}-prompt`;
  const holdHintId = `${uid}-hold`;
  const descriptionId = `${uid}-description`;
  const rootRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => rootRef.current as HTMLDivElement, []);

  const [inner, setInner] = useState<ConfirmMorphState>(defaultState);
  const state = stateProp ?? inner;
  const [working, setWorking] = useState<"confirm" | "undo">("confirm");
  const [counting, setCounting] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const faceKey: FaceKey = state === "confirming" && counting ? "counting" : state;

  const live = useRef({ state, disabled, onStateChange, controlled: stateProp !== undefined });
  useLayoutEffect(() => { live.current = { state, disabled, onStateChange, controlled: stateProp !== undefined }; });
  const pendingFocus = useRef(false);
  const run = useRef(0);
  const askedAt = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; run.current++; };
  }, []);

  const keepFocus = useCallback(() => {
    const root = rootRef.current;
    // Focus follows the control between faces, but only when it was already inside; a timeout never steals focus from elsewhere.
    pendingFocus.current = !!root && root.contains(document.activeElement);
  }, []);

  const go = useCallback((next: ConfirmMorphState) => {
    if (!mounted.current) return;
    if (next !== "confirming") setCounting(false);
    if (next === live.current.state) return;
    keepFocus();
    if (next === "confirming") askedAt.current = performance.now();
    if (!live.current.controlled) setInner(next);
    live.current.state = next;
    live.current.onStateChange?.(next);
  }, [keepFocus]);

  // A controlled parent can move the state on its own; the countdown never survives that.
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state !== "confirming") setCounting(false);
  }

  const toIdle = useCallback(() => { if (inFlight.current) return; run.current++; go("idle"); }, [go]);

  const perform = useCallback(async (kind: "confirm" | "undo") => {
    // Presence retains leaving faces briefly. Guard their stale callbacks and
    // same-tick double presses before starting an irreversible API request.
    if (!mounted.current || inFlight.current || live.current.disabled) return;
    const current = live.current.state;
    if (kind === "confirm" && current !== "confirming" && current !== "error") return;
    if (kind === "undo" && current !== "done" && current !== "error") return;
    const handler = kind === "confirm" ? onConfirm : onUndo;
    if (!handler) return;
    inFlight.current = true;
    const token = ++run.current;
    setWorking(kind);
    setCounting(false);
    go("pending");
    setAnnouncement(kind === "confirm" ? pendingLabel : undoingLabel);
    try {
      await handler();
      if (!mounted.current || token !== run.current) return;
      if (kind === "undo") { go("idle"); setAnnouncement("Undone"); return; }
      go("done");
      setAnnouncement(onUndo ? `${doneLabel}. ${undoLabel} is available.` : doneLabel);
    } catch (error) {
      if (!mounted.current || token !== run.current) return;
      go("error");
      setAnnouncement(errorLabel);
      onError?.(error);
    } finally {
      inFlight.current = false;
    }
  }, [doneLabel, errorLabel, go, onConfirm, onError, onUndo, pendingLabel, undoLabel, undoingLabel]);

  const cancel = useCallback(() => {
    if (inFlight.current || live.current.state === "pending") return;
    onCancel?.(); toIdle(); setAnnouncement("Cancelled");
  }, [onCancel, toIdle]);
  const expire = useRef(() => {});
  useLayoutEffect(() => { expire.current = () => { if (live.current.state === "confirming") cancel(); else toIdle(); }; });

  /* The shape: one pill whose width springs to whichever face is current. At rest it is auto, so it renders right before hydration. */
  const width = useMotionValue<number | "auto">("auto");
  const target = useRef(0);
  const flight = useRef(0);
  // Only the present face reports (a leaving face stops observing), so every report is the current face's width.
  const onFaceSize = useCallback((_id: FaceKey, w: number) => {
    if (Math.abs(w - target.current) < .25) return;
    const from = target.current;
    target.current = w;
    if (!from || reduced) { flight.current++; width.jump("auto"); return; }
    const now = width.get();
    if (now === "auto") width.jump(from);
    const token = ++flight.current;
    animate(width, w, w > (typeof now === "number" ? now : from) ? GROW : SHRINK).then(() => { if (token === flight.current) width.jump("auto"); });
  }, [reduced, width]);

  /* The timeout runs as an invisible clock. A pointer resting on the control holds it, and so does a hidden tab. */
  const drain = useMotionValue(1);
  const clock = useRef<AnimationPlaybackControls | null>(null);
  const holds = useRef({ hover: false, focus: false, hidden: false });
  const timeout = state === "confirming" && !counting ? confirmTimeout : state === "done" || state === "error" ? resultTimeout : 0;
  const sync = useCallback(() => {
    const control = clock.current;
    if (!control) return;
    const held = holds.current.hover || holds.current.focus || holds.current.hidden;
    if (held) control.pause(); else control.play();
  }, []);
  useEffect(() => {
    if (!timeout) return;
    drain.jump(1);
    const control = animate(drain, 0, { duration: timeout / 1000, ease: "linear" });
    clock.current = control;
    control.then(() => { if (clock.current === control) { clock.current = null; expire.current(); } });
    sync();
    return () => { if (clock.current === control) clock.current = null; control.stop(); };
  }, [drain, state, sync, timeout]);
  useEffect(() => {
    const onVisibility = () => { holds.current.hidden = document.hidden; sync(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [sync]);

  /* Countdown: a short grace period after the answer, drawn as a draining ring and ticking seconds. */
  const remaining = useMotionValue(1);
  const [seconds, setSeconds] = useState(countdown);
  const performRef = useRef(perform);
  useLayoutEffect(() => { performRef.current = perform; });
  useMotionValueEvent(remaining, "change", value => setSeconds(Math.max(1, Math.ceil(value * countdown))));
  useEffect(() => {
    if (!counting) return;
    remaining.jump(1);
    const control = animate(remaining, 0, { duration: countdown, ease: "linear" });
    control.then(() => { void performRef.current("confirm"); });
    return () => control.stop();
  }, [counting, countdown, remaining]);

  /* Hold: the confirm button fills with the danger colour from the left while pressed, and drains back if let go early. */
  const hold = useMotionValue(0);
  const holding = useRef<AnimationPlaybackControls | null>(null);
  const fillClip = useTransform(hold, value => `inset(0 ${(1 - value) * 100}% 0 0 round 999px)`);
  const startHold = () => {
    if (holding.current || live.current.disabled || inFlight.current || live.current.state !== "confirming") return;
    const control = animate(hold, 1, { duration: holdDuration / 1000 * (1 - hold.get()), ease: "linear" });
    holding.current = control;
    control.then(() => {
      if (holding.current !== control) return;
      holding.current = null;
      void perform("confirm");
    });
  };
  const releaseHold = () => {
    const control = holding.current;
    if (!control) return;
    holding.current = null;
    control.stop();
    if (hold.get() < 1) {
      animate(hold, 0, reduced ? { duration: 0 } : { type: "spring", visualDuration: .3, bounce: 0 });
      setAnnouncement(`Keep holding to ${confirmLabel.toLowerCase()}`);
    }
  };
  useEffect(() => { if (state !== "confirming") { holding.current?.stop(); holding.current = null; hold.jump(0); } }, [hold, state]);

  const answer = () => {
    if (live.current.disabled || inFlight.current || live.current.state !== "confirming") return;
    if (performance.now() - askedAt.current < ARM_MS) return;
    if (confirmMode === "countdown") {
      keepFocus();
      setCounting(true);
      setAnnouncement(`${countdownLabel ?? `${pendingLabel} in`} ${countdown} seconds`);
      return;
    }
    void perform("confirm");
  };

  // An outside press answers the question with no.
  useEffect(() => {
    if (state !== "confirming" || !cancelOnOutsidePress) return;
    const down = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) cancel(); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [cancel, cancelOnOutsidePress, state]);

  // Focus moves with the morph: Confirm while asking, the root while counting or working, Undo or Retry on a result, the trigger at rest.
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    pendingFocus.current = false;
    const root = rootRef.current;
    if (!root) return;
    const face = root.querySelector<HTMLElement>(`[data-face="${faceKey}"]`);
    const autofocus = face?.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)");
    (autofocus ?? root).focus({ preventScroll: true });
  }, [faceKey]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = live.current.state;
    if (event.key === "Escape") {
      if (current === "confirming") { event.preventDefault(); event.stopPropagation(); cancel(); }
      else if (current === "done" || current === "error") { event.preventDefault(); event.stopPropagation(); toIdle(); }
      return;
    }
    // Enter answers yes from anywhere in the question except a button of its own (Cancel keeps meaning Cancel).
    if (event.key === "Enter" && current === "confirming" && !event.repeat && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      if (counting) void perform("confirm");
      else if (confirmMode !== "hold") answer();
    }
  };

  const holdKeys = (event: ReactKeyboardEvent<HTMLButtonElement>, down: boolean) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (down) { if (!event.repeat) startHold(); }
    else releaseHold();
  };
  const holdPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    startHold();
  };

  const shownPrompt = prompt ?? <>{label}?</>;
  const shownCountdown = countdownLabel ?? `${pendingLabel} in`;
  const confirmButton = confirmMode === "hold"
    ? <button type="button" className={styles.confirm} data-autofocus disabled={disabled} aria-describedby={description ? `${holdHintId} ${descriptionId}` : holdHintId}
      onPointerDown={holdPointer} onPointerUp={releaseHold} onPointerCancel={releaseHold} onLostPointerCapture={releaseHold}
      onKeyDown={event => holdKeys(event, true)} onKeyUp={event => holdKeys(event, false)} onBlur={releaseHold} onContextMenu={event => event.preventDefault()}>
      <span>{confirmLabel}</span>
      <motion.span className={styles.fill} style={{ clipPath: fillClip }} aria-hidden="true"><span>{confirmLabel}</span></motion.span>
    </button>
    : <button type="button" className={styles.confirm} data-autofocus disabled={disabled} aria-describedby={description ? descriptionId : undefined} onClick={answer} onKeyDown={event => { if (event.repeat) event.preventDefault(); }}>{confirmLabel}</button>;

  const face = (() => {
    switch (faceKey) {
      case "confirming": return <>
        <Part reduced={reduced} className={styles.prompt}><span id={promptId} title={typeof shownPrompt === "string" ? shownPrompt : undefined}>{shownPrompt}</span></Part>
        <Part reduced={reduced}><button type="button" className={styles.secondary} data-autofocus onClick={cancel}>{cancelLabel}</button></Part>
        <Part reduced={reduced}>{confirmButton}</Part>
        {confirmMode === "hold" && <span id={holdHintId} className={styles.srOnly}>Press and hold</span>}
      </>;
      case "counting": return <>
        <Part reduced={reduced} className={styles.status}>
          <Ring progress={remaining} />
          <span className={styles.statusText}>{shownCountdown} <Seconds value={seconds} reduced={reduced} /></span>
        </Part>
        <Part reduced={reduced}><button type="button" className={styles.secondary} onClick={cancel}>{cancelLabel}</button></Part>
      </>;
      case "pending": return <Part reduced={reduced} className={styles.status}>
        <LoaderCircle className={styles.spinner} size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className={styles.statusText}>{working === "undo" ? undoingLabel : pendingLabel}</span>
      </Part>;
      case "done": return <>
        <Part reduced={reduced} className={styles.status}><Check reduced={reduced} /><span className={styles.statusText}>{doneLabel}</span></Part>
        {onUndo && <Part reduced={reduced}><button type="button" className={styles.secondary} data-autofocus onClick={() => void perform("undo")}>{undoLabel}</button></Part>}
      </>;
      case "error": return <>
        <Part reduced={reduced} className={styles.status}><CircleAlert className={styles.alert} size={16} strokeWidth={1.75} aria-hidden="true" /><span className={styles.statusText} role="alert" title={errorLabel}>{errorLabel}</span></Part>
        <Part reduced={reduced}><button type="button" className={styles.secondary} data-autofocus disabled={disabled} onClick={() => void perform(working)}>{retryLabel}</button></Part>
      </>;
      default: return <Part reduced={reduced}><button type="button" className={styles.trigger} data-autofocus data-confirm-morph-trigger disabled={disabled} aria-label={ariaLabel} title={ariaLabel}
        onClick={() => { if (live.current.disabled || inFlight.current || live.current.state !== "idle") return; setAnnouncement(typeof shownPrompt === "string" ? shownPrompt : ""); go("confirming"); }}>
        {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
        <span className={iconOnly ? styles.srOnly : undefined}>{label}</span>
      </button></Part>;
    }
  })();

  return <div ref={rootRef} className={[styles.root, className].filter(Boolean).join(" ")} data-confirm-morph-root data-state={state} data-face={faceKey} data-tone={tone} data-mode={confirmMode}
    data-disabled={disabled || undefined} data-icon-only={iconOnly || undefined} role="group" tabIndex={-1} onKeyDown={onKeyDown} aria-busy={state === "pending" || undefined}
    aria-label={ariaLabel} aria-describedby={description ? descriptionId : undefined}
    onFocusCapture={() => { holds.current.focus = true; sync(); }}
    onBlurCapture={event => { holds.current.focus = event.currentTarget.contains(event.relatedTarget as Node | null); sync(); }}
    onPointerEnter={() => { holds.current.hover = true; sync(); }} onPointerLeave={() => { holds.current.hover = false; sync(); }}
    onPointerCancel={() => { holds.current.hover = false; sync(); }}>
    <motion.div className={styles.surface} style={{ width }}>
      <AnimatePresence initial={false}>
        <Face key={faceKey} id={faceKey} reduced={reduced} onSize={onFaceSize} labelledBy={faceKey === "confirming" ? promptId : undefined}>{face}</Face>
      </AnimatePresence>
    </motion.div>
    {description ? <span id={descriptionId} className={styles.srOnly}>{description}</span> : null}
    <span className={styles.srOnly} role={state === "error" ? "alert" : "status"} aria-live={state === "error" ? "assertive" : "polite"}>{announcement}</span>
  </div>;
}

export default ConfirmMorph;

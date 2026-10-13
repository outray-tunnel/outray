"use client";

import { AnimatePresence, motion, useReducedMotion, type TargetAndTransition, type Transition } from "motion/react";
import { CircleAlert, Copy } from "lucide-react";
import { motionTokens } from "../lib/motion-tokens";
import { useCopyFeedback } from "../lib/use-copy-feedback";

export interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
  /** Kept for existing callers; copy buttons are always icon-only. */
  iconOnly?: true;
  variant?: "outline" | "plain";
  disabled?: boolean;
  onCopied?: () => void;
  onCopyError?: () => void;
}

/** Copy feedback is deliberately unhurried: a slow, almost critically damped spring and long, soft crossfades read as calm, never busy.
 *  The same motion plays in reverse when the confirmation hands back to idle, so nothing ever snaps. */
const settle = { type: "spring", visualDuration: .5, bounce: .06 } as const;
const enter = { duration: .36, ease: [...motionTokens.ease.enter] } as const;
const instant = { duration: motionTokens.duration.instant } as const;
const soft = `blur(${motionTokens.blur.soft}px)`;
const rest: TargetAndTransition = { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" };
const fadeIn: TargetAndTransition = { ...rest, opacity: 0 };
const fadeOut: TargetAndTransition = { opacity: 0, transition: instant };
/** Icons trade places in one soft breath: the old glyph shrinks into a blur while the new one grows out of it on the slow spring. */
const iconIn: TargetAndTransition = { opacity: 0, scale: .6, filter: soft };
const iconOut: TargetAndTransition = { opacity: 0, scale: .6, filter: soft, transition: { duration: .24, ease: [...motionTokens.ease.standard] } };
const iconEnter: Transition = { scale: settle, opacity: { ...enter, delay: .03 }, filter: { ...enter, delay: .03 } };

/** The success tick draws itself from its short stroke, the way a hand would write it: quick to start, then easing into place while the icon settles. */
function DrawnCheck({ reduced }: { reduced: boolean }) {
  return <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <motion.path d="M4 12l5 5L20 6" initial={reduced ? false : { pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ pathLength: { duration: .5, ease: [...motionTokens.ease.standard], delay: .05 }, opacity: { duration: .01, delay: .05 } }} />
  </svg>;
}

export function CopyButton({ value, label = "Copy", className, variant = "plain", disabled, onCopied, onCopyError }: CopyButtonProps) {
  const { state, copy } = useCopyFeedback();
  const reduced = useReducedMotion() ?? false;

  async function handleCopy() {
    if (await copy(value)) onCopied?.();
    else onCopyError?.();
  }

  return <><button
    type="button"
    className={["inline-flex size-8 px-0 shrink-0 items-center justify-center rounded-xl border transition-[background-color,border-color,color,transform] duration-160 ease-[cubic-bezier(.22,1,.36,1)] active:scale-[.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8367c7] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none", variant === "outline" ? "border-white/12 bg-zinc-900 text-zinc-50 hover:border-white/20 hover:bg-[#202023]" : "border-transparent bg-transparent text-zinc-400 hover:border-transparent hover:bg-transparent hover:text-zinc-50", className].filter(Boolean).join(" ")}
    onClick={() => void handleCopy()}
    aria-label={label}
    data-copy-state={state}
    disabled={disabled}
    title={label}
  >
    <span className="relative grid size-4 shrink-0" aria-hidden="true">
      <AnimatePresence initial={false}>
        <motion.span key={state} className="absolute inset-0 grid place-items-center data-[state=copied]:text-emerald-300 data-[state=error]:text-rose-300" data-state={state} initial={reduced ? fadeIn : iconIn} animate={rest} exit={reduced ? fadeOut : iconOut} transition={reduced ? instant : iconEnter}>
          {state === "copied" ? <DrawnCheck reduced={reduced} /> : state === "error" ? <CircleAlert size={16} strokeWidth={1.75} /> : <Copy size={16} strokeWidth={1.75} />}
        </motion.span>
      </AnimatePresence>
    </span>
  </button><span className="sr-only" role="status" aria-live="polite">{state === "idle" ? "" : state === "error" ? `${label}: Could not copy` : `${label}: Copied`}</span></>;
}

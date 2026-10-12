"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { X } from "lucide-react";
import { motionTokens } from "../lib/motion-tokens";

/** Mirrors the open state so the content can stay mounted while it animates out, and retarget mid-flight if it is reopened or closed early. */
const OpenContext = createContext<boolean | null>(null);

export function Dialog({ open: openProp, defaultOpen = false, onOpenChange, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Root>) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const open = openProp ?? uncontrolled;
  const setOpen = useCallback((next: boolean) => { if (openProp === undefined) setUncontrolled(next); onOpenChange?.(next); }, [openProp, onOpenChange]);
  return <OpenContext.Provider value={open}><DialogPrimitive.Root {...props} open={open} onOpenChange={setOpen}/></OpenContext.Provider>;
}

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  title: string;
  description?: string;
  children: ReactNode;
  closeDisabled?: boolean;
  overlayClassName?: string;
}

const fade: Transition = { duration: motionTokens.duration.instant };
const leave: Transition = { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] };

/** When the title or description changes while open, the new copy rises in and the old copy leaves upward. */
function SwapText({ text }: { text: string }) {
  const reduced = useReducedMotion();
  return <AnimatePresence mode="popLayout" initial={false}>
    <motion.span key={text} className="block leading-[1.45]" initial={reduced ? false : { opacity: 0, y: "0.3em", filter: `blur(${motionTokens.blur.soft}px)` }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: "-0.3em", filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] } }} transition={{ duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }}>{text}</motion.span>
  </AnimatePresence>;
}

export function DialogContent({ title, description, children, className, overlayClassName, closeDisabled = false, onPointerDownOutside, ...props }: DialogContentProps) {
  const open = useContext(OpenContext);
  const reduced = useReducedMotion();
  // When the open state last changed. Radix waits for the click before treating a press as outside, and a press on the trigger
  // while the dialog leaves reopens it first, so that press must not close it again.
  const change = useRef({ open, at: 0 });
  useLayoutEffect(() => { change.current = { open, at: performance.now() }; }, [open]);
  const pressOutside: DialogContentProps["onPointerDownOutside"] = event => {
    onPointerDownOutside?.(event);
    if (open !== null && (!change.current.open || event.detail.originalEvent.timeStamp < change.current.at)) event.preventDefault();
  };
  const classes = ["fixed inset-0 z-51 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-2rem),440px)] translate-y-0 scale-100 overflow-auto rounded-2xl border border-white/12 bg-[#111113] text-zinc-50 opacity-100 shadow-[0_24px_70px_rgb(0_0_0/.65)] outline-none transition-[opacity,transform] ease-out starting:translate-y-2 starting:scale-[.96] starting:opacity-0 data-[state=open]:duration-[240ms] data-[state=closed]:pointer-events-none data-[state=closed]:translate-y-1 data-[state=closed]:scale-[.98] data-[state=closed]:opacity-0 data-[state=closed]:duration-[160ms] motion-reduce:transition-none", className].filter(Boolean).join(" ");
  const overlayClasses = ["fixed inset-0 z-50 bg-[oklch(10%_0_0/.46)] opacity-100 backdrop-blur-[7px] transition-opacity ease-out starting:opacity-0 data-[state=open]:duration-[240ms] data-[state=closed]:pointer-events-none data-[state=closed]:opacity-0 data-[state=closed]:duration-[160ms] motion-reduce:transition-none", overlayClassName].filter(Boolean).join(" ");
  const inner = <>
    <div className="flex items-start justify-between gap-5 border-b border-white/12 p-6"><div><DialogPrimitive.Title className="relative m-0 font-sans text-[19px] leading-[1.45] font-medium tracking-[-.01em] [overflow-wrap:anywhere]"><SwapText text={title}/></DialogPrimitive.Title>{description ? <DialogPrimitive.Description className="relative mt-2 mb-0 text-[13px] leading-[1.45] text-zinc-400 [overflow-wrap:anywhere]"><SwapText text={description}/></DialogPrimitive.Description> : null}</div><DialogPrimitive.Close className="my-[calc((19px*1.45-32px)/2)] grid size-8 shrink-0 place-items-center rounded-xl border border-white/12 bg-white/[.025] text-zinc-400 transition-[background-color,color,transform] duration-160 ease-out hover:bg-[#202023] hover:text-zinc-50 active:scale-[.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8367c7] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transform-none motion-reduce:transition-none" disabled={closeDisabled} aria-label="Close dialog"><X size={16} strokeWidth={1.75} aria-hidden="true"/></DialogPrimitive.Close></div>
    <div className="p-6 text-[13px] leading-[1.45]">{children}</div>
  </>;
  // Under a bare Radix root the open state is unknown here, so CSS keyframes keyed off data-state animate the layers instead.
  if (open === null) return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className={overlayClasses}/>
    <DialogPrimitive.Content {...props} onPointerDownOutside={pressOutside} className={classes}>{inner}</DialogPrimitive.Content>
  </DialogPrimitive.Portal>;
  // The overlay fades while the dialog rises 8px and scales up on a spring. Closing is shorter and quieter, and starts from wherever the entrance is.
  return <AnimatePresence>
    {open && <DialogPrimitive.Portal key="dialog" forceMount>
      <DialogPrimitive.Overlay asChild forceMount><motion.div className={overlayClasses} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: reduced ? fade : leave }} transition={reduced ? fade : { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }}/></DialogPrimitive.Overlay>
      <DialogPrimitive.Content {...props} onPointerDownOutside={pressOutside} asChild forceMount>
        <motion.div className={classes} initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduced ? { opacity: 0, transition: fade } : { opacity: 0, y: 4, scale: .98, transition: leave }} transition={reduced ? fade : { default: motionTokens.spring.smooth, opacity: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.enter] } }}>{inner}</motion.div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>}
  </AnimatePresence>;
}

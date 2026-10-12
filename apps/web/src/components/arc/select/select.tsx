"use client";

import { forwardRef, useId, useState } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Variants } from "motion/react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { motionTokens } from "../lib/motion-tokens";

export interface SelectProps extends Omit<ComponentPropsWithoutRef<typeof SelectPrimitive.Root>, "children"> {
  label: string;
  description?: string;
  placeholder?: string;
  id?: string;
  className?: string;
  "aria-invalid"?: ComponentPropsWithoutRef<"button">["aria-invalid"];
  "aria-describedby"?: string;
  options: { value: string; label: string; disabled?: boolean; icon?: ReactNode; description?: string }[];
}

/** The shown value rolls in the direction of the list: a later option rises from below, an earlier one drops from above. */
const valueRoll: Variants = {
  enter: (direction: number) => ({ opacity: 0, y: `${direction * 0.35}em`, filter: `blur(${motionTokens.blur.soft}px)` }),
  center: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] } },
  exit: (direction: number) => ({ opacity: 0, y: `${direction * -0.3}em`, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] } }),
};
/** Reduced motion keeps a short crossfade; the resting state matches valueRoll so server and client markup agree. */
const valueFade: Variants = { enter: { opacity: 0 }, center: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: motionTokens.duration.instant } }, exit: { opacity: 0, transition: { duration: motionTokens.duration.instant } } };

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  { label, description, placeholder = "Select an option", options, id, className, disabled, onValueChange,
    "aria-invalid": invalid, "aria-describedby": describedBy, ...rootProps },
  ref,
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = description ? `${controlId}-description` : undefined;
  const reduceMotion = useReducedMotion();
  const [uncontrolledValue, setUncontrolledValue] = useState(rootProps.defaultValue ?? "");
  const currentValue = rootProps.value ?? uncontrolledValue;
  const index = options.findIndex((option) => option.value === currentValue);
  const shown = currentValue ? options[index]?.label ?? "" : placeholder;
  const [previousIndex, setPreviousIndex] = useState(index);
  const [direction, setDirection] = useState(1);
  if (previousIndex !== index) { setPreviousIndex(index); setDirection(index > previousIndex ? 1 : -1); }

  return (
    <div className="grid min-w-0 gap-2 [&>label]:text-[13px] [&>label]:font-medium">
      <label htmlFor={controlId}>{label}</label>
      <SelectPrimitive.Root {...rootProps} disabled={disabled} onValueChange={(next) => { setUncontrolledValue(next); onValueChange?.(next); }}>
        <SelectPrimitive.Trigger
          ref={ref}
          id={controlId}
          aria-invalid={invalid}
          aria-describedby={[hintId, describedBy].filter(Boolean).join(" ") || undefined}
          className={["group relative flex min-h-9 w-full items-center justify-between gap-3 rounded-xl border border-white/12 bg-zinc-900 px-3 text-left text-[13px] text-zinc-50 transition-[border-color,background-color,box-shadow] duration-160 ease-out hover:not-data-disabled:border-white/20 hover:not-data-disabled:bg-[#202023] active:not-data-disabled:border-white/20 active:not-data-disabled:bg-[#202023] focus-visible:border-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8367c7] data-[state=open]:border-white/20 data-[state=open]:bg-[#202023] data-disabled:cursor-not-allowed data-disabled:opacity-50 motion-reduce:transition-none", className].filter(Boolean).join(" ")}
        >
          {/* Radix keeps the real value for assistive tech; the visible copy below animates between values. */}
          <span className="sr-only"><SelectPrimitive.Value placeholder={placeholder} /></span>
          <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)] [&>span]:col-start-1 [&>span]:row-start-1 [&>span]:min-w-0 [&>span]:truncate [&>[data-placeholder]]:text-zinc-500" aria-hidden="true">
            <AnimatePresence initial={false} custom={direction}>
              <motion.span key={currentValue ? `value-${currentValue}` : "placeholder"} data-placeholder={currentValue ? undefined : ""} custom={direction} variants={reduceMotion ? valueFade : valueRoll} initial="enter" animate="center" exit="exit"><span className="flex min-w-0 items-center gap-2 [&>span:last-child]:truncate">{options[index]?.icon && <span className="inline-flex shrink-0 items-center justify-center">{options[index].icon}</span>}<span>{shown}</span></span></motion.span>
            </AnimatePresence>
          </span>
          <SelectPrimitive.Icon className="inline-flex shrink-0 text-zinc-500 transition-transform duration-580 ease-out group-data-[state=open]:rotate-180 motion-reduce:transition-none">
            <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          {/* Portaled menus cannot inherit theme tokens from the trigger's ancestors. */}
          <SelectPrimitive.Content className="z-1000 max-h-[min(320px,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)] max-w-[min(24rem,calc(100vw-20px))] origin-[var(--radix-select-content-transform-origin)] scale-100 overflow-hidden rounded-[14px] border border-white/12 bg-[#111113] p-1.5 text-zinc-50 opacity-100 shadow-[0_24px_70px_rgb(0_0_0/.65)] transition-[opacity,transform] ease-out starting:scale-[.97] starting:opacity-0 data-[state=open]:duration-[240ms] data-[state=closed]:scale-[.98] data-[state=closed]:opacity-0 data-[state=closed]:duration-[120ms] motion-reduce:transition-none" position="popper" sideOffset={4} collisionPadding={12}>
            <SelectPrimitive.ScrollUpButton className="grid h-7 place-items-center text-zinc-500">
              <ChevronUp size={16} strokeWidth={1.75} aria-hidden="true" />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="py-0.5">
              {options.map((option) => (
                <SelectPrimitive.Item key={option.value} value={option.value} textValue={option.label} disabled={option.disabled} className="relative flex min-h-9 cursor-default select-none items-center rounded-lg py-0 pr-[34px] pl-[11px] text-[13px] text-zinc-50 outline-none transition-colors duration-120 data-disabled:opacity-45 data-highlighted:bg-[#202023] hover:not-data-disabled:bg-[#202023] motion-reduce:transition-none">
                  {option.icon && <span className="mr-2 inline-flex shrink-0 items-center justify-center" aria-hidden="true">{option.icon}</span>}
                  <span className="grid min-w-0 gap-[3px] py-2"><SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>{option.description && <span className="text-[11px] leading-normal text-zinc-500">{option.description}</span>}</span>
                  <SelectPrimitive.ItemIndicator className="absolute right-2.5 inline-flex scale-100 items-center text-zinc-50 opacity-100 blur-none transition-[opacity,transform,filter] duration-[240ms] ease-out starting:scale-60 starting:opacity-0 starting:blur-[2px] motion-reduce:transition-none">
                    <Check size={16} strokeWidth={1.75} aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="grid h-7 place-items-center text-zinc-500">
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {description && <span id={hintId} className="text-xs text-zinc-500">{description}</span>}
    </div>
  );
});

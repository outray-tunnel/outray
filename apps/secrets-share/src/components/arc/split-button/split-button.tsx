"use client";

// UIArc registry: https://uiarc.dev/r/split-button.json
// Integration: scoped theme classes and an optional menu footer.

import { isValidElement, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import type { TargetAndTransition } from "motion/react";
import { ChevronDown } from "lucide-react";
import { motionTokens } from "../lib/motion-tokens";

export interface SplitButtonAction { label: string; onSelect?: () => void; disabled?: boolean; destructive?: boolean; icon?: ReactNode; }
export interface SplitButtonProps { className?: string; menuClassName?: string; menuFooter?: ReactNode; label: string; actions: SplitButtonAction[]; onClick?: () => void; disabled?: boolean; icon?: ReactNode; variant?: "primary" | "secondary"; }

const rest: TargetAndTransition = { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" };
const fadeIn: TargetAndTransition = { ...rest, opacity: 0 };
const fadeOut: TargetAndTransition = { opacity: 0, transition: { duration: motionTokens.duration.instant } };
const glyphIn: TargetAndTransition = { opacity: 0, y: 5, filter: `blur(${motionTokens.blur.soft}px)` };
const glyphOut: TargetAndTransition = { opacity: 0, y: -4, filter: `blur(${motionTokens.blur.subtle}px)`, transition: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] } };
const iconIn: TargetAndTransition = { opacity: 0, scale: .6, filter: `blur(${motionTokens.blur.subtle}px)` };
const iconOut: TargetAndTransition = { ...iconIn, transition: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] } };
/** Scale rides the spring; opacity and blur tween so blur never overshoots below zero. */
const iconEnter = { ...motionTokens.spring.snappy, opacity: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.enter] }, filter: { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.enter] } } as const;

/** Names the icon element, so swapping Copy for Check morphs while a re-render of the same icon stays still. */
function iconKey(node: ReactNode): string {
  if (!isValidElement(node)) return node == null || typeof node === "boolean" ? "" : String(node);
  const type = node.type as string | { displayName?: string; name?: string };
  return typeof type === "string" ? type : type?.displayName ?? type?.name ?? "icon";
}

/** Springs the slot to the natural width of its content when the label changes; other resizes (a late web font) jump. */
function useMorphWidth(content: RefObject<HTMLElement | null>, key: string, reduced: boolean) {
  const width = useMotionValue<number | "auto">("auto");
  const lastKey = useRef(key), armedUntil = useRef(0);
  useLayoutEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    armedUntil.current = performance.now() + 700;
  }, [key]);
  useEffect(() => {
    const node = content.current, slot = node?.parentElement;
    if (!node || !slot || typeof ResizeObserver === "undefined") return;
    let measured = false;
    const observer = new ResizeObserver(([entry]) => {
      const next = entry.contentRect.width;
      if (!next || !measured || reduced || performance.now() > armedUntil.current) { measured = next > 0; width.jump(next || "auto"); delete slot.dataset.morphing; return; }
      slot.dataset.morphing = "";
      animate(width, next, { ...motionTokens.spring.morph, onComplete: () => { delete slot.dataset.morphing; } });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [content, reduced, width]);
  return width;
}

type Glyph = { id: string; char: string; order: number };
const toGlyphs = (chars: string[], seq: number): Glyph[] => chars.map((char, order) => ({ id: `${seq}:${order}`, char, order }));

/** Shared leading and trailing characters keep their identity, so "Copy page" to "Copied" only replaces the changed letters. */
function useGlyphs(text: string) {
  const [state, setState] = useState(() => ({ text, seq: 0, glyphs: toGlyphs([...text], 0) }));
  if (state.text === text) return state.glyphs;
  const prev = [...state.text], next = [...text];
  let start = 0, end = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  while (end < prev.length - start && end < next.length - start && prev[prev.length - 1 - end] === next[next.length - 1 - end]) end++;
  if (start < 2) start = 0;
  if (end < 2) end = 0;
  const seq = state.seq + 1;
  const glyphs = [...state.glyphs.slice(0, start), ...toGlyphs(next.slice(start, next.length - end), seq), ...state.glyphs.slice(state.glyphs.length - end)];
  setState({ text, seq, glyphs });
  return glyphs;
}

function MorphText({ text, reduced }: { text: string; reduced: boolean }) {
  const glyphs = useGlyphs(text);
  return <span className="relative inline-flex flex-none whitespace-pre">
    <AnimatePresence mode="popLayout" initial={false}>
      {glyphs.map(glyph => <motion.span key={glyph.id} className="inline-block" layout={reduced ? false : "position"} layoutDependency={text} initial={reduced ? fadeIn : glyphIn} animate={rest} exit={reduced ? fadeOut : glyphOut} transition={reduced ? { duration: motionTokens.duration.instant } : { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter], delay: Math.min(glyph.order * motionTokens.stagger.char, .1), layout: motionTokens.spring.morph }}>{glyph.char}</motion.span>)}
    </AnimatePresence>
  </span>;
}

/** The main action morphs its icon and label in place while its width follows on a spring; the menu half never scales, so the menu opens from a still anchor. */
export function SplitButton({ label, actions, onClick, disabled, icon, className, menuClassName, menuFooter, variant = "primary" }: SplitButtonProps) {
  const reduced = useReducedMotion() ?? false;
  const contentRef = useRef<HTMLSpanElement>(null);
  const glyph = iconKey(icon);
  const width = useMorphWidth(contentRef, `${glyph}|${label}`, reduced);
  const secondary = variant === "secondary";
  return <DropdownPrimitive.Root>
    <div className={[
      "inline-flex items-stretch border transition-transform duration-[580ms] ease-[linear(0,.09,.27,.47,.64,.77,.86,.92,.97,.99,1.006,1)] has-[>_.split-primary:active:not(:disabled)]:scale-[.97] has-[>_.split-primary:active:not(:disabled)]:duration-[120ms] has-[>_.split-primary:active:not(:disabled)]:ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none motion-reduce:has-[>_.split-primary:active:not(:disabled)]:scale-100",
      secondary ? "rounded-xl border-[#38383e] bg-[#1a1a1e]" : "rounded-xl border-[#e7e7ea] bg-[#e7e7ea]",
      className,
    ].filter(Boolean).join(" ")}>
      <button className={[
        "split-primary relative inline-grid place-items-center border-0 font-[inherit] [transition:background-color_160ms_cubic-bezier(.22,1,.36,1),color_160ms_cubic-bezier(.22,1,.36,1),opacity_160ms_cubic-bezier(.22,1,.36,1)] [-webkit-tap-highlight-color:transparent] disabled:cursor-not-allowed disabled:opacity-52 motion-reduce:transition-none",
        secondary
          ? "min-h-9 min-w-[142px] rounded-l-xl bg-[#1a1a1e] px-3 text-xs font-medium text-[#e7e7ea] hover:bg-[#303036] active:bg-[color-mix(in_oklab,#303036,#38383e_55%)]"
          : "min-h-11 rounded-l-[11px] bg-[#e7e7ea] px-4 text-[13px] font-medium text-[#080809] hover:bg-[color-mix(in_oklab,#e7e7ea_88%,#080809)] active:bg-[color-mix(in_oklab,#e7e7ea_80%,#080809)]",
      ].join(" ")} type="button" onClick={onClick} disabled={disabled}>
        <motion.span className="inline-flex min-w-0 items-center data-[morphing]:[clip-path:inset(-50%_-8px)]" style={{ width }} aria-hidden="true">
          <span ref={contentRef} className="inline-flex flex-none items-center gap-2 whitespace-nowrap">
            {icon ? <span className="inline-grid flex-none place-items-center"><AnimatePresence initial={false}><motion.span key={glyph} className="col-start-1 row-start-1 inline-flex items-center justify-center" initial={reduced ? fadeIn : iconIn} animate={rest} exit={reduced ? fadeOut : iconOut} transition={reduced ? { duration: motionTokens.duration.instant } : iconEnter}>{icon}</motion.span></AnimatePresence></span> : null}
            <MorphText text={label} reduced={reduced} />
          </span>
        </motion.span>
        <span className="sr-only" aria-live="polite">{label}</span>
      </button>
      <DropdownPrimitive.Trigger className={[
        "grid place-items-center border-0 border-l font-[inherit] [transition:background-color_160ms_cubic-bezier(.22,1,.36,1),color_160ms_cubic-bezier(.22,1,.36,1),opacity_160ms_cubic-bezier(.22,1,.36,1)] [-webkit-tap-highlight-color:transparent] data-[state=open]:[&_svg]:rotate-180 disabled:cursor-not-allowed disabled:opacity-52 motion-reduce:transition-none motion-reduce:[&_svg]:transition-none",
        secondary
          ? "min-h-9 w-8 rounded-r-xl border-l-[#38383e] bg-[#1a1a1e] text-[#e7e7ea] hover:bg-[#303036] active:bg-[color-mix(in_oklab,#303036,#38383e_55%)] data-[state=open]:bg-[color-mix(in_oklab,#303036,#38383e_55%)]"
          : "min-h-11 w-[38px] rounded-r-[11px] border-l-[color-mix(in_oklab,#080809_18%,#e7e7ea)] bg-[#e7e7ea] text-[#080809] hover:bg-[color-mix(in_oklab,#e7e7ea_88%,#080809)] active:bg-[color-mix(in_oklab,#e7e7ea_80%,#080809)] data-[state=open]:bg-[color-mix(in_oklab,#e7e7ea_80%,#080809)]",
      ].join(" ")} type="button" aria-label={`${label} more actions`} disabled={disabled}><ChevronDown className="transition-transform duration-[580ms] ease-[linear(0,.09,.27,.47,.64,.77,.86,.92,.97,.99,1.006,1)]" size={16} strokeWidth={1.75} aria-hidden="true" /></DropdownPrimitive.Trigger>
    </div>
    <DropdownPrimitive.Portal><DropdownPrimitive.Content className={[
      "group/menu z-[60] min-w-[min(12rem,var(--radix-dropdown-menu-content-available-width))] max-w-[var(--radix-dropdown-menu-content-available-width)] origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-xl border border-[#38383e] bg-[#1b1b20] p-[5px] text-[#e7e7ea] shadow-[0_16px_34px_#0009] [--menu-x:0px] [--menu-y:-5px] [transition:opacity_160ms_cubic-bezier(.16,1,.3,1),transform_580ms_linear(0,.09,.27,.47,.64,.77,.86,.92,.97,.99,1.006,1)] data-[side=left]:[--menu-x:5px] data-[side=left]:[--menu-y:0px] data-[side=right]:[--menu-x:-5px] data-[side=right]:[--menu-y:0px] data-[side=top]:[--menu-y:5px] data-[state=closed]:pointer-events-none data-[state=closed]:animate-menu-exit data-[state=closed]:opacity-0 data-[state=closed]:[transform:translate(calc(var(--menu-x)*.5),calc(var(--menu-y)*.5))_scale(.985)] data-[state=closed]:[transition:opacity_130ms_cubic-bezier(.22,1,.36,1),transform_130ms_cubic-bezier(.22,1,.36,1)] starting:data-[state=open]:opacity-0 starting:data-[state=open]:[transform:translate(var(--menu-x),var(--menu-y))_scale(.97)] motion-reduce:transform-none motion-reduce:[transition:opacity_120ms_linear]",
      menuClassName,
    ].filter(Boolean).join(" ")} sideOffset={4} align="end" collisionPadding={12} loop>
      {actions.map((action, index) => <DropdownPrimitive.Item key={action.label} className={[
        "flex min-h-9 cursor-pointer items-center gap-[10px] rounded-md px-[11px] text-[13px] outline-none transition-[opacity,transform] duration-[240ms] ease-[cubic-bezier(.16,1,.3,1)] [transition-delay:calc(min(var(--i),4)*35ms)] data-[disabled]:cursor-default data-[disabled]:opacity-45 data-[highlighted]:bg-[#303036] starting:group-data-[state=open]/menu:opacity-0 starting:group-data-[state=open]/menu:[transform:translate(calc(var(--menu-x)*.4),calc(var(--menu-y)*.4))] motion-reduce:transition-none",
        action.destructive ? "text-[#fb7185] data-[highlighted]:bg-[color-mix(in_oklab,#fb7185_8%,#1a1a1e)]" : "",
      ].filter(Boolean).join(" ")} style={{ "--i": index } as CSSProperties} disabled={action.disabled} onSelect={action.onSelect}>{action.icon ? <span className="inline-flex" aria-hidden="true">{action.icon}</span> : null}{action.label}</DropdownPrimitive.Item>)}
      {menuFooter}
    </DropdownPrimitive.Content></DropdownPrimitive.Portal>
  </DropdownPrimitive.Root>;
}

export default SplitButton;

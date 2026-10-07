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
import styles from "./split-button.module.css";

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
  return <span className={styles.glyphs}>
    <AnimatePresence mode="popLayout" initial={false}>
      {glyphs.map(glyph => <motion.span key={glyph.id} className={styles.glyph} layout={reduced ? false : "position"} layoutDependency={text} initial={reduced ? fadeIn : glyphIn} animate={rest} exit={reduced ? fadeOut : glyphOut} transition={reduced ? { duration: motionTokens.duration.instant } : { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter], delay: Math.min(glyph.order * motionTokens.stagger.char, .1), layout: motionTokens.spring.morph }}>{glyph.char}</motion.span>)}
    </AnimatePresence>
  </span>;
}

/** The main action morphs its icon and label in place while its width follows on a spring; the menu half never scales, so the menu opens from a still anchor. */
export function SplitButton({ label, actions, onClick, disabled, icon, className, menuClassName, menuFooter, variant = "primary" }: SplitButtonProps) {
  const reduced = useReducedMotion() ?? false;
  const contentRef = useRef<HTMLSpanElement>(null);
  const glyph = iconKey(icon);
  const width = useMorphWidth(contentRef, `${glyph}|${label}`, reduced);
  return <DropdownPrimitive.Root>
    <div className={[styles.group, variant === "secondary" ? styles.secondary : "", className].filter(Boolean).join(" ")}>
      <button className={styles.primary} type="button" onClick={onClick} disabled={disabled}>
        <motion.span className={styles.primarySlot} style={{ width }} aria-hidden="true">
          <span ref={contentRef} className={styles.primaryContent}>
            {icon ? <span className={styles.mainIcon}><AnimatePresence initial={false}><motion.span key={glyph} className={styles.iconPhase} initial={reduced ? fadeIn : iconIn} animate={rest} exit={reduced ? fadeOut : iconOut} transition={reduced ? { duration: motionTokens.duration.instant } : iconEnter}>{icon}</motion.span></AnimatePresence></span> : null}
            <MorphText text={label} reduced={reduced} />
          </span>
        </motion.span>
        <span className={styles.srOnly} aria-live="polite">{label}</span>
      </button>
      <DropdownPrimitive.Trigger className={styles.trigger} type="button" aria-label={`${label} more actions`} disabled={disabled}><ChevronDown className={styles.chevron} size={16} strokeWidth={1.75} aria-hidden="true" /></DropdownPrimitive.Trigger>
    </div>
    <DropdownPrimitive.Portal><DropdownPrimitive.Content className={[styles.menu, menuClassName].filter(Boolean).join(" ")} sideOffset={4} align="end" collisionPadding={12} loop>
      {actions.map((action, index) => <DropdownPrimitive.Item key={action.label} className={[styles.item, action.destructive ? styles.destructive : ""].filter(Boolean).join(" ")} style={{ "--i": index } as CSSProperties} disabled={action.disabled} onSelect={action.onSelect}>{action.icon ? <span className={styles.icon} aria-hidden="true">{action.icon}</span> : null}{action.label}</DropdownPrimitive.Item>)}
      {menuFooter}
    </DropdownPrimitive.Content></DropdownPrimitive.Portal>
  </DropdownPrimitive.Root>;
}

export default SplitButton;

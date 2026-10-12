"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState } from "react";
import type { ComponentPropsWithoutRef, RefObject } from "react";
import { ChevronLeft as NavArrowLeft, ChevronRight as NavArrowRight } from "lucide-react";
import { AnimatePresence, LayoutGroup, animate, motion, useReducedMotion } from "motion/react";
import type { AnimationPlaybackControls, Variants } from "motion/react";
import { motionTokens } from "../lib/motion-tokens";

type RootProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Root>;
/** `direction` is +1 when the new tab sits after the old one; `panelHeightRef` holds the visible panel height so the next panel can morph from it; `leavingRectRef` pins the outgoing panel where it was on screen. */
const TabsContext = createContext<{ active: string; layoutId: string; direction: number; panelHeightRef: RefObject<number | null>; leavingRectRef: RefObject<DOMRect | null> }>({ active: "", layoutId: "tabs", direction: 1, panelHeightRef: { current: null }, leavingRectRef: { current: null } });

export function Tabs({ value, defaultValue, onValueChange, className, ...props }: RootProps) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const [direction, setDirection] = useState(1);
  const active = value ?? internal;
  const layoutId = useId();
  const root = useRef<HTMLDivElement>(null);
  const panelHeightRef = useRef<number | null>(null);
  const leavingRectRef = useRef<DOMRect | null>(null);
  function handleChange(next: string) {
    const frame = root.current;
    leavingRectRef.current = frame?.querySelector(':scope > [role="tabpanel"][data-state="active"]')?.getBoundingClientRect() ?? null;
    const order = frame ? Array.from(frame.querySelectorAll<HTMLElement>('[role="tab"][data-value]')).filter(tab => tab.closest("[data-arc-tabs-root]") === frame).map(tab => tab.dataset.value) : [];
    const from = order.indexOf(active), to = order.indexOf(next);
    if (from >= 0 && to >= 0 && from !== to) setDirection(to > from ? 1 : -1);
    if (value === undefined) setInternal(next); onValueChange?.(next);
  }
  return <TabsContext.Provider value={{ active, layoutId, direction, panelHeightRef, leavingRectRef }}><LayoutGroup id={layoutId}><TabsPrimitive.Root {...props} ref={root} data-arc-tabs-root="" className={["relative", className].filter(Boolean).join(" ")} value={active} onValueChange={handleChange}/></LayoutGroup></TabsContext.Provider>;
}

export function TabsList({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  const { active } = useContext(TabsContext);
  const reduced = useReducedMotion();
  const shell = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ overflow: false, left: false, right: false });
  const update = useCallback(() => {
    const frame = shell.current;
    const scroll = viewport.current;
    if (!frame || !scroll) return;
    const max = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    const next = { overflow: scroll.scrollWidth > frame.clientWidth + 1, left: scroll.scrollLeft > 1, right: scroll.scrollLeft < max - 1 };
    setEdges(previous => previous.overflow === next.overflow && previous.left === next.left && previous.right === next.right ? previous : next);
  }, []);
  const reveal = useCallback((tab: HTMLElement | null) => {
    const scroll = viewport.current;
    if (!scroll || !tab) return;
    const frame = scroll.getBoundingClientRect();
    const item = tab.getBoundingClientRect();
    const max = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    const left = frame.left + (scroll.scrollLeft > 1 ? 34 : 0);
    const right = frame.right - (scroll.scrollLeft < max - 1 ? 34 : 0);
    const delta = item.left < left ? item.left - left : item.right > right ? item.right - right : 0;
    if (delta) scroll.scrollBy({ left: delta, behavior: reduced ? "instant" : "smooth" });
  }, [reduced]);
  useLayoutEffect(() => {
    const frame = shell.current;
    const scroll = viewport.current;
    const content = list.current;
    if (!frame || !scroll || !content) return;
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    observer.observe(scroll);
    observer.observe(content);
    scroll.addEventListener("scroll", update, { passive: true });
    update();
    return () => { observer.disconnect(); scroll.removeEventListener("scroll", update); };
  }, [update]);
  useLayoutEffect(() => { reveal(list.current?.querySelector<HTMLElement>('[role="tab"][data-state="active"]') ?? null); }, [active, reveal]);
  const scrollTabs = (direction: number) => viewport.current?.scrollBy({ left: direction * (viewport.current?.clientWidth ?? 0) * .75, behavior: reduced ? "instant" : "smooth" });
  return <div ref={shell} className="group relative isolate inline-flex min-w-0 max-w-full items-center rounded-xl border border-white/12 bg-[#202023]" data-overflow={edges.overflow} data-left={edges.left} data-right={edges.right}>
    {edges.overflow && <button type="button" className="absolute inset-y-0 left-0 z-2 grid w-[33px] place-items-center rounded-l-xl border-0 bg-[#202023] text-zinc-50 disabled:pointer-events-none disabled:opacity-0 focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-[#8367c7]" aria-label="Scroll tabs left" disabled={!edges.left} onClick={() => scrollTabs(-1)}><NavArrowLeft width={17} height={17} aria-hidden="true"/></button>}
    <motion.div ref={viewport} layoutScroll className="min-w-0 overflow-x-auto rounded-[inherit] [scrollbar-width:none] group-data-[left=true]:[mask-image:linear-gradient(to_right,transparent,black_35px,black)] group-data-[right=true]:[mask-image:linear-gradient(to_right,black,black_calc(100%_-_35px),transparent)] group-data-[left=true]:group-data-[right=true]:[mask-image:linear-gradient(to_right,transparent,black_35px,black_calc(100%_-_35px),transparent)] [&::-webkit-scrollbar]:hidden" onFocusCapture={event => { if (event.target instanceof HTMLElement && event.target.getAttribute("role") === "tab") reveal(event.target); }}>
      <TabsPrimitive.List {...props} ref={list} data-outray-tabs-list="" className={["isolate inline-flex w-max items-center gap-1 p-1", className].filter(Boolean).join(" ")}/>
    </motion.div>
    {edges.overflow && <button type="button" className="absolute inset-y-0 right-0 z-2 grid w-[33px] place-items-center rounded-r-xl border-0 bg-[#202023] text-zinc-50 disabled:pointer-events-none disabled:opacity-0 focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-[#8367c7]" aria-label="Scroll tabs right" disabled={!edges.right} onClick={() => scrollTabs(1)}><NavArrowRight width={17} height={17} aria-hidden="true"/></button>}
  </div>;
}

export function TabsTrigger({ className, children, value, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  const { active } = useContext(TabsContext);
  const reduced = useReducedMotion();
  // The LayoutGroup in Tabs scopes the highlight to this instance, so it glides between triggers but never flies in from another tab set.
  return <TabsPrimitive.Trigger {...props} value={value} data-value={value} data-outray-tabs-trigger="" className={["relative inline-grid min-h-8 min-w-22 shrink-0 place-items-center rounded-[9px] border-0 bg-transparent px-3 text-[13px] font-medium whitespace-nowrap text-zinc-500 transition-colors duration-160 hover:text-zinc-50 active:text-zinc-50 data-[state=active]:text-violet-300 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8367c7] motion-reduce:transition-none", className].filter(Boolean).join(" ")}>
    {active === value && <motion.span className="absolute inset-0 -z-1 rounded-[inherit] border border-white/12 bg-zinc-900 shadow-[0_1px_2px_rgb(0_0_0/.25)] will-change-transform" layoutId="selection" layoutDependency={active} transition={reduced ? { duration: 0 } : motionTokens.spring.morph} aria-hidden="true"/>}
    <span className="relative z-1">{children}</span>
  </TabsPrimitive.Trigger>;
}

const panelMotion: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 8 }),
  center: { opacity: 1, x: 0, transition: { opacity: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }, x: motionTokens.spring.smooth } },
  exit: (direction: number) => ({ opacity: 0, x: direction * -6, transition: { duration: motionTokens.duration.instant, ease: [...motionTokens.ease.standard] } }),
};
/** Reduced motion: a short crossfade in place. Keys match panelMotion so server and client render identical styles. */
const panelFade: Variants = {
  enter: { opacity: 0, x: 0 },
  center: { opacity: 1, x: 0, transition: { duration: motionTokens.duration.instant } },
  exit: { opacity: 0, x: 0, transition: { duration: .1 } },
};

export function TabsContent({ className, value, forceMount, children, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  const { active, direction, panelHeightRef, leavingRectRef } = useContext(TabsContext);
  const reduced = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const selected = active === value;
  const classes = ["mt-4 text-[13px] leading-[1.45] text-zinc-400 data-[motion-pop-id]:mt-0 data-[state=inactive]:pointer-events-none focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#8367c7]", className].filter(Boolean).join(" ");
  // The incoming panel starts at the outgoing panel's height and settles at its own, so content below glides instead of jumping.
  useLayoutEffect(() => {
    const node = panel.current;
    if (!node || forceMount) return;
    // Outgoing: the tab root may have changed size around it, so pin the panel to where it was while it fades.
    if (!selected) { const before = leavingRectRef.current; const now = node.getBoundingClientRect(); if (before) node.style.translate = `${before.left - now.left}px ${before.top - now.top}px`; node.inert = true; return; }
    node.style.translate = ""; node.inert = false;
    const from = panelHeightRef.current;
    const to = node.offsetHeight;
    let controls: AnimationPlaybackControls | undefined;
    const release = () => { node.style.height = ""; node.style.overflow = ""; };
    if (from !== null && Math.abs(from - to) > 1 && !reduced) {
      if (to > from) node.style.overflow = "clip";
      controls = animate(node, { height: [from, to] }, { ...motionTokens.spring.smooth, onComplete: release });
    }
    panelHeightRef.current = controls && from !== null ? from : to;
    const observer = new ResizeObserver(() => { panelHeightRef.current = node.offsetHeight; });
    observer.observe(node);
    return () => { observer.disconnect(); controls?.stop(); release(); };
  }, [selected, reduced, forceMount, panelHeightRef, leavingRectRef]);
  if (forceMount) return <TabsPrimitive.Content {...props} value={value} forceMount className={classes}>{children}</TabsPrimitive.Content>;
  return <AnimatePresence initial={false} mode="popLayout" custom={direction}>
    {selected && <TabsPrimitive.Content {...props} key={value} value={value} forceMount asChild>
      <motion.div ref={panel} className={classes} custom={direction} variants={reduced ? panelFade : panelMotion} initial="enter" animate="center" exit="exit">{children}</motion.div>
    </TabsPrimitive.Content>}
  </AnimatePresence>;
}

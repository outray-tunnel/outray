import { HugeiconsIcon } from "@hugeicons/react";
import SidebarLeft01Icon from "@hugeicons-pro/core-stroke-rounded/SidebarLeft01Icon";
import SidebarRight01Icon from "@hugeicons-pro/core-stroke-rounded/SidebarRight01Icon";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { motionTokens } from "../arc/motion-tokens";

export function SidebarCollapseControl({
  isCollapsed,
  onToggle,
  controls,
}: {
  isCollapsed: boolean;
  onToggle: () => void;
  controls?: string;
}) {
  const reducedMotion = useReducedMotion();
  const label = isCollapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      aria-expanded={!isCollapsed}
      aria-controls={controls}
      className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors duration-150 hover:bg-white/[0.045] hover:text-zinc-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span aria-hidden="true" className="relative block size-[18px]">
        <AnimatePresence initial={false}>
          <motion.span
            key={isCollapsed ? "right" : "left"}
            className="absolute inset-0"
            initial={
              reducedMotion ? false : { opacity: 0, scale: 0.8, rotate: -20 }
            }
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.8, rotate: 20 }
            }
            transition={{
              duration: reducedMotion ? 0 : motionTokens.duration.fast,
              ease: [...motionTokens.ease.enter],
            }}
          >
            <HugeiconsIcon
              icon={isCollapsed ? SidebarRight01Icon : SidebarLeft01Icon}
              size={18}
              strokeWidth={1.7}
              aria-hidden="true"
            />
          </motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
}

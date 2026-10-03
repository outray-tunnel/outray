import { useId, useRef, type KeyboardEvent } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";

// Adapted from UIArc's MIT-licensed Segmented Control for OutRay's existing theme.
// License: ./uiarc-license.txt
interface Segment<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  label,
  fullWidth = false,
  className = "",
}: {
  options: readonly Segment<T>[];
  value: T;
  onValueChange: (value: T) => void;
  label: string;
  fullWidth?: boolean;
  className?: string;
}) {
  const id = useId();
  const reducedMotion = useReducedMotion();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = options.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? selectedIndex === last
          ? 0
          : selectedIndex + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? selectedIndex === 0
            ? last
            : selectedIndex - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;

    if (next < 0 || !options[next]) return;
    event.preventDefault();
    onValueChange(options[next].value);
    buttonRefs.current[next]?.focus();
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex min-w-0 max-w-full rounded-lg border border-white/[0.09] bg-white/[0.035] ${fullWidth ? "w-full" : ""} ${className}`}
    >
      <LayoutGroup id={id}>
        <motion.div
          layoutScroll
          className={`isolate flex min-w-0 items-center gap-0.5 overflow-x-auto p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${fullWidth ? "w-full" : ""}`}
        >
          {options.map((option, index) => {
            const selected = value === option.value;
            return (
              <button
                key={option.value}
                ref={(element) => {
                  buttonRefs.current[index] = element;
                }}
                type="button"
                aria-pressed={selected}
                tabIndex={index === selectedIndex ? 0 : -1}
                onClick={() => onValueChange(option.value)}
                onKeyDown={handleKeyDown}
                className={`relative h-7 whitespace-nowrap rounded-md px-2 text-[11px] font-medium transition-colors motion-reduce:transition-none focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${fullWidth ? "min-w-0 flex-1" : "min-w-10 shrink-0"} ${selected ? "text-white" : "text-zinc-500 hover:text-zinc-200"}`}
              >
                {selected && (
                  <motion.span
                    layoutId="selection"
                    layoutDependency={value}
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : { duration: 0.2, ease: "easeOut" }
                    }
                    className="absolute inset-0 -z-10 rounded-md bg-white/[0.12] shadow-sm"
                    aria-hidden="true"
                  />
                )}
                <span className="relative z-10">{option.label}</span>
              </button>
            );
          })}
        </motion.div>
      </LayoutGroup>
    </div>
  );
}

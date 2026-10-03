import {
  forwardRef,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

// Adapted from UIArc's MIT-licensed Button for OutRay's Geom/dark theme.
// License: ./uiarc-license.txt
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "destructive"
  | "outline"
  | "accent";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonShape = "rounded" | "soft" | "pill";

export interface ButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "onDrag" | "onDragEnd" | "onDragStart" | "onAnimationStart"
  > {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  loading?: boolean;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "border-white bg-white text-black hover:bg-zinc-200 active:bg-zinc-300",
  secondary:
    "border-white/[0.12] bg-white/[0.055] text-zinc-100 hover:border-white/[0.18] hover:bg-white/[0.09]",
  ghost:
    "border-transparent bg-transparent text-zinc-400 hover:bg-white/[0.055] hover:text-zinc-100",
  danger:
    "border-rose-400/20 bg-rose-400/[0.055] text-rose-300 hover:border-rose-400/40 hover:bg-rose-400/[0.1]",
  destructive:
    "border-rose-400/20 bg-rose-400/[0.055] text-rose-300 hover:border-rose-400/40 hover:bg-rose-400/[0.1]",
  outline:
    "border-white/[0.12] bg-transparent text-zinc-200 hover:border-white/[0.2] hover:bg-white/[0.055]",
  accent:
    "border-accent/20 bg-accent/15 text-accent hover:border-accent/30 hover:bg-accent/25",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "min-h-8 gap-1.5 px-3 text-[11px]",
  md: "min-h-9 gap-2 px-3.5 text-[12px]",
  lg: "min-h-11 gap-2.5 px-5 text-[13px]",
};

function labelKey(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(labelKey).join("");
  if (!isValidElement(node)) return "";
  const props = node.props as { children?: ReactNode };
  return labelKey(props.children);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    shape = "rounded",
    loading = false,
    isLoading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className = "",
    disabled,
    children,
    onClick,
    ...props
  },
  ref,
) {
  const reducedMotion = useReducedMotion();
  const busy = loading || isLoading;
  const popupTrigger =
    (props["aria-haspopup"] !== undefined &&
      props["aria-haspopup"] !== false &&
      props["aria-haspopup"] !== "false") ||
    (props as Record<string, unknown>)["data-state"] !== undefined;
  const explicitlyDisabled =
    props["aria-disabled"] === true || props["aria-disabled"] === "true";
  const inert = disabled || busy || explicitlyDisabled;
  const contentKey = `${labelKey(children)}:${labelKey(leftIcon)}:${labelKey(rightIcon)}`;

  return (
    <motion.button
      {...props}
      ref={ref}
      disabled={disabled}
      aria-busy={busy || undefined}
      aria-disabled={busy || props["aria-disabled"] || undefined}
      onClick={inert ? (event) => event.preventDefault() : onClick}
      layout={!reducedMotion}
      whileTap={
        reducedMotion || popupTrigger || inert ? undefined : { scale: 0.97 }
      }
      transition={
        reducedMotion
          ? { duration: 0 }
          : { type: "spring", visualDuration: 0.3, bounce: 0.12 }
      }
      className={`relative inline-flex items-center justify-center whitespace-nowrap border font-medium transition-[color,background-color,border-color,opacity] duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-[disabled=true]:cursor-not-allowed aria-[busy=true]:cursor-progress ${shape === "pill" ? "rounded-full" : shape === "soft" ? "rounded-xl" : "rounded-md"} ${variantStyles[variant]} ${sizeStyles[size]} ${fullWidth ? "w-full" : ""} ${className}`}
    >
      {busy && (
        <span
          className="absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <span className="size-4 animate-spin rounded-full border-[1.5px] border-current border-r-transparent motion-reduce:animate-none" />
        </span>
      )}
      <span className={`inline-flex items-center ${busy ? "opacity-0" : ""}`}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={contentKey}
            initial={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 4, filter: "blur(4px)" }
            }
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={
              reducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -3, filter: "blur(2px)" }
            }
            transition={{ duration: reducedMotion ? 0.08 : 0.2 }}
            className={`inline-flex items-center ${size === "lg" ? "gap-2.5" : size === "sm" ? "gap-1.5" : "gap-2"}`}
          >
            {leftIcon}
            {children}
            {rightIcon}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.button>
  );
});

Button.displayName = "Button";

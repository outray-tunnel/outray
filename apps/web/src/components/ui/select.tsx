import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import ArrowDown01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowDown01Icon";
import Tick02Icon from "@hugeicons-pro/core-stroke-rounded/Tick02Icon";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  optionClassName?: string;
  ariaLabel?: string;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  icon,
  disabled = false,
  className = "",
  triggerClassName = "",
  menuClassName = "",
  optionClassName = "",
  ariaLabel,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedOption = options.find((option) => option.value === value);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openAbove = spaceBelow < 190 && spaceAbove > spaceBelow;
    setMenuStyle({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(140, Math.min(320, openAbove ? spaceAbove : spaceBelow)),
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updateMenuPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleViewportChange = () => updateMenuPosition();

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, updateMenuPosition]);

  const openMenu = () => {
    const selectedIndex = options.findIndex((option) => option.value === value);
    setHighlightedIndex(Math.max(0, selectedIndex));
    updateMenuPosition();
    setIsOpen(true);
  };

  const chooseOption = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const moveHighlight = (direction: 1 | -1) => {
    if (!options.length) return;
    let nextIndex = highlightedIndex;
    do {
      nextIndex = (nextIndex + direction + options.length) % options.length;
    } while (options[nextIndex]?.disabled && nextIndex !== highlightedIndex);
    setHighlightedIndex(nextIndex);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
      } else {
        moveHighlight(event.key === "ArrowDown" ? 1 : -1);
      }
    } else if ((event.key === "Enter" || event.key === " ") && isOpen) {
      event.preventDefault();
      const option = options[highlightedIndex];
      if (option) chooseOption(option);
    } else if (event.key === "Escape") {
      setIsOpen(false);
    } else if (event.key === "Tab") {
      setIsOpen(false);
    }
  };

  const menu = isOpen && typeof document !== "undefined" ? createPortal(
    <div
      ref={menuRef}
      id={listboxId}
      role="listbox"
      aria-label={ariaLabel}
      className={`fixed z-[120] overflow-y-auto rounded-xl border border-white/[0.1] bg-[#111] p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.65)] ${menuClassName}`}
      style={menuStyle}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const highlighted = index === highlightedIndex;
        return (
          <button
            key={option.value}
            id={`${listboxId}-${index}`}
            type="button"
            role="option"
            aria-selected={selected}
            disabled={option.disabled}
            onMouseEnter={() => setHighlightedIndex(index)}
            onClick={() => chooseOption(option)}
            className={`relative flex min-h-9 w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
              option.disabled ? "cursor-not-allowed opacity-35" : ""
            } ${optionClassName}`}
          >
            {highlighted && (
              <motion.span
                layoutId={`${listboxId}-hover-indicator`}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-lg bg-white/[0.06]"
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
              />
            )}
            {option.icon && <span className="relative z-10 shrink-0 text-zinc-600">{option.icon}</span>}
            <span className="relative z-10 min-w-0 flex-1">
              <span className={`block truncate text-[11px] font-medium text-zinc-300 ${option.className ?? ""}`}>
                {option.label}
              </span>
              {option.description && (
                <span className="mt-0.5 block truncate text-[9px] text-zinc-700">
                  {option.description}
                </span>
              )}
            </span>
            {selected && (
              <HugeiconsIcon
                icon={Tick02Icon}
                size={13}
                strokeWidth={1.8}
                className="relative z-10 shrink-0 text-zinc-300"
              />
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (disabled) return;
          if (isOpen) setIsOpen(false);
          else openMenu();
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={isOpen ? `${listboxId}-${highlightedIndex}` : undefined}
        className={`flex h-10 w-full items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 text-left outline-none transition-colors hover:border-white/[0.13] hover:bg-white/[0.04] focus:border-white/[0.16] disabled:cursor-not-allowed disabled:opacity-40 ${triggerClassName}`}
      >
        {icon && <span className="shrink-0 text-zinc-600">{icon}</span>}
        <span className={`min-w-0 flex-1 truncate text-[11px] ${selectedOption?.className ?? "text-zinc-400"}`}>
          {selectedOption?.label ?? placeholder}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={13}
          strokeWidth={1.7}
          className={`shrink-0 text-zinc-700 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {menu}
    </div>
  );
}

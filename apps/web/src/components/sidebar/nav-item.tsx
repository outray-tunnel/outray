import { Link } from "@tanstack/react-router";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";

interface NavItemProps {
  icon: IconSvgElement;
  activeIcon?: IconSvgElement;
  label: string;
  to: string;
  activeOptions?: { exact: boolean };
  isCollapsed: boolean;
  params?: Record<string, string>;
  isActive?: boolean;
  compact?: boolean;
  badge?: ReactNode;
  ariaLabel?: string;
}

export function NavItem({
  icon,
  activeIcon,
  label,
  to,
  activeOptions,
  isCollapsed,
  params,
  isActive,
  compact = false,
  badge,
  ariaLabel,
}: NavItemProps) {
  const activeClassName =
    "bg-white/[0.07] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]";
  const inactiveClassName =
    "text-zinc-500 hover:bg-white/[0.045] hover:text-zinc-200";

  return (
    <Link
      to={to}
      params={params}
      activeProps={isActive === undefined ? { className: activeClassName } : {}}
      inactiveProps={
        isActive === undefined ? { className: inactiveClassName } : {}
      }
      activeOptions={activeOptions}
      className={`group relative flex w-full items-center rounded-lg tracking-[-0.01em] transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${compact ? "h-9 text-[13px] font-normal" : "h-10 text-sm font-medium"} ${
        isCollapsed ? "justify-center px-2.5" : "gap-3 px-3"
      } ${isActive === undefined ? "" : isActive ? activeClassName : inactiveClassName}`}
      title={isCollapsed ? label : undefined}
      aria-current={isActive ? "page" : undefined}
      aria-label={ariaLabel ?? (isCollapsed ? label : undefined)}
    >
      <HugeiconsIcon
        icon={isActive && activeIcon ? activeIcon : icon}
        size={compact ? 17 : 18}
        className="shrink-0"
        aria-hidden="true"
      />
      {!isCollapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {badge}
    </Link>
  );
}

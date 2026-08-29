import { Link } from "@tanstack/react-router";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

interface NavItemProps {
  icon: IconSvgElement;
  activeIcon?: IconSvgElement;
  label: string;
  to: string;
  activeOptions?: { exact: boolean };
  isCollapsed: boolean;
  params?: Record<string, string>;
  isActive?: boolean;
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
      className={`group relative flex h-10 w-full items-center rounded-lg text-sm font-medium tracking-[-0.01em] transition-colors duration-150 ${
        isCollapsed ? "justify-center px-2.5" : "gap-3 px-3"
      } ${isActive === undefined ? "" : isActive ? activeClassName : inactiveClassName}`}
      title={isCollapsed ? label : undefined}
    >
      <HugeiconsIcon
        icon={isActive && activeIcon ? activeIcon : icon}
        size={18}
        strokeWidth={1.7}
        className="shrink-0"
        aria-hidden="true"
      />
      {!isCollapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

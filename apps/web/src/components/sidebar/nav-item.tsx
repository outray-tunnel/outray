import { Link } from "@tanstack/react-router";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

interface NavItemProps {
  icon: IconSvgElement;
  label: string;
  to: string;
  activeOptions?: { exact: boolean };
  isCollapsed: boolean;
  params?: Record<string, string>;
}

export function NavItem({
  icon,
  label,
  to,
  activeOptions,
  isCollapsed,
  params,
}: NavItemProps) {
  return (
    <Link
      to={to}
      params={params}
      activeProps={{
        className:
          "bg-white/[0.07] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]",
      }}
      inactiveProps={{
        className:
          "text-zinc-500 hover:bg-white/[0.045] hover:text-zinc-200",
      }}
      activeOptions={activeOptions}
      className={`group relative flex h-8 w-full items-center rounded-md text-[13px] font-medium tracking-[-0.01em] transition-colors duration-150 ${
        isCollapsed ? "justify-center px-2" : "gap-2.5 px-2"
      }`}
      title={isCollapsed ? label : undefined}
    >
      <HugeiconsIcon
        icon={icon}
        size={16}
        strokeWidth={1.7}
        className="shrink-0"
        aria-hidden="true"
      />
      {!isCollapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
